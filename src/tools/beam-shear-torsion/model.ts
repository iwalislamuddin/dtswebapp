import { computeShearTorsion, type ShearTorsionInput, type ShearTorsionResult } from '../../calc/beam-shear-torsion'
import { checker, intRange, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Geser & Torsi Balok: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export const BARS = [10, 13, 16, 19, 22, 25, 29, 32]
export const STIRRUPS = [8, 10, 13, 16]
export const LAMBDA_OPTIONS = [
  { value: '1', label: 'Normal (1,0)' },
  { value: '0.85', label: 'Ringan-pasir (0,85)' },
  { value: '0.75', label: 'Ringan (0,75)' },
]

export interface ShearInput {
  fc: string
  fy: string
  fyt: string
  lam: string
  b: string
  h: string
  /** Selimut bersih ke sengkang (mm). */
  cc: string
  ds: string
  nLegs: '2' | '3' | '4'
  s: string
  nTop: string
  dbTop: string
  nBot: string
  dbBot: string
  nSide: string
  dbSide: string
  /** kN, kN·m terfaktor. */
  Vu: string
  Tu: string
}

/** Input bawaan = kasus golden default (300×500, sengkang Ø10-100, Vu 150 kN, Tu 25 kN·m). */
export const SHEAR_DEFAULTS: ShearInput = {
  fc: '25', fy: '420', fyt: '420', lam: '1', b: '300', h: '500', cc: '40', ds: '10', nLegs: '2', s: '100', nTop: '2', dbTop: '16',
  nBot: '2', dbBot: '19', nSide: '2', dbSide: '13', Vu: '150', Tu: '25',
}

export function validate(i: ShearInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('fc', pos)
  need('fy', pos)
  need('fyt', pos)
  need('b', pos)
  need('h', pos)
  need('cc', nonneg)
  need('s', pos)
  need('nTop', intRange(2, 20))
  need('nBot', intRange(2, 20))
  need('nSide', (n) => (!Number.isInteger(n) || n < 0 || n % 2 ? 'Kelipatan 2 (kiri = kanan)' : n > 20 ? 'Maksimum 20' : null))
  need('Vu', nonneg)
  need('Tu', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: ShearInput): ShearTorsionInput {
  return {
    fc: num(i.fc), fy: num(i.fy), fyt: num(i.fyt), lam: Number(i.lam), b: num(i.b), h: num(i.h), cc: num(i.cc), ds: Number(i.ds),
    nLegs: Number(i.nLegs), s: num(i.s), nTop: num(i.nTop), dbTop: Number(i.dbTop), nBot: num(i.nBot), dbBot: Number(i.dbBot),
    nSide: num(i.nSide), dbSide: Number(i.dbSide), Vu: num(i.Vu), Tu: num(i.Tu),
  }
}

/** Hitung; null bila input tidak valid atau geometri tidak dapat dihitung. */
export function computeShear(i: ShearInput): ShearTorsionResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeShearTorsion(toCalcInput(i))
  return r.valid ? r : null
}

/** Alasan penolakan bila field sah tetapi geometri tidak memungkinkan. */
export function rejectReason(i: ShearInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeShearTorsion(toCalcInput(i))
  return r.valid ? null : r.warn[0] ?? 'Input tidak dapat dihitung.'
}
