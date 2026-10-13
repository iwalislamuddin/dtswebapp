import { describe, expect, it } from 'vitest'
import { envelope, solveBeam, type BeamModel } from './beam-solver'

const EI = 2e13 // N·mm²
const uniform = (n: number, nEl: number) => Array.from({ length: n * nEl }, () => EI)

function maxAbs(sol: NonNullable<ReturnType<typeof solveBeam>>, f: 'Ms' | 'Vs') {
  return Math.max(...sol.els.flatMap((e) => e[f].map(Math.abs)))
}

describe('beam-solver — rumus tertutup', () => {
  it('sendi–sendi: M = wL²/8, V = wL/2, δ = 5wL⁴/384EI', () => {
    const m: BeamModel = { spans: [4000], nEl: 8, fixedL: false, fixedR: false }
    const w = 10 // N/mm
    const s = solveBeam(m, uniform(1, 8), [w])!
    expect(maxAbs(s, 'Ms')).toBeCloseTo((w * 4000 ** 2) / 8, -3)
    expect(Math.max(...s.els.flatMap((e) => e.Vs))).toBeCloseTo((w * 4000) / 2, 0)
    expect(Math.max(...s.dy)).toBeCloseTo((5 * w * 4000 ** 4) / (384 * EI), 6)
  })

  it('jepit–jepit: M tumpuan wL²/12, lapangan wL²/24, δ = wL⁴/384EI', () => {
    const m: BeamModel = { spans: [4000], nEl: 8, fixedL: true, fixedR: true }
    const w = 10
    const s = solveBeam(m, uniform(1, 8), [w])!
    const Ms = s.els.flatMap((e) => e.Ms)
    expect(Math.min(...Ms)).toBeCloseTo((-w * 4000 ** 2) / 12, -3)
    expect(Math.max(...Ms)).toBeCloseTo((w * 4000 ** 2) / 24, -3)
    expect(Math.max(...s.dy)).toBeCloseTo((w * 4000 ** 4) / (384 * EI), 6)
  })

  it('dua bentang sama: M tumpuan tengah wL²/8, reaksi tengah 5wL/4', () => {
    const m: BeamModel = { spans: [4000, 4000], nEl: 8, fixedL: false, fixedR: false }
    const w = 10
    const s = solveBeam(m, uniform(2, 8), [w, w])!
    expect(Math.min(...s.els.flatMap((e) => e.Ms))).toBeCloseTo((-w * 4000 ** 2) / 8, -3)
    // geser di kiri & kanan tumpuan tengah: 5wL/8 & 5wL/8
    expect(maxAbs(s, 'Vs')).toBeCloseTo((5 * w * 4000) / 8, 0)
  })

  it('tiga bentang sama: M tumpuan dalam wL²/10, lapangan ujung 0,08wL²', () => {
    const m: BeamModel = { spans: [4000, 4000, 4000], nEl: 10, fixedL: false, fixedR: false }
    const w = 10
    const s = solveBeam(m, uniform(3, 10), [w, w, w])!
    const Ms = s.els.flatMap((e) => e.Ms)
    expect(Math.min(...Ms)).toBeCloseTo((-w * 4000 ** 2) / 10, -3)
    expect(Math.max(...Ms)).toBeCloseTo(0.08 * w * 4000 ** 2, -3)
  })

  it('EI bervariasi: bagian lebih lunak melendut lebih besar; amplop memuat semua kasus', () => {
    const m: BeamModel = { spans: [4000], nEl: 8, fixedL: false, fixedR: false }
    const soft = uniform(1, 8).map((v, i) => (i >= 3 && i <= 4 ? v / 3 : v))
    const base = solveBeam(m, uniform(1, 8), [10])!
    const s = solveBeam(m, soft, [10])!
    expect(Math.max(...s.dy)).toBeGreaterThan(Math.max(...base.dy))
    const a = solveBeam({ ...m, spans: [4000, 4000] }, uniform(2, 8), [10, 0])!
    const b = solveBeam({ ...m, spans: [4000, 4000] }, uniform(2, 8), [0, 10])!
    const env = envelope([a, b])
    expect(Math.max(...env.Mmax)).toBeGreaterThan(0)
    expect(Math.min(...env.Mmin)).toBeLessThan(0)
  })
})
