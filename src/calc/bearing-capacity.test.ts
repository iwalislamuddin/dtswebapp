import { describe, expect, it } from 'vitest'
import golden from './__golden__/bearing-capacity.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeBearing, type BearingInput } from './bearing-capacity'

describe('bearing-capacity — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeBearing(c.args[0] as BearingInput), c.output)).toEqual([])
  })
})

describe('bearing-capacity — hitung tangan (docs/HANDOFF.md)', () => {
  // Bujur sangkar B=2, Df=1,5, c=10 kPa, φ=30°, γ=18, FS=3, tanpa air.
  const base: BearingInput = {
    shape: 'square', B: 2, L: 3, Df: 1.5, c: 10, phi: 30, gamma: 18, gsat: 20, Dw: 99,
    method: 'terzaghi', tfail: 'general', FS: 3, qapp: 0,
  }

  it('tiga metode', () => {
    const r = computeBearing(base)
    if (!r.valid) throw new Error('harus valid')
    const { terzaghi: T, meyerhof: M, vesic: V } = r.methods
    expect([T.Nc, T.Nq, T.Ng].map((x) => +x.toFixed(1))).toEqual([37.2, 22.5, 19.7])
    expect(T.qu).toBeCloseTo(1373, 0)
    expect(T.qall).toBeCloseTo(458, 0)
    expect([M.Nc, M.Nq, M.Ng].map((x) => +x.toFixed(1))).toEqual([30.1, 18.4, 15.7])
    expect(M.qu).toBeCloseTo(1752, 0)
    expect([V.Ng].map((x) => +x.toFixed(1))).toEqual([22.4])
    expect(V.qu).toBeCloseTo(1826, 0)
  })

  it('φ = 0 (undrained): Nc 5,7 / 5,14, Nq 1, Nγ 0', () => {
    const r = computeBearing({ ...base, phi: 0 })
    if (!r.valid) throw new Error('harus valid')
    expect(r.methods.terzaghi.Nc).toBe(5.7)
    expect(r.methods.meyerhof.Nc).toBe(5.14)
    expect(r.methods.vesic.Nq).toBeCloseTo(1, 12)
    expect(r.methods.terzaghi.Ng).toBe(0)
  })

  it('MAT Dw = 0,5: q 19,2 kPa, γ efektif 10,2', () => {
    const r = computeBearing({ ...base, Dw: 0.5 })
    if (!r.valid) throw new Error('harus valid')
    expect(r.q).toBeCloseTo(19.2, 1)
    expect(r.gBase).toBeCloseTo(10.19, 2)
  })

  it('φ > 50° ditandai, tanpa bocor ke perhitungan berikutnya', () => {
    const tinggi = computeBearing({ ...base, phi: 55 })
    const nol = computeBearing({ ...base, phi: 0 })
    if (!tinggi.valid || !nol.valid) throw new Error('harus valid')
    expect(tinggi.methods.terzaghi.cap).toBe(true)
    expect(nol.methods.terzaghi.cap).toBe(false)
  })
})
