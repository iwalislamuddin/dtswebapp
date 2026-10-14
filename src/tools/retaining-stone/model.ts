import { computeStoneWall, type StoneWallInput, type StoneWallResult } from '../../calc/retaining-stone'
import { checker, num, pos, type FieldErrors } from '../form'
import { validateWallCommon, WALL_COMMON_DEFAULTS, type WallCommonInput } from '../_retaining/common'

// Input UI DPT Batu Kali (gravitasi): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export interface StoneInput extends WallCommonInput {
  /** Berat isi pasangan batu (kN/m³). */
  gammaW: string
}

/** Input bawaan = kasus golden default (H 3 m, badan 0,5 → 1,8 m). */
export const STONE_DEFAULTS: StoneInput = {
  ...WALL_COMMON_DEFAULTS, H: '3', bTop: '0.5', bBot: '1.8', tf: '0.6', toe: '0.3', heel: '0.3', gammaW: '22',
}

export function validate(i: StoneInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  validateWallCommon(i, e, need)
  need('gammaW', pos)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: StoneInput): StoneWallInput {
  const n = num
  return {
    opsi: i.opsi, H: n(i.H), bTop: n(i.bTop), bBot: n(i.bBot), tf: n(i.tf), toe: n(i.toe), heel: n(i.heel), D: n(i.D),
    gamma1: n(i.gamma1), phi1: n(i.phi1), beta: n(i.beta), q: n(i.q), gamma2: n(i.gamma2), phi2: n(i.phi2), c2: n(i.c2),
    qall: n(i.qall), kf: n(i.kf), passive: i.passive, gammaW: n(i.gammaW), FSot: n(i.FSot), FSsl: n(i.FSsl), Lwall: n(i.Lwall),
  }
}

/** Hitung; null bila input tidak valid. */
export function computeStone(i: StoneInput): StoneWallResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeStoneWall(toCalcInput(i))
  return r.valid ? r : null
}

/** Pesan bila mesin hitung menolak meski field sah. */
export function rejectReason(i: StoneInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeStoneWall(toCalcInput(i))
  return r.valid ? null : r.warn[0] ?? 'Input tidak dapat dihitung.'
}
