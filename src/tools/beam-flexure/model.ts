import { BEAM_BARS, computeBeamFlexure, type BeamFlexureInput, type BeamFlexureResult } from '../../calc/beam-flexure'
import { checker, intRange, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Kapasitas Lentur Balok (φMn): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
export { BEAM_BARS }

export interface BeamFlexInput {
  fc: string
  fy: string
  /** Penampang & selimut bersih (mm). */
  b: string
  h: string
  cc: string
  /** Diameter sengkang (mm). */
  ds: string
  /** Tulangan tarik: jumlah total, diameter, jumlah lapis, spasi bersih antar lapis. */
  n1: string
  db1: string
  nLay: '1' | '2' | '3'
  sv: string
  doubly: 'yes' | 'no'
  /** Tulangan tekan. */
  n2: string
  db2: string
}

/** Input bawaan = kasus golden default (300×500, 3D19, f'c 25 → φMn 132,6 kN·m). */
export const BEAM_FLEX_DEFAULTS: BeamFlexInput = {
  fc: '25', fy: '420', b: '300', h: '500', cc: '40', ds: '10', n1: '3', db1: '19', nLay: '1', sv: '25', doubly: 'no', n2: '2', db2: '16',
}

export function validate(i: BeamFlexInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('fc', pos)
  need('fy', pos)
  need('b', pos)
  need('h', pos)
  need('cc', nonneg)
  need('ds', nonneg)
  need('n1', intRange(1, 30))
  if (i.nLay !== '1') need('sv', nonneg)
  if (i.doubly === 'yes') need('n2', intRange(0, 30))
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BeamFlexInput): BeamFlexureInput {
  return {
    fc: num(i.fc), fy: num(i.fy), b: num(i.b), h: num(i.h), cc: num(i.cc), ds: num(i.ds), n1: num(i.n1), db1: Number(i.db1),
    nLay: Number(i.nLay), sv: num(i.sv), doubly: i.doubly, n2: num(i.n2), db2: Number(i.db2),
  }
}

/** Hitung; null bila input tidak valid atau tinggi efektif ≤ 0 (UI memakai hasil terakhir, diredupkan). */
export function computeBeamFlex(i: BeamFlexInput): BeamFlexureResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeBeamFlexure(toCalcInput(i))
  return r.valid ? r : null
}

/** Pesan bila hitungan ditolak mesin hitung meski field sah (mis. tinggi efektif ≤ 0). */
export function rejectReason(i: BeamFlexInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeBeamFlexure(toCalcInput(i))
  return r.valid ? null : r.warn[0] ?? 'Input tidak dapat dihitung.'
}
