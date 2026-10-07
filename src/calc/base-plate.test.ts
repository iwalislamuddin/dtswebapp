import { describe, expect, it } from 'vitest'
import golden from './__golden__/base-plate.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeBasePlate, type BasePlateInput } from './base-plate'

describe('base-plate — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeBasePlate(c.args[0] as BasePlateInput), c.output)).toEqual([])
  })
})
