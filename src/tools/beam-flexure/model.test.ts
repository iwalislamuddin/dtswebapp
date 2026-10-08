import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/beam-flexure.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildBeamFlexReport } from './report'
import { BEAM_FLEX_DEFAULTS, computeBeamFlex, rejectReason, validate, type BeamFlexInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): BeamFlexInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as BeamFlexInput
}

describe('kapasitas balok — input UI', () => {
  it('input bawaan UI = kasus default golden (φMn 132,6 kN·m)', () => {
    const r = computeBeamFlex(BEAM_FLEX_DEFAULTS)!
    expect(goldenDiff(r, byName('default').output)).toEqual([])
    expect(r.phiMnkNm).toBeCloseTo(132.6, 1)
  })

  it.each(['over-reinforced', '2 lapis', '3 lapis', 'rangkap', 'rangkap, baja tekan', 'transisi', 'di bawah As,min', 'tidak muat', 'spasi bersih kurang', 'fc 40', 'fc 60', 'sv kosong'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeBeamFlex(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi; tinggi efektif ≤ 0 dilaporkan sebagai alasan penolakan', () => {
    expect(validate({ ...BEAM_FLEX_DEFAULTS, n1: '0', b: '' })).toEqual({ n1: 'Bilangan bulat ≥ 1', b: 'Isi angka' })
    expect(validate({ ...BEAM_FLEX_DEFAULTS, sv: '', n2: '' })).toEqual({})
    const tipis = { ...BEAM_FLEX_DEFAULTS, h: '50' }
    expect(computeBeamFlex(tipis)).toBeNull()
    expect(rejectReason(tipis)).toMatch(/Tinggi efektif/)
  })
})

describe('kapasitas balok — laporan', () => {
  const steps = (i: BeamFlexInput) => buildBeamFlexReport(i)!.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('kesetimbangan tertutup, Mn & φMn sama dengan hasil hitung', () => {
    for (const name of ['default', 'rangkap', 'over-reinforced']) {
      const ui = fromGolden(name)
      const r = computeBeamFlex(ui)!
      const v = Object.fromEntries(steps(ui).map((s) => [s.lhs, s.value]))
      expect(Math.abs(Number(v['C + C_{s} − T']))).toBeLessThan(0.5)
      expect(v['M_{n}']).toBe(r.MnkNm!.toFixed(2))
      expect(v['φM_{n}']).toBe(r.phiMnkNm!.toFixed(2))
      expect(v['φ']).toBe(r.phi!.toFixed(r.et! >= 0.005 || r.et! <= r.ey! ? 2 : 3))
    }
  })

  it('lapis > 1 menampilkan tabel lapis; dua gambar', () => {
    const rep = buildBeamFlexReport(fromGolden('2 lapis'))!
    expect(rep.sections[1].blocks.some((b) => b.k === 'table')).toBe(true)
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })
})
