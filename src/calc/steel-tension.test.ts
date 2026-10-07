import { describe, expect, it } from 'vitest'
import golden from './__golden__/steel-tension.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeSteelTension, type SteelTensionInput } from './steel-tension'

describe('steel-tension — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeSteelTension(c.args[0] as SteelTensionInput), c.output)).toEqual([])
  })
})
