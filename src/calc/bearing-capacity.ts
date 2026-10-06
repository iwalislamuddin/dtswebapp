// Daya dukung tanah fondasi dangkal — Terzaghi (1943), Meyerhof (1963), Vesic (1973).
// Port 1:1 dari modules/bearing-capacity/module.js (compute), diverifikasi golden test.
//
//   qu = c·Nc·sc·dc + q·Nq·sq·dq + ½·γ·B·Nγ·sγ·dγ, q = overburden efektif di dasar (koreksi MAT, Das).
// Keruntuhan lokal (Terzaghi saja): c* = ⅔c, tanφ* = ⅔tanφ.
// TIDAK termasuk: beban miring/eksentris, dasar/lereng miring, penurunan, tanah berlapis, fondasi dalam.

import { GAMMA_W, ngTerzaghi, nqPrandtl, nqTerzaghi } from './shared/geotech'
import { D2R, num, type NumLike } from './shared/num'

export type FootingShape = 'strip' | 'square' | 'circular' | 'rect'
export type BearingMethod = 'terzaghi' | 'meyerhof' | 'vesic'

export const FOOTING_SHAPES: readonly [FootingShape, string][] = [
  ['strip', 'Menerus (strip)'],
  ['square', 'Bujur sangkar'],
  ['circular', 'Lingkaran'],
  ['rect', 'Persegi panjang'],
]
export const BEARING_METHODS: readonly [BearingMethod, string][] = [
  ['terzaghi', 'Terzaghi (1943)'],
  ['meyerhof', 'Meyerhof (1963)'],
  ['vesic', 'Vesic (1973)'],
]

export interface BearingInput {
  shape?: FootingShape
  /** Lebar / sisi / diameter (m). */
  B: NumLike
  /** Panjang (m), hanya persegi panjang. */
  L: NumLike
  /** Kedalaman dasar fondasi (m). */
  Df: NumLike
  /** Kohesi (kPa). */
  c: NumLike
  /** Sudut geser dalam (°). */
  phi: NumLike
  /** Berat isi lembab (kN/m³). */
  gamma: NumLike
  /** Berat isi jenuh (kN/m³). */
  gsat: NumLike
  /** Kedalaman muka air tanah dari permukaan (m). */
  Dw: NumLike
  method?: BearingMethod
  tfail?: 'general' | 'local'
  FS: NumLike
  /** Tekanan kerja (kPa), 0 = tanpa rasio D/C. */
  qapp: NumLike
}

export interface MethodInput {
  c: number
  phiDeg: number
  gamma: number
  gBase: number
  q: number
  B: number
  L: number
  Df: number
  bl: number
  shape: FootingShape
  local: boolean
}

export interface MethodResult {
  method: BearingMethod
  Nc: number
  Nq: number
  Ng: number
  sc: number
  sq: number
  sg: number
  dc: number
  dq: number
  dg: number
  t1: number
  t2: number
  t3: number
  qu: number
  phiDeg: number
  c: number
  local: boolean
  cap: boolean
  qnet: number
  qall: number
  qallNet: number
}

interface WaterCorrection {
  q: number
  gBase: number
  gsub: number
  wc: string
}

export type BearingResult =
  | { valid: false; warn: string[] }
  | {
      valid: true
      warn: string[]
      shape: FootingShape
      B: number
      L: number
      Df: number
      bl: number
      c: number
      phiDeg: number
      gamma: number
      gsat: number
      Dw: number
      FS: number
      local: boolean
      qApp: number
      q: number
      gBase: number
      gsub: number
      wc: string
      methods: Record<BearingMethod, MethodResult>
      primary: BearingMethod
      pm: MethodResult
      inp: MethodInput
      /** q kerja / q_izin metode utama; null bila q kerja tidak diisi. */
      dc: number | null
    }

export const methodName = (k: string): string => BEARING_METHODS.find((m) => m[0] === k)?.[1] ?? k
export const shapeName = (k: string): string => FOOTING_SHAPES.find((s) => s[0] === k)?.[1] ?? k

