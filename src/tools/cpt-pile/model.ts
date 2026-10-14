import { computeCptPile, type CptPileInput, type CptPileResult } from '../../calc/cpt-pile'
import { cptAt, type CptUnit } from '../../calc/shared/cpt'
import { cptDataError, cptPoints } from '../_cpt/data'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Daya Dukung Tiang dari CPT/Sondir: angka sebagai teks form; data sondir sebagai teks tempel (z qc fs).

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true) — bidang turunan pasti terisi. */
export type CptPileOk = CptPileResult & {
  valid: true; zMax: number; hasFs: boolean; Ap: number; K: number; qc1: number; qc2: number; qp: number; Qp: number; Qs: number
  fsMax: number; capped: boolean; Qu: number; Qall: number; QallGlobal: number; dc: number
}

/** Contoh sondir dengan kolom fs (kg/cm²): z, qc, fs. */
export const CPT_PILE_SAMPLE =
  '0 5 0.1\n1 10 0.2\n2 15 0.3\n3 25 0.5\n4 35 0.6\n5 50 0.8\n6 60 0.9\n7 75 1.0\n8 90 1.1\n9 110 1.2\n10 130 1.3\n11 150 1.4\n12 175 1.5\n13 200 1.6\n14 220 1.7\n16 250 1.8'

export interface CptPileUIInput {
  unit: CptUnit
  /** Data sondir: "z qc [fs]" per baris. */
  data: string
  shape: 'circle' | 'square'
  /** Diameter / sisi D (m), panjang tertanam Lp (m). */
  D: string
  Lp: string
  /** Sumber gesekan selimut: kolom fs sondir atau rasio gesek Rf (%, kosong/0 = 1). */
  fsrc: 'data' | 'rf'
  Rf: string
  /** FS ujung (kosong/0 = 3) dan selimut (kosong/0 = 5). */
  FSp: string
  FSs: string
  /** Beban kerja (kN); 0 = tanpa rasio D/C. */
  Pw: string
}

/** Input bawaan = kasus golden default. */
export const CPT_PILE_DEFAULTS: CptPileUIInput = {
  unit: 'kgcm2', data: CPT_PILE_SAMPLE, shape: 'circle', D: '0.4', Lp: '12', fsrc: 'data', Rf: '1', FSp: '3', FSs: '5', Pw: '0',
}

/** Kolom fs ada pada data tempel? (menentukan apakah Rf perlu diisi) */
export const dataHasFs = (i: Pick<CptPileUIInput, 'data' | 'unit'>): boolean => cptPoints(i.data, i.unit).some((p) => p.fs != null)

export function validate(i: CptPileUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  const dataErr = cptDataError(i.data, i.unit)
  if (dataErr) e.data = dataErr
  need('D', pos)
  need('Lp', pos)
  if ((i.fsrc === 'rf' || !dataHasFs(i)) && i.Rf.trim() !== '') need('Rf', nonneg)
  for (const k of ['FSp', 'FSs'] as const) if (i[k].trim() !== '') need(k, nonneg)
  need('Pw', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: CptPileUIInput): CptPileInput {
  const n = (s: string) => num(s)
  return { shape: i.shape, D: n(i.D), Lp: n(i.Lp), fsrc: i.fsrc, Rf: n(i.Rf), FSp: n(i.FSp), FSs: n(i.FSs), Pw: n(i.Pw) }
}

/** Hitung; null bila input tidak valid. */
export function computeCptPileUI(i: CptPileUIInput): CptPileOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeCptPile(toCalcInput(i), cptPoints(i.data, i.unit))
  return r.valid ? (r as CptPileOk) : null
}

/** fs selimut terpakai (kPa, sudah dibatasi 120) pada n titik sepanjang tiang — untuk diagram. */
export function shaftProfile(r: CptPileOk, n = 60): { z: number; fs: number }[] {
  return Array.from({ length: n }, (_, k) => {
    const z = ((k + 0.5) * r.Lp) / n
    const raw = r.fsrc === 'data' ? cptAt(r.pts, z, 'fs') : (r.Rf / 100) * cptAt(r.pts, z, 'qc')
    return { z, fs: Math.min(raw, 120) }
  })
}
