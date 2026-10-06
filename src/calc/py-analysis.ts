// Analisis P-Y: tiang dibebani lateral sebagai balok di atas pegas tak-linear (Winkler).
// Port 1:1 dari modules/py-analysis/module.js (compute), diverifikasi golden test.
//
//   EI·y'''' + p(y, z) = 0, beda-hingga 60 elemen + iterasi sekan (under-relaksasi 0,5), beban bertahap 10 langkah.
//   Kepala: geser = H, momen = M + H·e (bebas) atau kemiringan 0 (jepit). Ujung: momen = geser = 0.
//   Lempung lunak — Matlock (1970) statik: pu = min[(3 + γ'z/cu + 0,5z/D), 9]·cu·D, p = 0,5·pu·(y/y50)^(1/3).
//   Pasir — API RP2A / O'Neill-Murchison: pu = min[(C1·z + C2·D), C3·D]·γ'·z, p = A·pu·tanh(k·z·y/(A·pu)).
// TIDAK termasuk: tanah berlapis, penampang retak (reduksi EI manual), beban siklik.
// Urutan operasi solver sengaja identik dengan build lama: kasus yang tidak konvergen pun harus sama persis.

import { rankineKp } from './shared/geotech'

/** Jumlah elemen beda-hingga (61 node). */
const NEL = 60
/** Langkah pembebanan untuk kurva H–y0. */
const STEPS = 10

export type PySoil = 'clay' | 'sand'
export type PileHead = 'free' | 'fixed'

export interface PyInput {
  soil: PySoil
  head: PileHead
  /** Beban lateral (kN). */
  H: number
  /** Momen di kepala (kNm), kepala bebas. */
  M: number
  /** Tinggi beban di atas tanah (m). */
  e: number
  /** Diameter (mm). */
  D: number
  /** Panjang tertanam (m). */
  L: number
  /** Modulus elastis (MPa). */
  E: number
  /** Berat isi efektif (kN/m³). */
  gam: number
  cu: number
  eps50: number
  /** Sudut geser (°). */
  phi: number
  /** Modulus subgrade awal (MN/m³). */
  kpy: number
}

/** Parameter kurva p-y & tiang (satuan kN, m). */
export interface PyParams {
  soil: PySoil
  head: PileHead
  D: number
  L: number
  EI: number
  gam: number
  cu?: number
  eps50?: number
  y50?: number
  C1?: number
  C2?: number
  C3?: number
  /** kN/m³ */
  kpy?: number
}

export interface PySolution {
  /** Defleksi per node (m). */
  y: Float64Array
  /** Momen per node (kNm). */
  M: Float64Array
  /** Reaksi tanah per node (kN/m). */
  p: Float64Array
  dz: number
  conv: boolean
  iters: number
}

export interface PyResult {
  warn: string[]
  valid: boolean
  soil: PySoil
  head: PileHead
  D?: number
  L?: number
  E?: number
  I?: number
  EI?: number
  cu?: number
  eps50?: number
  y50?: number
  phi?: number
  kpy?: number
  Kp?: number
  C1?: number
  C2?: number
  C3?: number
  gam?: number
  H?: number
  M?: number
  e?: number
  M0?: number
  P?: PyParams
  sol?: PySolution
  /** Kurva kepala H (kN) – y0 (mm). */
  curve?: { H: number; y0: number }[]
  conv?: boolean
  /** Defleksi kepala (mm). */
  y0?: number
  slope0?: number
  ymax?: number
  ymaxZ?: number
  Mmax?: number
  MmaxZ?: number
  puTop?: number
}

/** Reaksi ultimit pu (kN/m) di kedalaman z. */
export function puAt(P: PyParams, z: number): number {
  if (P.soil === 'clay') {
    const cu = P.cu as number
    const ps = (3 + (P.gam * z) / cu + (0.5 * z) / P.D) * cu * P.D
    return Math.min(ps, 9 * cu * P.D)
  }
  const pus = ((P.C1 as number) * z + (P.C2 as number) * P.D) * P.gam * z
  const pud = (P.C3 as number) * P.D * P.gam * z
  return Math.max(0, Math.min(pus, pud))
}

/** Reaksi tanah p (kN/m) untuk defleksi y (m) di kedalaman z (m). */
export function pOfY(P: PyParams, z: number, y: number): number {
  const ay = Math.abs(y), sgn = y < 0 ? -1 : 1
  const pu = puAt(P, z)
  if (pu <= 0 || ay < 1e-12) return 0
  let p: number
  if (P.soil === 'clay') {
    const yr = ay / (P.y50 as number)
    p = yr >= 8 ? pu : 0.5 * pu * Math.cbrt(yr)
  } else {
    const A = Math.max(3 - (0.8 * z) / P.D, 0.9)
    p = A * pu * Math.tanh(((P.kpy as number) * z * ay) / (A * pu))
  }
  return sgn * Math.min(p, pu)
}

