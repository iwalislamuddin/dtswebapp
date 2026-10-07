import { describe, expect, it } from 'vitest'
import golden from './__golden__/rational-method.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeRational, type RationalInput } from './rational-method'

describe('rational-method — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeRational(c.args[0] as RationalInput), c.output)).toEqual([])
  })
})
