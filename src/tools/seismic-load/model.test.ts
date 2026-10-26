import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeGrid, lookup, parsePlaces, searchPlaces } from './map'
import { computeSeismicUI, SEISMIC_DEFAULTS, validate } from './model'
import { buildSeismicReport } from './report'

const dir = join(__dirname, 'data')
const buf = gunzipSync(readFileSync(join(dir, 'rsa-grid.bin.gz')))
const grid = decodeGrid(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const places = parsePlaces(readFileSync(join(dir, 'places.csv'), 'utf8'))

describe('beban gempa — peta', () => {
  it('titik grid tepat = nilai tabel; Jakarta = bawaan input', () => {
    const v = lookup(grid, 106.8, -6.2)!
    expect(v).toBeTruthy()
    const d = lookup(grid, 106.83, -6.18)!
    expect([String(d.Ss), String(d.S1), String(d.PGA), String(d.TL)]).toEqual([SEISMIC_DEFAULTS.Ss, SEISMIC_DEFAULTS.S1, SEISMIC_DEFAULTS.PGA, SEISMIC_DEFAULTS.TL])
  })
  it('interpolasi bilinear di antara titik grid, di dalam rentang keempat titik', () => {
    const a = lookup(grid, 100.3, -0.9)!, b = lookup(grid, 100.4, -0.9)!, m = lookup(grid, 100.35, -0.9)!
    expect(m.Ss).toBeGreaterThanOrEqual(Math.min(a.Ss, b.Ss) - 1e-9)
    expect(m.Ss).toBeLessThanOrEqual(Math.max(a.Ss, b.Ss) + 1e-9)
  })
  it('luar cakupan → null', () => {
    expect(lookup(grid, 90, 0)).toBeNull()
    expect(lookup(grid, 120, 10)).toBeNull()
  })
  it('wilayah gempa rendah vs tinggi masuk akal (Kalimantan < Sumatra barat)', () => {
    expect(lookup(grid, 114.59, -3.32)!.Ss).toBeLessThan(0.2)
    expect(lookup(grid, 100.35, -0.95)!.Ss).toBeGreaterThan(1.2)
  })
  it('cari lokasi: awalan & ibu kota provinsi didahulukan', () => {
    expect(places.length).toBe(6410)
    const r = searchPlaces(places, 'pad')
    expect(r[0].name).toBe('Padang')
    expect(r[0].kind).toBe('P')
    expect(searchPlaces(places, 'x')).toEqual([])
  })
})

describe('beban gempa — input UI', () => {
  it('input bawaan sah', () => {
    expect(validate(SEISMIC_DEFAULTS)).toEqual({})
    const r = computeSeismicUI(SEISMIC_DEFAULTS)!
    expect(r.sdc).toBe('D')
    expect(r.levels).toHaveLength(5)
  })
  it('validasi: field tersembunyi tidak diperiksa; lantai & Tc', () => {
    expect(validate({ ...SEISMIC_DEFAULTS, R: '', Tc: '' })).toEqual({})
    expect(validate({ ...SEISMIC_DEFAULTS, period: 'analysis', Tc: '' })).toEqual({ Tc: 'Isi angka' })
    expect(validate({ ...SEISMIC_DEFAULTS, kind: 'nb-other', Tc: '0' })).toEqual({ Tc: 'Harus > 0' })
    expect(validate({ ...SEISMIC_DEFAULTS, sysB: 'custom', R: '0' })).toEqual({ R: 'Harus > 0' })
    expect(validate({ ...SEISMIC_DEFAULTS, levels: [{ h: '0', w: 'x' }] })).toEqual({ 'lv.0.h': 'Harus > 0', 'lv.0.w': 'Isi angka' })
    expect(validate({ ...SEISMIC_DEFAULTS, levels: [] })).toEqual({ levels: 'Isi minimal satu lantai/massa' })
    expect(validate({ ...SEISMIC_DEFAULTS, site: 'SF' })).toHaveProperty('site')
    expect(computeSeismicUI({ ...SEISMIC_DEFAULTS, site: 'SF' })).toBeNull()
  })
  it('sistem kustom memakai R input', () => {
    const r = computeSeismicUI({ ...SEISMIC_DEFAULTS, sysB: 'custom', R: '4', Om: '2', Cd: '4' })!
    expect(r.sys.R).toBe(4)
    expect(r.Cs0).toBeCloseTo(r.SDS / 4, 12)
  })
})

describe('beban gempa — laporan', () => {
  it.each([
    ['gedung', SEISMIC_DEFAULTS],
    ['nongedung mirip gedung', { ...SEISMIC_DEFAULTS, kind: 'nb-similar' as const, levels: [{ h: '8', w: '900' }] }],
    ['nongedung lain, kaku', { ...SEISMIC_DEFAULTS, kind: 'nb-other' as const, Tc: '0.05', levels: [{ h: '6', w: '2000' }] }],
  ])('%s: nilai laporan = hasil hitung, dua gambar', (_n, ui) => {
    const r = computeSeismicUI(ui)!
    const rep = buildSeismicReport(ui)!
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'V')!.value).toBe(r.V.toFixed(1))
    expect(steps.find((s) => s.lhs === 'S_{DS}')!.value).toBe(r.SDS.toFixed(4))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
    expect(rep.warnings).toEqual(r.warn)
  })
})
