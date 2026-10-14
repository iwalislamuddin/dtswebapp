import { computeCptBearing, type CptBearingInput, type CptBearingResult } from '../../calc/cpt-bearing'
import type { CptUnit } from '../../calc/shared/cpt'
import { CPT_SAMPLE, cptDataError, cptPoints } from '../_cpt/data'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Daya Dukung CPT (fondasi dangkal dari sondir): angka sebagai teks form; data sondir sebagai teks tempel.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true) — bidang turunan pasti terisi. */
export type CptBearingOk = CptBearingResult & { valid: true; zMax: number; qcb: number; sigv0: number; qaNet: number; qaGross: number; dc: number; method: string }

export interface CptBearingUIInput {
  unit: CptUnit
  /** Data sondir: "z qc" per baris. */
  data: string
  /** Lebar B, panjang L (kosong = B), kedalaman dasar Df (m); berat isi di atas dasar (kN/m³). */
  B: string
  L: string
  Df: string
  gamma: string
  soil: 'sand' | 'clay'
  /** Lempung: faktor kerucut Nk (kosong = 14), FS (kosong = 3). */
  Nk: string
  FS: string
  /** Tekanan kerja neto (kPa); 0 = tanpa rasio D/C. */
  qw: string
}

/** Input bawaan = kasus golden default. */
export const CPT_BEARING_DEFAULTS: CptBearingUIInput = {
  unit: 'kgcm2', data: CPT_SAMPLE, B: '1.5', L: '1.5', Df: '1', gamma: '17', soil: 'sand', Nk: '14', FS: '3', qw: '0',
}

export function validate(i: CptBearingUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  const dataErr = cptDataError(i.data, i.unit)
  if (dataErr) e.data = dataErr
  need('B', pos)
  if (i.L.trim() !== '') need('L', nonneg)
  need('Df', nonneg)
  need('gamma', nonneg)
  if (i.soil === 'clay') for (const k of ['Nk', 'FS'] as const) if (i[k].trim() !== '') need(k, nonneg)
  need('qw', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: CptBearingUIInput): CptBearingInput {
  const n = (s: string) => num(s)
  return { B: n(i.B), L: n(i.L), Df: n(i.Df), gamma: n(i.gamma), soil: i.soil, Nk: n(i.Nk), FS: n(i.FS), qw: n(i.qw) }
}

/** Hitung; null bila input tidak valid. */
export function computeCptBearingUI(i: CptBearingUIInput): CptBearingOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeCptBearing(toCalcInput(i), cptPoints(i.data, i.unit))
  return r.valid ? (r as CptBearingOk) : null
}
