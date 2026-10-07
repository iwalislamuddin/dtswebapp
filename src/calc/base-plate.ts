// Base plate & anchor rod kolom baja (DFBK) — AISC Design Guide 1 (2nd Ed.), AISC 360-22, ACI 318-19.
// Port 1:1 dari modules/base-plate/module.js (compute), diverifikasi golden test.
//
//   Tumpu beton: fp(max) = φc·0,85f'c·√(A2/A1) ≤ 2, φc = 0,65. Eksentrisitas e = Mu/Pu: konsentrik / momen kecil
//   (e ≤ ecrit = N/2 − Pu/(2qmax)) / momen besar (Y = (f+N/2) − √[(f+N/2)² − 2Pu(e+f)/qmax], T = qmax·Y − Pu).
//   Tebal pelat: garis leleh kantilever m, n, λn' (konsentrik); tp = √(4Mpl/(φb·Fy)), sisi tumpu & sisi tarik.
//   Baja angkur: φ·0,75Fu·Ab (φ 0,75); geser dasar: gesekan μ·Pu ≤ 0,2f'c·A1.
// TIDAK termasuk: breakout/cabut/pryout beton angkur (tool Anchor Bolt Group), shear lug, prying, las pelat-kolom.

import { numFinite as num, type NumLike } from './shared/num'

/** Mutu angkur ASTM F1554 (MPa). */
export const ANCHOR_MATERIALS: Record<string, { label: string; Fu: number; Fy: number }> = {
  g36: { label: 'F1554 Gr.36', Fu: 400, Fy: 248 },
  g55: { label: 'F1554 Gr.55', Fu: 517, Fy: 380 },
  g105: { label: 'F1554 Gr.105', Fu: 862, Fy: 724 },
  custom: { label: 'Kustom', Fu: 400, Fy: 248 },
}

const PHI_C = 0.65 // tumpu beton
const PHI_B = 0.9 // leleh lentur pelat
const PHI_T = 0.75 // tarik angkur (AISC J3)
const PHI_V = 0.75 // geser-friksi

export type ColumnType = 'w' | 'hssr' | 'hssc'

export interface BasePlateInput {
  colType?: ColumnType
  /** Kolom: tinggi/diameter d, lebar bf, tebal sayap tf (mm). */
  d: NumLike
  bf: NumLike
  tf: NumLike
  /** Pelat N × B × tp (mm), Fy (MPa). */
  N: NumLike
  B: NumLike
  tp: NumLike
  Fy: NumLike
  /** '0' = λ konservatif 1,0; lainnya = λ eksak. */
  lamExact?: string
  fc: NumLike
  a2a1: NumLike
  /** kN & kNm. */
  Pu: NumLike
  Mu: NumLike
  Vu: NumLike
  surf?: 'grout' | 'concrete'
  mat?: string
  Fu: NumLike
  /** Angkur: diameter (mm), jumlah per muka tarik, jarak tepi pelat → sumbu angkur (mm). */
  db: NumLike
  nT: NumLike
  aEdge: NumLike
}

export interface BasePlateResult {
  valid: boolean
  warn: string[]
  colType?: ColumnType
  d?: number
  bf?: number
  tf?: number
  N?: number
  B?: number
  Fy?: number
  tp?: number
  fc?: number
  a2a1?: number
  Pu?: number
  Mu?: number
  mat?: string
  matLabel?: string
  Fu?: number
  db?: number
  nT?: number
  aEdge?: number
  Vu?: number
  surf?: string
  sqrtR?: number
  A1?: number
  fpMax?: number
  phiPp?: number
  A1req?: number
  qmax?: number
  e?: number
  ecrit?: number
  f?: number
  mode?: 'concentric' | 'small' | 'large'
  Y?: number
  fp?: number
  /** N */
  T?: number
  noSol?: boolean
  m?: number
  n?: number
  lam?: number
  lamN?: number
  X?: number
  x?: number
  tpM?: number
  tpN?: number
  tpLam?: number
  tpBrg?: number
  tpTens?: number
  tpReq?: number
  dcPlate?: number
  dcBrg?: number
  Ab?: number
  Fnt?: number
  phiRnRod?: number
  Trod?: number
  dcTens?: number
  mu?: number
  phiVn?: number
  dcShear?: number
  shearGov?: string
  gov?: string
  govDC?: number
  feasible?: boolean
}

