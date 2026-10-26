import { describe, expect, it } from 'vitest'
import golden from './__golden__/wind-load.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { cfOpenPlane, computeFreeRoof, computeOpenFrame, computeWarehouse, computeWind, cpGableRoof, cpLeeward, cpRoofZones, KzAt, type WindInput } from './wind-load'

describe('wind-load — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeWind(c.args[0] as WindInput), c.output)).toEqual([])
  })
})

// ── Tipe struktur lain: dicek terhadap tabel/gambar SNI 1727:2020 (ASCE 7-16) & hitung tangan ──
const base = { V: 35, expo: 'C' as const, Kd: 0.85, Kzt: 1, Ke: 1, G: 0.85 }

describe('gudang atap pelana — Gbr. 27.3-1', () => {
  it('Cp atap ⟂ bubungan: nilai tabel & interpolasi h/L, θ', () => {
    expect(cpGableRoof(0.25, 20)).toEqual({ ww: [-0.3, 0.2], lw: -0.6 })
    expect(cpGableRoof(1.0, 10)).toEqual({ ww: [-1.3, -0.18], lw: -0.7 })
    const c = cpGableRoof(0.6, 14.9) // baris 0,5 → −0,704; baris 1,0 → −1,006
    expect(c.ww[0]).toBeCloseTo(-0.704 + 0.2 * (-1.006 + 0.704), 9)
    expect(c.ww[1]).toBeCloseTo(-0.18, 9)
  })

  it('zona atap θ < 10° / sejajar bubungan, h/L 0,75 → interpolasi antara baris 0,5 dan 1,0', () => {
    expect(cpRoofZones(6, 8).map((z) => [z.x0, z.x1, +z.Cp.toFixed(6)])).toEqual([[0, 3, -1.1], [3, 6, -0.8], [6, 8, -0.6]])
    expect(cpRoofZones(5, 60).map((z) => [z.x0, z.x1, z.Cp])).toEqual([[0, 5, -0.9], [5, 10, -0.5], [10, 60, -0.3]])
  })

  it('hitung tangan: S 20, Lb 48, he 6, θ 15°', () => {
    const r = computeWarehouse({ ...base, enc: 'enclosed', S: 20, Lb: 48, he: 6, theta: 15, s: 6 })
    expect(r.valid).toBe(true)
    const rise = 10 * Math.tan((15 * Math.PI) / 180)
    expect(r.h).toBeCloseTo(6 + rise / 2, 9)
    const qh = (0.613 * KzAt(r.h, 'C') * 0.85 * 35 * 35) / 1000
    expect(r.qh).toBeCloseTo(qh, 12)
    const n = r.dirs[0]
    const roofW = n.surfaces.find((s) => s.name === 'Atap windward')!
    expect(roofW.Cp).toEqual(cpGableRoof(r.h / 20, 15).ww)
    // F = (0,8 qe − Cp,lee qh)·G·he·Lb + Σ atap
    const ex = (q: number, cp: number) => q * 0.85 * cp
    const lw = n.surfaces.find((s) => s.name === 'Atap leeward')!
    const F0 = (ex(r.qe, 0.8) - ex(r.qh, cpLeeward(20 / 48))) * 6 * 48 + (ex(r.qh, roofW.Cp[0]) - ex(r.qh, lw.Cp[0])) * rise * 48
    expect(n.F[0]).toBeCloseTo(F0, 9)
    // angkat atap kasus 1, +GCpi: −Σ (qhGCp − qh·0,18)·10·48
    const U0 = -((ex(r.qh, roofW.Cp[0]) - r.qh * 0.18) + (ex(r.qh, lw.Cp[0]) - r.qh * 0.18)) * 10 * 48
    expect(n.U[0]).toBeCloseTo(U0, 9)
    expect(n.Fmin).toBeCloseTo(0.77 * 48 * 6 + 0.38 * 48 * rise, 9)
  })
})

