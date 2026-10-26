import { describe, expect, it } from 'vitest'
import { coefCu, computeSeismic, sdcFromSD1, sdcFromSDS, siteFa, siteFpga, siteFv, spectrumSa, systemsFor, type SeismicInput } from './seismic-load'

const five = Array.from({ length: 5 }, () => ({ h: 4, w: 5000 }))
const base: SeismicInput = {
  Ss: 0.8, S1: 0.4, PGA: 0.38, TL: 20, site: 'SD', risk: 'II', kind: 'building', system: 'C5', Tc: null, rho: 1.3, levels: five,
}

describe('seismic-load — koefisien tabel', () => {
  it('Fa, Fv, FPGA: nilai tabel & interpolasi linear, ujung dibatasi', () => {
    expect(siteFa('SD', 0.25)).toBe(1.6)
    expect(siteFa('SD', 0.8)).toBeCloseTo(1.18, 12)
    expect(siteFa('SE', 2)).toBe(0.8)
    expect(siteFv('SD', 0.4)).toBe(1.9)
    expect(siteFv('SE', 0.15)).toBeCloseTo(3.75, 12)
    expect(siteFv('SC', 0.05)).toBe(1.5)
    expect(siteFpga('SD', 0.38)).toBeCloseTo(1.22, 12)
  })

  it('KDS Tabel 8 & 9, kategori risiko IV naik', () => {
    expect(sdcFromSDS(0.1, 'II')).toBe('A')
    expect(sdcFromSDS(0.2, 'II')).toBe('B')
    expect(sdcFromSDS(0.2, 'IV')).toBe('C')
    expect(sdcFromSDS(0.4, 'IV')).toBe('D')
    expect(sdcFromSDS(0.5, 'I')).toBe('D')
    expect(sdcFromSD1(0.1, 'III')).toBe('B')
    expect(sdcFromSD1(0.15, 'IV')).toBe('D')
  })

  it('Cu Tabel 17', () => {
    expect(coefCu(0.5)).toBe(1.4)
    expect(coefCu(0.25)).toBeCloseTo(1.45, 12)
    expect(coefCu(0.05)).toBe(1.7)
  })

  it('spektrum: T0, plato SDS, SD1/T, SD1·TL/T²', () => {
    const SDS = 0.6, SD1 = 0.3, TL = 4
    expect(spectrumSa(0, SDS, SD1, TL)).toBeCloseTo(0.24, 12)
    expect(spectrumSa(0.1, SDS, SD1, TL)).toBeCloseTo(0.6, 12)
    expect(spectrumSa(0.4, SDS, SD1, TL)).toBeCloseTo(0.6, 12)
    expect(spectrumSa(1, SDS, SD1, TL)).toBeCloseTo(0.3, 12)
    expect(spectrumSa(5, SDS, SD1, TL)).toBeCloseTo((0.3 * 4) / 25, 12)
  })
})

