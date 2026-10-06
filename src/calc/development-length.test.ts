import { describe, expect, it } from 'vitest'
import golden from './__golden__/development-length.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeDevLength, type DevLengthInput } from './development-length'

describe('development-length — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeDevLength(c.args[0] as DevLengthInput), c.output)).toEqual([])
  })
})

describe('development-length — hitung tangan (docs/HANDOFF.md)', () => {
  const base = { fc: 25, fy: 420, barType: 'ulir' as const, db: 19, psit: 1, psie: 1, lambda: 1, cb: 40, ktrMode: 'zero' as const, Atr: 0, s: 100, n: 1 }
  it('D19 ulir → 560 mm, Ø19 polos → 1110 mm', () => {
    expect(computeDevLength(base).ldRound).toBe(560)
    expect(computeDevLength({ ...base, barType: 'polos' }).ldRound).toBe(1110)
  })
})
