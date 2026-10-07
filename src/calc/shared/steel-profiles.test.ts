import { describe, expect, it } from 'vitest'
import golden from '../__golden__/steel-profiles.json'
import { goldenDiff, type GoldenCase } from '../__golden__/golden'
import { getProfile, listProfiles, PIPE, rminMm, tGov, typeInfo } from './steel-profiles'

function run(c: GoldenCase): unknown {
  const [a, b] = c.args as string[]
  if (c.fn === 'list') return listProfiles(a)
  if (c.fn === 'get') return getProfile(a, b)
  return typeInfo(a)
}

describe('steel-profiles — sama dengan core/steel-profiles.js', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(run(c), c.output)).toEqual([])
  })
})

describe('steel-profiles — hitung tangan & perilaku', () => {
  it('pipa Ø114,3×6 eksak: Ag 2041 mm² (HANDOFF)', () => {
    expect(PIPE(114.3, 6).A * 100).toBeCloseTo(2041, 0)
  })
  it('tGov: WF/UNP → tf, lainnya → t', () => {
    const wf = getProfile('WF', '400×200×8×13')!
    expect(tGov('WF', wf)).toBe(13)
    expect(tGov('SHS', getProfile('SHS', '100×100×6')!)).toBe(6)
  })
  it('BUG lama dipertahankan (port 1:1): siku Sx = imin tabel, imin kosong', () => {
    const L = getProfile('L', 'L 75×75×6')!
    expect(L.Sx).toBe(1.46)
    expect(L.imin).toBeUndefined()
    expect(rminMm(L)).toBeNaN()
  })
})
