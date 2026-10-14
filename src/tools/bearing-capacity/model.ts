import { computeBearing, type BearingInput, type BearingMethod, type BearingResult, type FootingShape } from '../../calc/bearing-capacity'
import { anyNum, checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Daya Dukung Tanah (fondasi dangkal): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true). */
export type BearingOk = Extract<BearingResult, { valid: true }>

export interface BearingUIInput {
  shape: FootingShape
  /** Lebar / sisi / diameter (m) dan panjang (m, hanya persegi panjang). */
  B: string
  L: string
  /** Kedalaman dasar (m). */
  Df: string
  /** Kohesi (kPa), sudut geser (°), berat isi lembab & jenuh (kN/m³), kedalaman MAT (m). */
  c: string
  phi: string
  gamma: string
  gsat: string
  Dw: string
  method: BearingMethod
  tfail: 'general' | 'local'
  /** Faktor keamanan (kosong/0 = 3) dan tekanan kerja opsional (kPa; 0 = tanpa rasio D/C). */
  FS: string
  qapp: string
}

/** Input bawaan = kasus golden default. */
export const BEARING_DEFAULTS: BearingUIInput = {
  shape: 'square', B: '2', L: '3', Df: '1.5', c: '10', phi: '30', gamma: '18', gsat: '20', Dw: '99',
  method: 'terzaghi', tfail: 'general', FS: '3', qapp: '0',
}

export function validate(i: BearingUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('B', pos)
  if (i.shape === 'rect') need('L', pos)
  need('Df', nonneg)
  need('c', nonneg)
  need('phi', nonneg)
  need('gamma', pos)
  for (const k of ['gsat', 'FS'] as const) if (i[k].trim() !== '') need(k, nonneg)
  need('Dw', anyNum)
  need('qapp', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BearingUIInput): BearingInput {
  return {
    shape: i.shape, B: num(i.B), L: num(i.L), Df: num(i.Df), c: num(i.c), phi: num(i.phi), gamma: num(i.gamma), gsat: num(i.gsat),
    Dw: num(i.Dw), method: i.method, tfail: i.tfail, FS: num(i.FS), qapp: num(i.qapp),
  }
}

/** Hitung; null bila input tidak valid. */
export function computeBearingUI(i: BearingUIInput): BearingOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeBearing(toCalcInput(i))
  return r.valid ? r : null
}
