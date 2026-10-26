import {
  computeFreeRoof,
  computeOpenFrame,
  computeWarehouse,
  computeWind,
  KzAt,
  type Enclosure,
  type Exposure,
  type FrameKind,
  type FreeRoofFlow,
  type FreeRoofResult,
  type FreeRoofShape,
  type MemberShape,
  type OpenFrameResult,
  type TowerShape,
  type WarehouseResult,
  type WindBase,
  type WindInput,
  type WindLevel,
  type WindResult,
} from '../../calc/wind-load'
import { checker, num, pos, type FieldErrors, type Rule } from '../form'

// Input UI Beban Angin (SNI 1727:2020): angka sebagai teks form; toCalcInput() → bentuk compute lama (gedung).
// Tipe struktur: gedung (SPGAU dinding, port build lama), gudang atap pelana, atap bebas bangunan terbuka, rangka terbuka.

export type { FieldErrors }
/** Hasil hitung yang sah (valid: true) — bidang turunan pasti terisi. */
export type WindOk = WindResult & {
  valid: true; Kh: number; qh: number; LB: number; CpL: number; CpW: number; CpS: number
  pWWtopPlus: number; pWWtopMinus: number; pLee: number; pLeeMinus: number; pSide: number; pSideMinus: number; pNetTop: number
  F: number; M: number; Fmin: number; minGoverns: boolean; Fdesign: number; table: WindLevel[]
}

export type StructType = 'building' | 'warehouse' | 'freeroof' | 'frame'

export const TYPE_LABEL: Record<StructType, string> = {
  building: 'Gedung tertutup (SPGAU dinding)',
  warehouse: 'Gudang tertutup atap pelana',
  freeroof: 'Bangunan terbuka / shelter (atap bebas)',
  frame: 'Rangka terbuka / menara rangka',
}

export interface WindUIInput {
  /** Tipe bangunan/struktur (tak ada = gedung, simpanan lama). */
  type: StructType
  /** Kecepatan angin dasar (m/s). */
  V: string
  expo: Exposure
  /** Faktor arah, topografi, elevasi, efek hembusan. */
  Kd: string
  Kzt: string
  Ke: string
  G: string
  enc: Enclosure
  /** Gedung: lebar tegak lurus angin, panjang sejajar angin, tinggi atap rata-rata (m). */
  B: string
  L: string
  H: string
  /** Gudang: ketertutupan, bentang, panjang, tinggi tritisan (m), sudut atap (°), jarak portal (m). */
  whEnc: 'enclosed' | 'partial'
  whS: string
  whLb: string
  whHe: string
  whTheta: string
  whS2: string
  /** Atap bebas: bentuk, aliran, sudut (°), tinggi rata-rata h, dimensi searah angin L, panjang B, jarak rangka s (m). */
  frShape: FreeRoofShape
  frFlow: FreeRoofFlow
  frTheta: string
  frH: string
  frL: string
  frB: string
  frS: string
  /** Rangka terbuka: jenis, bentuk batang, penampang menara, ε, lebar b, elevasi bawah/atas, diameter batang (m). */
  ofKind: FrameKind
  ofMember: MemberShape
  ofTower: TowerShape
  ofEps: string
  ofB: string
  ofZ1: string
  ofZ2: string
  ofD: string
}

/** Input bawaan = kasus golden default (gedung) + bawaan tipe lain. */
export const WIND_DEFAULTS: WindUIInput = {
  type: 'building', V: '35', expo: 'C', Kd: '0.85', Kzt: '1', Ke: '1', G: '0.85', enc: 'enclosed', B: '30', L: '20', H: '24',
  whEnc: 'enclosed', whS: '24', whLb: '60', whHe: '7', whTheta: '15', whS2: '6',
  frShape: 'pitched', frFlow: 'clear', frTheta: '15', frH: '5', frL: '12', frB: '30', frS: '6',
  ofKind: 'tower', ofMember: 'flat', ofTower: 'square', ofEps: '0.25', ofB: '2', ofZ1: '0', ofZ2: '30', ofD: '0.06',
}

