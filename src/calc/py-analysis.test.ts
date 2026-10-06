import { describe, expect, it } from 'vitest'
import golden from './__golden__/py-analysis.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computePy, type PyInput } from './py-analysis'

describe('py-analysis — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computePy(c.args[0] as PyInput), c.output)).toEqual([])
  })
})

describe('py-analysis — kesetimbangan', () => {
  const base: PyInput = {
    soil: 'sand', head: 'free', H: 200, M: 0, e: 0, D: 600, L: 15, E: 25000, gam: 8, cu: 40, eps50: 0.01, phi: 33, kpy: 16,
  }

  it('Σ reaksi tanah ≈ H (gaya horizontal setimbang)', () => {
    const r = computePy(base)
    if (!r.sol) throw new Error('harus ada solusi')
    const { p, dz } = r.sol
    let sum = 0
    for (let i = 0; i < p.length; i++) sum += p[i] * (i === 0 || i === p.length - 1 ? dz / 2 : dz)
    expect(r.conv).toBe(true)
    expect(sum).toBeCloseTo(200, 0)
  })

  it('tanah sangat lunak → defleksi kepala lebih besar', () => {
    const kaku = computePy(base)
    const lunak = computePy({ ...base, kpy: 2 })
    expect(Math.abs(lunak.y0 as number)).toBeGreaterThan(Math.abs(kaku.y0 as number))
  })
})
