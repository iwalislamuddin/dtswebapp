import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/steel-tension.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { gradeOf } from '../_steel/profile'
import { buildTensionReport } from './report'
import { computeTension, TENSION_DEFAULTS, toCalcInput, validate, type TensionInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): TensionInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const t = (k: string) => String(a[k])
  return {
    ptype: t('ptype'), psize: t('psize'), grade: gradeOf(Number(a.Fy), Number(a.Fu)), Fy: t('Fy'), Fu: t('Fu'),
    conn: a.conn as TensionInput['conn'], nHole: t('nHole'), db: t('db'), hole: t('hole'), tHole: t('tHole'), Upreset: t('Upreset'),
    Uval: t('Uval'), L: t('L'), Pu: t('Pu'), Pa: t('Pa'),
  }
}

describe('batang tarik baja — input UI', () => {
  it('input bawaan UI = kasus default golden (hasil identik build lama)', () => {
    expect(goldenDiff(computeTension(TENSION_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['baut default', 'las', 'fraktur menentukan', 'U manual', 'An sangat kecil', 'L/r tepat', 'pipa', 'siku', 'UNP', 'SHS hitung', 'CNP', 'D/C terlampaui', 'D/C aman'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeTension(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi per field (field tersembunyi tidak diperiksa); input tidak valid → tidak dihitung', () => {
    const bad: TensionInput = { ...TENSION_DEFAULTS, nHole: '1.5', db: '0', L: '-1', psize: 'xx' }
    expect(validate(bad)).toEqual({ nHole: 'Bilangan bulat ≥ 0', db: 'Harus > 0', L: 'Tidak boleh negatif', psize: 'Pilih ukuran profil' })
    expect(computeTension(bad)).toBeNull()
    expect(validate({ ...TENSION_DEFAULTS, conn: 'weld', db: '' })).toEqual({})
    expect(validate({ ...TENSION_DEFAULTS, Upreset: '0', Uval: '1.4' })).toEqual({ Uval: 'Antara 0 dan 1' })
    expect(validate({ ...TENSION_DEFAULTS, grade: 'custom', Fy: '300', Fu: '250' })).toEqual({ Fu: 'Fu harus ≥ Fy' })
  })

  it('mutu dari tabel; kustom memakai isian', () => {
    expect(toCalcInput({ ...TENSION_DEFAULTS, grade: 'BJ 50', Fy: '1', Fu: '1' })).toMatchObject({ Fy: 290, Fu: 500 })
    expect(toCalcInput({ ...TENSION_DEFAULTS, grade: 'custom', Fy: '275,5', Fu: '430' })).toMatchObject({ Fy: 275.5, Fu: 430 })
  })
})

describe('batang tarik baja — laporan', () => {
  const steps = (rep: NonNullable<ReturnType<typeof buildTensionReport>>) =>
    rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('bagian & langkah rumus konsisten dengan hasil hitung', () => {
    const ui = fromGolden('D/C aman')
    const rep = buildTensionReport(ui)!
    const r = computeTension(ui)!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Data profil & material', 'Luas penampang', 'Leleh tarik penampang bruto (D2a)', 'Fraktur tarik penampang neto efektif (D2b)',
      'Kekuatan tarik desain', 'Kelangsingan (D1)',
    ])
    const v = steps(rep)
    const val = (lhs: string, k = 0) => v.filter((s) => s.lhs === lhs)[k]?.value
    expect(val('A_{n}')).toBe(r.An!.toFixed(0))
    expect(val('A_{e}')).toBe(r.Ae!.toFixed(0))
    expect(val('P_{n}', 0)).toBe(r.PnY!.toFixed(1))
    expect(val('P_{n}', 1)).toBe(r.PnR!.toFixed(1))
    expect(val('φ_{t}P_{n}', 2)).toBe(r.phiPn!.toFixed(1))
    expect(val('D/C_{DFBK}')).toBe(r.dcL!.toFixed(3))
    expect(rep.governing).toEqual({ label: 'D/C DFBK menentukan', ratio: r.dcL })
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })

  it('las: tanpa langkah lubang; tanpa beban: tanpa D/C menentukan', () => {
    const rep = buildTensionReport(fromGolden('las'))!
    expect(steps(rep).some((s) => s.lhs === 'd_{h}')).toBe(false)
    expect(rep.governing).toBeUndefined()
    expect(buildTensionReport({ ...TENSION_DEFAULTS, psize: '' })).toBeNull()
  })
})
