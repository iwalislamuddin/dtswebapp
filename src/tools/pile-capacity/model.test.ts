import { describe, expect, it } from 'vitest'
import { alphaOneill, betaOneill, computePile, cuFromN, gammaFromN, ncStarOneill, phiFromN } from '../../calc/pile-capacity'
import { computePileUI, PILE_DEFAULTS, toCalcInput, validate, type PileUIInput } from './model'
import { buildPileReport } from './report'

const ui = (p: Partial<PileUIInput> = {}): PileUIInput => ({ ...PILE_DEFAULTS, ...p })

describe('daya dukung tiang (SPT) — input UI', () => {
  it('input bawaan sah dan terhitung', () => {
    expect(validate(PILE_DEFAULTS)).toEqual({})
    const r = computePileUI(PILE_DEFAULTS)!
    expect(r.zc).toBe(1.5)
    expect(r.zTip).toBeCloseTo(16.5, 9)
    expect(r.D).toBeCloseTo(0.6, 9)
    // selimut mulai dari cut-off
    expect(r.segs[0].top).toBeCloseTo(1.5, 9)
    expect(r.segs[r.segs.length - 1].bot).toBeCloseTo(16.5, 9)
  })

  it('tabel → lapis setara computePile dengan cut-off (D dalam mm)', () => {
    const i = ui({ method: 'static' })
    const r = computePileUI(i)!
    const calc = toCalcInput(i)
    const layers = r.layers
    const ref = computePile({ shape: 'circular', D: calc.Dmm / 1000, L: calc.L, ptype: calc.ptype, material: calc.material, Dw: calc.Dw, FS: calc.FS, inclW: 'no', zc: calc.zc }, layers)
    if (!ref.valid) throw new Error('harus valid')
    expect(r.Qallow).toBeCloseTo(ref.Qallow, 9)
    expect(layers[0].H).toBe(2)
    expect(layers[0].gamma).toBe(gammaFromN('L', 3))
    expect(layers[0].cu).toBe(cuFromN(3))
    expect(layers[3].phi).toBeCloseTo(phiFromN(12), 9)
  })

  it('γ / cu terisi menggantikan korelasi (statik & O′Neill–Reese)', () => {
    const rows = PILE_DEFAULTS.rows.map((x, k) => (k === 0 ? { ...x, gamma: '15', cu: '25' } : x))
    const st = computePileUI(ui({ method: 'static', rows }))!
    expect(st.rows[0]).toMatchObject({ gamma: 15, gammaCorr: false, cu: 25, cuCorr: false })
    expect(toCalcInput(ui({ method: 'oneill', rows })).rows[0].cu).toBe(25)
  })

  it('input lama method "spt" (Meyerhof) dibaca sebagai O′Neill & Reese', () => {
    const old = { ...PILE_DEFAULTS, method: 'spt' } as unknown as PileUIInput
    expect(toCalcInput(old).method).toBe('oneill')
    expect(computePileUI(old)!.Qallow).toBeCloseTo(computePileUI(PILE_DEFAULTS)!.Qallow, 9)
  })

  it('validasi tabel: Z mulai 0 dan naik', () => {
    const rows = PILE_DEFAULTS.rows.map((x) => ({ ...x }))
    rows[0].z = '1'
    rows[2].z = '1'
    expect(validate(ui({ rows }))).toEqual({ 'rows.0.z': 'Baris pertama Z = 0', 'rows.2.z': 'Z harus naik' })
    expect(validate(ui({ rows: [] }))).toEqual({ rows: 'Isi minimal satu baris data SPT' })
  })

  it('gesekan negatif: zona cut-off…zn keluar dari Qs dan mengurangi Q izin', () => {
    const a = computePileUI(ui())!
    const b = computePileUI(ui({ nsf: 'yes', zn: '5' }))!
    expect(b.Qn).toBeGreaterThan(0)
    expect(b.segs.filter((s) => s.neg).every((s) => s.bot <= 5 + 1e-9)).toBe(true)
    expect(b.Qs + b.Qn).toBeCloseTo(a.Qs, 6)
    expect(b.Qallow).toBeCloseTo((b.Qp + b.Qs) / b.FS - b.Qn, 6)
    // segmen dipecah tepat di zn
    expect(b.segs.some((s) => Math.abs(s.bot - 5) < 1e-9)).toBe(true)
  })

  it('tarik = Σ ct·Qs,i / FSt + W′p', () => {
    const r = computePileUI(PILE_DEFAULTS)!
    const Tsu = r.segs.reduce((s, g) => s + (g.soil === 'clay' ? 1 : 0.75) * g.Qs, 0)
    expect(r.Tsu).toBeCloseTo(Tsu, 9)
    // MAT 2 m: 0,5 m kering (1,5–2), 14,5 m terendam
    expect(r.Wpe).toBeCloseTo(r.Ap * (0.5 * 24 + 14.5 * (24 - 9.81)), 6)
    expect(r.Tallow).toBeCloseTo(Tsu / 3 + r.Wpe, 9)
  })

  it('penulangan: hitung tangan D600, Tu 220 kN, 6 D16 minimum', () => {
    const b = computePileUI(PILE_DEFAULTS)!.rebar!
    expect(b.Ag).toBeCloseTo(282743.3, 1)
    expect(b.AsT).toBeCloseTo((220e3) / (0.9 * 420), 6) // 582 mm²
    expect(b.AsMin).toBeCloseTo(0.005 * b.Ag, 6) // 1414 mm²
    expect(b.n).toBe(Math.ceil(b.AsMin / b.Ab)) // 8 D16
    expect(b.okP && b.okT && b.okSpacing).toBe(true)
    expect(computePileUI(ui({ material: 'steel' }))!.rebar).toBeNull()
  })
})

