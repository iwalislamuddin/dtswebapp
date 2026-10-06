import { describe, expect, it } from 'vitest'
import golden from './__golden__/beam-shear-torsion.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeShearTorsion, type ShearTorsionInput } from './beam-shear-torsion'

describe('beam-shear-torsion — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeShearTorsion(c.args[0] as ShearTorsionInput), c.output)).toEqual([])
  })
})
