import { computeSettlement, type SettlementInput, type SettlementResult, type SettlementShape } from '../../calc/settlement'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Penurunan Fondasi: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true). */
export type SettlementOk = Extract<SettlementResult, { valid: true }>

export interface SettlementUIInput {
  shape: SettlementShape
  /** Lebar / sisi / diameter B (m), panjang L (m, persegi panjang), kedalaman dasar Df (m). */
  B: string
  L: string
  Df: string
  /** Tekanan neto di dasar (kPa). */
  q0: string
  rigid: 'flex' | 'rigid'
  /** Modulus tanah Es (MPa), angka Poisson (kosong = 0,3), tebal lapisan termampatkan Hs (m; kosong = 30), faktor Fox If (kosong = 1). */
  Es: string
  mu: string
  Hs: string
  If: string
  /** Lempung: kedalaman puncak (m), tebal (m), e0, Cc, Cr, σ'0 & σ'c (kPa). Kosong = tanpa konsolidasi. */
  ztop: string
  Hc: string
  e0: string
  Cc: string
  Cr: string
  sig0: string
  sigc: string
  /** Laju: cv (m²/tahun), waktu ditinjau (tahun), drainase. */
  cv: string
  t: string
  drain: 'single' | 'double'
}

/** Input bawaan = kasus golden default. */
export const SETTLEMENT_DEFAULTS: SettlementUIInput = {
  shape: 'square', B: '2', L: '3', Df: '1.5', q0: '150', rigid: 'flex', Es: '10', mu: '0.3', Hs: '8', If: '1',
  ztop: '3', Hc: '4', e0: '0.9', Cc: '0.25', Cr: '0.05', sig0: '60', sigc: '80', cv: '1.5', t: '3', drain: 'double',
}

const OPTIONAL = ['mu', 'Hs', 'If', 'ztop', 'Hc', 'e0', 'Cc', 'Cr', 'sig0', 'sigc', 'cv', 't'] as const

export function validate(i: SettlementUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('B', pos)
  if (i.shape === 'rect') need('L', pos)
  need('Df', nonneg)
  need('q0', pos)
  need('Es', pos)
  for (const k of OPTIONAL) if (i[k].trim() !== '') need(k, nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: SettlementUIInput): SettlementInput {
  const n = (s: string) => num(s)
  return {
    shape: i.shape, B: n(i.B), L: n(i.L), Df: n(i.Df), q0: n(i.q0), Es: n(i.Es), mu: n(i.mu), Hs: n(i.Hs), If: n(i.If), rigid: i.rigid,
    ztop: n(i.ztop), Hc: n(i.Hc), e0: n(i.e0), Cc: n(i.Cc), Cr: n(i.Cr), sig0: n(i.sig0), sigc: n(i.sigc), cv: n(i.cv), t: n(i.t), drain: i.drain,
  }
}

/** Hitung; null bila input tidak valid. */
export function computeSettlementUI(i: SettlementUIInput): SettlementOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeSettlement(toCalcInput(i))
  return r.valid ? r : null
}
