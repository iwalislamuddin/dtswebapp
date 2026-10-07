import { describe, expect, it } from 'vitest'
import golden from './__golden__/steel-compression.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeSteelCompression, type SteelCompressionInput } from './steel-compression'

describe('steel-compression — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeSteelCompression(c.args[0] as SteelCompressionInput), c.output)).toEqual([])
  })
})
