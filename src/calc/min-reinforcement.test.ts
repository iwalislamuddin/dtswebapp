import { describe, expect, it } from 'vitest'
import golden from './__golden__/min-reinforcement.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeMinRebar, type MinRebarInput } from './min-reinforcement'

describe('min-reinforcement — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeMinRebar(c.args[0] as MinRebarInput), c.output)).toEqual([])
  })
})
