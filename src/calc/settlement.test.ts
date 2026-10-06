import { describe, expect, it } from 'vitest'
import golden from './__golden__/settlement.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeSettlement, degreeOfConsolidation, type SettlementInput } from './settlement'

describe('settlement — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeSettlement(c.args[0] as SettlementInput), c.output)).toEqual([])
  })
})

describe('settlement — hitung tangan (docs/HANDOFF.md)', () => {
  // Bujur sangkar B=2, Df=1,5, q0=150; Es=10 MPa, μ=0,3, H=8, If=1; lempung z=3/Hc=4, e0=0,9, Cc=0,25,
  // Cr=0,05, σ'0=60, σ'c=80; cv=1,5 m²/th, drainase ganda, t=3 th.
  const base: SettlementInput = {
    shape: 'square', B: 2, L: 3, Df: 1.5, q0: 150, Es: 10, mu: 0.3, Hs: 8, If: 1, rigid: 'flex',
    ztop: 3, Hc: 4, e0: 0.9, Cc: 0.25, Cr: 0.05, sig0: 60, sigc: 80, cv: 1.5, drain: 'double', t: 3,
  }

  it('kasus default', () => {
    const r = computeSettlement(base)
    if (!r.valid || !r.consol.active || !r.rate.active) throw new Error('harus lengkap')
    expect(r.IsCenter).toBeCloseTo(0.494, 3)
    expect(r.SeCenter).toBeCloseTo(26.95, 2)
    expect([r.consol.dTop, r.consol.dMid, r.consol.dBot].map((x) => +x.toFixed(1))).toEqual([49.0, 19.8, 10.7])
    expect(r.consol.dAvg).toBeCloseTo(23.2, 1)
    expect(r.consol.OCR).toBeCloseTo(1.33, 2)
    expect(r.consol.mode).toBe('OC-melewati-σc')
    expect(r.Sc).toBeCloseTo(22.02, 2)
    expect(r.Stotal).toBeCloseTo(48.96, 2)
    expect(r.rate.Tv).toBeCloseTo(1.125, 3)
    expect(r.rate.U).toBeCloseTo(0.95, 3)
    expect(r.rate.t50).toBeCloseTo(0.53, 2)
    expect(r.rate.t90).toBeCloseTo(2.26, 2)
    expect(r.rate.St).toBeCloseTo(47.85, 2)
  })

  it('variasi: NC, strip, lingkaran, kaku', () => {
    const sc = (over: Partial<SettlementInput>) => {
      const r = computeSettlement({ ...base, ...over })
      if (!r.valid) throw new Error('harus valid')
      return r
    }
    expect(sc({ sigc: 60 }).Sc).toBeCloseTo(74.62, 2)
    expect(sc({ shape: 'strip' }).Se).toBeCloseTo(41.3, 1)
    expect(sc({ shape: 'circular' }).Stotal).toBeCloseTo(37.7, 1)
    expect(sc({ rigid: 'rigid' }).Stotal).toBeCloseTo(43.3, 1)
  })

  it('derajat konsolidasi: perilaku build lama di U ≈ 60% (lompatan kecil, kandidat perbaikan)', () => {
    // Batas cabang memakai Tv = 0,2827 (U = 60% dari rumus akar), tetapi rumus log memberi U = 59,66% di sana.
    // Dibekukan apa adanya selama port 1:1; perbaiki terpisah (batas cabang Tv ≈ 0,286) dengan acuan baru.
    expect(degreeOfConsolidation(0.2826)).toBeCloseTo(0.6, 3)
    expect(degreeOfConsolidation(0.2828)).toBeCloseTo(0.5966, 4)
  })
})