describe('atap bebas bangunan terbuka — Gbr. 27.3-4, 27.3-5, 27.3-7', () => {
  const fr = (o: Partial<Parameters<typeof computeFreeRoof>[0]>) => computeFreeRoof({ ...base, shape: 'pitched', flow: 'clear', theta: 15, h: 5, L: 10, B: 24, s: 6, ...o })

  it('pelana θ 15°: nilai tabel bersih & terhalang', () => {
    const c = fr({}).cases[0]
    expect([c.A.CNW, c.A.CNL, c.B.CNW, c.B.CNL]).toEqual([1.1, -0.4, 0.1, -1.1])
    const o = fr({ flow: 'obstructed' }).cases[0]
    expect([o.A.CNW, o.A.CNL, o.B.CNW, o.B.CNL]).toEqual([-1.2, -1.0, -0.6, -1.6])
  })

  it('pelana θ 18,75° → tengah 15° & 22,5°; θ < 7,5° → monoslope θ = 0°', () => {
    const c = fr({ theta: 18.75 }).cases[0]
    expect(c.A.CNL).toBeCloseTo(-0.15, 9)
    expect(c.B.CNL).toBeCloseTo(-0.95, 9)
    const z = fr({ theta: 5 })
    expect(z.usesMonoZero).toBe(true)
    expect([z.cases[0].A.CNW, z.cases[0].A.CNL]).toEqual([1.2, 0.3])
  })

  it('monoslope θ 15°: γ = 0° & 180°; p = qh·G·CN; gaya vertikal', () => {
    const r = fr({ shape: 'mono' })
    expect(r.cases.map((c) => [c.A.CNW, c.A.CNL, c.B.CNW, c.B.CNL])).toEqual([[-0.9, -1.3, -1.9, 0.0], [1.3, 1.6, 1.8, 0.6]])
    const A = r.cases[0].A
    expect(A.pW).toBeCloseTo(r.qh * 0.85 * -0.9, 12)
    expect(A.Fv).toBeCloseTo((A.pW + A.pL) * 5 * 24, 9)
  })

  it('γ = 90°: zona ≤ h, h–2h, > 2h', () => {
    const r = fr({})
    expect(r.zones.map((z) => [z.x0, z.x1, z.CNA, z.CNB])).toEqual([[0, 5, -0.8, 0.8], [5, 10, -0.6, 0.5], [10, 24, -0.3, 0.3]])
    expect(fr({ flow: 'obstructed' }).zones.map((z) => [z.CNA, z.CNB])).toEqual([[-1.2, 0.5], [-0.9, 0.5], [-0.6, 0.3]])
  })
})

describe('rangka terbuka — Gbr. 29.4-2 & 29.4-3', () => {
  const of = (o: Partial<Parameters<typeof computeOpenFrame>[0]>) => computeOpenFrame({ ...base, kind: 'tower', member: 'flat', tower: 'square', eps: 0.27, b: 2, z1: 0, z2: 30, D: 0.05, ...o })

  it('menara bujur sangkar ε 0,27 batang datar: Cf 2,70; diagonal ×1,2 → 3,24', () => {
    const r = of({})
    expect(r.Cf).toBeCloseTo(4 * 0.27 ** 2 - 5.9 * 0.27 + 4, 12)
    expect(r.Cf.toFixed(2)).toBe('2.70')
    expect(r.diagFactor).toBe(1.2)
    expect(r.CfDiag!.toFixed(2)).toBe('3.24')
  })

  it('menara segitiga batang bulat: faktor 0,51ε² + 0,57', () => {
    const r = of({ tower: 'triangle', member: 'round', eps: 0.3 })
    expect(r.Cf).toBeCloseTo((3.4 * 0.09 - 4.7 * 0.3 + 3.4) * (0.51 * 0.09 + 0.57), 12)
    expect(r.diagFactor).toBeUndefined()
  })

  it('bidang terbuka: tabel ε & D√qz; F segmen ≈ cara titik berat; minimum 0,77·Af', () => {
    expect(cfOpenPlane(0.05, 'flat', 0).Cf).toBe(2.0)
    expect(cfOpenPlane(0.2, 'round', 5.3).Cf).toBe(1.3)
    expect(cfOpenPlane(0.65, 'round', 21.8).Cf).toBe(1.1)
    const r = of({ kind: 'plane', eps: 0.35, b: 6, z1: 2, z2: 8 })
    expect(r.Cf).toBe(1.6)
    expect(r.Af).toBeCloseTo(0.35 * 6 * 6, 12)
    expect(r.F / r.Fc).toBeGreaterThan(0.97)
    expect(r.F / r.Fc).toBeLessThan(1.03)
    expect(r.Fmin).toBeCloseTo(0.77 * r.Af, 12)
    expect(r.Fn).toBe(Math.max(r.F, r.Fc))
    expect(r.Fdesign).toBe(Math.max(r.Fn, r.Fmin))
    expect(of({ kind: 'plane', eps: 0.8 }).valid).toBe(false)
  })
})
