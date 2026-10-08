import { computeSteelCompression, K_PRESETS, type SteelCompressionInput, type SteelCompressionResult } from '../../calc/steel-compression'
import { parseNum, type FieldErrors } from '../form'
import { gradeValues, validateGrade, validateProfile, type SteelGradeInput } from '../_steel/profile'

// Input UI Batang Tekan Baja: angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk compute lama.

export { parseNum, type FieldErrors }

/** Pilihan K: nilai preset sebagai teks, '0' = manual. */
export const K_OPTIONS = K_PRESETS.map(([label, k]) => ({ value: String(k), label: label.replace(/\s{2,}/g, ' ') }))

export interface CompressionInput extends SteelGradeInput {
  ptype: string
  psize: string
  Kpreset: string
  Kval: string
  /** Panjang tak-terkekang sumbu kuat & lemah (mm). */
  Lx: string
  Ly: string
  /** Tekuk torsi WF: Kz & Lz (mm); 0 = 1,0 / maks(Lx, Ly). */
  Kz: string
  Lz: string
  /** kN; 0 = lewati D/C. */
  Pu: string
  Pa: string
}

/** Input bawaan = kasus golden default (WF 200×200, K 1, L 3 m, BJ 37). */
export const COMPRESSION_DEFAULTS: CompressionInput = {
  ptype: 'WF', psize: '200×200×8×12', grade: 'BJ 37', Fy: '240', Fu: '370', Kpreset: '1', Kval: '1', Lx: '3000', Ly: '3000',
  Kz: '1', Lz: '3000', Pu: '0', Pa: '0',
}

export function validate(i: CompressionInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof CompressionInput, rule: (n: number) => string | null) => {
    const n = parseNum(i[key])
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  validateProfile(e, i.ptype, i.psize)
  validateGrade(e, i, false)
  if (i.Kpreset === '0') need('Kval', (n) => (n > 0 ? null : 'Harus > 0'))
  need('Lx', nonneg)
  need('Ly', nonneg)
  if (!e.Lx && !e.Ly && !((parseNum(i.Lx) ?? 0) > 0 || (parseNum(i.Ly) ?? 0) > 0)) e.Ly = 'Isi Lx atau Ly > 0'
  if (i.ptype === 'WF') {
    need('Kz', nonneg)
    need('Lz', nonneg)
  }
  need('Pu', nonneg)
  need('Pa', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: CompressionInput): SteelCompressionInput {
  const n = (s: string) => parseNum(s) ?? 0
  return {
    ptype: i.ptype, psize: i.psize, Fy: gradeValues(i).Fy, Kpreset: i.Kpreset, Kval: n(i.Kval), Lx: n(i.Lx), Ly: n(i.Ly),
    Kz: n(i.Kz), Lz: n(i.Lz), Pu: n(i.Pu), Pa: n(i.Pa),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeCompression(i: CompressionInput): SteelCompressionResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeSteelCompression(toCalcInput(i))
  return r.valid ? r : null
}
