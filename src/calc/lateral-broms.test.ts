import { describe, expect, it } from 'vitest'
import golden from './__golden__/lateral-broms.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeBroms, type BromsInput } from './lateral-broms'

describe('lateral-broms — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeBroms(c.args[0] as BromsInput), c.output)).toEqual([])
  })
})

describe('lateral-broms — hitung tangan', () => {
  const base: BromsInput = { soil: 'clay', head: 'fixed', D: 500, L: 10, e: 0, My: 800, cu: 50, phi: 32, gam: 9 }

  it('lempung jepit pendek: Hu = 9·cu·D·(L − 1,5D)', () => {
    const r = computeBroms({ ...base, L: 3, My: 5000 })
    expect(r.Hshort).toBeCloseTo(9 * 50 * 0.5 * (3 - 0.75), 9)
    expect(r.short).toBe(true)
  })

  it('pasir bebas panjang: akar bisection memenuhi My = e·H + 0,5443·H^1,5/√(Kp·γ·D)', () => {
    const r = computeBroms({ ...base, soil: 'sand', head: 'free', e: 1 })
    const coef = (r.Kp as number) * 9 * 0.5
    const H = r.Hlong as number
    expect(1 * H + (0.5443 / Math.sqrt(coef)) * Math.pow(H, 1.5)).toBeCloseTo(800, 6)
  })
})
