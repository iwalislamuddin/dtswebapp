// Sambungan las sudut (fillet) — SNI 1729:2020 (AISC 360-16) Ps. J2 & J4, DFBK.
// Port 1:1 dari modules/weld-connection/module.js (compute), diverifikasi golden test.
//
//   Kuat las Rn = 0,60·FEXX·kd·β·Awe, Awe = 0,707·w·Lw, φ = 0,75 (J2.4); faktor arah kd = 1 + 0,5·sin^1,5 θ;
//   reduksi las ujung-panjang β = 1,2 − 0,002·Lw/w (0,6…1,0) bila Lw/w > 100 (J2.2b).
//   Logam dasar (J4.2): leleh geser 1,00·0,60·Fy·t·Lw, fraktur geser 0,75·0,60·Fu·t·Lw. Batas ukuran w (Tabel J2.4).
// TIDAK termasuk: las tumpul, grup las eksentris (ICR), kombinasi multi-arah J2.4(c), fatik.

import { numFinite as num, type NumLike } from './shared/num'

export type Electrode = 'e60' | 'e70' | 'e80' | 'custom'

/** FEXX elektroda (MPa). */
const fexxOf = (e: string | undefined): number => (e === 'e60' ? 413 : e === 'e80' ? 551 : 482)

/** Ukuran las minimum (Tabel J2.4) dari tebal bagian tertipis (mm). */
export function weldMin(t: number): number {
  if (t <= 6) return 3
  if (t <= 13) return 5
  if (t <= 19) return 6
  return 8
}

export interface WeldConnectionInput {
  electrode?: Electrode
  /** Dipakai bila electrode = custom (MPa); 0 → 482. */
  Fexx: NumLike
  /** Kaki las w & panjang efektif total Lw (mm). */
  w: NumLike
  Lw: NumLike
  /** Sudut beban terhadap sumbu las (°), dibatasi 0–90. */
  theta: NumLike
  useDir: 'yes' | 'no'
  endLoaded: 'yes' | 'no'
  /** Logam dasar tertipis: t (mm), Fy, Fu (MPa). */
  t: NumLike
  Fy: NumLike
  Fu: NumLike
  /** Beban terfaktor (kN). */
  Ru: NumLike
}

export interface WeldConnectionResult {
  valid: boolean
  warn: string[]
  electrode: Electrode | undefined
  Fexx: number
  w: number
  Lw: number
  theta: number
  useDir: boolean
  endLoaded: boolean
  t: number
  Fy: number
  Fu: number
  Ru: number
  /** Throat efektif (mm) & luas efektif (mm²). */
  te: number
  Awe: number
  kd: number
  beta: number
  ratioLw: number
  /** kN */
  Rnw: number
  phiRnw: number
  baseOk: boolean
  Agv: number
  phiRyBase: number
  phiRuBase: number
  /** Infinity bila data logam dasar tidak lengkap. */
  phiBase: number
  baseGov: 'leleh' | 'fraktur'
  phiRn: number
  weldGoverns: boolean
  dc: number
  wMin: number
  wMax: number
}

export function computeWeldConnection(v: WeldConnectionInput): WeldConnectionResult {
  const warn: string[] = []
  const Fexx = v.electrode === 'custom' ? num(v.Fexx) || fexxOf(v.electrode) : fexxOf(v.electrode)
  const w = num(v.w)
  const Lw = num(v.Lw)
  const theta = Math.max(0, Math.min(90, num(v.theta)))
  const useDir = v.useDir === 'yes'
  const endLoaded = v.endLoaded === 'yes'
  const t = num(v.t), Fy = num(v.Fy), Fu = num(v.Fu)
  const Ru = num(v.Ru)

  // throat & luas efektif
  const te = 0.707 * w
  const Awe = te * Lw

  // faktor arah
  const kd = useDir ? 1.0 + 0.5 * Math.pow(Math.sin((theta * Math.PI) / 180), 1.5) : 1.0

  // reduksi ujung-panjang (J2.2b)
  let beta = 1.0
  const ratioLw = w > 0 ? Lw / w : 0
  if (endLoaded && ratioLw > 100) {
    beta = Math.max(0.6, Math.min(1.0, 1.2 - 0.002 * ratioLw))
    if (ratioLw > 300) beta = 0.6
  }

  // kuat las (J2.4)
  const Rnw = (0.6 * Fexx * kd * beta * Awe) / 1000
  const phiRnw = 0.75 * Rnw

  // logam dasar (J4.2)
  const baseOk = t > 0 && Fy > 0 && Fu > 0
  const Agv = t * Lw
  const phiRyBase = (1.0 * 0.6 * Fy * Agv) / 1000
  const phiRuBase = (0.75 * 0.6 * Fu * Agv) / 1000
  const phiBase = baseOk ? Math.min(phiRyBase, phiRuBase) : Infinity

  // desain = min(las, logam dasar)
  const phiRn = Math.min(phiRnw, phiBase)
  const weldGoverns = phiRnw <= phiBase
  const dc = Ru > 0 ? (phiRn > 0 ? Ru / phiRn : Infinity) : 0

  // batas ukuran & panjang
  const wMin = baseOk ? weldMin(t) : 3
  const wMax = baseOk ? (t < 6 ? t : t - 2) : Infinity
  if (baseOk && w < wMin)
    warn.push('Ukuran las w = ' + w + ' mm < minimum Tabel J2.4 = ' + wMin + ' mm (untuk t = ' + t + ' mm) — TIDAK memenuhi.')
  if (baseOk && Number.isFinite(wMax) && w > wMax)
    warn.push('Ukuran las w = ' + w + ' mm > maksimum sepanjang tepi = ' + wMax.toFixed(0) + ' mm (J2.2b) — kurangi w atau pakai groove.')
  if (w > 0 && Lw < 4 * w)
    warn.push('Panjang las Lw = ' + Lw + ' mm < 4·w = ' + 4 * w + ' mm — panjang efektif dianggap 25% Lw (J2.2b); hasil di atas TIDAK berlaku.')
  if (endLoaded && ratioLw > 100)
    warn.push('Las longitudinal end-loaded dengan Lw/w = ' + ratioLw.toFixed(0) + ' > 100 — reduksi β = ' + beta.toFixed(2) + ' diterapkan.')
  if (!baseOk) warn.push('Data logam dasar (t, Fy, Fu) belum lengkap — cek logam dasar dilewati; kapasitas = las saja.')
  if (useDir && theta > 0)
    warn.push('Faktor arah kd = ' + kd.toFixed(2) + ' hanya sah untuk las sudut SATU arah beban seragam — jangan pakai untuk grup las multi-arah tanpa J2.4(c).')
  if (dc > 1)
    warn.push('D/C = ' + dc.toFixed(2) + ' > 1 — perbesar w / perpanjang Lw' + (weldGoverns ? '' : ' (logam dasar menentukan: perbesar t)') + '.')

  return {
    valid: true, warn, electrode: v.electrode, Fexx, w, Lw, theta, useDir, endLoaded, t, Fy, Fu, Ru,
    te, Awe, kd, beta, ratioLw, Rnw, phiRnw, baseOk, Agv, phiRyBase, phiRuBase, phiBase,
    baseGov: phiRyBase <= phiRuBase ? 'leleh' : 'fraktur',
    phiRn, weldGoverns, dc, wMin, wMax,
  }
}
