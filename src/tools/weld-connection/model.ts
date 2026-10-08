import { computeWeldConnection, type Electrode, type WeldConnectionInput, type WeldConnectionResult } from '../../calc/weld-connection'
import { parseNum, type FieldErrors } from '../form'

// Input UI Sambungan Las: angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk compute lama.

export { parseNum, type FieldErrors }

export interface WeldInput {
  electrode: Electrode
  /** MPa — dipakai bila elektroda = kustom. */
  Fexx: string
  /** Kaki las & panjang efektif total (mm). */
  w: string
  Lw: string
  /** Sudut beban terhadap sumbu las (°). */
  theta: string
  useDir: 'yes' | 'no'
  endLoaded: 'yes' | 'no'
  /** Logam dasar tertipis: mm, MPa. */
  t: string
  Fy: string
  Fu: string
  /** kN, terfaktor. */
  Ru: string
}

/** Input bawaan = kasus golden "default E70 6mm x 200" (build lama). */
export const WELD_DEFAULTS: WeldInput = {
  electrode: 'e70', Fexx: '482', w: '6', Lw: '200', theta: '0', useDir: 'yes', endLoaded: 'no', t: '10', Fy: '240', Fu: '370',
  Ru: '150',
}

export function validate(i: WeldInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof WeldInput, rule: (n: number) => string | null) => {
    const n = parseNum(i[key])
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  if (i.electrode === 'custom') need('Fexx', pos)
  need('w', pos)
  need('Lw', pos)
  need('theta', (n) => (n >= 0 && n <= 90 ? null : 'Antara 0 dan 90°'))
  need('t', nonneg)
  need('Fy', nonneg)
  need('Fu', nonneg)
  need('Ru', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: WeldInput): WeldConnectionInput {
  const n = (s: string) => parseNum(s) ?? 0
  return {
    electrode: i.electrode, Fexx: n(i.Fexx), w: n(i.w), Lw: n(i.Lw), theta: n(i.theta), useDir: i.useDir, endLoaded: i.endLoaded,
    t: n(i.t), Fy: n(i.Fy), Fu: n(i.Fu), Ru: n(i.Ru),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeWeld(i: WeldInput): WeldConnectionResult | null {
  if (Object.keys(validate(i)).length) return null
  return computeWeldConnection(toCalcInput(i))
}

/** Faktor arah kd(θ) = 1 + 0,5·sin^1,5 θ (J2-5). */
export const kdOf = (thetaDeg: number): number => 1 + 0.5 * Math.pow(Math.sin((thetaDeg * Math.PI) / 180), 1.5)
