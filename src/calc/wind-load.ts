// Beban angin gedung — SNI 1727:2020 (ASCE 7-16) Bab 26–27, prosedur pengarah, SPGAU dinding, gedung tertutup kaku.
// Port 1:1 dari modules/wind-load/module.js (compute), diverifikasi golden test.
//
//   qz = 0,613·Kz·Kzt·Kd·Ke·V² (Pa → kPa); Kz = 2,01·(z/zg)^(2/α), z ≥ 4,6 m (eksposur B/C/D).
//   Cp windward 0,8 (variasi z), leeward dari L/B (−0,5/−0,3/−0,2), samping −0,7; GCpi ±0,18 / ±0,55 / 0.
//   Geser dasar & momen guling: integrasi 40 strip; beban minimum 0,77 kPa × B·H (Ps. 27.1.5).
// TIDAK termasuk: atap (uplift), faktor hembusan fleksibel Gf, Kzt dihitung, parapet, komponen & kladding (Bab 30).

import { numFinite as num, type NumLike } from './shared/num'

export type Exposure = 'B' | 'C' | 'D'
export type Enclosure = 'enclosed' | 'partial' | 'open'

/** Konstanta eksposur (α, zg dalam m) — Tabel 26.11-1. */
const EXPO: Record<Exposure, { alpha: number; zg: number }> = {
  B: { alpha: 7.0, zg: 365.76 },
  C: { alpha: 9.5, zg: 274.32 },
  D: { alpha: 11.5, zg: 213.36 },
}

export interface WindInput {
  /** Kecepatan angin dasar (m/s). */
  V: NumLike
  expo?: Exposure
  /** Kd, Kzt, Ke, G — 0 = default 0,85 / 1,0 / 1,0 / 0,85. */
  Kd: NumLike
  Kzt: NumLike
  Ke: NumLike
  G: NumLike
  enc?: Enclosure
  /** Lebar tegak lurus angin, panjang sejajar angin, tinggi atap rata-rata (m). */
  B: NumLike
  L: NumLike
  H: NumLike
}

export interface WindLevel {
  /** m, -, kPa */
  z: number
  Kz: number
  qz: number
  /** Tekanan windward ±GCpi (kPa). */
  pWW: number
  pWWm: number
}

export interface WindResult {
  valid: boolean
  warn: string[]
  V: number
  expo: string
  Kd: number
  Kzt: number
  Ke: number
  G: number
  enc: string
  GCpi: number
  B: number
  L: number
  H: number
  Kh?: number
  /** kPa */
  qh?: number
  LB?: number
  CpL?: number
  CpW?: number
  CpS?: number
  /** Tekanan desain dinding (kPa): …Plus = GCpi positif, …Minus = GCpi negatif. */
  pWWtopPlus?: number
  pWWtopMinus?: number
  pLee?: number
  pLeeMinus?: number
  pSide?: number
  pSideMinus?: number
  pNetTop?: number
  /** Geser dasar (kN) & momen guling (kNm). */
  F?: number
  M?: number
  Fmin?: number
  minGoverns?: boolean
  Fdesign?: number
  table?: WindLevel[]
}

/** Koefisien eksposur tekanan velositas Kz di ketinggian z (m). */
export function KzAt(z: number, ex: string): number {
  const e = EXPO[ex as Exposure] || EXPO.C
  const zz = Math.max(4.6, Math.min(z, e.zg))
  return 2.01 * Math.pow(zz / e.zg, 2 / e.alpha)
}

/** Cp dinding leeward dari L/B (Gbr. 27.3-1), interpolasi linear. */
export function cpLeeward(LB: number): number {
  if (LB <= 1) return -0.5
  if (LB <= 2) return -0.5 + (LB - 1) * 0.2
  if (LB <= 4) return -0.3 + (LB - 2) * 0.05
  return -0.2
}

