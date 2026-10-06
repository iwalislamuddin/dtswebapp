import { describe, expect, it } from 'vitest'
import golden from './__golden__/column-pm.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeColumnPM, type ColumnPMInput } from './column-pm'

describe('column-pm — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeColumnPM(c.args[0] as ColumnPMInput), c.output)).toEqual([])
  })
})

describe('column-pm — hitung tangan', () => {
  it('Po = 0,85f\'c(Ag − Ast) + fy·Ast; tarik murni = −fy·Ast', () => {
    const r = computeColumnPM({
      shape: 'rect', b: 400, h: 400, D: 0, tx: 0, ty: 0, bw: 0, tf: 0, dp: 60, fc: 25, fy: 400, db: 19,
      nx: 3, ny: 3, ncirc: 0, spac: 0, tie: 'tie', Pu: 1000, Mux: 100, Muy: 0,
    })
    const Ast = 8 * Math.PI * 19 * 19 / 4
    expect(r.nBars).toBe(8)
    expect(r.Po).toBeCloseTo((0.85 * 25 * (160000 - Ast) + 400 * Ast) / 1000, 6)
    expect(r.Pnt).toBeCloseTo((-400 * Ast) / 1000, 6)
    expect(r.phiPnMax).toBeCloseTo(0.65 * 0.8 * (r.Po as number), 9)
  })
})
