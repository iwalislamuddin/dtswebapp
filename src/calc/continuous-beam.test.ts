import { describe, expect, it } from 'vitest'
import golden from './__golden__/continuous-beam.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeContinuousBeam, type ContinuousBeamInput } from './continuous-beam'

describe('continuous-beam — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeContinuousBeam(c.args[0] as ContinuousBeamInput), c.output)).toEqual([])
  })
})
