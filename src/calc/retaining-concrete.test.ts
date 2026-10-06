import { describe, expect, it } from 'vitest'
import golden from './__golden__/retaining-concrete.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeConcreteWall, type ConcreteWallInput } from './retaining-concrete'

describe('retaining-concrete — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeConcreteWall(c.args[0] as ConcreteWallInput), c.output)).toEqual([])
  })
})
