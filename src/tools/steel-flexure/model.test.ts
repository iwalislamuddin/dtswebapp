import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/steel-flexure.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { gradeOf } from '../_steel/profile'
import { buildFlexureReport } from './report'
import { computeFlexure, FLEXURE_DEFAULTS, mnCurve, toCalcInput, validate, type FlexureInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): FlexureInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const t = (k: string) => String(a[k])
  return {
    ptype: t('ptype'), psize: t('psize'), grade: gradeOf(Number(a.Fy)), Fy: t('Fy'), Fu: '0', axis: a.axis as FlexureInput['axis'],
    Lb: t('Lb'), Cbpreset: t('Cbpreset'), Cbval: t('Cbval'), Mu: t('Mu'), Ma: t('Ma'),
  }
}

const UI_CASES = [
  'Lb 9000', 'Lb kecil', 'Lb 0', 'Cb 1,14', 'Cb kantilever', 'Cb manual', 'WF sayap non-kompak', 'WF sayap langsing', 'WF sumbu lemah',
  'WF sumbu lemah non-kompak', 'UNP sumbu kuat', 'SHS (leleh', 'SHS sayap non-kompak', 'SHS sayap langsing', 'RHS LTB elastis', 'RHS LTB inelastis',
  'RHS sumbu lemah', 'RHS badan non-kompak', 'pipa kompak', 'pipa non-kompak', 'pipa langsing / di luar', 'siku', 'CNP', 'D/C',
]

describe('balok baja lentur — input UI', () => {
  it('input bawaan UI = kasus default golden (hasil identik build lama)', () => {
    expect(goldenDiff(computeFlexure(FLEXURE_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(UI_CASES.map((n) => n.replace('', '')))('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeFlexure(ui)!, byName(name).output)).toEqual([])
  })

  it('sumbu & Lb hanya berlaku bila relevan', () => {
    // pipa: sumbu tidak dipilih → x; Lb tidak divalidasi
    expect(toCalcInput({ ...FLEXURE_DEFAULTS, ptype: 'PIPE', axis: 'y' }).axis).toBe('x')
    expect(validate({ ...FLEXURE_DEFAULTS, axis: 'y', Lb: '' })).toEqual({})
    expect(validate({ ...FLEXURE_DEFAULTS, Lb: '-5', Cbpreset: '0', Cbval: '0' })).toEqual({ Lb: 'Tidak boleh negatif', Cbval: 'Harus > 0' })
    expect(computeFlexure({ ...FLEXURE_DEFAULTS, psize: 'xx' })).toBeNull()
  })

  it('kurva Mn–Lb: menurun monoton, Mn di Lb input = hasil hitung', () => {
    const r = computeFlexure(FLEXURE_DEFAULTS)!
    const pts = mnCurve(FLEXURE_DEFAULTS, 12000, 60)
    for (let k = 1; k < pts.length; k++) expect(pts[k][1]).toBeLessThanOrEqual(pts[k - 1][1] + 1e-9)
    expect(pts[0][1]).toBeCloseTo(r.Mp!, 9)
    expect(mnCurve(FLEXURE_DEFAULTS, 3000, 1)[1][1]).toBeCloseTo(r.Mn!, 9)
  })
})

describe('balok baja lentur — laporan', () => {
  const steps = (rep: NonNullable<ReturnType<typeof buildFlexureReport>>) =>
    rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
  const title = (n: string) => buildFlexureReport(fromGolden(n))!.sections.map((s) => s.title)

  it('WF sumbu kuat: F2/F3, langkah konsisten dengan hasil hitung', () => {
    const rep = buildFlexureReport(FLEXURE_DEFAULTS)!
    const r = computeFlexure(FLEXURE_DEFAULTS)!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Data profil & material', 'Properti penampang (sumbu kuat)', 'Klasifikasi penampang (Tabel B4.1b)', 'Leleh (F2.1)',
      'Tekuk torsi-lateral (F2.2)', 'Tekuk lokal sayap (F3)', 'Kekuatan lentur desain',
    ])
    const v = Object.fromEntries(steps(rep).map((s) => [s.lhs, s.value]))
    expect(v['M_{p}']).toBe(r.Mp!.toFixed(2))
    expect(v['L_{p}']).toBe(r.f!.Lp!.toFixed(0))
    expect(v['L_{r}']).toBe(r.f!.Lr!.toFixed(0))
    expect(v['M_{n,LTB}']).toBe((r.f!.Mn_ltb! / 1e6).toFixed(2))
    expect(v['φ_{b}M_{n}']).toBe(r.phiMn!.toFixed(2))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })

  it('bagian per pasal: F6, F7 (+F7.4), F8, indikatif', () => {
    expect(title('WF sumbu lemah non-kompak')).toContain('Tekuk lokal sayap (F6.2)')
    expect(title('RHS LTB inelastis')).toContain('Tekuk torsi-lateral HSS persegi panjang (F7.4)')
    expect(title('SHS sayap non-kompak')).toContain('Leleh & tekuk lokal (F7.1–F7.3)')
    expect(title('pipa non-kompak')).toContain('HSS bundar (F8)')
    expect(title('siku')).toContain('Leleh elastis (indikatif)')
    const fl = steps(buildFlexureReport(fromGolden('pipa non-kompak'))!).find((s) => s.lhs === 'M_{n}')!
    expect(fl.ref).toBe('F8-2')
  })

  it('D/C menentukan', () => {
    const rep = buildFlexureReport(fromGolden('D/C'))!
    expect(rep.governing?.label).toBe('D/C DFBK menentukan')
  })
})
