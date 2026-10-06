import { describe, expect, it } from 'vitest'
import golden from './__golden__/cpt-bearing.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeCptBearing, type CptBearingInput } from './cpt-bearing'
import { parseCpt, type CptPoint } from './shared/cpt'

describe('cpt-bearing — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeCptBearing(c.args[0] as CptBearingInput, c.args[1] as CptPoint[]), c.output)).toEqual([])
  })
})

describe('cpt-bearing — hitung tangan', () => {
  it('pasir B ≤ 1,2 m: qa = qc̄/15·Kd', () => {
    // qc konstan 100 kg/cm² → qc̄ = 9806,65 kPa; B=1, Df=1 → Kd = 1,33 (dibatasi).
    const pts = parseCpt('0 100\n10 100', 'kgcm2')
    const r = computeCptBearing({ B: 1, L: 1, Df: 1, gamma: 18, soil: 'sand', Nk: 14, FS: 3, qw: 0 }, pts)
    expect(r.qcb).toBeCloseTo(9806.65, 6)
    expect(r.Kd).toBe(1.33)
    expect(r.qaNet).toBeCloseTo((9806.65 / 15) * 1.33, 6)
    expect(r.qaGross).toBeCloseTo((9806.65 / 15) * 1.33 + 18, 6)
  })

  it('lempung: su = (qc̄ − σv0)/Nk + Skempton', () => {
    // qc konstan 1000 kPa (1 MPa); B=L=2, Df=1, γ=20 → su = (1000−20)/14 = 70; qult = 5·70·1,1·1,2 = 462.
    const pts = parseCpt('0 1\n10 1', 'mpa')
    const r = computeCptBearing({ B: 2, L: 2, Df: 1, gamma: 20, soil: 'clay', Nk: 14, FS: 3, qw: 0 }, pts)
    expect(r.su).toBeCloseTo(70, 9)
    expect(r.qult).toBeCloseTo(462, 9)
    expect(r.qaNet).toBeCloseTo(154, 9)
  })
})
