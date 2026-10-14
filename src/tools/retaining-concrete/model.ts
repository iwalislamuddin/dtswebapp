import { computeConcreteWall, type ConcreteWallInput, type ConcreteWallResult, type WallFlexure } from '../../calc/retaining-concrete'
import { checker, num, nonneg, pos, type FieldErrors } from '../form'
import { validateWallCommon, WALL_COMMON_DEFAULTS, type WallCommonInput } from '../_retaining/common'

// Input UI DPT Beton Kantilever: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export const WALL_BARS = [10, 13, 16, 19, 22, 25, 29, 32] as const

export interface ConcreteWallUIInput extends WallCommonInput {
  /** Berat isi beton (kN/m³). */
  gammaC: string
  fc: string
  fy: string
  /** Selimut stem & tapak (mm); 0 = 50 / 75. */
  coverS: string
  coverF: string
  /** Diameter tulangan utama & bagi/susut (mm). */
  dbMain: string
  dbDist: string
}

/** Input bawaan = kasus golden default (H 3 m, stem 0,25 → 0,40 m, tapak 0,4 m). */
export const WALL_DEFAULTS: ConcreteWallUIInput = {
  ...WALL_COMMON_DEFAULTS, H: '3', bTop: '0.25', bBot: '0.4', tf: '0.4', toe: '0.8', heel: '1.5',
  gammaC: '24', fc: '25', fy: '420', coverS: '50', coverF: '75', dbMain: '16', dbDist: '13',
}

export function validate(i: ConcreteWallUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  validateWallCommon(i, e, need)
  for (const k of ['gammaC', 'fc', 'fy'] as const) need(k, pos)
  for (const k of ['coverS', 'coverF'] as const) need(k, nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: ConcreteWallUIInput): ConcreteWallInput {
  const n = num
  return {
    opsi: i.opsi, H: n(i.H), bTop: n(i.bTop), bBot: n(i.bBot), tf: n(i.tf), toe: n(i.toe), heel: n(i.heel), D: n(i.D),
    gamma1: n(i.gamma1), phi1: n(i.phi1), beta: n(i.beta), q: n(i.q), gamma2: n(i.gamma2), phi2: n(i.phi2), c2: n(i.c2),
    qall: n(i.qall), kf: n(i.kf), passive: i.passive, gammaC: n(i.gammaC), fc: n(i.fc), fy: n(i.fy), coverS: n(i.coverS),
    coverF: n(i.coverF), dbMain: Number(i.dbMain), dbDist: Number(i.dbDist), FSot: n(i.FSot), FSsl: n(i.FSsl), Lwall: n(i.Lwall),
  }
}

/** Hitung; null bila input tidak valid. */
export function computeConcrete(i: ConcreteWallUIInput): ConcreteWallResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeConcreteWall(toCalcInput(i))
  return r.valid ? r : null
}

/** Pesan bila mesin hitung menolak meski field sah. */
export function rejectReason(i: ConcreteWallUIInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeConcreteWall(toCalcInput(i))
  return r.valid ? null : r.warn[0] ?? 'Input tidak dapat dihitung.'
}

/** Rasio D/C struktur: lentur & geser stem, toe, heel (toe/heel yang tidak ada dilewati). ∞ bila penampang tak cukup. */
export function structRatios(r: ConcreteWallResult): { label: string; ratio: number }[] {
  const one = (f: WallFlexure | undefined, label: string) => {
    if (!f) return []
    return [
      { label: `Lentur ${label}`, ratio: f.dc ?? Infinity },
      { label: `Geser ${label}`, ratio: f.dcV ?? Infinity },
    ]
  }
  return [
    ...one(r.stem, 'stem'),
    ...(r.toe! > 0.01 ? one(r.toeD, 'toe') : []),
    ...(r.B! - r.xb! > 0.01 ? one(r.heelD, 'heel') : []),
  ]
}
