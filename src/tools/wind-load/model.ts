import { computeWind, KzAt, type Enclosure, type Exposure, type WindInput, type WindLevel, type WindResult } from '../../calc/wind-load'
import { checker, num, pos, type FieldErrors } from '../form'

// Input UI Beban Angin (SNI 1727:2020 Bab 26–27, SPGAU dinding): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true) — bidang turunan pasti terisi. */
export type WindOk = WindResult & {
  valid: true; Kh: number; qh: number; LB: number; CpL: number; CpW: number; CpS: number
  pWWtopPlus: number; pWWtopMinus: number; pLee: number; pLeeMinus: number; pSide: number; pSideMinus: number; pNetTop: number
  F: number; M: number; Fmin: number; minGoverns: boolean; Fdesign: number; table: WindLevel[]
}

export interface WindUIInput {
  /** Kecepatan angin dasar (m/s). */
  V: string
  expo: Exposure
  /** Faktor arah, topografi, elevasi, efek hembusan. */
  Kd: string
  Kzt: string
  Ke: string
  G: string
  enc: Enclosure
  /** Lebar tegak lurus angin, panjang sejajar angin, tinggi atap rata-rata (m). */
  B: string
  L: string
  H: string
}

/** Input bawaan = kasus golden default. */
export const WIND_DEFAULTS: WindUIInput = { V: '35', expo: 'C', Kd: '0.85', Kzt: '1', Ke: '1', G: '0.85', enc: 'enclosed', B: '30', L: '20', H: '24' }

export const ENC_LABEL: Record<Enclosure, string> = { enclosed: 'tertutup', partial: 'tertutup sebagian', open: 'terbuka' }

export function validate(i: WindUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  for (const k of ['V', 'Kd', 'Kzt', 'Ke', 'G', 'B', 'L', 'H'] as const) need(k, pos)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: WindUIInput): WindInput {
  return { V: num(i.V), expo: i.expo, Kd: num(i.Kd), Kzt: num(i.Kzt), Ke: num(i.Ke), G: num(i.G), enc: i.enc, B: num(i.B), L: num(i.L), H: num(i.H) }
}

/** Hitung; null bila input tidak valid. */
export function computeWindUI(i: WindUIInput): WindOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeWind(toCalcInput(i))
  return r.valid ? (r as WindOk) : null
}

/** Tekanan velositas qz (kPa) di ketinggian z — rumus yang sama dengan mesin hitung. */
export function qzAt(r: WindOk, z: number): number {
  return (0.613 * KzAt(z, r.expo) * r.Kzt * r.Kd * r.Ke * r.V * r.V) / 1000
}

/** Tekanan netto horizontal windward + leeward (kPa) di z — integran geser dasar (internal saling meniadakan). */
export function netPressure(r: WindOk, z: number): number {
  return qzAt(r, z) * r.G * r.CpW + r.qh * r.G * Math.abs(r.CpL)
}

/**
 * Profil sepanjang tinggi (n + 1 titik, z = 0…H): tekanan windward ±GCpi dan geser kumulatif dari atap ke z
 * (kN, integrasi strip sama dengan mesin hitung; di z = 0 sama dengan F hitungan).
 */
export function windProfile(r: WindOk, n = 40) {
  const dz = r.H / n
  const z: number[] = [], pP: number[] = [], pM: number[] = [], Vz: number[] = Array.from({ length: n + 1 }, () => 0)
  for (let k = 0; k <= n; k++) {
    const zz = k * dz, q = qzAt(r, zz)
    z.push(zz)
    pP.push(q * r.G * r.CpW - r.qh * r.GCpi)
    pM.push(q * r.G * r.CpW + r.qh * r.GCpi)
  }
  for (let k = n - 1; k >= 0; k--) Vz[k] = Vz[k + 1] + netPressure(r, (k + 0.5) * dz) * r.B * dz
  return { z, pP, pM, Vz }
}