/** Koreksi muka air tanah (Das): overburden q di dasar dan γ untuk suku Nγ. */
function waterCorrection(gamma: number, gsat: number, Dw: number, Df: number, B: number): WaterCorrection {
  const gsub = Math.max(0.1, gsat - GAMMA_W)
  if (Dw >= Df + B) return { q: gamma * Df, gBase: gamma, gsub, wc: 'MAT di bawah zona pengaruh (Dw ≥ Df+B) — tanpa pengaruh.' }
  if (Dw >= Df) {
    return {
      q: gamma * Df,
      gBase: gsub + ((Dw - Df) / B) * (gamma - gsub),
      gsub,
      wc: 'MAT dalam zona baji (Df ≤ Dw < Df+B) — γ efektif rata-rata pada suku Nγ.',
    }
  }
  if (Dw > 0) {
    return {
      q: gamma * Dw + gsub * (Df - Dw),
      gBase: gsub,
      gsub,
      wc: 'MAT antara permukaan & dasar (0 < Dw < Df) — overburden berlapis, suku Nγ pakai γ′.',
    }
  }
  return { q: gsub * Df, gBase: gsub, gsub, wc: 'MAT di / atas permukaan tanah (Dw ≤ 0) — seluruh γ′.' }
}

type MethodCore = Omit<MethodResult, 'qnet' | 'qall' | 'qallNet'>

/** Satu metode daya dukung batas. */
export function bearingByMethod(method: BearingMethod, inp: MethodInput): MethodCore {
  let phiDeg = inp.phiDeg
  let c = inp.c
  let localApplied = false
  if (method === 'terzaghi' && inp.local) {
    c = (2 / 3) * inp.c
    phiDeg = Math.atan((2 / 3) * Math.tan(inp.phiDeg * D2R)) / D2R
    localApplied = true
  }
  const phi = phiDeg * D2R
  const { B, q, gBase: g, Df, bl, shape } = inp
  let Nq: number, Nc: number, Ng: number
  let sc = 1, sq = 1, sg = 1, dc = 1, dq = 1, dg = 1
  let capNote = false
  let t1: number, t2: number, t3: number

  if (method === 'terzaghi') {
    Nq = nqTerzaghi(phi)
    Nc = phiDeg < 1e-4 ? 5.7 : (Nq - 1) / Math.tan(phi)
    const ng = ngTerzaghi(phiDeg)
    Ng = ng.value
    capNote = ng.capped
    let kc: number, kg: number
    if (shape === 'strip') { kc = 1.0; kg = 0.5 }
    else if (shape === 'square') { kc = 1.3; kg = 0.4 }
    else if (shape === 'circular') { kc = 1.3; kg = 0.3 }
    else { kc = 1 + 0.3 * bl; kg = (1 - 0.2 * bl) * 0.5 }
    sc = kc
    sq = 1
    sg = kg / 0.5 // relatif terhadap strip (0,5), untuk tampilan
    t1 = kc * c * Nc
    t2 = q * Nq
    t3 = kg * g * B * Ng
  } else {
    Nq = nqPrandtl(phi)
    Nc = phiDeg < 1e-4 ? 5.14 : (Nq - 1) / Math.tan(phi)
    if (method === 'meyerhof') {
      Ng = (Nq - 1) * Math.tan(1.4 * phi)
      const Nphi = Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2)
      const sN = Math.sqrt(Nphi)
      const k = Df / B
      sc = 1 + 0.2 * Nphi * bl
      dc = 1 + 0.2 * sN * k
      if (phiDeg >= 10) {
        sq = 1 + 0.1 * Nphi * bl
        sg = sq
        dq = 1 + 0.1 * sN * k
        dg = dq
      }
    } else {
      Ng = 2 * (Nq + 1) * Math.tan(phi)
      sc = 1 + (Nq / Nc) * bl
      sq = 1 + bl * Math.tan(phi)
      sg = Math.max(0.6, 1 - 0.4 * bl)
      const kk = Df / B <= 1 ? Df / B : Math.atan(Df / B)
      dc = 1 + 0.4 * kk
      dq = 1 + 2 * Math.tan(phi) * Math.pow(1 - Math.sin(phi), 2) * kk
      dg = 1
    }
    t1 = c * Nc * sc * dc
    t2 = q * Nq * sq * dq
    t3 = 0.5 * g * B * Ng * sg * dg
  }
  if (Ng < 0) Ng = 0
  if (t3 < 0) t3 = 0
  return { method, Nc, Nq, Ng, sc, sq, sg, dc, dq, dg, t1, t2, t3, qu: t1 + t2 + t3, phiDeg, c, local: localApplied, cap: capNote }
}

