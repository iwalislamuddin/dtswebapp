import { computeSteelBeam, type SteelBeamInput, type SteelBeamResult } from '../../calc/steel-beam-analysis'
import { getProfile, listProfiles } from '../../calc/shared/steel-profiles'
import { parseNum, type FieldErrors } from '../form'

export { parseNum, type FieldErrors }

// Input UI Analisis Balok Baja: struktur yang terbaca manusia (daftar beban), angka sebagai teks form agar bisa
// diketik bebas ("1," / kosong). toCalcInput() menerjemahkannya ke bentuk datar compute lama (d1_w1, p1_P, …).

export const MAX_DIST = 3
export const MAX_POINT = 4

export interface DistLoad {
  /** kN/m di a1 & a2 */
  w1: string
  w2: string
  /** m dari ujung kiri */
  a1: string
  a2: string
}

export interface PointLoad {
  /** kN (+ ke bawah) */
  P: string
  /** m dari ujung kiri */
  a: string
}

export interface BeamInput {
  ptype: string
  psize: string
  /** m */
  L: string
  cL: string
  cR: string
  /** MPa */
  E: string
  self: 'ya' | 'tidak'
  dist: DistLoad[]
  point: PointLoad[]
}

/** Ukuran tengah daftar (perilaku build lama saat tipe dipilih). */
export const defaultSize = (type: string): string => {
  const list = listProfiles(type)
  return list.length ? list[Math.min(list.length - 1, Math.floor(list.length / 2))].name : ''
}

export const BEAM_DEFAULTS: BeamInput = {
  ptype: 'WF',
  // Build lama memilih ukuran tengah daftar (WF 500×200) — terlalu besar untuk contoh 6 m; pakai kasus golden default.
  psize: '300×150×6.5×9',
  L: '6',
  cL: '0',
  cR: '0',
  E: '200000',
  self: 'ya',
  dist: [{ w1: '15', w2: '15', a1: '0', a2: '6' }],
  point: [{ P: '30', a: '3' }],
}

export function validate(i: BeamInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: string, s: string, rule: (n: number) => string | null) => {
    const n = parseNum(s)
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  need('L', i.L, pos)
  need('cL', i.cL, nonneg)
  need('cR', i.cR, nonneg)
  need('E', i.E, pos)
  if (!getProfile(i.ptype, i.psize)) e.psize = 'Pilih ukuran profil'
  i.dist.forEach((d, k) => {
    for (const f of ['w1', 'w2'] as const) need(`dist.${k}.${f}`, d[f], () => null)
    need(`dist.${k}.a1`, d.a1, nonneg)
    need(`dist.${k}.a2`, d.a2, nonneg)
  })
  i.point.forEach((p, k) => {
    need(`point.${k}.P`, p.P, () => null)
    need(`point.${k}.a`, p.a, nonneg)
  })
  return e
}

/** Bentuk datar compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BeamInput): SteelBeamInput {
  const n = (s: string) => parseNum(s) ?? 0
  const v: SteelBeamInput = {
    L: n(i.L), cL: n(i.cL), cR: n(i.cR), E: n(i.E), self: i.self,
    nd: Math.min(MAX_DIST, i.dist.length), np: Math.min(MAX_POINT, i.point.length),
  }
  i.dist.slice(0, MAX_DIST).forEach((d, k) => {
    v[`d${k + 1}_w1`] = n(d.w1)
    v[`d${k + 1}_w2`] = n(d.w2)
    v[`d${k + 1}_a1`] = n(d.a1)
    v[`d${k + 1}_a2`] = n(d.a2)
  })
  i.point.slice(0, MAX_POINT).forEach((p, k) => {
    v[`p${k + 1}_P`] = n(p.P)
    v[`p${k + 1}_a`] = n(p.a)
  })
  return v
}

export interface BeamOutcome {
  input: BeamInput
  r: SteelBeamResult
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeBeam(i: BeamInput): BeamOutcome | null {
  if (Object.keys(validate(i)).length) return null
  return { input: i, r: computeSteelBeam(toCalcInput(i), getProfile(i.ptype, i.psize)) }
}
