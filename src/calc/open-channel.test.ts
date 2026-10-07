import { describe, expect, it } from 'vitest'
import golden from './__golden__/open-channel.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeOpenChannel, type OpenChannelInput } from './open-channel'

describe('open-channel — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeOpenChannel(c.args[0] as OpenChannelInput), c.output)).toEqual([])
  })
})

describe('open-channel — konsistensi', () => {
  it('kedalaman normal dari Q mengembalikan Q yang sama bila dihitung dari y', () => {
    const base: OpenChannelInput = { shape: 'trap', b: 1, m: 1.5, D: 1, mat: 'concrete', nman: 0.013, S: 0.001, mode: 'fromQ', y: 0, Q: 1.7 }
    const fromQ = computeOpenChannel(base)
    const fromY = computeOpenChannel({ ...base, mode: 'fromY', y: fromQ.y as number })
    expect(fromY.Q).toBeCloseTo(1.7, 9)
  })
})
