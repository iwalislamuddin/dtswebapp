import { describe, expect, it } from 'vitest'
import golden from './__golden__/two-way-slab.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeTwoWaySlab, type TwoWaySlabInput } from './two-way-slab'

describe('two-way-slab — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeTwoWaySlab(c.args[0] as TwoWaySlabInput), c.output)).toEqual([])
  })
})
