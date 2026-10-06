import { describe, expect, it } from 'vitest'
import golden from './__golden__/pile-cap.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computePileCap, type PileCapInput } from './pile-cap'

describe('pile-cap — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computePileCap(c.args[0] as PileCapInput), c.output)).toEqual([])
  })
})

describe('pile-cap — hitung tangan', () => {
  it('4 tiang, beban sentris: reaksi Pu/4, momen lentur = 2·R·(s/2 − c/2)', () => {
    const r = computePileCap({
      mode: 'pu', Pu: 4000, Mux: 0, Muy: 0, Q: 0, n: 4, dp: 400, s: 1200, ov: 400, cx: 500, cy: 500, h: 800, cov: 75, fc: 30, fy: 420, db: 25,
    })
    expect(r.R).toEqual([1000, 1000, 1000, 1000])
    expect(r.Lx).toBe(2000)
    expect(r.flexX?.Mu).toBeCloseTo(2 * 1000 * (600 - 250), 9) // kN·mm
  })
})
