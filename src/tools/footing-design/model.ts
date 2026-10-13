import { computeFooting, type FootingInput, type FootingResult } from '../../calc/footing-design'
import { anyNum, checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Desain Pondasi Tapak: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export const FOOTING_BARS = [10, 13, 16, 19, 22, 25, 29, 32] as const

export interface FootingUIInput {
  /** Beban layan: aksial (kN), momen (kN·m), geser (kN). */
  P: string
  Mx: string
  My: string
  Hx: string
  Hy: string
  /** Faktor beban ultimit rata-rata (kosong/0 = 1,5). */
  LF: string
  /** Tapak: panjang L, lebar B (m), tebal (mm), kedalaman dasar (m). */
  L: string
  B: string
  tf: string
  Df: string
  /** Kolom (mm). */
  c1: string
  c2: string
  fc: string
  fy: string
  /** Tanah: daya dukung izin (kPa), koefisien gesek, berat isi beton & timbunan (kN/m³; 0 = 24 / 18). */
  qa: string
  mu: string
  gc: string
  gs: string
  /** Selimut bersih (mm) & diameter tulangan. */
  cc: string
  db: string
}

/** Input bawaan = kasus golden default. */
export const FOOTING_DEFAULTS: FootingUIInput = {
  P: '900', Mx: '60', My: '40', Hx: '30', Hy: '20', LF: '1.5', L: '2.5', B: '2.5', tf: '500', Df: '1.5', c1: '400', c2: '400',
  fc: '25', fy: '420', qa: '200', mu: '0.5', gc: '24', gs: '18', cc: '75', db: '16',
}

export function validate(i: FootingUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('P', pos)
  for (const k of ['Mx', 'My', 'Hx', 'Hy'] as const) need(k, anyNum)
  for (const k of ['LF', 'gc', 'gs'] as const) if (i[k].trim() !== '') need(k, nonneg)
  for (const k of ['L', 'B', 'tf', 'c1', 'c2', 'fc', 'fy', 'qa', 'db'] as const) need(k, pos)
  for (const k of ['Df', 'mu', 'cc'] as const) need(k, nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: FootingUIInput): FootingInput {
  const n = (s: string) => num(s)
  return {
    P: n(i.P), Mx: n(i.Mx), My: n(i.My), Hx: n(i.Hx), Hy: n(i.Hy), LF: n(i.LF), L: n(i.L), B: n(i.B), tf: n(i.tf), Df: n(i.Df),
    c1: n(i.c1), c2: n(i.c2), fc: n(i.fc), fy: n(i.fy), qa: n(i.qa), mu: n(i.mu), gc: n(i.gc), gs: n(i.gs), cc: n(i.cc), db: n(i.db),
  }
}

/** Hitung; null bila input tidak valid atau desain struktur tidak dapat dilakukan (tinggi efektif ≤ 0). */
export function computeFootingUI(i: FootingUIInput): FootingResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeFooting(toCalcInput(i))
  return r.valid && r.desOk ? r : null
}

/** Pesan bila mesin hitung menolak meski field sah. */
export function rejectReason(i: FootingUIInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeFooting(toCalcInput(i))
  return r.valid && r.desOk ? null : r.warn[r.warn.length - 1] ?? 'Input tidak dapat dihitung.'
}
