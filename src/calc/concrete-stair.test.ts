import { describe, expect, it } from 'vitest'
import golden from './__golden__/concrete-stair.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeStair, type StairInput } from './concrete-stair'

describe('concrete-stair — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeStair(c.args[0] as StairInput), c.output)).toEqual([])
  })
})

describe('concrete-stair — perbaikan & kesetimbangan', () => {
  const base: StairInput = { L1: 1.2, L2: 2.52, L3: 1.2, H: 1.8, R: 175, tw: 150, supA: 'sendi', supB: 'rol', SDL: 1.5, LL: 3.0, fc: 25, fy: 420, cc: 20, db: 13 }

  it('rol-rol: dilaporkan mekanisme (build lama crash)', () => {
    const r = computeStair({ ...base, supA: 'rol', supB: 'rol' })
    expect(r.unstable).toBe(true)
    expect(r.warn[0]).toMatch(/tidak stabil/)
  })

  it('Σ reaksi vertikal = Σ wu·L', () => {
    const r = computeStair(base)
    expect(r.sumRy).toBeCloseTo(r.Wu as number, 6)
    expect(r.sumRx).toBeCloseTo(0, 6)
  })
})
