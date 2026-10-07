// Analisis balok baja dua tumpuan (sendi–rol) dengan kantilever opsional: reaksi, V, M, lendutan.
// Port 1:1 dari modules/steel-beam-analysis/module.js (compute), diverifikasi golden test.
//
//   Beban: ≤ 3 patch merata/trapesium + ≤ 4 terpusat + berat sendiri profil (opsional); posisi dari ujung kiri.
//   V & M dari statika potongan; lendutan dari integrasi ganda κ = M/EI (trapesium kumulatif, 400 interval),
//   syarat batas y = 0 di kedua tumpuan. Konvensi: beban & lendutan ke bawah (+), momen sagging (+).
// Alat bantu ANALISIS — bukan cek kapasitas (pakai steel-flexure). E default 200 000 MPa, I = Ix profil.
// Profil dipilih UI dan diberikan sebagai argumen (build lama membacanya dari state modul).

import type { SteelProfile } from './shared/steel-profiles'

const MAX_DIST = 3 // patch merata/trapesium maksimum
const MAX_PT = 4 // beban terpusat maksimum
const NINT = 400 // interval integrasi (grid seragam)
const EPS = 1e-6

/** Tipe profil yang didukung tool ini. */
export const BEAM_PROFILE_TYPES = ['WF', 'UNP', 'CNP', 'RHS', 'SHS']

/** Input form: patch i = d{i}_w1/w2 (kN/m), d{i}_a1/a2 (m); titik i = p{i}_P (kN), p{i}_a (m). */
export interface SteelBeamInput {
  /** Bentang antar tumpuan, kantilever kiri & kanan (m). */
  L: number
  cL: number
  cR: number
  /** MPa, ≤ 0 = 200 000. */
  E: number
  self: 'ya' | 'tidak'
  nd: number
  np: number
  [load: string]: number | string
}

interface Patch {
  w1: number
  w2: number
  a1: number
  a2: number
}

interface PointLoad {
  P: number
  a: number
}

export interface SteelBeamResult {
  valid: boolean
  warn: string[]
  noload?: boolean
  prof?: SteelProfile
  /** m */
  L?: number
  cL?: number
  cR?: number
  Ltot?: number
  xA?: number
  xB?: number
  E?: number
  /** cm⁴ */
  I?: number
  /** N·mm² */
  EI?: number
  /** Beban masukan setelah dipotong ke panjang balok (kN/m, kN, m). */
  inpDist?: (Patch & { self?: boolean })[]
  inpPt?: PointLoad[]
  wself?: number
  /** Beban internal SI (N/mm, N, mm). */
  D?: Patch[]
  P?: PointLoad[]
  /** kN */
  RA?: number
  RB?: number
  Wtot?: number
  /** kNm & m */
  Mmax?: number
  xMmax?: number
  Vmax?: number
  xVmax?: number
  /** mm (+ ke bawah) */
  ymax?: number
  xYmax?: number
  /** L / |ymax| */
  ratio?: number
  /** MPa */
  fb?: number | null
  /** xs (mm), M (N·mm), y (mm), Vpts [x mm, V N] termasuk lompatan geser. */
  plot?: { xs: number[]; M: number[]; y: number[]; Vpts: [number, number][] }
  /** Nilai di posisi x (m) untuk hover: V kN, M kNm, y mm. */
  at?: (xm: number) => { V: number; M: number; y: number }
}

/** Nilai berhingga atau 0 (global isFinite seperti build lama). */
const fin = (x: number): number => (isFinite(x) ? x : 0)
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x))
const fmtm = (x: number): number => Math.round(x * 1000) / 1000

/** Bagian patch di kiri x: resultan A (N) & momennya terhadap x (N·mm). */
function patchLeft(d: Patch, x: number): { A: number; Mo: number } {
  if (x <= d.a1 + EPS) return { A: 0, Mo: 0 }
  const t = Math.min(x, d.a2)
  const Lp = d.a2 - d.a1
  const wt = Lp > EPS ? d.w1 + ((d.w2 - d.w1) * (t - d.a1)) / Lp : d.w1
  const len = t - d.a1
  const A = ((d.w1 + wt) / 2) * len
  const xbar = d.w1 + wt > EPS ? (len * (d.w1 + 2 * wt)) / (3 * (d.w1 + wt)) : len / 2
  return { A, Mo: A * (x - (d.a1 + xbar)) }
}

/** Resultan penuh patch & posisinya. */
function patchFull(d: Patch): { W: number; xpos: number } {
  const Lp = d.a2 - d.a1
  const W = ((d.w1 + d.w2) / 2) * Lp
  const xc = d.w1 + d.w2 > EPS ? (Lp * (d.w1 + 2 * d.w2)) / (3 * (d.w1 + d.w2)) : Lp / 2
  return { W, xpos: d.a1 + xc }
}