describe('seismic-load — gedung, hitung tangan', () => {
  const r = computeSeismic(base)
  it('parameter desain', () => {
    expect(r.valid).toBe(true)
    expect(r.SMS).toBeCloseTo(0.944, 12)
    expect(r.SM1).toBeCloseTo(0.76, 12)
    expect(r.SDS).toBeCloseTo(0.62933333, 7)
    expect(r.SD1).toBeCloseTo(0.50666667, 7)
    expect(r.sdc).toBe('D')
    expect(r.PGAM).toBeCloseTo(1.22 * 0.38, 12)
  })
  it('periode Ta = 0,0466·20^0,9 dan Cs = SDS/(R/Ie)', () => {
    expect(r.hn).toBe(20)
    expect(r.Ta).toBeCloseTo(0.0466 * Math.pow(20, 0.9), 12)
    expect(r.Tsrc).toBe('Ta')
    expect(r.Cs).toBeCloseTo(r.SDS / 8, 12)
    expect(r.V).toBeCloseTo((r.SDS / 8) * 25000, 9)
  })
  it('distribusi vertikal: ΣFx = V, geser tingkat 1 = V, momen dasar = ΣFx·hx', () => {
    expect(r.levels.reduce((a, l) => a + l.Fx, 0)).toBeCloseTo(r.V, 9)
    expect(r.levels[0].Vx).toBeCloseTo(r.V, 9)
    expect(r.levels[0].Mx).toBeCloseTo(r.M0, 9)
    expect(r.levels[4].Vx).toBeCloseTo(r.levels[4].Fx, 12)
    expect(r.k).toBeCloseTo(1 + (r.T - 0.5) / 2, 12)
  })
  it('simpangan izin SRPM KDS D dibagi ρ', () => {
    expect(r.levels[0].drift).toBeCloseTo((0.02 * 4000) / 1.3, 9)
  })
  it('Tc: dibatasi Cu·Ta, tidak kurang dari Ta', () => {
    expect(computeSeismic({ ...base, Tc: 5 }).T).toBeCloseTo(r.CuTa, 12)
    expect(computeSeismic({ ...base, Tc: 0.1 }).T).toBeCloseTo(r.Ta, 12)
    expect(computeSeismic({ ...base, Tc: 0.8 }).Tsrc).toBe('Tc')
  })
  it('Cs minimum menentukan untuk R besar, periode panjang', () => {
    const t = computeSeismic({ ...base, Ss: 0.3, S1: 0.15, Tc: 3, levels: Array.from({ length: 30 }, () => ({ h: 4, w: 5000 })), system: 'C1' })
    expect(t.Cs).toBeCloseTo(Math.max(0.044 * t.SDS, 0.01), 12)
  })
  it('S1 ≥ 0,6: Cs,min 0,5·S1/(R/Ie) dan KDS E bila S1 ≥ 0,75', () => {
    const t = computeSeismic({ ...base, Ss: 2, S1: 0.8, site: 'SC' })
    expect(t.sdc).toBe('E')
    expect(t.CsMin).toBeCloseTo(Math.max(0.044 * t.SDS, (0.5 * 0.8) / 8), 12)
    expect(t.hLimit).toBe(null)
  })
  it('sistem tidak diizinkan → peringatan', () => {
    const t = computeSeismic({ ...base, system: 'C7' })
    expect(t.warn.some((w) => w.includes('TIDAK DIIZINKAN'))).toBe(true)
  })
  it('SF tidak sah', () => {
    expect(computeSeismic({ ...base, site: 'SF' }).valid).toBe(false)
  })
})

describe('seismic-load — nongedung', () => {
  it('tidak mirip gedung: Cs,min 0,03 dan T wajib', () => {
    const t = computeSeismic({ ...base, kind: 'nb-other', system: 'T6', Ss: 0.2, S1: 0.1, site: 'SC', Tc: 0.5 })
    expect(t.CsMin).toBeCloseTo(0.03, 12)
    expect(computeSeismic({ ...base, kind: 'nb-other', system: 'T6', Tc: null }).valid).toBe(false)
  })
  it('kaku T < 0,06 s: V = 0,30·SDS·W·Ie', () => {
    const t = computeSeismic({ ...base, kind: 'nb-other', system: 'T6', risk: 'III', Tc: 0.05, levels: [{ h: 6, w: 1000 }] })
    expect(t.rigid).toBe(true)
    expect(t.V).toBeCloseTo(0.3 * t.SDS * 1000 * 1.25, 9)
  })
  it('daftar sistem per jenis', () => {
    expect(systemsFor('building').every((s) => /^[A-H]/.test(s.id))).toBe(true)
    expect(systemsFor('nb-similar').some((s) => s.id === 'N1')).toBe(true)
    expect(systemsFor('nb-other').every((s) => s.id.startsWith('T'))).toBe(true)
  })
})