/** Modulus sekan (kN/m²) kurva p-y pada defleksi y. */
function secant(P: PyParams, z: number, y: number): number {
  const ay = Math.abs(y)
  if (ay < 1e-9) {
    // Kemiringan awal: pasir = k·z; lempung → nilai pada y kecil.
    if (P.soil === 'sand') return (P.kpy as number) * z
    const ys = 1e-5
    return Math.abs(pOfY(P, z, ys)) / ys
  }
  return Math.abs(pOfY(P, z, y)) / ay
}

/** A·x = b, eliminasi Gauss dengan pivot parsial (A & b diubah di tempat). */
function solveLinear(A: Float64Array[], b: Float64Array, N: number): Float64Array {
  for (let c = 0; c < N; c++) {
    let piv = c, mx = Math.abs(A[c][c])
    for (let rr = c + 1; rr < N; rr++) {
      const av = Math.abs(A[rr][c])
      if (av > mx) { mx = av; piv = rr }
    }
    if (piv !== c) {
      const t = A[piv]; A[piv] = A[c]; A[c] = t
      const tb = b[piv]; b[piv] = b[c]; b[c] = tb
    }
    const d = A[c][c]
    if (Math.abs(d) < 1e-30) continue
    for (let r2 = c + 1; r2 < N; r2++) {
      const fac = A[r2][c] / d
      if (fac === 0) continue
      for (let k = c; k < N; k++) A[r2][k] -= fac * A[c][k]
      b[r2] -= fac * b[c]
    }
  }
  const x = new Float64Array(N)
  for (let i = N - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j < N; j++) s -= A[i][j] * x[j]
    x[i] = Math.abs(A[i][i]) < 1e-30 ? 0 : s / A[i][i]
  }
  return x
}

/** Satu solusi tak-linear untuk beban (H, M0); yInit = tebakan awal (warm start). */
export function solvePile(P: PyParams, H: number, M0: number, yInit: Float64Array | null): PySolution {
  const n = NEL, dz = P.L / n, N = n + 5 // anu y(-2..n+2), indeks = i + 2
  const EI = P.EI
  const c4 = EI / Math.pow(dz, 4)
  let y = yInit ? yInit.slice() : new Float64Array(n + 1)
  let conv = false, iters = 0

  for (let it = 0; it < 100; it++) {
    iters = it + 1
    const A = Array.from({ length: N }, () => new Float64Array(N))
    const b = new Float64Array(N)

    // Persamaan pengatur di node i = 0..n.
    for (let i = 0; i <= n; i++) {
      const ki = secant(P, i * dz, y[i])
      const row = A[i]
      row[i + 0] += c4 * 1
      row[i + 1] += c4 * -4
      row[i + 2] += c4 * 6 + ki
      row[i + 3] += c4 * -4
      row[i + 4] += c4 * 1
      b[i] = 0
    }
    const c2 = EI / (dz * dz), c3 = EI / (2 * dz * dz * dz)
    // Kepala (indeks y(-2)=0, y(-1)=1, y0=2, y1=3, y2=4).
    if (P.head === 'fixed') {
      A[n + 1][1] += 1; A[n + 1][3] += -1; b[n + 1] = 0 // kemiringan 0
    } else {
      A[n + 1][1] += c2; A[n + 1][2] += -2 * c2; A[n + 1][3] += c2; b[n + 1] = M0 // momen
    }
    A[n + 2][0] += -c3; A[n + 2][1] += 2 * c3; A[n + 2][3] += -2 * c3; A[n + 2][4] += c3; b[n + 2] = H // geser
    // Ujung: momen 0 & geser 0.
    A[n + 3][n + 1] += c2; A[n + 3][n + 2] += -2 * c2; A[n + 3][n + 3] += c2; b[n + 3] = 0
    A[n + 4][n + 0] += -c3; A[n + 4][n + 1] += 2 * c3; A[n + 4][n + 3] += -2 * c3; A[n + 4][n + 4] += c3; b[n + 4] = 0

    const x = solveLinear(A, b, N)
    let maxd = 0
    const ynew = new Float64Array(n + 1)
    for (let q = 0; q <= n; q++) {
      const val = 0.5 * y[q] + 0.5 * x[q + 2] // under-relaksasi
      maxd = Math.max(maxd, Math.abs(val - y[q]))
      ynew[q] = val
    }
    y = ynew
    if (maxd < 1e-7) { conv = true; break }
  }

  // Momen M = EI·y'' (beda tengah); kepala dari BC, ujung 0.
  const M = new Float64Array(n + 1), p = new Float64Array(n + 1)
  for (let m = 0; m <= n; m++) {
    p[m] = pOfY(P, m * dz, y[m])
    if (m === 0) M[m] = P.head === 'fixed' ? (EI * 2 * (y[1] - y[0])) / (dz * dz) : M0
    else if (m === n) M[m] = 0
    else M[m] = (EI * (y[m - 1] - 2 * y[m] + y[m + 1])) / (dz * dz)
  }
  return { y, M, p, dz, conv, iters }
}

