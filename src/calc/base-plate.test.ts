import { describe, expect, it } from 'vitest'
import { getProfile } from './shared/steel-profiles'
import { computeBasePlate, holeDiameter, type BasePlateInput } from './base-plate'

const W = getProfile('WF', '250×250×9×14')!

const base: BasePlateInput = {
  fixity: 'fixed', colType: 'WF', prof: W, colFy: 240, Ry: 1.5,
  N: 400, B: 350, tp: 25, plateFy: 240,
  anchorGrade: 'F1554-36', da: 24, nRow: 2, aN: 50, aB: 60, hef: 400, head: 'headed', eh: 100,
  fc: 25, support: 'pedestal', Lp: 600, Bp: 550, ha: 800, caN: 0, caB: 0, cracked: true, condA: false, grout: 30,
  loadMode: 'actual', Pu: 400, Mu: 60, Vu: 50, H: 4000, K: 1, shearMode: 'friction', weld: 8, FEXX: 490,
}
const run = (p: Partial<BasePlateInput>) => computeBasePlate({ ...base, ...p })
const close = (a: number, b: number, rel = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)))

describe('base-plate — hitung tangan', () => {
  it('tumpu konsentrik: fp(max), A2 pedestal, λn′ dan tp perlu (DG1 §3.1)', () => {
    const r = run({ fixity: 'pinned', Mu: 0, Vu: 0 })
    // √(A2/A1) = min(600/400, 550/350) = 1,5
    close(r.sqrtR, 1.5)
    close(r.fpMax, 0.65 * 0.85 * 25 * 1.5)
    expect(r.regime).toBe('bearing')
    close(r.fp, 400e3 / (400 * 350))
    close(r.m, (400 - 0.95 * 250) / 2)
    close(r.n, (350 - 0.8 * 250) / 2)
    const X = ((4 * 250 * 250) / 500 ** 2) * (400e3 / (0.65 * 0.85 * 25 * 1.5 * 400 * 350))
    const lam = Math.min(1, (2 * Math.sqrt(X)) / (1 + Math.sqrt(1 - X)))
    close(r.lamN, (lam * 250) / 4)
    const l = Math.max(r.m, r.n, r.lamN)
    close(r.tpReq, l * Math.sqrt((2 * r.fp) / (0.9 * 240)))
    expect(r.Trow).toBe(0)
  })

  it('momen besar: Y, T dan tebal sisi tarik (DG1 §3.4)', () => {
    const r = run({ Pu: 100, Mu: 80 })
    expect(r.regime).toBe('large')
    const f = 200 - 50, q = r.fpMax * 350, h = f + 200
    const Y = h - Math.sqrt(h * h - (2 * (80e6 + 100e3 * f)) / q)
    close(r.Y, Y)
    close(r.Trow, (q * Y - 100e3) / 1000)
    close(r.Tanchor, r.Trow / 2)
    const x = f - (250 / 2 - 14 / 2)
    close(r.tpTens, Math.sqrt((4 * r.Trow * 1000 * x) / (0.9 * 240 * 350)))
    // keseimbangan: C − T = Pu ; momen terhadap pusat pelat = Mu
    const C = q * Y
    close((C - r.Trow * 1000) / 1000, 100)
    close((C * (200 - Y / 2) + r.Trow * 1000 * f) / 1e6, 80)
  })

  it('momen kecil: tumpu saja, angkur tidak tarik', () => {
    const r = run({ Pu: 800, Mu: 20 })
    expect(r.regime).toBe('small')
    close(r.Y, 400 - 2 * 25)
    expect(r.Trow).toBe(0)
  })

  it('uplift murni: gaya dibagi rata, tanpa tumpu; uplift + momen tanpa tumpu', () => {
    const r = run({ fixity: 'pinned', Pu: -120, Mu: 0, Vu: 0 })
    expect(r.regime).toBe('uplift')
    close(r.Tanchor, 30)
    expect(r.nTens).toBe(4)
    expect(r.checks.find((c) => c.key === 'brg')).toBeUndefined()
    const u = run({ Pu: -100, Mu: 5 })
    expect(u.regime).toBe('uplift')
    close(u.Trow, 50 + 5e6 / (2 * 150) / 1000)
    close(u.Trow2, 50 - 5e6 / (2 * 150) / 1000)
  })

  it('baja angkur & jebol beton tarik (17.6.1–17.6.2)', () => {
    const r = run({ Pu: 100, Mu: 80 })
    close(r.phiNsa, (0.75 * 353 * 400) / 1000)
    // caN = (600−400)/2 + 50 = 150, caB = (550−350)/2 + 60 = 160 → 4 tepi < 1,5·hef → hef′ = max(160/1,5; 300/3)
    expect(r.hefReduced).toBe(true)
    close(r.hefUsed, Math.max(160 / 1.5, 300 / 3))
    const h = r.hefUsed
    close(r.Nb, (10 * 5 * h ** 1.5) / 1000)
    const ANc = (Math.min(1.5 * h, 150) + Math.min(1.5 * h, 300)) * (230 + 2 * Math.min(1.5 * h, 160))
    close(r.ANc, Math.min(ANc, 2 * 9 * h * h))
  })

  it('desain kapasitas jepit: Mpr = 1,1·Ry·Fy·Zx, Vu = 2Mpr/H', () => {
    const r = run({ loadMode: 'capacity' })
    const Zx = 250 * 14 * (250 - 14) + (9 * (250 - 28) ** 2) / 4
    close(r.Mu, (1.1 * 1.5 * 240 * Zx) / 1e6)
    close(r.Vu, (2 * r.Mu) / 4)
  })

  it('desain kapasitas sendi: Pu = φc·Pn kolom (E3)', () => {
    const r = run({ fixity: 'pinned', loadMode: 'capacity', K: 1, H: 4000 })
    const rmin = (W.imin as number) * 10, lam = 4000 / rmin
    const Fe = (Math.PI ** 2 * 200000) / lam ** 2
    close(r.Pu, (0.9 * Math.pow(0.658, 240 / Fe) * 240 * W.A * 100) / 1000)
    expect(r.Mu).toBe(0)
  })

  it('slab: √(A2/A1) dari frustum 1V:2H, dibatasi 2; tanpa tepi dekat', () => {
    const r = run({ support: 'slab', ha: 300 })
    close(r.sqrtR, 2)
    expect(r.caN).toBe(Infinity)
    const t = run({ support: 'slab', ha: 50 })
    close(t.sqrtR, Math.min(600 / 400, 550 / 350))
  })

  it('geser oleh angkur: baja ×0,8 grout, jebol geser & cungkil; interaksi 1,2', () => {
    const r = run({ shearMode: 'anchors', Pu: 100, Mu: 80, Vu: 120 })
    close(r.Vsa, ((0.6 * 353 * 400) / 1000) * 0.8)
    expect(r.phiVcbg).not.toBeNull()
    expect(r.checks.some((c) => c.key === 'Vcp')).toBe(true)
    if (r.inter != null) close(r.inter, r.interN + r.interV)
  })

  it('las sudut: tegangan resultan per satuan panjang vs φ·0,6FEXX·0,707w', () => {
    const r = run({ Pu: 100, Mu: 80, Vu: 50 })
    close(r.phiRw, 0.75 * 0.6 * 490 * 0.707 * 8)
    close(r.fr, Math.hypot(r.fn, r.fv))
  })

  it('profil SHS & pipa: m, n dari 0,95 / 0,8', () => {
    const s = run({ colType: 'SHS', prof: getProfile('SHS', '200×200×9')!, Mu: 0, fixity: 'pinned' })
    close(s.m, (400 - 0.95 * 200) / 2)
    const p = run({ colType: 'PIPE', prof: getProfile('PIPE', 'Ø216.3×8.2')!, Mu: 0, fixity: 'pinned' })
    close(p.n, (350 - 0.8 * 216.3) / 2)
  })

  it('lubang angkur DG1 Tabel 2.3', () => {
    expect(holeDiameter(24)).toBe(40)
    expect(holeDiameter(30)).toBe(51)
  })
})