export function computeWind(v: WindInput): WindResult {
  const V = num(v.V)
  const ex = v.expo || 'C'
  const Kd = num(v.Kd) || 0.85, Kzt = num(v.Kzt) || 1.0, Ke = num(v.Ke) || 1.0, G = num(v.G) || 0.85
  const enc = v.enc || 'enclosed'
  const B = num(v.B), Lp = num(v.L), H = num(v.H)
  const GCpi = enc === 'partial' ? 0.55 : enc === 'open' ? 0 : 0.18
  const r: WindResult = { valid: false, warn: [], V, expo: ex, Kd, Kzt, Ke, G, enc, GCpi, B, L: Lp, H }
  if (V <= 0 || B <= 0 || Lp <= 0 || H <= 0) { r.warn.push('Lengkapi V, B, L, dan H (> 0).'); return r }

  const q = (z: number) => (0.613 * KzAt(z, ex) * Kzt * Kd * Ke * V * V) / 1000 // kPa
  const Kh = KzAt(H, ex), qh = q(H)
  const LB = Lp / B
  const CpL = cpLeeward(LB), CpW = 0.8, CpS = -0.7
  Object.assign(r, {
    Kh, qh, LB, CpL, CpW, CpS,
    pWWtopPlus: qh * G * CpW - qh * GCpi, pWWtopMinus: qh * G * CpW + qh * GCpi,
    pLee: qh * G * CpL - qh * GCpi, pLeeMinus: qh * G * CpL + qh * GCpi,
    pSide: qh * G * CpS - qh * GCpi, pSideMinus: qh * G * CpS + qh * GCpi,
    pNetTop: qh * G * CpW + qh * G * Math.abs(CpL), // internal saling meniadakan
  })

  // Geser dasar & momen guling (40 strip).
  const nS = 40, dz = H / nS
  let F = 0, M = 0
  for (let i = 0; i < nS; i++) {
    const zMid = (i + 0.5) * dz
    const pNet = q(zMid) * G * CpW + qh * G * Math.abs(CpL)
    F += pNet * B * dz
    M += pNet * B * dz * zMid
  }
  const Fmin = 0.77 * B * H
  const table = [0.25, 0.5, 0.75, 1.0].map((f) => {
    const z = f * H, qz = q(z)
    return { z, Kz: KzAt(z, ex), qz, pWW: qz * G * CpW - qh * GCpi, pWWm: qz * G * CpW + qh * GCpi }
  })
  Object.assign(r, { F, M, Fmin, minGoverns: Fmin > F, Fdesign: Math.max(F, Fmin), table, valid: true })

  if (H > 160) r.warn.push('H = ' + H.toFixed(0) + ' m sangat tinggi — cek fleksibilitas (T > 1 dtk → perlu Gf, bukan G=0,85). Prosedur ini untuk gedung KAKU.')
  else if (H > 60) r.warn.push('H > 60 m — prosedur pengarah tetap berlaku, tetapi pastikan gedung kaku (n1 ≥ 1 Hz); bila fleksibel gunakan Gf.')
  if (H / Math.min(B, Lp) > 4) r.warn.push('H/lebar-terkecil = ' + (H / Math.min(B, Lp)).toFixed(1) + ' > 4 — gedung langsing, kemungkinan fleksibel; periksa frekuensi alami.')
  if (Fmin > F) r.warn.push('Beban minimum SPGAU 0,77 kN/m² (Ps. 27.1.5) MENENTUKAN: F,min = ' + Fmin.toFixed(1) + ' kN > hasil hitungan ' + F.toFixed(1) + ' kN.')
  if (V < 20 || V > 60) r.warn.push('V = ' + V + ' m/s di luar rentang lazim peta angin Indonesia (± 25–45 m/s) — pastikan satuan m/s (bukan km/jam).')
  if (Kzt !== 1) r.warn.push('Kzt = ' + Kzt + ' ≠ 1 — pastikan dihitung dari Ps. 26.8 (bukit/escarpment).')
  r.warn.push('Atap TIDAK dihitung (uplift atap datar/miring, zona tepi) — tinjau terpisah. Tekanan dinding samping & internal untuk desain elemen dinding (K&K perlu prosedur Bab 30).')
  return r
}
