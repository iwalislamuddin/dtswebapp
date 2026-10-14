import { computeBroms, type BromsInput, type BromsResult, type BromsSoil, type PileHead } from '../../calc/lateral-broms'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Lateral Tiang — Broms: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true) — bidang turunan pasti terisi. */
export type BromsOk = BromsResult & {
  valid: true; D: number; L: number; e: number; My: number; Hshort: number; Hlong: number; fShort: number; short: boolean; Hu: number
  mode: string; f: number; zmax: number; Mmax: number; dcMom: number
}

export interface BromsUIInput {
  soil: BromsSoil
  head: PileHead
  /** Diameter D (mm), panjang tertanam L (m), tinggi beban di atas tanah e (m), momen leleh tiang My (kN·m). */
  D: string
  L: string
  e: string
  My: string
  /** Lempung: cu (kPa). Pasir: φ (°) dan γ′ (kN/m³). */
  cu: string
  phi: string
  gam: string
}

/** Input bawaan = kasus golden default. */
export const BROMS_DEFAULTS: BromsUIInput = { soil: 'clay', head: 'free', D: '500', L: '10', e: '0', My: '800', cu: '50', phi: '32', gam: '9' }

export function validate(i: BromsUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('D', pos)
  need('L', pos)
  need('e', nonneg)
  need('My', pos)
  if (i.soil === 'clay') {
    need('cu', pos)
    const D = num(i.D) / 1000, L = num(i.L)
    if (!e.L && !e.D && L <= 1.5 * D) e.L = 'Harus > 1,5·D (zona reaksi nol di atas)'
  } else {
    need('phi', pos)
    need('gam', pos)
  }
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BromsUIInput): BromsInput {
  const n = (s: string) => num(s)
  return { soil: i.soil, head: i.head, D: n(i.D), L: n(i.L), e: n(i.e), My: n(i.My), cu: n(i.cu), phi: n(i.phi), gam: n(i.gam) }
}

/** Hitung; null bila input tidak valid. */
export function computeBromsUI(i: BromsUIInput): BromsOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeBroms(toCalcInput(i))
  return r.valid ? (r as BromsOk) : null
}