describe('daya dukung tiang (SPT) — O′Neill & Reese (1999)', () => {
  it('faktor α, β, Nc* — hitung tangan', () => {
    expect(alphaOneill(50)).toBe(0.55)
    expect(alphaOneill(200)).toBeCloseTo(0.5, 12) // cu/pa = 2 → 0,55 − 0,05
    expect(alphaOneill(400)).toBe(0.45)
    expect(betaOneill(4, 20)).toBeCloseTo(1.5 - 0.245 * 2, 12)
    expect(betaOneill(4, 10)).toBeCloseTo(((1.5 - 0.245 * 2) * 10) / 15, 12)
    expect(betaOneill(0, 30)).toBe(1.2)
    expect(betaOneill(40, 30)).toBe(0.25)
    expect(ncStarOneill(10)).toBe(6.5)
    expect(ncStarOneill(36)).toBeCloseTo(7.25, 12)
    expect(ncStarOneill(72)).toBeCloseTo(8.5, 12)
    expect(ncStarOneill(150)).toBe(9)
  })

  it('opsi abaikan 1,5 m teratas & 1D terbawah (bawaan tidak)', () => {
    const r0 = computePileUI(PILE_DEFAULTS)!
    expect(r0.orExcl).toBe(false)
    expect(r0.segs.filter((s) => s.soil === 'clay').every((s) => s.fs > 0)).toBe(true)
    const r = computePileUI(ui({ orExcl: 'yes' }))!
    const top = r.segs.filter((s) => s.soil === 'clay' && s.bot <= r.zc + 1.5 + 1e-9)
    expect(top.length).toBeGreaterThan(0)
    expect(top.every((s) => s.fs === 0)).toBe(true)
    // segmen dipecah tepat di cut-off + 1,5 m; sisa lempung tetap dihitung
    expect(r.segs.some((s) => Math.abs(s.bot - (r.zc + 1.5)) < 1e-9)).toBe(true)
    expect(r.Qs).toBeLessThan(r0.Qs)
    // opsi hanya berlaku untuk O'Neill & Reese
    expect(toCalcInput(ui({ method: 'static', orExcl: 'yes' })).orExcl).toBe(false)
  })

  it('bawaan: fs lempung = 0,55 cu, fs pasir = β σ′v, ujung pasir 57,5 N', () => {
    const r = computePileUI(PILE_DEFAULTS)!
    expect(r.method).toBe('oneill')
    // lempung di bawah zona 1,5 m: α = 0,55 (cu korelasi kecil)
    const c = r.segs.find((s) => s.soil === 'clay' && s.fs > 0)!
    expect(c.fs).toBeCloseTo(0.55 * Number(r.layers[c.idx - 1].cu), 9)
    for (const s of r.segs.filter((x) => x.soil === 'sand')) {
      const beta = betaOneill((s.top + s.bot) / 2, Number(r.layers[s.idx - 1].N))
      expect(s.fs).toBeCloseTo(Math.min(beta * s.sv, 200), 9)
    }
    // ujung 16,5 m pada lapis Z = 16 m, N = 45
    expect(r.qp).toBeCloseTo(57.5 * 45, 9)
  })

  it('reduksi diameter besar pasir (D > 1,27 m) dan ujung lempung Nc*·cu', () => {
    const big = computePileUI(ui({ D: '1500', cover: '75' }))!
    expect(big.kBase).toBeCloseTo(1.27 / 1.5, 12)
    expect(big.qp).toBeCloseTo((1.27 / 1.5) * 57.5 * 45, 9)
    const rows = PILE_DEFAULTS.rows.map((x) => ({ ...x, soil: 'L' as const, cu: '60' }))
    const cl = computePileUI(ui({ rows, orExcl: 'yes' }))!
    expect(cl.NcStar).toBeCloseTo(8.25, 12)
    expect(cl.qp).toBeCloseTo(8.25 * 60, 9)
    // 1D terbawah diabaikan
    expect(cl.segs.filter((s) => s.top >= cl.zTip - cl.D - 1e-9).every((s) => s.fs === 0)).toBe(true)
  })
})

describe('daya dukung tiang (SPT) — laporan', () => {
  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computePileUI(PILE_DEFAULTS)!
    const rep = buildPileReport(PILE_DEFAULTS)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['Q_{u}']).toBe(r.Qu.toFixed(1))
    expect(v['Q_{izin}']).toBe(r.Qallow.toFixed(1))
    expect(v['T_{izin}']).toBe(r.Tallow.toFixed(1))
  })

  it('gambar profil + penampang; seksi gesekan negatif hanya bila aktif', () => {
    const rep = buildPileReport(PILE_DEFAULTS)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
    expect(rep.sections.some((s) => s.title === 'Gesekan negatif')).toBe(false)
    expect(buildPileReport(ui({ nsf: 'yes', zn: '6' }))!.sections.some((s) => s.title === 'Gesekan negatif')).toBe(true)
    expect(buildPileReport(ui({ material: 'steel' }))!.sections.some((s) => s.title.startsWith('Penulangan'))).toBe(false)
  })
})
