import { describe, expect, it } from 'vitest'
import golden from './__golden__/pile-capacity.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computePile, DEFAULT_PILE_LAYERS, type PileInput, type PileLayer } from './pile-capacity'

describe('pile-capacity — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computePile(c.args[0] as PileInput, c.args[1] as PileLayer[]), c.output)).toEqual([])
  })
})

describe('pile-capacity — hitung tangan (docs/HANDOFF.md)', () => {
  // Bulat D=0,4 m, L=12, pancang beton, Dw=2, FS=2,5; L1 lempung, L2–L3 pasir, semua statik.
  const g: PileInput = { shape: 'circular', D: 0.4, L: 12, ptype: 'driven', material: 'concrete', Dw: 2, FS: 2.5, inclW: 'no' }
  const layers = (): PileLayer[] => DEFAULT_PILE_LAYERS.map((l) => ({ ...l }))

  it('kasus default', () => {
    const r = computePile(g, layers())
    if (!r.valid) throw new Error('harus valid')
    expect(r.segs.map((s) => +s.fs.toFixed(1))).toEqual([19.2, 23.0, 33.9])
    expect(r.Qs).toBeCloseTo(355.0, 1)
    expect(r.svTip).toBeCloseTo(115.9, 1)
    expect(r.Nq).toBeCloseTo(37.8, 1)
    expect(r.qp).toBeCloseTo(1371, 0)
    expect(r.Qp).toBeCloseTo(172.3, 1)
    expect(r.Qu).toBeCloseTo(527.4, 1)
    expect(Math.round(r.Qallow)).toBe(211)
  })

  it('SPT di lapis 3 → 882 kN; L = 8 → 116 kN', () => {
    const spt = layers()
    spt[2].method = 'spt'
    const a = computePile(g, spt)
    const b = computePile({ ...g, L: 8 }, layers())
    if (!a.valid || !b.valid) throw new Error('harus valid')
    expect(a.qp).toBe(14000)
    expect(Math.round(a.Qallow)).toBe(882)
    expect(Math.round(b.Qallow)).toBe(116)
  })

  it('Decourt-Quaresma', () => {
    const r = computePile(g, layers())
    if (!r.valid || !r.dq.active) throw new Error('Decourt harus aktif')
    expect(r.dq.NsAvg).toBeCloseTo(16.8, 1)
    expect(r.dq.fsDq).toBeCloseTo(66.1, 1)
    expect(r.dq.QpDq).toBeCloseTo(1759, 0)
    expect(r.dq.QuDq).toBeCloseTo(2756, 0)
  })
})
