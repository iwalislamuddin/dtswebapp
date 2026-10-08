import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/beam-shear-torsion.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildShearReport } from './report'
import { computeShear, rejectReason, SHEAR_DEFAULTS, validate, type ShearInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): ShearInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as ShearInput
}

describe('geser & torsi — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeShear(SHEAR_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['torsi diabaikan', 'tanpa torsi', 'geser besar', 'penampang tidak cukup', 'spasi terlalu besar', 'Vs > 0,33', 'balok tinggi', 'Al tidak cukup', 'beton ringan', 'fc 80'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeShear(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi: samping kelipatan 2, atas/bawah ≥ 2; geometri mustahil → alasan', () => {
    expect(validate({ ...SHEAR_DEFAULTS, nSide: '3', nBot: '1', s: '0' })).toEqual({ nSide: 'Kelipatan 2 (kiri = kanan)', nBot: 'Bilangan bulat ≥ 2', s: 'Harus > 0' })
    expect(computeShear(fromGolden('inti <= 0'))).toBeNull()
    expect(rejectReason(fromGolden('inti <= 0'))).toMatch(/inti sengkang/)
    expect(rejectReason({ ...SHEAR_DEFAULTS, h: '30', cc: '20' })).toMatch(/Tinggi efektif/)
  })
})

describe('geser & torsi — laporan', () => {
  const steps = (i: ShearInput) => buildShearReport(i)!.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
  it('langkah konsisten dengan hasil hitung; tanpa torsi → bagian torsi tidak ada', () => {
    const r = computeShear(SHEAR_DEFAULTS)!
    const v = Object.fromEntries(steps(SHEAR_DEFAULTS).map((s) => [s.lhs, s.value]))
    expect(v['V_{c}']).toBe(r.VckN!.toFixed(1))
    expect(v['φV_{n}']).toBe(r.phiVnkN!.toFixed(1))
    expect(v['φT_{n}']).toBe(r.phiTnkNm!.toFixed(2))
    expect(v['A_{l,pasang}']).toBe(r.AlProv!.toFixed(0))
    expect(buildShearReport(fromGolden('tanpa torsi'))!.sections.some((s) => s.title.startsWith('Kuat torsi'))).toBe(false)
  })
})
