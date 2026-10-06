// Stabilitas dinding penahan tanah (per meter panjang, kN & m) — dipakai dinding pasangan batu & beton kantilever.
// Tekanan tanah Rankine pada bidang vertikal semu setinggi H' di ujung tumit; koordinat x dari ujung depan (toe).

import { rankineKp } from './geotech'

/** Komponen berat: W (kN/m) dengan lengan x (m) dari toe. j: 'c' beton, 's' tanah (opsional). */
export interface WeightPart {
  nm: string
  W: number
  x: number
  j?: 'c' | 's'
}

export interface EarthThrust {
  /** Resultan tanah (kN/m), miring β. */
  Pa: number
  /** Resultan beban merata (kN/m), miring β. */
  Pq: number
  Pah: number
  Pav: number
  Pqh: number
  Pqv: number
  /** Lengan dari dasar tapak (m). */
  yPa: number
  yPq: number
}

/** Resultan tekanan aktif tanah (γ) dan beban merata (q) pada bidang semu setinggi Hp, miring β (derajat). */
export function earthThrust(Ka: number, gamma: number, q: number, Hp: number, betaDeg: number): EarthThrust {
  const D2R = Math.PI / 180
  const cbeta = Math.cos(betaDeg * D2R), sbeta = Math.sin(betaDeg * D2R)
  const Pa = 0.5 * Ka * gamma * Hp * Hp
  const Pq = Ka * q * Hp
  return { Pa, Pq, Pah: Pa * cbeta, Pav: Pa * sbeta, Pqh: Pq * cbeta, Pqv: Pq * sbeta, yPa: Hp / 3, yPq: Hp / 2 }
}

export interface FoundationSoil {
  /** Berat isi tanah fondasi/depan (kN/m³). */
  g2: number
  /** Sudut geser tanah fondasi (°). */
  phi2: number
  /** Kohesi tanah fondasi (kPa). */
  c2: number
  /** Kedalaman tanah depan (m), untuk tahanan pasif. */
  D: number
  /** Faktor gesekan dasar: μ = tan(k·φ2), adhesi = k·c2. */
  kf: number
  usePp: boolean
  /** Daya dukung izin (kPa); 0 = lewati. */
  qall: number
}

export interface WallStability {
  sumW: number
  sumMw: number
  sumV: number
  /** Momen penahan & guling terhadap toe (kNm/m). */
  Mr: number
  Mo: number
  FSot: number
  Kp: number
  Pp: number
  Fr: number
  FrTot: number
  Ph: number
  FSsl: number
  xbar: number
  e: number
  qmax: number
  qmin: number
  /** Distribusi tekanan dasar segitiga (kontak sebagian). */
  tri: boolean
  /** Resultan di luar dasar (x̄ ≤ 0): dinding terguling. */
  overturned: boolean
  dcQ: number | null
}

/** Tekanan dasar dari resultan V di x̄ (dari toe) pada lebar B: trapesium bila |e| ≤ B/6, selain itu segitiga. */
export function basePressure(V: number, B: number, xbar: number): { e: number; qmax: number; qmin: number; tri: boolean; overturned: boolean } {
  const e = B / 2 - xbar
  if (xbar <= 0) return { e, qmax: Infinity, qmin: 0, tri: true, overturned: true }
  if (Math.abs(e) <= B / 6 + 1e-12) return { e, qmax: (V / B) * (1 + (6 * e) / B), qmin: (V / B) * (1 - (6 * e) / B), tri: false, overturned: false }
  if (e > 0) return { e, qmax: (2 * V) / (3 * xbar), qmin: 0, tri: true, overturned: false }
  return { e, qmax: (2 * V) / (3 * (B - xbar)), qmin: 0, tri: true, overturned: false }
}

/** Guling, geser (gesekan + adhesi + pasif opsional), dan tekanan dasar pada beban layan. */
export function wallStability(parts: readonly WeightPart[], t: EarthThrust, B: number, soil: FoundationSoil): WallStability {
  const D2R = Math.PI / 180
  let sumW = 0, sumMw = 0
  for (const p of parts) { sumW += p.W; sumMw += p.W * p.x }

  const sumV = sumW + t.Pav + t.Pqv
  const Mr = sumMw + (t.Pav + t.Pqv) * B
  const Mo = t.Pah * t.yPa + t.Pqh * t.yPq
  const FSot = Mo > 1e-9 ? Mr / Mo : 999

  const { g2, phi2, c2, D, kf } = soil
  const Kp = rankineKp(phi2 * D2R)
  const Pp = 0.5 * Kp * g2 * D * D + 2 * c2 * Math.sqrt(Kp) * D
  const Fr = sumV * Math.tan(kf * phi2 * D2R) + kf * c2 * B
  const FrTot = Fr + (soil.usePp ? Pp : 0)
  const Ph = t.Pah + t.Pqh
  const FSsl = Ph > 1e-9 ? FrTot / Ph : 999

  const xbar = (Mr - Mo) / sumV
  const bp = basePressure(sumV, B, xbar)
  const dcQ = soil.qall > 0 && Number.isFinite(bp.qmax) ? bp.qmax / soil.qall : null

  return { sumW, sumMw, sumV, Mr, Mo, FSot, Kp, Pp, Fr, FrTot, Ph, FSsl, xbar, ...bp, dcQ }
}
