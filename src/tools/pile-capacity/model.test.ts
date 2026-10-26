import { describe, expect, it } from 'vitest'
import { computePile, cuFromN, gammaFromN, phiFromN } from '../../calc/pile-capacity'
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

  it('γ / cu terisi menggantikan korelasi; cu diabaikan pada metode SPT', () => {
    const rows = PILE_DEFAULTS.rows.map((x, k) => (k === 0 ? { ...x, gamma: '15', cu: '25' } : x))
    const st = computePileUI(ui({ method: 'static', rows }))!
    expect(st.rows[0]).toMatchObject({ gamma: 15, gammaCorr: false, cu: 25, cuCorr: false })
    expect(toCalcInput(ui({ method: 'spt', rows })).rows[0].cu).toBeNull()
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
