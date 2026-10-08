import { computeSteelTension, U_PRESETS, type SteelTensionInput, type SteelTensionResult } from '../../calc/steel-tension'
import { parseNum, type FieldErrors } from '../form'
import { gradeValues, validateGrade, validateProfile, type SteelGradeInput } from '../_steel/profile'

// Input UI Batang Tarik Baja: angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk compute lama.

export { parseNum, type FieldErrors }

/** Pilihan shear lag U: nilai preset sebagai teks, '0' = manual. */
export const U_OPTIONS = U_PRESETS.map(([label, u]) => ({ value: String(u), label }))

export interface TensionInput extends SteelGradeInput {
  ptype: string
  psize: string
  conn: 'bolt' | 'weld'
  /** Jumlah lubang di penampang kritis. */
  nHole: string
  /** mm */
  db: string
  hole: string
  /** Tebal elemen berlubang (mm); 0 = otomatis dari library. */
  tHole: string
  Upreset: string
  Uval: string
  /** mm */
  L: string
  /** kN; 0 = lewati D/C. */
  Pu: string
  Pa: string
}

/** Input bawaan = kasus golden default (WF 400×200, 2 lubang M18, BJ 37). */
export const TENSION_DEFAULTS: TensionInput = {
  ptype: 'WF', psize: '400×200×8×13', grade: 'BJ 37', Fy: '240', Fu: '370', conn: 'bolt', nHole: '2', db: '18', hole: '2',
  tHole: '13', Upreset: '1', Uval: '0.85', L: '3000', Pu: '0', Pa: '0',
}

export function validate(i: TensionInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof TensionInput, rule: (n: number) => string | null) => {
    const n = parseNum(i[key])
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  validateProfile(e, i.ptype, i.psize)
  validateGrade(e, i, true)
  if (i.conn === 'bolt') {
    need('nHole', (n) => (Number.isInteger(n) && n >= 0 ? null : 'Bilangan bulat ≥ 0'))
    need('db', pos)
    need('hole', nonneg)
    need('tHole', nonneg)
  }
  if (i.Upreset === '0') need('Uval', (n) => (n > 0 && n <= 1 ? null : 'Antara 0 dan 1'))
  need('L', nonneg)
  need('Pu', nonneg)
  need('Pa', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: TensionInput): SteelTensionInput {
  const n = (s: string) => parseNum(s) ?? 0
  const { Fy, Fu } = gradeValues(i)
  return {
    ptype: i.ptype, psize: i.psize, Fy, Fu, conn: i.conn, nHole: n(i.nHole), db: n(i.db), hole: n(i.hole), tHole: n(i.tHole),
    Upreset: i.Upreset, Uval: n(i.Uval), L: n(i.L), Pu: n(i.Pu), Pa: n(i.Pa),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeTension(i: TensionInput): SteelTensionResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeSteelTension(toCalcInput(i))
  return r.valid ? r : null
}
