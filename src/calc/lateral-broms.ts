// Kapasitas lateral ultimit tiang tunggal — metode Broms (1964), rigid-plastis.
// Port 1:1 dari modules/lateral-broms/module.js (compute), diverifikasi golden test.
//
//   Hu = min(kegagalan tanah [tiang pendek], leleh lentur tiang [tiang panjang]).
//   Lempung: pu = 9·cu·D, nol pada 0–1,5D. Pasir: pu = 3·Kp·γ'·z·D, Kp = tan²(45° + φ/2).
//   Kepala bebas atau jepit (dikekang pile cap).
// TIDAK termasuk: defleksi kerja (pakai Analisis P-Y), tanah berlapis.

import { rankineKp } from './shared/geotech'
import { deg2rad } from './shared/num'

export type BromsSoil = 'clay' | 'sand'
export type PileHead = 'free' | 'fixed'

export interface BromsInput {
  soil: BromsSoil
  head: PileHead
  /** Diameter (mm). */
  D: number
  /** Panjang tertanam (m). */
  L: number
  /** Tinggi beban di atas muka tanah (m). */
  e: number
  /** Momen leleh/ultimit tiang (kNm). */
  My: number
  /** Kohesi undrained (kPa), lempung. */
  cu: number
  /** Sudut geser (°), pasir. */
  phi: number
  /** Berat isi efektif (kN/m³), pasir. */
  gam: number
}

export interface BromsResult {
  warn: string[]
  valid: boolean
  soil: BromsSoil
  head: PileHead
  /** Diameter (m). */
  D?: number
  L?: number
  e?: number
  My?: number
  cu?: number
  /** Reaksi tanah lempung 9·cu·D (kN/m). */
  k?: number
  phi?: number
  gam?: number
  Kp?: number
  /** Kapasitas mode tiang pendek (kN). */
  Hshort?: number
  /** Kapasitas mode tiang panjang (kN). */
  Hlong?: number
  fShort?: number
  /** Titik rotasi tiang pendek (m), lempung kepala bebas — untuk gambar. */
  rot?: number
  /** Momen jepit kepala mode pendek (kNm). */
  MfixShort?: number
  short?: boolean
  /** Kapasitas lateral ultimit (kN). */
  Hu?: number
  mode?: string
  f?: number
  /** Kedalaman momen maksimum (m). */
  zmax?: number
  Mmax?: number
  Mhead?: number
  /** Mmax / My. */
  dcMom?: number
}

export function computeBroms(v: BromsInput): BromsResult {
  const r: BromsResult = { warn: [], valid: true, soil: v.soil, head: v.head }
  const D = v.D / 1000 // mm → m
  const { L, e, My } = v
  if (!(D > 0) || !(L > 0) || !(e >= 0) || !(My > 0)) { r.valid = false; return r }
  Object.assign(r, { D, L, e, My })

  if (v.soil === 'clay') {
    const cu = v.cu
    if (!(cu > 0)) { r.valid = false; return r }
    if (L <= 1.5 * D) { r.valid = false; r.warn.push('L harus > 1,5·D (zona reaksi nol atas).'); return r }
    r.cu = cu
    r.k = 9 * cu * D
    clay(r, D, L, e, My, r.k)
  } else {
    const { phi, gam } = v
    if (!(phi > 0) || !(gam > 0)) { r.valid = false; return r }
    r.phi = phi
    r.gam = gam
    r.Kp = rankineKp(deg2rad(phi))
    sand(r, D, L, e, My, r.Kp, gam)
  }
  return r
}

function clay(r: BromsResult, D: number, L: number, e: number, My: number, k: number): void {
  if (r.head === 'free') {
    // Pendek (rotasi kaku): f² + (4e + 3D + 2L)·f − (L − 1,5D)² = 0.
    const A = 4 * e + 3 * D + 2 * L
    const f = (-A + Math.sqrt(A * A + 4 * Math.pow(L - 1.5 * D, 2))) / 2
    r.Hshort = k * f
    r.fShort = f
    r.rot = (f + 1.5 * D + L) / 2
    // Panjang (leleh): H²/(2k) + (e + 1,5D)·H − My = 0.
    const b = e + 1.5 * D
    r.Hlong = k * (-b + Math.sqrt(b * b + (2 * My) / k))
  } else {
    r.Hshort = k * (L - 1.5 * D)
    r.MfixShort = r.Hshort * e + (k * (L - 1.5 * D) * (1.5 * D + L)) / 2
    const b = e + 1.5 * D
    r.Hlong = k * (-b + Math.sqrt(b * b + (4 * My) / k))
  }
  finalize(r)
}

function sand(r: BromsResult, D: number, L: number, e: number, My: number, Kp: number, g: number): void {
  const coef = Kp * g * D
  if (r.head === 'free') {
    r.Hshort = (0.5 * Kp * g * D * Math.pow(L, 3)) / (e + L)
    r.fShort = 0.816 * Math.sqrt(r.Hshort / coef)
    r.Hlong = solveSandLong(e, My, coef, 1)
  } else {
    r.Hshort = 1.5 * Kp * g * D * L * L
    r.MfixShort = r.Hshort * (e + (2 * L) / 3)
    r.Hlong = solveSandLong(e, My, coef, 2)
  }
  finalize(r)
}

/** Selesaikan m·My = e·u² + (0,5443/√coef)·u³ untuk u = √H (m = 1 bebas, 2 jepit), bisection. */
function solveSandLong(e: number, My: number, coef: number, m: number): number {
  const c3 = 0.5443 / Math.sqrt(coef)
  const g = (u: number) => e * u * u + c3 * u * u * u - m * My
  let lo = 0, hi = 1
  while (g(hi) < 0 && hi < 1e6) hi *= 2
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (g(mid) < 0) lo = mid
    else hi = mid
  }
  const u = (lo + hi) / 2
  return u * u
}

function finalize(r: BromsResult): void {
  const Hshort = r.Hshort as number, Hlong = r.Hlong as number
  const D = r.D as number, e = r.e as number
  const short = Hshort <= Hlong
  const Hu = Math.min(Hshort, Hlong)
  r.short = short
  r.Hu = Hu
  r.mode = short ? 'Tiang pendek — kegagalan tanah' : 'Tiang panjang — leleh lentur tiang'
  // Kedalaman & momen maksimum pada kapasitas yang menentukan.
  if (r.soil === 'clay') {
    const f = Hu / (r.k as number)
    r.f = f
    r.zmax = 1.5 * D + f
    r.Mmax = r.head === 'free' || !short ? Hu * (e + 1.5 * D + 0.5 * f) : r.MfixShort
  } else {
    const coef = (r.Kp as number) * (r.gam as number) * D
    const f = 0.816 * Math.sqrt(Hu / coef)
    r.f = f
    r.zmax = f
    r.Mmax = r.head === 'free' || !short ? Hu * (e + 0.667 * f) : r.MfixShort
  }
  if (r.head === 'fixed' && short) r.Mhead = r.MfixShort
  r.dcMom = (r.Mmax as number) / (r.My as number)
  if (r.head === 'fixed' && short && (r.MfixShort as number) > (r.My as number))
    r.warn.push('Momen jepit kepala (' + (r.MfixShort as number).toFixed(0) + ' kNm) > My — sendi plastis terbentuk di kepala; kasus "panjang" yang menentukan.')
}
