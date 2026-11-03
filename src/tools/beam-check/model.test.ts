import { describe, expect, it } from 'vitest'
import { computeBeamFlexure } from '../../calc/beam-flexure'
import { computeShearTorsion } from '../../calc/beam-shear-torsion'
import { BEAM_CHECK_DEFAULTS, computeCheck, rejectReason, toCalcInput, validate, type BeamCheckForm } from './model'
import { buildBeamCheckReport } from './report'

const D = BEAM_CHECK_DEFAULTS

describe('cek desain balok — hitung', () => {
  it('lentur lapangan/tumpuan = mesin lentur; geser tumpuan = mesin geser dengan d dari lentur', () => {
    const r = computeCheck(D)!
    const pos = computeBeamFlexure({ fc: 25, fy: 420, b: 300, h: 500, cc: 40, ds: 10, n1: 3, db1: 19, nLay: 1, sv: 25, doubly: 'yes', n2: 2, db2: 19 })
    expect(r.pos!.flex.phiMnkNm).toBeCloseTo(pos.phiMnkNm!, 6)
    expect(r.pos!.ratioM).toBeCloseTo(90 / pos.phiMnkNm!, 6)
    const neg = r.neg!.flex
    expect(neg.nLay).toBe(2)
    expect(neg.d!).toBeLessThan(r.pos!.flex.d!) // 2 lapis → d lebih kecil
    const sh = computeShearTorsion({ fc: 25, fy: 420, fyt: 420, lam: 1, b: 300, h: 500, cc: 40, ds: 10, nLegs: 2, s: 100, nTop: 5, dbTop: 19, nBot: 3, dbBot: 19, nSide: 0, dbSide: 13, Vu: 150, Tu: 0, d: neg.d })
    expect(r.sup!.r.phiVnkN).toBeCloseTo(sh.phiVnkN!, 6)
    expect(r.sup!.r.d).toBeCloseTo(neg.d!, 6)
    expect(r.mid).toBeNull()
  })

  it('torsi mati: ratioT & ratioAl = 0; torsi hidup & besar: ratioT > 0', () => {
    const off = computeCheck(D)!
    expect(off.sup!.ratioT).toBe(0)
    expect(off.sup!.ratioAl).toBe(0)
    const on = computeCheck({ ...D, torsion: 'yes', Tu: '40' })!
    expect(on.sup!.ratioT).toBeGreaterThan(0)
    expect(on.sup!.ratioSec).toBeGreaterThan(off.sup!.ratioSec)
  })

  it('sengkang lapangan opsional memakai spasi & Vu sendiri', () => {
    const r = computeCheck({ ...D, midStir: 'yes', sMid: '200', VuMid: '60' })!
    expect(r.mid!.r.s).toBe(200)
    expect(r.mid!.r.VukN).toBeCloseTo(60, 6)
    expect(r.mid!.r.d).toBeCloseTo(r.pos!.flex.d!, 6)
  })

  it('momen berlebih → rasio > 1 dan gov mengikutinya', () => {
    const r = computeCheck({ ...D, Mneg: '400' })!
    expect(r.neg!.ratioM).toBeGreaterThan(1)
    expect(r.gov).toBeGreaterThanOrEqual(r.neg!.ratioM)
  })
})

describe('cek desain balok — validasi', () => {
  it('tekan ≥ 2, field bersyarat tidak memblokir saat tersembunyi', () => {
    expect(validate({ ...D, nPosC: '1', sMid: '0', Tu: '-1', nSide: '3' })).toEqual({ nPosC: 'Bilangan bulat ≥ 2' })
    expect(validate({ ...D, midStir: 'yes', sMid: '0', torsion: 'yes', nSide: '3' })).toMatchObject({ sMid: 'Harus > 0', nSide: 'Kelipatan 2 (kiri = kanan)' })
    expect(toCalcInput({ ...D, sMid: '0' }).sMid).toBe(0)
  })

  it('geometri mustahil → alasan', () => {
    expect(computeCheck({ ...D, h: '60' })).toBeNull()
    expect(rejectReason({ ...D, h: '60' })).toMatch(/Tinggi efektif/)
  })
})

describe('cek desain balok — laporan', () => {
  const titles = (i: BeamCheckForm) => buildBeamCheckReport(i)!.sections.map((s) => s.title)
  it('bagian laporan mengikuti opsi', () => {
    const base = titles(D)
    expect(base.some((t) => t.startsWith('Lentur lapangan'))).toBe(true)
    expect(base).toContain('Geser tumpuan')
    expect(base).not.toContain('Geser lapangan')
    expect(base.some((t) => t.startsWith('Kuat torsi'))).toBe(false)
    expect(titles({ ...D, midStir: 'yes' })).toContain('Geser lapangan')
    expect(titles({ ...D, torsion: 'yes', Tu: '40' }).some((t) => t.startsWith('Kuat torsi'))).toBe(true)
  })
  it('ringkasan memuat cek lentur & geser', () => {
    expect(buildBeamCheckReport(D)!.summary!.length).toBeGreaterThanOrEqual(5)
  })
})
