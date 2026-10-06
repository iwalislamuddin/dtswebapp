import { describe, expect, it } from 'vitest'
import golden from './__golden__/beam-flexure.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeBeamFlexure, type BeamFlexureInput } from './beam-flexure'

describe('beam-flexure — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeBeamFlexure(c.args[0] as BeamFlexureInput), c.output)).toEqual([])
  })
})

describe('beam-flexure — hitung tangan (docs/HANDOFF.md)', () => {
  const base = { fc: 25, fy: 420, b: 300, h: 500, cc: 40, ds: 10, n1: 3, db1: 19, nLay: 1, sv: 25, doubly: 'no' as const, n2: 2, db2: 16 }
  it('3D19 → φMn 132,6 kNm; 8D25 over-reinforced → φ 0,65', () => {
    expect(computeBeamFlexure(base).phiMnkNm).toBeCloseTo(132.6, 1)
    const over = computeBeamFlexure({ ...base, n1: 8, db1: 25, nLay: 2 })
    expect(over.phi).toBe(0.65)
    expect(over.fs).toBeLessThan(420) // baja tarik tidak leleh
  })
})
