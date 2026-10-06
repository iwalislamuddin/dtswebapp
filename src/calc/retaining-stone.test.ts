import { describe, expect, it } from 'vitest'
import golden from './__golden__/retaining-stone.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeStoneWall, type StoneWallInput } from './retaining-stone'
import { basePressure } from './shared/retaining'

describe('retaining-stone — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeStoneWall(c.args[0] as StoneWallInput), c.output)).toEqual([])
  })
})

describe('shared/retaining — tekanan dasar', () => {
  it('trapesium, segitiga ke toe, segitiga ke heel, terguling', () => {
    expect(basePressure(300, 3, 1.5)).toMatchObject({ e: 0, qmax: 100, qmin: 100, tri: false })
    expect(basePressure(300, 3, 0.75)).toMatchObject({ qmax: (2 * 300) / (3 * 0.75), qmin: 0, tri: true })
    expect(basePressure(300, 3, 2.25)).toMatchObject({ qmax: (2 * 300) / (3 * 0.75), qmin: 0, tri: true })
    expect(basePressure(300, 3, -0.1)).toMatchObject({ qmax: Infinity, overturned: true })
  })
})