function interpY(xs: number[], yv: number[], x: number): number {
  if (x <= xs[0]) return yv[0]
  if (x >= xs[xs.length - 1]) return yv[yv.length - 1]
  let i = Math.min(xs.length - 2, Math.floor(x / (xs[1] - xs[0])))
  while (i < xs.length - 1 && xs[i + 1] < x) i++
  const t = (x - xs[i]) / (xs[i + 1] - xs[i])
  return yv[i] + (yv[i + 1] - yv[i]) * t
}

function uniqSort(arr: number[]): number[] {
  arr.sort((a, b) => a - b)
  const out: number[] = []
  for (let i = 0; i < arr.length; i++) if (i === 0 || arr[i] - out[out.length - 1] > 1e-4) out.push(arr[i])
  return out
}

export function computeSteelBeam(v: SteelBeamInput, prof: SteelProfile | null): SteelBeamResult {
  const r: SteelBeamResult = { valid: true, warn: [] }
  if (!prof) { r.valid = false; return r }
  r.prof = prof
  const Lm = v.L
  if (!(Lm > 0)) { r.valid = false; return r }
  const cLm = Math.max(0, fin(v.cL)), cRm = Math.max(0, fin(v.cR))
  const LtotM = cLm + Lm + cRm
  const L = Lm * 1000, Ltot = LtotM * 1000
  const xA = cLm * 1000, xB = (cLm + Lm) * 1000 // tumpuan A (sendi) & B (rol)
  const E = v.E > 0 ? v.E : 200000
  const EI = E * prof.Ix * 1e4
  Object.assign(r, { L: Lm, cL: cLm, cR: cRm, Ltot: LtotM, xA: xA / 1000, xB: xB / 1000, E, I: prof.Ix, EI })

  // Beban (SI internal: N/mm, N, mm).
  const D: Patch[] = [], P: PointLoad[] = []
  const inpDist: SteelBeamResult['inpDist'] = [], inpPt: PointLoad[] = []
  r.inpDist = inpDist
  r.inpPt = inpPt
  const get = (k: string) => fin(v[k] as number)
  const nd = Math.max(0, Math.min(MAX_DIST, Math.round(v.nd)))
  for (let i = 1; i <= nd; i++) {
    const w1 = get('d' + i + '_w1'), w2 = get('d' + i + '_w2'), a1 = get('d' + i + '_a1'), a2 = get('d' + i + '_a2')
    if (a2 <= a1) { r.warn.push('Beban merata #' + i + ': a2 (' + fmtm(a2) + ') ≤ a1 (' + fmtm(a1) + ') — diabaikan.'); continue }
    const ca1 = clamp(a1, 0, LtotM), ca2 = clamp(a2, 0, LtotM)
    if (ca1 !== a1 || ca2 !== a2) r.warn.push('Beban merata #' + i + ': posisi dipotong ke panjang balok 0…' + fmtm(LtotM) + ' m.')
    if (ca2 <= ca1) continue
    if (w1 === 0 && w2 === 0) continue
    inpDist.push({ w1, w2, a1: ca1, a2: ca2 })
    D.push({ w1, w2, a1: ca1 * 1000, a2: ca2 * 1000 }) // kN/m ≡ N/mm
  }
  if (v.self === 'ya' && prof.w > 0) {
    const wsw = (prof.w * 9.81) / 1000 // kg/m → kN/m
    r.wself = wsw
    D.push({ w1: wsw, w2: wsw, a1: 0, a2: Ltot })
    inpDist.push({ w1: wsw, w2: wsw, a1: 0, a2: LtotM, self: true })
  }
  const np = Math.max(0, Math.min(MAX_PT, Math.round(v.np)))
  for (let i = 1; i <= np; i++) {
    const Pv = get('p' + i + '_P'), a = get('p' + i + '_a')
    if (!(Math.abs(Pv) > 0)) continue
    const ca = clamp(a, 0, LtotM)
    if (ca !== a) r.warn.push('Beban terpusat #' + i + ': posisi dipotong ke 0…' + fmtm(LtotM) + ' m.')
    inpPt.push({ P: Pv, a: ca })
    P.push({ P: Pv * 1000, a: ca * 1000 })
  }
  if (!D.length && !P.length) { r.valid = false; r.noload = true; return r }
  r.D = D
  r.P = P

  // Reaksi: ΣM terhadap A.
  let sumF = 0, sumMA = 0
  for (const d of D) { const f = patchFull(d); sumF += f.W; sumMA += f.W * (f.xpos - xA) }
  for (const p of P) { sumF += p.P; sumMA += p.P * (p.a - xA) }
  const RB = sumMA / L
  const RA = sumF - RB
  Object.assign(r, { RA: RA / 1000, RB: RB / 1000, Wtot: sumF / 1000 })

  const shear = (x: number, right: boolean): number => {
    let s = 0
    if (right ? xA <= x + EPS : xA < x - EPS) s += RA
    if (right ? xB <= x + EPS : xB < x - EPS) s += RB
    for (const p of P) if (right ? p.a <= x + EPS : p.a < x - EPS) s -= p.P
    for (const d of D) s -= patchLeft(d, x).A
    return s
  }
  const moment = (x: number): number => {
    let m = 0
    if (xA < x + EPS) m += RA * (x - xA)
    if (xB < x + EPS) m += RB * (x - xB)
    for (const p of P) if (p.a <= x + EPS) m -= p.P * (x - p.a)
    for (const d of D) m -= patchLeft(d, x).Mo
    return m
  }

  // Grid seragam: M & integrasi lendutan.
  const xs: number[] = [], M: number[] = [], kappa: number[] = []
  for (let i = 0; i <= NINT; i++) {
    const x = (Ltot * i) / NINT
    xs.push(x)
    M.push(moment(x))
    kappa.push(M[i] / EI)
  }
  const th0: number[] = [0], y0: number[] = [0]
  for (let i = 1; i <= NINT; i++) {
    const h = xs[i] - xs[i - 1]
    th0.push(th0[i - 1] + ((kappa[i] + kappa[i - 1]) / 2) * h)
    y0.push(y0[i - 1] + ((th0[i] + th0[i - 1]) / 2) * h)
  }
  // v = v0 + C1·x + C2 (positif ke atas), v = 0 di kedua tumpuan.
  const v0A = interpY(xs, y0, xA), v0B = interpY(xs, y0, xB)
  const C1 = -(v0B - v0A) / L
  const C2 = -(v0A + C1 * xA)
  const yv = xs.map((x, i) => -(y0[i] + C1 * x + C2)) // mm, + ke bawah

  // Momen maksimum: grid + titik geser nol + posisi beban titik + tumpuan.
  let Mmax = 0, xMmax = 0
  for (let i = 0; i <= NINT; i++) if (Math.abs(M[i]) > Math.abs(Mmax)) { Mmax = M[i]; xMmax = xs[i] }
  let prevV = shear(0, true)
  for (let i = 1; i <= NINT; i++) {
    const vNow = shear(xs[i], true)
    if (prevV === 0 || (prevV > 0) !== (vNow > 0)) {
      const xz = xs[i - 1] + ((xs[i] - xs[i - 1]) * Math.abs(prevV)) / (Math.abs(prevV) + Math.abs(vNow) + EPS)
      const mz = moment(xz)
      if (Math.abs(mz) > Math.abs(Mmax)) { Mmax = mz; xMmax = xz }
    }
    prevV = vNow
  }
  for (const p of P) { const mp = moment(p.a); if (Math.abs(mp) > Math.abs(Mmax)) { Mmax = mp; xMmax = p.a } }
  for (const xt of [xA, xB]) { const mt = moment(xt); if (Math.abs(mt) > Math.abs(Mmax)) { Mmax = mt; xMmax = xt } }

  // Geser maksimum: kedua sisi tiap lompatan + grid.
  let Vmax = 0, xVmax = 0
  const chkV = (x: number, right: boolean) => { const vv = shear(x, right); if (Math.abs(vv) > Math.abs(Vmax)) { Vmax = vv; xVmax = x } }
  chkV(0, true)
  chkV(Ltot, false)
  chkV(xA, false); chkV(xA, true); chkV(xB, false); chkV(xB, true)
  for (const p of P) { chkV(p.a, false); chkV(p.a, true) }
  for (let i = 0; i <= NINT; i++) chkV(xs[i], true)

  let ymax = 0, xYmax = 0
  for (let i = 0; i <= NINT; i++) if (Math.abs(yv[i]) > Math.abs(ymax)) { ymax = yv[i]; xYmax = xs[i] }
  const Sx = (prof.Sx as number) * 1e3
  Object.assign(r, {
    Mmax: Mmax / 1e6, xMmax: xMmax / 1000, Vmax: Vmax / 1e3, xVmax: xVmax / 1000, ymax, xYmax: xYmax / 1000,
    ratio: Math.abs(ymax) > EPS ? L / Math.abs(ymax) : Infinity, fb: Sx > 0 ? Math.abs(Mmax) / Sx : null,
  })

  // Data diagram geser termasuk lompatan di beban titik & tumpuan.
  const Vpts: [number, number][] = []
  const jumpAt = P.map((p) => p.a).concat([xA, xB])
  let stops = [0]
  for (let i = 1; i < NINT; i++) stops.push(xs[i])
  stops.push(Ltot)
  stops.push(...jumpAt)
  for (const d of D) stops.push(d.a1, d.a2)
  stops = uniqSort(stops.filter((x) => x >= 0 && x <= Ltot))
  for (const x of stops) {
    if (jumpAt.some((j) => Math.abs(j - x) < 1e-3) && x > EPS) Vpts.push([x, shear(x, false)]) // sisi kiri
    Vpts.push([x, shear(x, true)])
  }
  r.plot = { xs, M, y: yv, Vpts }
  r.at = (xm: number) => {
    const x = clamp(xm, 0, LtotM) * 1000
    return { V: shear(x, true) / 1e3, M: moment(x) / 1e6, y: interpY(xs, yv, x) }
  }
  return r
}
