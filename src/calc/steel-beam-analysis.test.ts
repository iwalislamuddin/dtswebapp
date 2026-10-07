import { describe, expect, it } from 'vitest'
import golden from './__golden__/steel-beam-analysis.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeSteelBeam, type SteelBeamInput } from './steel-beam-analysis'
import { getProfile, type SteelProfile } from './shared/steel-profiles'

describe('steel-beam-analysis — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    // Argumen kedua = profil yang diisi UI lama ke state modul.
    expect(goldenDiff(computeSteelBeam(c.args[0] as SteelBeamInput, c.args[1] as SteelProfile), c.output)).toEqual([])
  })
})

describe('steel-beam-analysis — hitung tangan', () => {
  it('balok sederhana beban merata: M = wL²/8, δ = 5wL⁴/384EI', () => {
    const prof = getProfile('WF', '300×150×6.5×9') as SteelProfile
    const r = computeSteelBeam({ L: 6, cL: 0, cR: 0, E: 200000, self: 'tidak', nd: 1, np: 0, d1_w1: 10, d1_w2: 10, d1_a1: 0, d1_a2: 6 }, prof)
    expect(r.Mmax).toBeCloseTo((10 * 36) / 8, 6)
    expect(r.RA).toBeCloseTo(30, 9)
    expect(r.ymax).toBeCloseTo((5 * 10 * 6000 ** 4) / (384 * 200000 * prof.Ix * 1e4), 2)
  })
})
