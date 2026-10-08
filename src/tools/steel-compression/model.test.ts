import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/steel-compression.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { gradeOf } from '../_steel/profile'
import { buildCompressionReport } from './report'
import { COMPRESSION_DEFAULTS, computeCompression, validate, type CompressionInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): CompressionInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const t = (k: string) => String(a[k])
  return {
    ptype: t('ptype'), psize: t('psize'), grade: gradeOf(Number(a.Fy)), Fy: t('Fy'), Fu: '0', Kpreset: t('Kpreset'), Kval: t('Kval'),
    Lx: t('Lx'), Ly: t('Ly'), Kz: t('Kz'), Lz: t('Lz'), Pu: t('Pu'), Pa: t('Pa'),
  }
}

describe('batang tekan baja — input UI', () => {
  it('input bawaan UI = kasus default golden (hasil identik build lama)', () => {
    expect(goldenDiff(computeCompression(COMPRESSION_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['L 9000', 'torsi menentukan', 'Kz & Lz kosong', 'K preset jepit', 'K manual', 'sumbu kuat', 'KL/r > 200', 'WF sayap langsing', 'UNP', 'siku', 'SHS langsing', 'RHS', 'pipa langsing', 'CNP', 'D/C'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeCompression(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi per field; Kz/Lz hanya untuk WF; panjang nol ditolak', () => {
    expect(validate({ ...COMPRESSION_DEFAULTS, Lx: '0', Ly: '0' })).toEqual({ Ly: 'Isi Lx atau Ly > 0' })
    expect(validate({ ...COMPRESSION_DEFAULTS, Kpreset: '0', Kval: '0', Lz: '-1' })).toEqual({ Kval: 'Harus > 0', Lz: 'Tidak boleh negatif' })
    expect(validate({ ...COMPRESSION_DEFAULTS, ptype: 'SHS', psize: '100×100×6', Lz: '' })).toEqual({})
    expect(validate({ ...COMPRESSION_DEFAULTS, grade: 'custom', Fy: '0' })).toEqual({ Fy: 'Harus > 0' })
    expect(computeCompression({ ...COMPRESSION_DEFAULTS, Lx: 'x' })).toBeNull()
  })
})

describe('batang tekan baja — laporan', () => {
  const steps = (rep: NonNullable<ReturnType<typeof buildCompressionReport>>) =>
    rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('WF: bagian lentur + torsi + elemen, rumus konsisten dengan hasil hitung', () => {
    const ui = fromGolden('torsi menentukan')
    const rep = buildCompressionReport(ui)!
    const r = computeCompression(ui)!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Data profil & material', 'Panjang efektif & kelangsingan (E2)', 'Tekuk lentur (E3)', 'Tekuk torsi — WF simetris ganda (E4)',
      'Kelangsingan elemen (Tabel B4.1a)', 'Kekuatan tekan desain',
    ])
    const v = steps(rep)
    expect(v.filter((s) => s.lhs === 'F_{e}').map((s) => s.value)).toEqual([r.FeFlex!.toFixed(1), r.tors!.Fe.toFixed(1)])
    expect(v.filter((s) => s.lhs === 'P_{n}').map((s) => s.value)).toEqual([r.PnFlex!.toFixed(1), r.tors!.Pn.toFixed(1), r.Pn!.toFixed(1)])
    expect(v.find((s) => s.lhs === 'φ_{c}P_{n}')!.value).toBe(r.phiPn!.toFixed(1))
    expect(r.govLS).toBe('Tekuk torsi (E4)')
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })

  it('elastis memakai E3-3; HSS tanpa bagian torsi; D/C menentukan', () => {
    const rep = buildCompressionReport(fromGolden('L 9000'))!
    expect(steps(rep).find((s) => s.lhs === 'F_{cr}')!.ref).toBe('E3-3')
    const hss = buildCompressionReport(fromGolden('RHS'))!
    expect(hss.sections.some((s) => s.title.includes('torsi'))).toBe(false)
    const d = buildCompressionReport(fromGolden('D/C'))!
    expect(d.governing?.label).toBe('D/C DFBK menentukan')
  })
})
