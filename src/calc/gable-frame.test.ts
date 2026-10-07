import { describe, expect, it } from 'vitest'
import golden from './__golden__/gable-frame.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeGable, type GableInput } from './gable-frame'

describe('gable-frame — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeGable(c.args[0] as GableInput), c.output)).toEqual([])
  })
})

describe('gable-frame — kesetimbangan', () => {
  it('Σ reaksi horizontal = −Σ lateral', () => {
    const base = (golden as GoldenCase[])[0].args[0] as GableInput
    const r = computeGable({ ...base, HL1: 10, HL2: 5 })
    expect(r.sumRx).toBeCloseTo(-15, 6)
    expect(r.sumRy).toBeCloseTo(r.Wgrav as number, 6)
  })
})