export const ENC_LABEL: Record<Enclosure, string> = { enclosed: 'tertutup', partial: 'tertutup sebagian', open: 'terbuka' }

const angle: Rule = (n) => (n < 0 ? 'Tidak boleh negatif' : n > 45 ? 'Maksimum 45°' : null)

export function validate(i: WindUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  for (const k of ['V', 'Kd', 'Kzt', 'Ke', 'G'] as const) need(k, pos)
  const t = i.type ?? 'building'
  if (t === 'building') for (const k of ['B', 'L', 'H'] as const) need(k, pos)
  else if (t === 'warehouse') {
    for (const k of ['whS', 'whLb', 'whHe', 'whS2'] as const) need(k, pos)
    need('whTheta', angle)
  } else if (t === 'freeroof') {
    for (const k of ['frH', 'frL', 'frB', 'frS'] as const) need(k, pos)
    need('frTheta', angle)
  } else {
    const epsMax = i.ofKind === 'plane' ? 0.7 : 1
    need('ofEps', (n) => (n <= 0 ? 'Harus > 0' : n > epsMax ? (i.ofKind === 'plane' ? 'Maksimum 0,7 (> 0,7 = papan pejal, Ps. 29.3)' : 'Maksimum 1') : null))
    need('ofB', pos)
    need('ofZ1', (n) => (n < 0 ? 'Tidak boleh negatif' : null))
    need('ofZ2', (n) => (n <= num(i.ofZ1) ? 'Harus > elevasi bawah' : null))
    if (i.ofMember === 'round') need('ofD', pos)
  }
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: WindUIInput): WindInput {
  return { V: num(i.V), expo: i.expo, Kd: num(i.Kd), Kzt: num(i.Kzt), Ke: num(i.Ke), G: num(i.G), enc: i.enc, B: num(i.B), L: num(i.L), H: num(i.H) }
}

const baseOf = (i: WindUIInput): WindBase => ({ V: num(i.V), expo: i.expo, Kd: num(i.Kd), Kzt: num(i.Kzt), Ke: num(i.Ke), G: num(i.G) })

/** Hitung gedung; null bila input tidak valid. */
export function computeWindUI(i: WindUIInput): WindOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeWind(toCalcInput(i))
  return r.valid ? (r as WindOk) : null
}

/** Hasil sah salah satu tipe struktur. */
export type WindAny =
  | { type: 'building'; r: WindOk }
  | { type: 'warehouse'; r: WarehouseResult }
  | { type: 'freeroof'; r: FreeRoofResult }
  | { type: 'frame'; r: OpenFrameResult }

/** Hitung sesuai tipe; null bila input tidak valid. */
export function computeWindAny(i: WindUIInput): WindAny | null {
  if (Object.keys(validate(i)).length) return null
  const b = baseOf(i)
  switch (i.type ?? 'building') {
    case 'building': {
      const r = computeWindUI(i)
      return r ? { type: 'building', r } : null
    }
    case 'warehouse': {
      const r = computeWarehouse({ ...b, enc: i.whEnc, S: num(i.whS), Lb: num(i.whLb), he: num(i.whHe), theta: num(i.whTheta), s: num(i.whS2) })
      return r.valid ? { type: 'warehouse', r } : null
    }
    case 'freeroof': {
      const r = computeFreeRoof({ ...b, shape: i.frShape, flow: i.frFlow, theta: num(i.frTheta), h: num(i.frH), L: num(i.frL), B: num(i.frB), s: num(i.frS) })
      return r.valid ? { type: 'freeroof', r } : null
    }
    case 'frame': {
      const r = computeOpenFrame({ ...b, kind: i.ofKind, member: i.ofMember, tower: i.ofTower, eps: num(i.ofEps), b: num(i.ofB), z1: num(i.ofZ1), z2: num(i.ofZ2), D: num(i.ofD) })
      return r.valid ? { type: 'frame', r } : null
    }
  }
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
