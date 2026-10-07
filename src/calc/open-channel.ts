// Saluran terbuka — persamaan Manning (persegi, trapesium, segitiga, lingkaran terisi sebagian).
// Port 1:1 dari modules/open-channel/module.js (compute), diverifikasi golden test.
//
//   V = (1/n)·R^(2/3)·√S, Q = V·A. Mode: kapasitas dari kedalaman y, atau kedalaman normal dari Q (bisection;
//   lingkaran dibatasi kapasitas gravitasi maksimum ±0,94D). Kedalaman kritis Q²T/(gA³) = 1; Froude V/√(gA/T).

import { GRAVITY as G } from './shared/hydraulics'
import { numFinite as num, type NumLike } from './shared/num'

export type ChannelShape = 'rect' | 'trap' | 'tri' | 'circle'

/** Koefisien Manning per material (default 0,013). */
export const MANNING_N: Record<string, number> = { concrete: 0.013, concreteRough: 0.015, masonry: 0.025, earth: 0.022, grass: 0.03, pvc: 0.01 }

const matN = (mat: string | undefined): number => MANNING_N[mat as string] || 0.013

export interface OpenChannelInput {
  shape?: ChannelShape
  mode?: 'fromY' | 'fromQ'
  /** Lebar dasar (m), talud m (H:1V), diameter (m). */
  b: NumLike
  m: NumLike
  D: NumLike
  /** Kunci MANNING_N atau 'custom'. */
  mat?: string
  nman: NumLike
  /** Kemiringan dasar (m/m). */
  S: NumLike
  /** Kedalaman (m) atau debit (m³/s) yang diketahui. */
  y: NumLike
  Q: NumLike
}

export interface SectionGeometry {
  /** m², m, m */
  A: number
  P: number
  T: number
  /** false = lingkaran penuh. */
  ok: boolean
}

export interface OpenChannelResult {
  valid: boolean
  warn: string[]
  shape: ChannelShape
  mode: string
  b: number
  m: number
  D: number
  n: number
  S: number
  y?: number
  Q?: number
  A?: number
  P?: number
  T?: number
  /** Jari-jari hidraulik (m) & kecepatan (m/s). */
  R?: number
  V?: number
  /** Kedalaman kritis (m); null bila tak terkurung. */
  yc?: number | null
  Fr?: number
  regime?: string
}

/** Geometri basah pada kedalaman y. */
export function sectionAt(shape: ChannelShape, y: number, b: number, m: number, D: number): SectionGeometry {
  if (y <= 0) return { A: 0, P: 0.0001, T: 0.0001, ok: true }
  if (shape === 'rect') return { A: b * y, P: b + 2 * y, T: b, ok: true }
  if (shape === 'trap') return { A: (b + m * y) * y, P: b + 2 * y * Math.sqrt(1 + m * m), T: b + 2 * m * y, ok: true }
  if (shape === 'tri') return { A: m * y * y, P: 2 * y * Math.sqrt(1 + m * m), T: 2 * m * y, ok: true }
  if (y >= D) return { A: (Math.PI * D * D) / 4, P: Math.PI * D, T: 0.0001, ok: false } // penuh
  const th = 2 * Math.acos(1 - (2 * y) / D)
  return { A: ((D * D) / 8) * (th - Math.sin(th)), P: (D * th) / 2, T: D * Math.sin(th / 2), ok: true }
}

function flowOf(shape: ChannelShape, y: number, b: number, m: number, D: number, n: number, S: number) {
  const g = sectionAt(shape, y, b, m, D)
  if (g.A <= 0) return { Q: 0, V: 0, g, R: undefined as number | undefined }
  const R = g.A / g.P
  const V = (1 / n) * Math.pow(R, 2 / 3) * Math.sqrt(S)
  return { Q: V * g.A, V, R, g }
}

