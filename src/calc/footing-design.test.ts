import { describe, expect, it } from 'vitest'
import golden from './__golden__/footing-design.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeFooting, type FootingInput } from './footing-design'

describe('footing-design — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeFooting(c.args[0] as FootingInput), c.output)).toEqual([])
  })
})
