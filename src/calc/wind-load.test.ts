import { describe, expect, it } from 'vitest'
import golden from './__golden__/wind-load.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeWind, type WindInput } from './wind-load'

describe('wind-load — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeWind(c.args[0] as WindInput), c.output)).toEqual([])
  })
})
