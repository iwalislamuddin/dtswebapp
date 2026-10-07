// Aliran pipa bertekanan — kehilangan energi Darcy-Weisbach (Swamee-Jain) + minor ΣK, pembanding Hazen-Williams.
// Port 1:1 dari modules/pipe-flow/module.js (compute), diverifikasi golden test.
//
//   Re < 2300: f = 64/Re; selain itu f = 0,25 / [log(ε/3,7D + 5,74/Re^0,9)]². hf = f·(L/D)·V²/2g, hm = ΣK·V²/2g.
//   Hazen-Williams: hf = 10,67·L·Q^1,852 / (C^1,852·D^4,87).

import { GRAVITY as G } from './shared/hydraulics'
import { numFinite as num, type NumLike } from './shared/num'

/** Kekasaran ε (mm) & C Hazen-Williams per material. */
export const PIPE_MATERIALS: Record<string, { label: string; eps: number; C: number }> = {
  pvc: { label: 'PVC / HDPE', eps: 0.0015, C: 150 },
  steelNew: { label: 'Baja baru', eps: 0.045, C: 130 },
  steelOld: { label: 'Baja lama/berkarat', eps: 0.5, C: 100 },
  castiron: { label: 'Besi cor', eps: 0.26, C: 110 },
  concrete: { label: 'Beton', eps: 0.5, C: 120 },
  gip: { label: 'GIP (galvanis)', eps: 0.15, C: 120 },
}

export interface PipeFlowInput {
  /** Diameter dalam (mm), panjang (m), debit (L/s). */
  D: NumLike
  Lp: NumLike
  Q: NumLike
  /** Kunci PIPE_MATERIALS atau 'custom'. */
  mat?: string
  /** Kustom: ε (mm), C. */
  eps: NumLike
  C: NumLike
  /** Viskositas kinematik (×10⁻⁶ m²/s), 0 = 1,004. */
  nu: NumLike
  sumK: NumLike
}

export interface PipeFlowResult {
  valid: boolean
  warn: string[]
  /** m, m, m³/s, m */
  D: number
  Lp: number
  Q: number
  mat: string
  eps: number
  C: number
  /** m²/s */
  nu: number
  sumK: number
  matLabel: string
  A?: number
  V?: number
  Re?: number
  regime?: 'laminar' | 'transisi' | 'turbulen'
  f?: number
  /** m */
  hv?: number
  hf?: number
  hm?: number
  hTot?: number
  /** m per km */
  gradient?: number
  hfHW?: number
  /** % selisih HW terhadap Darcy */
  diffHW?: number
}

export function computePipeFlow(v: PipeFlowInput): PipeFlowResult {
  const D = num(v.D) / 1000
  const Lp = num(v.Lp)
  const Q = num(v.Q) / 1000
  const mat = v.mat || 'pvc'
  const eps = (mat === 'custom' ? num(v.eps) : PIPE_MATERIALS[mat].eps) / 1000
  const C = mat === 'custom' ? num(v.C) : PIPE_MATERIALS[mat].C
  const nu = num(v.nu) * 1e-6 || 1.004e-6
  const sumK = num(v.sumK)
  const r: PipeFlowResult = {
    valid: false, warn: [], D, Lp, Q, mat, eps, C, nu, sumK, matLabel: mat === 'custom' ? 'Kustom' : PIPE_MATERIALS[mat].label,
  }
  if (D <= 0 || Lp <= 0 || Q <= 0) { r.warn.push('Isi D, L, dan Q (> 0).'); return r }

  const A = (Math.PI * D * D) / 4
  const V = Q / A
  const Re = (V * D) / nu
  let f: number, regime: PipeFlowResult['regime']
  if (Re < 2300) { f = 64 / Re; regime = 'laminar' }
  else {
    f = 0.25 / Math.pow(Math.log10(eps / (3.7 * D) + 5.74 / Math.pow(Re, 0.9)), 2)
    regime = Re < 4000 ? 'transisi' : 'turbulen'
  }
  const hv = (V * V) / (2 * G)
  const hf = f * (Lp / D) * hv
  const hm = sumK * hv
  const hfHW = (10.67 * Lp * Math.pow(Q, 1.852)) / (Math.pow(C, 1.852) * Math.pow(D, 4.87))
  const diffHW = hf > 0 ? ((hfHW - hf) / hf) * 100 : 0
  Object.assign(r, { A, V, Re, regime, f, hv, hf, hm, hTot: hf + hm, gradient: (hf / Lp) * 1000, hfHW, diffHW, valid: true })

  if (V < 0.3) r.warn.push('V = ' + V.toFixed(2) + ' m/s < 0,3 m/s — risiko pengendapan; pertimbangkan D lebih kecil.')
  if (V > 3.0) r.warn.push('V = ' + V.toFixed(2) + ' m/s > 3 m/s — bising/erosif & rugi tinggi; pertimbangkan D lebih besar (lazim 0,6–2,5 m/s).')
  if (regime === 'transisi') r.warn.push('Re = ' + Re.toFixed(0) + ' di zona transisi (2300–4000) — f tak menentu; hasil indikatif.')
  if (Re >= 2300 && (eps / D < 1e-6 || eps / D > 0.05))
    r.warn.push('ε/D = ' + (eps / D).toExponential(1) + ' di luar rentang validitas Swamee–Jain — hasil ekstrapolasi.')
  if (mat === 'custom' && C <= 0) r.warn.push('C Hazen–Williams kustom belum diisi — pembanding HW tidak bermakna.')
  if (Math.abs(diffHW) > 20)
    r.warn.push('Selisih Darcy vs Hazen–Williams ' + diffHW.toFixed(0) + '% — wajar bila V di luar ±0,9–2 m/s atau pipa sangat kasar (HW empiris utk air).')
  return r
}
