import { describe, expect, it } from 'vitest'
import golden from './__golden__/pipe-flow.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computePipeFlow, type PipeFlowInput } from './pipe-flow'

describe('pipe-flow — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computePipeFlow(c.args[0] as PipeFlowInput), c.output)).toEqual([])
  })
})

describe('pipe-flow — hitung tangan', () => {
  it('laminar: f = 64/Re', () => {
    const r = computePipeFlow({ D: 100, Lp: 200, mat: 'pvc', eps: 0, C: 150, Q: 0.05, nu: 1.004, sumK: 0 })
    expect(r.regime).toBe('laminar')
    expect(r.f).toBeCloseTo(64 / (r.Re as number), 12)
  })
})
