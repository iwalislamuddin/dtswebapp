import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/wind-load.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { computeWindAny, computeWindUI, netPressure, validate, WIND_DEFAULTS, windProfile, type WindUIInput } from './model'
import { buildWindReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): WindUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as unknown as WindUIInput
}

describe('beban angin — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeWindUI(WIND_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'eksposur B', 'eksposur D', 'tertutup sebagian', 'terbuka', 'L/B 1,5', 'L/B 3', 'L/B 5', 'L/B < 1, rendah (z < 4,6)',
    'beban minimum menentukan', 'tinggi > 60', 'tinggi > 160, langsing', 'V di luar rentang, Kzt 1,2', 'nilai string',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const c = cases.find((x) => x.name === name)!
    const ui = fromGolden(c.name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeWindUI(ui)!, c.output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi (faktor 0 tidak lagi diam-diam jadi bawaan)', () => {
    expect(validate(fromGolden('B 0'))).toEqual({ B: 'Harus > 0' })
    expect(validate(fromGolden('faktor kosong'))).toEqual({ Kd: 'Harus > 0', Kzt: 'Harus > 0', Ke: 'Harus > 0', G: 'Harus > 0' })
    expect(validate({ ...WIND_DEFAULTS, V: '' })).toEqual({ V: 'Isi angka' })
    expect(computeWindUI(fromGolden('B 0'))).toBeNull()
  })

  it('profil: geser kumulatif di dasar = F hitungan, nol di atap; tekanan windward di puncak = nilai mesin', () => {
    const r = computeWindUI(WIND_DEFAULTS)!
    const p = windProfile(r)
    expect(p.Vz[0]).toBeCloseTo(r.F, 9)
    expect(p.Vz[p.Vz.length - 1]).toBe(0)
    expect(p.pP[p.pP.length - 1]).toBeCloseTo(r.pWWtopPlus, 12)
    expect(p.pM[p.pM.length - 1]).toBeCloseTo(r.pWWtopMinus, 12)
    expect(netPressure(r, r.H)).toBeCloseTo(r.pNetTop, 12)
  })
})

describe('beban angin — laporan', () => {
  it.each([
    ['default', WIND_DEFAULTS],
    ['beban minimum', fromGolden('beban minimum menentukan')],
    ['L/B 3, sebagian', { ...WIND_DEFAULTS, L: '90', enc: 'partial' as const }],
  ])('%s: nilai laporan sama dengan hasil hitung, satu gambar', (_n, ui) => {
    const r = computeWindUI(ui)!
    const rep = buildWindReport(ui)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['q_{h}']).toBe(r.qh.toFixed(3))
    expect(v['K_{h}']).toBe(r.Kh.toFixed(3))
    expect(v['F']).toBe(r.F.toFixed(1))
    expect(v['F_{min}']).toBe(r.Fmin.toFixed(1))
    expect(v['F_{desain}']).toBe(r.Fdesign.toFixed(1))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.warnings).toEqual(r.warn)
  })
})

describe('beban angin — tipe struktur lain', () => {
  it.each(['warehouse', 'freeroof', 'frame'] as const)('%s: input bawaan sah, laporan terbentuk dengan gambar & peringatan hasil', (type) => {
    const ui = { ...WIND_DEFAULTS, type }
    expect(validate(ui)).toEqual({})
    const a = computeWindAny(ui)!
    expect(a.type).toBe(type)
    const rep = buildWindReport(ui)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure').length).toBeGreaterThan(0)
    expect(rep.warnings).toEqual(a.r.warn)
  })

  it('field tipe lain tidak divalidasi; field tipe aktif divalidasi', () => {
    expect(validate({ ...WIND_DEFAULTS, frH: '', ofEps: 'x' })).toEqual({})
    expect(validate({ ...WIND_DEFAULTS, type: 'warehouse', whTheta: '50' })).toEqual({ whTheta: 'Maksimum 45°' })
    expect(validate({ ...WIND_DEFAULTS, type: 'frame', ofKind: 'plane', ofEps: '0.8' })).toEqual({ ofEps: 'Maksimum 0,7 (> 0,7 = papan pejal, Ps. 29.3)' })
    expect(validate({ ...WIND_DEFAULTS, type: 'frame', ofZ2: '0' })).toEqual({ ofZ2: 'Harus > elevasi bawah' })
    expect(computeWindAny({ ...WIND_DEFAULTS, type: 'freeroof', frL: '0' })).toBeNull()
  })
})