export function computeBasePlate(v: BasePlateInput): BasePlateResult {
  const r: BasePlateResult = { valid: false, warn: [] }
  const colType = v.colType || 'w'
  const d = num(v.d), tf = num(v.tf)
  let bf = num(v.bf)
  if (colType === 'hssc') bf = d // bulat: lebar = diameter
  const N = num(v.N), B = num(v.B), Fy = num(v.Fy), tp = num(v.tp)
  const fc = num(v.fc)
  const a2a1 = Math.max(1, num(v.a2a1))
  const Pu = num(v.Pu), Mu = Math.abs(num(v.Mu))
  const Pu_N = Pu * 1000, Mu_Nmm = Mu * 1e6
  const mat = v.mat || 'g36'
  const M = ANCHOR_MATERIALS[mat]
  const Fu = mat === 'custom' ? num(v.Fu) : M.Fu
  const db = num(v.db), nT = Math.max(1, Math.round(num(v.nT)))
  const aEdge = num(v.aEdge)
  const Vu = num(v.Vu), surf = v.surf || 'grout'
  Object.assign(r, { colType, d, bf, tf, N, B, Fy, tp, fc, a2a1, Pu, Mu, mat, matLabel: M.label, Fu, db, nT, aEdge, Vu, surf })

  if (N <= 0 || B <= 0 || fc <= 0 || Fy <= 0) { r.warn.push("Lengkapi dimensi pelat, f'c, dan Fy."); return r }

  // Tumpu beton.
  const sqrtR = Math.min(Math.sqrt(a2a1), 2)
  const A1 = B * N
  const fpMax = PHI_C * 0.85 * fc * sqrtR // MPa, sudah × φc
  const phiPp = (fpMax * A1) / 1000
  const qmax = fpMax * B // N/mm
  const e = Pu_N > 0 ? Mu_Nmm / Pu_N : Infinity
  const ecrit = N / 2 - Pu_N / (2 * qmax)
  const f = N / 2 - aEdge // CL pelat → sumbu angkur tarik
  Object.assign(r, { sqrtR, A1, fpMax, phiPp, A1req: fpMax > 0 ? Pu_N / fpMax : 0, qmax, e, ecrit, f })

  if (Pu_N <= 0) {
    r.warn.push('Pu ≤ 0 (uplift murni) belum ditangani tool ini — masukkan Pu tekan; angkur tarik penuh dicek di tool Anchor Bolt Group.')
    return r
  }

  // Rezim, panjang tumpu Y, tarik angkur T.
  let mode: 'concentric' | 'small' | 'large', Y = 0, fp = 0, T_N = 0, noSol = false
  if (Mu <= 0 || e <= ecrit + 1e-6) {
    mode = Mu <= 0 ? 'concentric' : 'small'
    Y = Math.min(N, N - 2 * e)
    if (Y <= 0) { r.warn.push('Panjang tumpu Y ≤ 0 — eksentrisitas melebihi pelat; perbesar N.'); Y = 0 }
    fp = Y > 0 ? Pu_N / (B * Y) : Infinity
  } else {
    mode = 'large'
    const half = f + N / 2
    const disc = half * half - (2 * Pu_N * (e + f)) / qmax
    if (disc < 0) { noSol = true; r.warn.push('Tidak ada solusi nyata untuk Y (Pers. 3.4.4 tak terpenuhi) — pelat terlalu kecil, perbesar N/B.') }
    else {
      Y = half - Math.sqrt(disc)
      T_N = qmax * Y - Pu_N
      fp = fpMax
      if (Y > N) r.warn.push('Y = ' + Y.toFixed(0) + ' mm > N — tepi tekan lebih dari panjang pelat; perbesar N.')
      if (aEdge <= 0) r.warn.push('Jarak tepi angkur aEdge = 0 — isi posisi angkur tarik agar f benar.')
    }
  }
  Object.assign(r, { mode, Y, fp, T: T_N, noSol })

  // Garis leleh kantilever m, n, λn'.
  let m: number, n: number
  if (colType === 'hssc') { m = (N - 0.8 * d) / 2; n = (B - 0.8 * d) / 2 }
  else if (colType === 'hssr') { m = (N - 0.95 * d) / 2; n = (B - 0.95 * bf) / 2 }
  else { m = (N - 0.95 * d) / 2; n = (B - 0.8 * bf) / 2 }
  m = Math.max(0, m)
  n = Math.max(0, n)
  let lam = 1, lamN = 0, X = 0
  if (colType === 'w' && d > 0 && bf > 0) {
    const Pp = phiPp / PHI_C
    X = Math.min(Pp > 0 ? ((4 * d * bf) / Math.pow(d + bf, 2)) * (Pu / Pp) : 0, 1)
    if (v.lamExact !== '0') {
      const den = 1 + Math.sqrt(Math.max(0, 1 - X))
      lam = den > 0 ? Math.min(1, (2 * Math.sqrt(X)) / den) : 1
    }
    lamN = (lam * Math.sqrt(d * bf)) / 4
  }
  Object.assign(r, { m, n, lam, lamN, X })

  // Tebal pelat perlu — sisi tumpu.
  const tpFor = (c: number): number => {
    if (c <= 0 || !isFinite(fp)) return 0
    const Mpl = Math.max(0, Y >= c ? (fp * c * c) / 2 : fp * Y * (c - Y / 2))
    return Math.sqrt((4 * Mpl) / (PHI_B * Fy))
  }
  const tpM = tpFor(m), tpN = tpFor(n)
  const tpLam = mode === 'concentric' ? tpFor(lamN) : 0
  const tpBrg = Math.max(tpM, tpN, tpLam)
  // Sisi tarik (momen besar).
  let x = 0, tpTens = 0
  if (T_N > 0) {
    x = Math.max(0, f - d / 2 + tf / 2) // Pers. 3.4.6
    tpTens = Math.sqrt((4 * ((T_N / B) * x)) / (PHI_B * Fy))
  }
  const tpReq = Math.max(tpBrg, tpTens)
  const dcPlate = tp > 0 ? tpReq / tp : Infinity
  const dcBrg = fpMax > 0 && isFinite(fp) ? fp / fpMax : Infinity

  // Baja angkur tarik.
  const Ab = (Math.PI * db * db) / 4
  const Fnt = 0.75 * Fu
  const phiRnRod = (PHI_T * Fnt * Ab) / 1000
  const Trod = T_N > 0 ? T_N / nT / 1000 : 0
  const dcTens = T_N > 0 ? (phiRnRod > 0 ? Trod / phiRnRod : Infinity) : 0

  // Geser dasar (gesekan).
  const mu = surf === 'concrete' ? 0.7 : 0.55
  const Vf1 = mu * Pu
  const Vf2 = (0.2 * fc * A1) / 1000
  const phiVn = PHI_V * Math.min(Vf1, Vf2)
  const dcShear = Vu > 0 ? (phiVn > 0 ? Vu / phiVn : Infinity) : 0

  const checks = [
    { key: 'tumpu beton', dc: dcBrg },
    { key: 'tebal pelat', dc: dcPlate },
    { key: 'tarik angkur', dc: dcTens },
    { key: 'geser dasar', dc: dcShear },
  ]
  let gov = checks[0]
  for (const c of checks) if (c.dc > gov.dc) gov = c
  Object.assign(r, {
    x, tpM, tpN, tpLam, tpBrg, tpTens, tpReq, dcPlate, dcBrg, Ab, Fnt, phiRnRod, Trod, dcTens, mu, phiVn, dcShear,
    shearGov: Vf1 <= Vf2 ? 'gesekan μ·Pu' : "batas 0,2·f'c·A1", gov: gov.key, govDC: gov.dc,
    feasible: !noSol && Y > 0 && Y <= N * 1.001, valid: true,
  })

  if (m <= 0 && n <= 0) r.warn.push('m dan n ≤ 0 — pelat lebih kecil dari jejak kolom; perbesar N/B.')
  if (N < d) r.warn.push('N = ' + N + ' mm < d = ' + d + ' mm — kolom tidak muat pada panjang pelat.')
  if (B < bf) r.warn.push('B = ' + B + ' mm < bf/lebar = ' + bf + ' mm — kolom tidak muat pada lebar pelat.')
  if (mode === 'small') r.warn.push('e = ' + e.toFixed(0) + ' mm ≤ ecrit = ' + ecrit.toFixed(0) + ' mm → momen KECIL: tumpu menahan sendiri, angkur tidak tarik.')
  if (mode === 'large' && !noSol) r.warn.push('e = ' + e.toFixed(0) + ' mm > ecrit = ' + ecrit.toFixed(0) + ' mm → momen BESAR: angkur menahan tarik T = ' + (T_N / 1000).toFixed(1) + ' kN.')
  if (dcBrg > 1 && isFinite(dcBrg)) r.warn.push('D/C tumpu = ' + dcBrg.toFixed(2) + " > 1 — tegangan tumpu > fp(max); perbesar pelat atau naikkan f'c / A2.")
  if (dcPlate > 1 && isFinite(dcPlate)) r.warn.push('tp,req = ' + tpReq.toFixed(1) + ' mm > tp = ' + tp + ' mm — pertebal pelat.')
  if (T_N > 0 && dcTens > 1) r.warn.push('D/C tarik angkur = ' + dcTens.toFixed(2) + ' > 1 — perbesar diameter/jumlah angkur atau naikkan mutu.')
  if (Vu > 0 && dcShear > 1) r.warn.push('D/C geser gesekan = ' + dcShear.toFixed(2) + ' > 1 — tambah shear lug atau andalkan geser angkur (cek di tool Anchor Bolt Group).')
  if (T_N > 0) r.warn.push('Cek kuat BETON angkur (cabut/breakout/pryout) di tool "Anchor Bolt Group" (ACI 318-19 Ch.17) memakai T = ' + (T_N / 1000).toFixed(1) + ' kN' + (Vu > 0 ? ' & Vu = ' + Vu.toFixed(1) + ' kN.' : '.'))
  return r
}
