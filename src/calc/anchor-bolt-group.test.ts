import { describe, expect, it } from 'vitest'
import golden from './__golden__/anchor-bolt-group.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeAnchorBoltGroup, type AnchorBoltGroupInput } from './anchor-bolt-group'

describe('anchor-bolt-group — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeAnchorBoltGroup(c.args[0] as AnchorBoltGroupInput), c.output)).toEqual([])
  })
})
