import { computePy, type PyInput, type PyParams, type PyResult, type PySoil, type PileHead, type PySolution } from '../../calc/py-analysis'
import { anyNum, checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Analisis P-Y (tiang dibebani lateral, beda-hingga): angka sebagai teks form.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true) — bidang turunan pasti terisi. */
export type PyOk = PyResult & {
  valid: true; D: number; L: number; e: number; M: number; EI: number; I: number; H: number; M0: number; P: PyParams; sol: PySolution; curve: { H: number; y0: number }[]
  conv: boolean; y0: number; slope0: number; ymax: number; ymaxZ: number; Mmax: number; MmaxZ: number; puTop: number
}

export interface PyUIInput {
  soil: PySoil
  head: PileHead
  /** Beban lateral H (kN), momen kepala M (kN·m), tinggi beban e (m). */
  H: string
  M: string
  e: string
  /** Diameter D (mm), panjang tertanam L (m), modulus elastis tiang E (MPa). */
  D: string
  L: string
  E: string
  /** Berat isi efektif γ′ (kN/m³). */
  gam: string
  /** Lempung (Matlock): cu (kPa), ε50. */
  cu: string
  eps50: string
  /** Pasir (API): φ (°), modulus subgrade awal k (MN/m³). */
  phi: string
  kpy: string
}

/** Input bawaan = kasus golden default. */
export const PY_DEFAULTS: PyUIInput = {
  soil: 'clay', head: 'free', H: '200', M: '0', e: '0', D: '600', L: '15', E: '25000', gam: '8', cu: '40', eps50: '0.01', phi: '33', kpy: '16',
}

export function validate(i: PyUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('H', pos)
  need('D', pos)
  need('L', pos)
  need('E', pos)
  need('gam', pos)
  need('e', nonneg)
  if (i.head === 'free') need('M', anyNum)
  if (i.soil === 'clay') {
    need('cu', pos)
    need('eps50', pos)
  } else {
    need('phi', pos)
    need('kpy', pos)
  }
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: PyUIInput): PyInput {
  const n = (s: string) => num(s)
  return {
    soil: i.soil, head: i.head, H: n(i.H), M: n(i.M), e: n(i.e), D: n(i.D), L: n(i.L), E: n(i.E), gam: n(i.gam),
    cu: n(i.cu), eps50: n(i.eps50), phi: n(i.phi), kpy: n(i.kpy),
  }
}

/** Hitung; null bila input tidak valid. */
export function computePyUI(i: PyUIInput): PyOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computePy(toCalcInput(i))
  return r.valid ? (r as PyOk) : null
}

/** Profil sepanjang tiang: z (m), defleksi y (mm), momen M (kN·m), reaksi tanah p (kN/m). */
export function pyProfile(r: PyOk): { z: number[]; y: number[]; M: number[]; p: number[] } {
  const { sol } = r
  const z = Array.from(sol.y, (_, k) => k * sol.dz)
  return { z, y: Array.from(sol.y, (v) => v * 1000), M: Array.from(sol.M), p: Array.from(sol.p) }
}
