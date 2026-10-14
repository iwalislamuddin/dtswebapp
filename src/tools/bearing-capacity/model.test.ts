import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/bearing-capacity.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { BEARING_DEFAULTS, computeBearingUI, validate, type BearingUIInput } from './model'
import { buildBearingReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): BearingUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as BearingUIInput
}

describe('daya dukung tanah — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeBearingUI(BEARING_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'metode utama Meyerhof', 'metode utama Vesic', 'strip', 'lingkaran', 'persegi panjang', 'persegi panjang L<B ditukar', 'phi 0 undrained',
    'phi 5', 'keruntuhan lokal', 'MAT di zona baji', 'MAT antara permukaan', 'MAT di permukaan', 'gsat <= gamma', 'phi 47', 'phi 55', 'Df/B > 4',
    'q kerja melebihi izin', 'q kerja aman, Vesic', 'FS 0 -> 3', 'gsat kosong', 'nilai string dari form',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeBearingUI(ui)!, byName(name).output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi (B 0, γ 0, Df negatif, L kosong pada persegi panjang)', () => {
    expect(validate(fromGolden('B 0'))).toEqual({ B: 'Harus > 0' })
    expect(validate(fromGolden('gamma 0'))).toEqual({ gamma: 'Harus > 0' })
    expect(validate(fromGolden('Df negatif'))).toEqual({ Df: 'Tidak boleh negatif' })
    expect(validate(fromGolden('persegi panjang L kosong'))).toEqual({ L: 'Harus > 0' })
    expect(computeBearingUI(fromGolden('B 0'))).toBeNull()
  })

  it('L tak divalidasi bila bukan persegi panjang; gsat & FS boleh kosong', () => {
    expect(validate({ ...BEARING_DEFAULTS, L: '' })).toEqual({})
    expect(validate({ ...BEARING_DEFAULTS, shape: 'rect', L: '' })).toEqual({ L: 'Isi angka' })
    expect(validate({ ...BEARING_DEFAULTS, gsat: '', FS: '' })).toEqual({})
  })
})

describe('daya dukung tanah — laporan', () => {
  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computeBearingUI(BEARING_DEFAULTS)!
    const rep = buildBearingReport(BEARING_DEFAULTS)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['q_{u}']).toBe(r.pm.qu.toFixed(1))
    expect(v['q_{izin}']).toBe(r.pm.qall.toFixed(1))
  })

  it('satu gambar; rasio D/C hanya bila q kerja diisi', () => {
    const rep = buildBearingReport(BEARING_DEFAULTS)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.governing).toBeUndefined()
    expect(buildBearingReport({ ...BEARING_DEFAULTS, qapp: '300' })!.governing!.ratio).toBeGreaterThan(0)
  })
})
