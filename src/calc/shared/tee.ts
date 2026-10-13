// Penampang balok persegi / T / L (SNI 2847:2019): lebar efektif sayap (Tabel 6.3.2.1), desain lentur tulangan
// tunggal (tekan di sayap untuk momen positif; momen negatif memakai bw), inersia bruto & retak, Ie Branson.
// Satuan: mm, MPa; momen kN·m. Persegi = kasus bf = bw, hf = h.

import { beta1, ES } from './concrete'

export type TeeKind = 'persegi' | 'T' | 'L'

export interface TeeSection {
  bw: number
  h: number
  /** Lebar & tebal sayap (persegi: bf = bw, hf = h). */
  bf: number
  hf: number
  /** Jarak serat atas ke sentroid bruto & inersia bruto. */
  yTop: number
  Ig: number
}

/**
 * Lebar efektif sayap (Tabel 6.3.2.1). bt = lebar tributari pelat yang dipikul balok (mm): T interior → tiap sisi
 * ≤ min(8hf, sw/2, ln/8) dengan sw/2 ≈ (bt − bw)/2; L tepi → satu sisi ≤ min(6hf, sw/2, ln/12), sw/2 ≈ bt − bw/2
 * (bt diukur dari sumbu balok ke tepi pelat yang dipikul).
 */
export function effectiveFlangeWidth(kind: TeeKind, bw: number, hf: number, bt: number, ln: number): number {
  if (kind === 'persegi' || !(hf > 0) || !(bt > bw)) return bw
  if (kind === 'T') return bw + 2 * Math.max(0, Math.min(8 * hf, (bt - bw) / 2, (ln * 1000) / 8))
  return bw + Math.max(0, Math.min(6 * hf, bt - bw / 2, (ln * 1000) / 12))
}

export function teeSection(bw: number, h: number, bf: number, hf: number): TeeSection {
  if (!(bf > bw) || !(hf > 0) || hf >= h) return { bw, h, bf: bw, hf: h, yTop: h / 2, Ig: (bw * h ** 3) / 12 }
  const hw = h - hf
  const Af = bf * hf, Aw = bw * hw, A = Af + Aw
  const yTop = (Af * (hf / 2) + Aw * (hf + hw / 2)) / A
  const Ig = (bf * hf ** 3) / 12 + Af * (yTop - hf / 2) ** 2 + (bw * hw ** 3) / 12 + Aw * (hf + hw / 2 - yTop) ** 2
  return { bw, h, bf, hf, yTop, Ig }
}

/** Mcr (kN·m): sagging → serat bawah tarik, hogging → serat atas tarik; fr = 0,62√f'c. */
export function crackingMoment(s: TeeSection, fc: number, sagging: boolean): number {
  const yt = sagging ? s.h - s.yTop : s.yTop
  return (0.62 * Math.sqrt(fc) * s.Ig) / yt / 1e6
}

/** Inersia retak transformasi (mm⁴). Sagging: sayap tekan (bisa T); hogging: tekan di bawah → persegi bw. */
export function crackedInertiaTee(s: TeeSection, As: number, d: number, fc: number, sagging: boolean): number {
  if (!(As > 0)) return s.Ig
  const n = Math.max(1, ES / (4700 * Math.sqrt(fc)))
  const nAs = n * As
  const bTop = sagging ? s.bf : s.bw
  // kd dalam sayap (persegi bTop)
  const rn = nAs / (bTop * d)
  let kd = (Math.sqrt(rn * rn + 2 * rn) - rn) * d
  if (sagging && s.bf > s.bw && kd > s.hf) {
    const a = s.bw / 2, b = (s.bf - s.bw) * s.hf + nAs, c = -((s.bf - s.bw) * s.hf * s.hf) / 2 - nAs * d
    kd = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
    return (s.bf * kd ** 3) / 3 - ((s.bf - s.bw) * (kd - s.hf) ** 3) / 3 + nAs * (d - kd) ** 2
  }
  return (bTop * kd ** 3) / 3 + nAs * (d - kd) ** 2
}

/** Ie Branson (24.2.3.5) untuk momen layan bertanda M (kN·m; + sagging) dengan As tarik terpasang (mm²). */
export function effectiveInertiaTee(s: TeeSection, M: number, As: number, d: number, fc: number): number {
  const sagging = M >= 0
  const Ma = Math.abs(M)
  const Mcr = crackingMoment(s, fc, sagging)
  if (Ma <= Mcr || !(As > 0)) return s.Ig
  const Icr = crackedInertiaTee(s, As, d, fc, sagging)
  const r = (Mcr / Ma) ** 3
  return Math.min(s.Ig, r * s.Ig + (1 - r) * Icr)
}

export interface TeeFlexure {
  As: number
  /** Tinggi blok tekan ekuivalen a dan sumbu netral c (mm). */
  a: number
  c: number
  et: number
  tc: boolean
  infeasible: boolean
  /** Blok tekan melewati sayap (perilaku T sejati). */
  tShaped: boolean
}

/** As perlu (φ = 0,90) untuk Mu (kN·m) pada penampang tekan-sayap bf (bw bila hanya persegi). */
export function designTee(Mu: number, bw: number, bf: number, hf: number, d: number, fc: number, fy: number): TeeFlexure {
  const o: TeeFlexure = { As: 0, a: 0, c: 0, et: Infinity, tc: true, infeasible: false, tShaped: false }
  if (!(Mu > 0) || !(bw > 0) || !(d > 0)) return o
  const phi = 0.9, b1 = beta1(fc)
  const rect = (b: number): { As: number; a: number; inf: boolean } => {
    const Rn = (Mu * 1e6) / phi / (b * d * d)
    let disc = 1 - (2 * Rn) / (0.85 * fc)
    let inf = false
    if (disc < 0) { inf = true; disc = 0 }
    const rho = ((0.85 * fc) / fy) * (1 - Math.sqrt(disc))
    const As = rho * b * d
    return { As, a: (As * fy) / (0.85 * fc * b), inf }
  }
  const r1 = rect(Math.max(bf, bw))
  if (!(bf > bw) || r1.a <= hf) {
    Object.assign(o, { As: r1.As, a: r1.a, infeasible: r1.inf })
  } else {
    // blok tekan menembus sayap: sayap menjulur (bf − bw) hf + badan bw
    const Cf = 0.85 * fc * (bf - bw) * hf
    const Mnw = (Mu * 1e6) / phi - Cf * (d - hf / 2)
    const Rn = Mnw / (bw * d * d)
    let disc = 1 - (2 * Rn) / (0.85 * fc)
    let inf = false
    if (disc < 0 || Mnw < 0) { inf = disc < 0; disc = Math.max(0, disc) }
    const rhoW = ((0.85 * fc) / fy) * (1 - Math.sqrt(disc))
    const Asw = rhoW * bw * d
    const aw = (Asw * fy) / (0.85 * fc * bw)
    Object.assign(o, { As: Cf / fy + Math.max(0, Asw), a: aw, infeasible: inf, tShaped: true })
  }
  o.c = o.a / b1
  o.et = o.c > 0 ? (0.003 * (d - o.c)) / o.c : Infinity
  o.tc = o.et >= 0.005
  return o
}
