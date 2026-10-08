import { CB_PRESETS, computeSteelFlexure, type SteelFlexureInput, type SteelFlexureResult } from '../../calc/steel-flexure'
import { parseNum, type FieldErrors } from '../form'
import { gradeValues, validateGrade, validateProfile, type SteelGradeInput } from '../_steel/profile'

// Input UI Balok Baja (Lentur): angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk compute lama.

export { parseNum, type FieldErrors }

/** Pilihan Cb: nilai preset sebagai teks; kantilever 'cant' (Cb 1,0, nilainya sama dengan momen seragam); '0' = manual. */
export const CB_OPTIONS = CB_PRESETS.map(([label, cb]) => ({
  value: label.startsWith('Kantilever') ? 'cant' : String(cb),
  label: label.replace(/\s{2,}/g, ' '),
}))

export interface FlexureInput extends SteelGradeInput {
  ptype: string
  psize: string
  axis: 'x' | 'y'
  /** Panjang tak-terkekang lateral (mm). */
  Lb: string
  Cbpreset: string
  Cbval: string
  /** kN·m; 0 = lewati D/C. */
  Mu: string
  Ma: string
}

/** Input bawaan = kasus golden default (WF 400×200, Lb 3 m, Cb 1, BJ 37). */
export const FLEXURE_DEFAULTS: FlexureInput = {
  ptype: 'WF', psize: '400×200×8×13', grade: 'BJ 37', Fy: '240', Fu: '370', axis: 'x', Lb: '3000', Cbpreset: '1', Cbval: '1',
  Mu: '0', Ma: '0',
}

/** Pilihan sumbu lentur berarti (WF & RHS); profil lain selalu sumbu kuat/simetris. */
export const hasAxisChoice = (ptype: string) => ptype === 'WF' || ptype === 'RHS'

/** Tekuk torsi-lateral ditinjau (Lb & Cb berlaku): I/kanal & RHS sumbu kuat. */
export const hasLtb = (i: Pick<FlexureInput, 'ptype' | 'axis'>) =>
  i.ptype === 'UNP' || ((i.ptype === 'WF' || i.ptype === 'RHS') && effAxis(i) === 'x')

/** Sumbu efektif: pilihan sumbu hanya berlaku untuk profil yang mendukungnya. */
export const effAxis = (i: Pick<FlexureInput, 'ptype' | 'axis'>): 'x' | 'y' => (hasAxisChoice(i.ptype) ? i.axis : 'x')

export function validate(i: FlexureInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof FlexureInput, rule: (n: number) => string | null) => {
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
  if (hasLtb(i)) {
    need('Lb', nonneg)
    if (i.Cbpreset === '0') need('Cbval', (n) => (n > 0 ? null : 'Harus > 0'))
  }
  need('Mu', nonneg)
  need('Ma', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: FlexureInput): SteelFlexureInput {
  const n = (s: string) => parseNum(s) ?? 0
  return {
    ptype: i.ptype, psize: i.psize, Fy: gradeValues(i).Fy, axis: effAxis(i), Lb: n(i.Lb), Cbpreset: i.Cbpreset, Cbval: n(i.Cbval),
    Mu: n(i.Mu), Ma: n(i.Ma),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeFlexure(i: FlexureInput): SteelFlexureResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeSteelFlexure(toCalcInput(i))
  return r.valid ? r : null
}

/** Kurva Mn (kN·m) terhadap Lb (mm) untuk input yang sama — dihitung ulang dengan mesin hitung (titik [Lb, Mn]). */
export function mnCurve(i: FlexureInput, LbMax: number, n = 80): [number, number][] {
  const base = toCalcInput(i)
  return Array.from({ length: n + 1 }, (_, k) => {
    const Lb = (LbMax * k) / n
    return [Lb, computeSteelFlexure({ ...base, Lb }).Mn ?? 0] as [number, number]
  })
}