export function computeBearing(v: BearingInput): BearingResult {
  const warn: string[] = []
  const shape = v.shape || 'strip'
  let B = num(v.B), L = num(v.L)
  const Df = num(v.Df), c = num(v.c), gamma = num(v.gamma), Dw = num(v.Dw), qApp = num(v.qapp)
  let phiDeg = num(v.phi), gsat = num(v.gsat), FS = num(v.FS)
  const local = String(v.tfail) === 'local'

  if (!(B > 0)) { warn.push('Lebar fondasi B harus > 0.'); return { valid: false, warn } }
  if (!(Df >= 0)) { warn.push('Kedalaman Df tidak boleh negatif.'); return { valid: false, warn } }
  if (!(gamma > 0)) { warn.push('Berat isi tanah γ harus > 0.'); return { valid: false, warn } }
  if (!(gsat > 0)) gsat = gamma + 1
  if (!(FS > 0)) FS = 3
  if (phiDeg < 0) phiDeg = 0

  let bl: number
  if (shape === 'strip') { bl = 0; L = 0 }
  else if (shape === 'square' || shape === 'circular') { bl = 1; L = B } // lingkaran: B = diameter
  else {
    if (!(L > 0)) { warn.push('Panjang L harus > 0 untuk fondasi persegi panjang.'); return { valid: false, warn } }
    if (L < B) { [B, L] = [L, B]; warn.push('L < B ditukar agar B = sisi pendek.') }
    bl = B / L
  }

  const wt = waterCorrection(gamma, gsat, Dw, Df, B)
  const inp: MethodInput = { c, phiDeg, gamma, gBase: wt.gBase, q: wt.q, B, L, Df, bl, shape, local }

  const withAllowable = (m: MethodCore): MethodResult => {
    const qnet = m.qu - wt.q
    return { ...m, qnet, qall: m.qu / FS, qallNet: qnet / FS }
  }
  const methods: Record<BearingMethod, MethodResult> = {
    terzaghi: withAllowable(bearingByMethod('terzaghi', inp)),
    meyerhof: withAllowable(bearingByMethod('meyerhof', inp)),
    vesic: withAllowable(bearingByMethod('vesic', inp)),
  }
  const primary = v.method || 'terzaghi'
  const pm = methods[primary]
  const dc = qApp > 0 ? qApp / pm.qall : null

  if (local) warn.push('Keruntuhan LOKAL (Terzaghi): c* = ⅔c dan tanφ* = ⅔tanφ diterapkan HANYA pada metode Terzaghi (tanah lepas/lunak). Meyerhof & Vesic tetap parameter penuh — perbandingan tidak setara untuk kondisi ini.')
  if (methods.terzaghi.cap) warn.push('φ > 50° di luar tabel Terzaghi Nγ — nilai di-clamp ke 50°; hasil Terzaghi tidak andal pada φ setinggi ini.')
  if (phiDeg > 45) warn.push('φ > 45° sangat tinggi — periksa parameter tanah; faktor daya dukung tumbuh sangat cepat (sensitif).')
  if (c > 0 && phiDeg > 0) warn.push('Tanah c–φ: pastikan parameter kekuatan (c, φ) konsisten dengan kondisi drainase (efektif vs total).')
  if (Df > B * 4) warn.push('Df/B = ' + (Df / B).toFixed(1) + ' > 4 — fondasi cenderung DALAM; teori daya dukung dangkal (dan faktor kedalaman) mungkin tidak berlaku. Pertimbangkan analisis fondasi dalam.')
  if (Dw < Df + B && gsat <= gamma) warn.push('γsat ≤ γ padahal MAT berpengaruh — periksa berat isi jenuh (γsat semestinya > γ lembab).')
  if (dc !== null && dc > 1) warn.push('Tekanan kerja q = ' + qApp.toFixed(1) + ' kPa > q_izin (' + pm.qall.toFixed(1) + ' kPa) metode ' + methodName(primary) + ' — TIDAK AMAN (rasio ' + dc.toFixed(2) + ').')
  warn.push('Faktor keamanan FS = ' + FS.toFixed(1) + ' terhadap keruntuhan geser; PENURUNAN (settlement) tidak diperiksa dan sering justru menentukan pada pasir/fondasi lebar.')

  return {
    valid: true, warn, shape, B, L, Df, bl, c, phiDeg, gamma, gsat, Dw, FS, local, qApp,
    q: wt.q, gBase: wt.gBase, gsub: wt.gsub, wc: wt.wc, methods, primary, pm, inp, dc,
  }
}