export function computeOpenChannel(v: OpenChannelInput): OpenChannelResult {
  const shape = v.shape || 'trap'
  const mode = v.mode || 'fromY'
  const b = num(v.b), m = num(v.m), D = num(v.D)
  let n = num(v.nman) || (v.mat === 'custom' ? 0.013 : matN(v.mat))
  if (v.mat !== 'custom') n = matN(v.mat)
  const S = num(v.S)
  const yIn = num(v.y), QIn = num(v.Q)
  const r: OpenChannelResult = { valid: false, warn: [], shape, mode, b, m, D, n, S }

  if (n <= 0 || S <= 0) { r.warn.push('Isi koefisien Manning n dan kemiringan S (> 0).'); return r }
  if ((shape === 'rect' || shape === 'trap') && b <= 0) { r.warn.push('Isi lebar dasar b (> 0).'); return r }
  if ((shape === 'trap' || shape === 'tri') && m <= 0) { r.warn.push('Isi kemiringan talud m (> 0).'); return r }
  if (shape === 'circle' && D <= 0) { r.warn.push('Isi diameter D (> 0).'); return r }

  const yMaxSearch = shape === 'circle' ? D * 0.999 : 20
  let y: number, Q: number
  if (mode === 'fromY') {
    if (yIn <= 0) { r.warn.push('Isi kedalaman air y (> 0).'); return r }
    if (shape === 'circle' && yIn >= D) { r.warn.push('y ≥ D — saluran penuh/bertekanan. Gunakan tool Aliran Pipa.'); return r }
    y = yIn
    Q = flowOf(shape, y, b, m, D, n, S).Q
  } else {
    if (QIn <= 0) { r.warn.push('Isi debit Q (> 0).'); return r }
    // Lingkaran: kapasitas gravitasi maksimum (dicari numerik).
    let Qcap = 0, yCap = yMaxSearch
    if (shape === 'circle') {
      for (let yy = 0.02 * D; yy <= yMaxSearch; yy += D / 200) {
        const qq = flowOf(shape, yy, b, m, D, n, S).Q
        if (qq > Qcap) { Qcap = qq; yCap = yy }
      }
      if (QIn > Qcap) {
        r.warn.push('Q = ' + QIn.toFixed(3) + ' m³/s melampaui kapasitas gravitasi maks ' + Qcap.toFixed(3) +
          ' m³/s (pada y≈' + (yCap / D).toFixed(2) + 'D) — perbesar D atau S, atau saluran menjadi bertekanan.')
        return r
      }
    }
    // Bisection pada cabang Q(y) naik.
    let lo = 1e-4, hi = shape === 'circle' ? yCap : yMaxSearch
    if (shape !== 'circle') {
      let guard = 0
      while (flowOf(shape, hi, b, m, D, n, S).Q < QIn && guard < 30) { hi *= 1.6; guard++ }
    }
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2
      if (flowOf(shape, mid, b, m, D, n, S).Q < QIn) lo = mid
      else hi = mid
    }
    y = (lo + hi) / 2
    Q = QIn
  }

  const f = flowOf(shape, y, b, m, D, n, S)
  const g = f.g
  Object.assign(r, { y, Q, A: g.A, P: g.P, T: g.T, R: f.R, V: f.V })

  // Kedalaman kritis (bisection bila terkurung).
  let yc: number | null = null
  {
    let lo = 1e-4, hi = shape === 'circle' ? D * 0.999 : Math.max(5 * y, 5)
    const fcn = (yy: number) => {
      const s = sectionAt(shape, yy, b, m, D)
      if (s.A <= 0 || s.T <= 0) return -1
      return (Q * Q * s.T) / (G * Math.pow(s.A, 3)) - 1 // > 0 → superkritis (yy < yc)
    }
    if (fcn(lo) > 0 && fcn(hi) < 0) {
      for (let i = 0; i < 70; i++) {
        const mid = (lo + hi) / 2
        if (fcn(mid) > 0) lo = mid
        else hi = mid
      }
      yc = (lo + hi) / 2
    }
  }
  const Fr = g.T > 0 && g.A > 0 ? f.V / Math.sqrt((G * g.A) / g.T) : 0
  Object.assign(r, { yc, Fr, regime: Fr < 0.95 ? 'subkritis' : Fr > 1.05 ? 'SUPERKRITIS' : 'mendekati kritis', valid: true })

  const V = f.V
  if (V < 0.6) r.warn.push('V = ' + V.toFixed(2) + ' m/s < 0,6 m/s — risiko sedimentasi (self-cleansing tak terpenuhi).')
  if (V > 3.0) r.warn.push('V = ' + V.toFixed(2) + ' m/s > 3 m/s — risiko erosi/abrasif; pastikan material tahan (beton mutu baik ±4–6 m/s).')
  if (Fr > 0.8 && Fr < 1.2) r.warn.push('Fr = ' + Fr.toFixed(2) + ' dekat 1 — aliran tak stabil (bergelombang); hindari desain di rentang 0,8–1,2.')
  if (shape === 'circle' && y / D > 0.8) r.warn.push('y/D = ' + (y / D).toFixed(2) + ' > 0,8 — melampaui batas lazim desain gravitasi saluran tertutup; sisakan ruang udara.')
  if (shape !== 'circle') r.warn.push('Tambahkan tinggi jagaan (freeboard) — lazim ≥ 0,25·y atau sesuai standar (mis. KP-03 irigasi).')
  return r
}
