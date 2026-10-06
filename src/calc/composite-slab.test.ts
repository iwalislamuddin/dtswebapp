import { describe, expect, it } from 'vitest'
import golden from './__golden__/composite-slab.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeCompositeSlab, type CompositeSlabInput } from './composite-slab'

describe('composite-slab — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeCompositeSlab(c.args[0] as CompositeSlabInput), c.output)).toEqual([])
  })
})
