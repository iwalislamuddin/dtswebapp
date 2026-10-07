import { describe, expect, it } from 'vitest'
import golden from './__golden__/steel-flexure.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeSteelFlexure, type SteelFlexureInput } from './steel-flexure'

describe('steel-flexure — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeSteelFlexure(c.args[0] as SteelFlexureInput), c.output)).toEqual([])
  })
})

describe('steel-flexure — perbaikan', () => {
  it('SHS sayap langsing: build lama crash (lamF tak ada di F7), port memberi peringatan', () => {
    const r = computeSteelFlexure({ ptype: 'SHS', psize: '200×200×6', Fy: 450, axis: 'x', Lb: 0, Cbpreset: '1', Cbval: 1, Mu: 0, Ma: 0 })
    expect(r.valid).toBe(true)
    expect(r.f?.flange?.cls).toBe('langsing')
    expect(r.warn.some((w) => w.startsWith('Sayap LANGSING'))).toBe(true)
  })
})