/** Koefisien Reese C1, C2, C3 (pasir) dari φ (°). */
export function sandCoefficients(phiDeg: number): { C1: number; C2: number; C3: number; Kp: number } {
  const phi = (phiDeg * Math.PI) / 180
  const a = phi / 2, beta = Math.PI / 4 + phi / 2
  const Ko = 0.4, Ka = Math.pow(Math.tan(Math.PI / 4 - phi / 2), 2)
  const tb = Math.tan(beta), tbf = Math.tan(beta - phi)
  const C1 = (Ko * Math.tan(phi) * Math.sin(beta)) / (tbf * Math.cos(a)) +
    (tb * tb * Math.tan(a)) / tbf + Ko * tb * (Math.tan(phi) * Math.sin(beta) - Math.tan(a))
  const C2 = tb / tbf - Ka
  const C3 = Ka * (Math.pow(tb, 8) - 1) + Ko * Math.tan(phi) * Math.pow(tb, 4)
  return { C1, C2, C3, Kp: rankineKp(phi) }
}

export function computePy(v: PyInput): PyResult {
  const r: PyResult = { warn: [], valid: true, soil: v.soil, head: v.head }
  const D = v.D / 1000, L = v.L, E = v.E
  if (!(D > 0) || !(L > 0) || !(E > 0)) { r.valid = false; return r }
  const I = (Math.PI * Math.pow(D, 4)) / 64
  const EI = E * 1000 * I // MPa → kPa · m⁴ = kN·m²
  const P: PyParams = { soil: v.soil, head: v.head, D, L, EI, gam: v.gam }
  Object.assign(r, { D, L, E, I, EI })

  if (v.soil === 'clay') {
    if (!(v.cu > 0) || !(v.gam > 0) || !(v.eps50 > 0)) { r.valid = false; return r }
    P.cu = v.cu
    P.eps50 = v.eps50
    P.y50 = 2.5 * v.eps50 * D
    Object.assign(r, { cu: v.cu, eps50: v.eps50, y50: P.y50 })
  } else {
    if (!(v.phi > 0) || !(v.gam > 0) || !(v.kpy > 0)) { r.valid = false; return r }
    const sc = sandCoefficients(v.phi)
    P.C1 = sc.C1
    P.C2 = sc.C2
    P.C3 = sc.C3
    P.kpy = v.kpy * 1000 // MN/m³ → kN/m³
    Object.assign(r, { phi: v.phi, kpy: v.kpy, Kp: sc.Kp, C1: sc.C1, C2: sc.C2, C3: sc.C3 })
  }
  r.gam = v.gam
  r.H = v.H
  r.M = v.M
  r.e = v.e || 0
  const M0 = (v.M || 0) + v.H * (v.e || 0)
  r.M0 = M0
  r.P = P

  if (!(v.H > 0)) { r.valid = false; r.warn.push('Masukkan beban lateral H > 0.'); return r }

  // Pembebanan bertahap dengan warm start → kurva H–y0.
  const curve = [{ H: 0, y0: 0 }]
  let yPrev: Float64Array | null = null
  let last: PySolution | null = null
  let allConv = true
  for (let s = 1; s <= STEPS; s++) {
    const Hs = (v.H * s) / STEPS, Ms = (M0 * s) / STEPS
    const sol: PySolution = solvePile(P, Hs, Ms, yPrev)
    yPrev = sol.y
    last = sol
    if (!sol.conv) allConv = false
    curve.push({ H: Hs, y0: sol.y[0] * 1000 })
  }
  const sol = last as PySolution
  r.sol = sol
  r.curve = curve
  r.conv = allConv

  const { y, M, dz } = sol
  r.y0 = y[0] * 1000 // mm
  r.slope0 = (y[1] - y[0]) / dz
  let ymax = 0, ymaxZ = 0, Mmax = 0, MmaxZ = 0
  for (let i = 0; i < y.length; i++) {
    if (Math.abs(y[i]) > Math.abs(ymax)) { ymax = y[i]; ymaxZ = i * dz }
    if (Math.abs(M[i]) > Math.abs(Mmax)) { Mmax = M[i]; MmaxZ = i * dz }
  }
  Object.assign(r, { ymax: ymax * 1000, ymaxZ, Mmax, MmaxZ, puTop: puAt(P, 0.5 * D) })
  if (!allConv) r.warn.push('Iterasi belum konvergen penuh pada sebagian langkah — hasil perkiraan; coba kurangi H atau periksa parameter.')
  return r
}
