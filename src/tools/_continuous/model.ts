import { CB_BARS, CB_STIRRUPS, computeContinuousMember, type CMInput, type CMResult } from '../../calc/continuous-beam'
import type { CBElement } from '../../calc/shared/coefficient-method'
import { checker, intRange, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Balok Menerus & Pelat Satu Arah Menerus (satu mesin, `calc/continuous-member`): field mengikuti jenis
// elemen, jumlah bentang, metode analisis, dan penampang T/L.

export type { FieldErrors }
export { CB_BARS, CB_STIRRUPS }

export interface CMUI {
  n: string
  /** Bentang ujung & dalam as–as (m), lebar tumpuan (mm). */
  L: string
  Li: string
  bsup: string
  b: string
  h: string
  /** Balok: penampang persegi/T/L, lebar tributari (m), tebal pelat sayap (mm). */
  sect: 'persegi' | 'T' | 'L'
  bt: string
  hf: string
  /** Pelat atau pelat di atas balok kN/m²; beban garis balok kN/m (di luar berat sendiri). */
  qDs: string
  qLs: string
  qDb: string
  qLb: string
  ujung: 'bebas' | 'spandrel' | 'kolom'
  m12: 'std' | 'm12'
  tumpuan1: 'ss' | 'js' | 'jj'
  metode: 'auto' | 'koef' | 'solver'
  ujungS: 'sendi' | 'jepit'
  retak: 'ig' | 'rata' | 'variabel'
  design: 'ya' | 'tidak'
  fc: string
  fy: string
  cc: string
  db: string
  fyt: string
  ds: string
  defl: 'ya' | 'tidak'
  xi: string
  /** Fraksi beban hidup tetap (%). */
  sustL: string
  lim: 'l480' | 'l360' | 'l240'
}

const COMMON: Omit<CMUI, 'b' | 'h' | 'sect' | 'bt' | 'hf' | 'qDs' | 'qLs' | 'qDb' | 'qLb' | 'cc' | 'db' | 'ds'> = {
  n: '4', L: '4', Li: '4', bsup: '300', ujung: 'spandrel', m12: 'std', tumpuan1: 'ss', metode: 'auto', ujungS: 'sendi', retak: 'rata',
  design: 'ya', fc: '25', fy: '420', fyt: '420', defl: 'ya', xi: '2', sustL: '25', lim: 'l480',
}

export const PELAT_DEFAULTS: CMUI = {
  ...COMMON, b: '300', h: '130', sect: 'persegi', bt: '0', hf: '0', qDs: '1.5', qLs: '3', qDb: '0', qLb: '0', cc: '20', db: '10', ds: '10',
}

export const BALOK_DEFAULTS: CMUI = {
  ...COMMON, n: '3', L: '6', Li: '6', bsup: '400', b: '300', h: '600', sect: 'T', bt: '3', hf: '120', qDs: '1.5', qLs: '2.5', qDb: '5', qLb: '0',
  cc: '40', db: '19', ds: '10',
}

export const defaultsFor = (elem: CBElement): CMUI => (elem === 'pelat' ? PELAT_DEFAULTS : BALOK_DEFAULTS)

export const CB_LIMITS = [
  { value: 'l480', label: 'L/480 — elemen non-struktural mudah rusak' },
  { value: 'l360', label: 'L/360' },
  { value: 'l240', label: 'L/240 — elemen non-struktural tak terpengaruh' },
] as const

export const CB_XI = [
  { value: '2', label: '≥ 5 tahun (ξ = 2,0)' },
  { value: '1.4', label: '12 bulan (ξ = 1,4)' },
  { value: '1.2', label: '6 bulan (ξ = 1,2)' },
  { value: '1', label: '3 bulan (ξ = 1,0)' },
] as const

export function validate(i: CMUI, elem: CBElement): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  const balok = elem === 'balok'
  need('n', intRange(1, 12))
  need('L', pos)
  if ((Number(i.n) || 0) >= 3) need('Li', pos)
  need('bsup', nonneg)
  if (balok) need('b', pos)
  need('h', pos)
  if (balok) {
    need('bt', nonneg)
    need('hf', nonneg)
    need('qDb', nonneg)
    if (i.sect !== 'persegi') {
      need('bt', pos)
      need('hf', pos)
      if (!e.hf && Number(i.hf) >= Number(i.h)) e.hf = 'Harus < tinggi balok h'
    }
  }
  need('qDs', nonneg)
  need('qLs', nonneg)
  if (balok) need('qLb', nonneg)
  if (i.design === 'ya') {
    need('fc', pos)
    need('fy', pos)
    need('cc', nonneg)
    if (balok) need('fyt', pos)
    if (i.defl === 'ya') need('sustL', (s) => (s < 0 || s > 100 ? 'Antara 0 dan 100' : null))
  }
  return e
}

export function toCalcInput(i: CMUI, elem: CBElement): CMInput {
  const balok = elem === 'balok'
  return {
    elem, n: num(i.n), L: num(i.L), Li: num(i.Li), bsup: num(i.bsup), b: num(i.b), h: num(i.h),
    sect: balok ? i.sect : 'persegi', bt: balok ? num(i.bt) : 0, hf: balok ? num(i.hf) : 0,
    qDs: num(i.qDs), qLs: num(i.qLs), qDb: balok ? num(i.qDb) : 0, qLb: balok ? num(i.qLb) : 0,
    ujung: i.ujung, m12: i.m12, tumpuan1: i.tumpuan1, metode: i.metode, ujungS: i.ujungS, retak: i.retak, design: i.design,
    fc: num(i.fc), fy: num(i.fy), cc: num(i.cc), db: Number(i.db), fyt: num(i.fyt), ds: Number(i.ds),
    defl: i.defl, xi: Number(i.xi), sustL: num(i.sustL) / 100, limDiv: i.lim === 'l360' ? 360 : i.lim === 'l240' ? 240 : 480,
  }
}

/** Hitung; null bila input tidak valid atau geometri/beban tidak dapat dihitung. */
export function computeCM(i: CMUI, elem: CBElement): CMResult | null {
  if (Object.keys(validate(i, elem)).length) return null
  const r = computeContinuousMember(toCalcInput(i, elem))
  return r.valid ? r : null
}

export function rejectReason(i: CMUI, elem: CBElement): string | null {
  if (Object.keys(validate(i, elem)).length) return null
  const r = computeContinuousMember(toCalcInput(i, elem))
  if (r.valid) return r.des?.err ?? null
  return r.invalidReason ?? null
}

/** Nilai ekstrem (bertanda) dari diagram. */
export function extremeOf(xs: number[], ys: number[]): { x: number; v: number } {
  let k = 0
  ys.forEach((y, i) => { if (Math.abs(y) > Math.abs(ys[k])) k = i })
  return { x: xs[k], v: ys[k] }
}
