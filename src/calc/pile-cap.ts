// Desain pile cap (poer) 2–6 tiang — SNI 2847:2019: reaksi tiang, lentur di muka kolom, geser satu arah,
// pons kolom & pons tiang (keliling dipangkas tepi poer).
// Port 1:1 dari modules/pile-cap/module.js (compute), diverifikasi golden test.
// Akan menjadi dasar tool `deep-foundation` (lihat docs/TOOL-REVISIONS.md).
//
//   Reaksi: Ri = Pu/n + Muy·xi/Σx² + Mux·yi/Σy² (atau kapasitas Q per tiang).
//   Geser satu arah & pons kolom: fraksi reaksi tiang yang berada di luar penampang kritis (lebar zona = dp).
//   Tiang bulat → persegi ekuivalen sisi 0,886·dp untuk pons tiang.

import { barArea, flexuralRn, oneWayVc, punchingVc, rhoFromRn, rhoShrinkage } from './shared/concrete'

const PHI_F = 0.9 // lentur (terkendali tarik)
const PHI_V = 0.75 // geser
const LAMBDA = 1.0 // beton normal

export interface PileCapInput {
  /** 'pu' = beban kolom terfaktor; 'kapasitas' = kapasitas terfaktor tiap tiang. */
  mode: 'pu' | 'kapasitas'
  /** kN & kNm. */
  Pu: number
  Mux: number
  Muy: number
  Q: number
  /** Jumlah tiang 2–6 (dari select, boleh teks). */
  n: number | string
  /** Diameter tiang, spasi, overhang pusat→tepi (mm). */
  dp: number
  s: number
  ov: number
  /** Kolom, tebal poer, selimut ke pusat tulangan bawah (mm). */
  cx: number
  cy: number
  h: number
  cov: number
  fc: number
  fy: number
  /** Diameter tulangan lentur (mm, dari select). */
  db: number | string
}

export interface PilePosition {
  x: number
  y: number
}

export interface CapFlexure {
  /** Lebar & tinggi efektif penampang (mm), muka kolom. */
  b: number
  d: number
  face: number
  /** Momen sisi +/− (kN·mm). */
  Mp: number
  Mm: number
  Mu: number
  Rn: number
  over?: boolean
  rho: number
  AsReq: number
  rhoMin: number
  AsMin: number
  AsMinGov: boolean
  As: number
  nBar: number
  AsProv: number
  spacing: number
  sMax: number
  a: number
  /** kNm */
  phiMn: number
  dc: number
}

export interface CapOneWay {
  d: number
  b: number
  crit: number
  Vu: number
  Vc: number
  phiVc: number
  dc: number
}

export interface CapPunchColumn {
  d: number
  b0: number
  bx: number
  by: number
  Vu: number
  beta: number
  vc: number
  Vc: number
  phiVc: number
  dc: number
}

export interface CapPunchPile {
  i?: number
  d: number
  a: number
  b0: number
  sides?: number
  alphaS?: number
  vc?: number
  Vc?: number
  phiVc: number
  Vu: number
  dc: number
}

export interface PileCapResult {
  warn: string[]
  valid: boolean
  n?: number
  fc?: number
  fy?: number
  dp?: number
  s?: number
  ov?: number
  cx?: number
  cy?: number
  h?: number
  cov?: number
  db?: number
  Ab?: number
  mode?: string
  piles?: PilePosition[]
  spanX?: number
  spanY?: number
  /** Dimensi poer (mm). */
  Lx?: number
  Ly?: number
  cantX?: number
  cantY?: number
  /** Tulangan arah X di lapis luar. */
  xOuter?: boolean
  dx?: number
  dy?: number
  davg?: number
  Sx2?: number
  Sy2?: number
  Q?: number
  Pu?: number
  Ptot?: number
  Mux?: number
  Muy?: number
  /** Reaksi tiang (kN). */
  R?: number[]
  Rmax?: number
  Rmin?: number
  flexX?: CapFlexure
  flexY?: CapFlexure
  vx?: CapOneWay
  vy?: CapOneWay
  punchCol?: CapPunchColumn
  punchPile?: CapPunchPile
  checks?: { name: string; dc: number }[]
  gov?: { name: string; dc: number }
  ok?: boolean
}

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x)

/** Susunan tiang (mm), origin di titik berat = pusat kolom. */
export function pileLayout(n: number, s: number): PilePosition[] {
  if (n === 2) return [{ x: -s / 2, y: 0 }, { x: s / 2, y: 0 }]
  if (n === 3) {
    const R = s / Math.sqrt(3) // jari-jari lingkar segitiga sama sisi
    return [{ x: 0, y: R }, { x: -s / 2, y: -R / 2 }, { x: s / 2, y: -R / 2 }]
  }
  if (n === 4) return [{ x: -s / 2, y: -s / 2 }, { x: s / 2, y: -s / 2 }, { x: -s / 2, y: s / 2 }, { x: s / 2, y: s / 2 }]
  if (n === 5) return [{ x: -s / 2, y: -s / 2 }, { x: s / 2, y: -s / 2 }, { x: -s / 2, y: s / 2 }, { x: s / 2, y: s / 2 }, { x: 0, y: 0 }]
  // 6: 2 baris × 3 kolom
  return [{ x: -s, y: -s / 2 }, { x: 0, y: -s / 2 }, { x: s, y: -s / 2 }, { x: -s, y: s / 2 }, { x: 0, y: s / 2 }, { x: s, y: s / 2 }]
}

type Ready = Required<Pick<PileCapResult, 'n' | 'piles' | 'R' | 'cx' | 'cy' | 'Lx' | 'Ly' | 'dx' | 'dy' | 'davg' | 'h' | 'cov' | 'fc' | 'fy' | 'Ab' | 'dp'>>

export function computePileCap(v: PileCapInput): PileCapResult {
  const r: PileCapResult = { warn: [], valid: true }
  const n = parseInt(String(v.n), 10)
  const { fc, fy, dp, s, ov, cx, cy, h, cov } = v
  const db = parseFloat(String(v.db))
  if (!(fc > 0) || !(fy > 0) || !(dp > 0) || !(s > 0) || !(ov > 0) ||
      !(cx > 0) || !(cy > 0) || !(h > 0) || !(cov >= 0)) { r.valid = false; return r }
  Object.assign(r, { n, fc, fy, dp, s, ov, cx, cy, h, cov, db, Ab: barArea(db), mode: v.mode })

  if (s < 2.5 * dp) r.warn.push('Spasi tiang s = ' + s.toFixed(0) + ' mm < 2,5·dp (' +
    (2.5 * dp).toFixed(0) + ' mm) — jarak antar tiang lazimnya ≥ 2,5–3·dp.')
  if (ov < dp / 2 + 50) r.warn.push('Overhang tepi ' + ov.toFixed(0) + ' mm terlalu kecil — jarak pusat tiang ke tepi poer sebaiknya ≥ dp/2 + selimut.')

  // Geometri poer dari bounding box tiang + overhang.
  const P = pileLayout(n, s)
  r.piles = P
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  Object.assign(r, { spanX, spanY, Lx: spanX + 2 * ov, Ly: spanY + 2 * ov })

  // Tinggi efektif dua lapis; lapis luar ke arah kantilever terbesar.
  const cantX = Math.max(...xs.map(Math.abs)) - cx / 2
  const cantY = Math.max(...ys.map(Math.abs)) - cy / 2
  r.cantX = cantX
  r.cantY = cantY
  const dOut = h - cov - db / 2
  const dIn = h - cov - 1.5 * db
  if (dIn <= 0) { r.valid = false; r.warn.push('Tebal poer terlalu kecil dibanding selimut + tulangan.'); return r }
  const xOuter = cantX >= cantY
  const dx = xOuter ? dOut : dIn, dy = xOuter ? dIn : dOut
  Object.assign(r, { xOuter, dx, dy, davg: (dx + dy) / 2 })

  // Reaksi tiang.
  const Sx2 = xs.reduce((a, x) => a + x * x, 0)
  const Sy2 = ys.reduce((a, y) => a + y * y, 0)
  r.Sx2 = Sx2
  r.Sy2 = Sy2
  const R: number[] = []
  if (v.mode === 'kapasitas') {
    const Q = v.Q
    if (!(Q > 0)) { r.valid = false; return r }
    Object.assign(r, { Q, Ptot: n * Q, Mux: 0, Muy: 0 })
    for (let i = 0; i < n; i++) R.push(Q)
  } else {
    const Pu = v.Pu, Mux = v.Mux || 0, Muy = v.Muy || 0
    if (!(Pu > 0)) { r.valid = false; return r }
    Object.assign(r, { Pu, Mux, Muy, Ptot: Pu })
    if (Math.abs(Mux) > 1e-6 && Sy2 < 1e-6)
      r.warn.push('Susunan tiang tidak punya lengan arah-Y → Mux tak dapat ditahan kopel tiang (diabaikan).')
    if (Math.abs(Muy) > 1e-6 && Sx2 < 1e-6)
      r.warn.push('Susunan tiang tidak punya lengan arah-X → Muy tak dapat ditahan kopel tiang (diabaikan).')
    for (let j = 0; j < n; j++) {
      R.push(Pu / n +
        (Sx2 > 1e-6 ? (Muy * 1000 * P[j].x) / Sx2 : 0) +
        (Sy2 > 1e-6 ? (Mux * 1000 * P[j].y) / Sy2 : 0))
    }
  }
  r.R = R
  r.Rmax = Math.max(...R)
  r.Rmin = Math.min(...R)
  if (r.Rmin < -1e-6) r.warn.push('Reaksi tiang minimum negatif (' + r.Rmin.toFixed(1) +
    ' kN) → tiang tertarik (cabut). Perlu tiang tahan tarik / perbesar susunan.')

  const rr = r as PileCapResult & Ready
  r.flexX = flexure(rr, 'x')
  r.flexY = flexure(rr, 'y')
  r.vx = oneWay(rr, 'x')
  r.vy = oneWay(rr, 'y')
  r.punchCol = punchColumn(rr)
  r.punchPile = punchPile(rr)

  const checks = [
    { name: 'Lentur X', dc: r.flexX.dc }, { name: 'Lentur Y', dc: r.flexY.dc },
    { name: 'Geser 1-arah X', dc: r.vx.dc }, { name: 'Geser 1-arah Y', dc: r.vy.dc },
    { name: 'Pons kolom', dc: r.punchCol.dc }, { name: 'Pons tiang', dc: r.punchPile.dc },
  ]
  r.checks = checks
  r.gov = checks.reduce((a, b) => (b.dc > a.dc ? b : a))
  r.ok = r.gov.dc <= 1.0 && r.Rmin >= -1e-6
  return r
}

/** Lentur di muka kolom; axis 'x' → tulangan sejajar X, momen dari tiang dengan |x| > cx/2, lebar b = Ly. */
function flexure(r: Ready, axis: 'x' | 'y'): CapFlexure {
  const isX = axis === 'x'
  const face = (isX ? r.cx : r.cy) / 2
  const b = isX ? r.Ly : r.Lx
  const d = isX ? r.dx : r.dy
  let Mp = 0, Mm = 0 // kN·mm
  for (let i = 0; i < r.n; i++) {
    const c = isX ? r.piles[i].x : r.piles[i].y
    if (c > face) Mp += r.R[i] * (c - face)
    else if (c < -face) Mm += r.R[i] * (-face - c)
  }
  const Mu = Math.max(Mp, Mm)
  const Rn = flexuralRn(Mu * 1e3, PHI_F, b, d)
  const { disc, rho: rhoOk } = rhoFromRn(Rn, r.fc, r.fy)
  const over = disc < 0
  const rho = over ? NaN : rhoOk
  const AsReq = over ? Infinity : rhoOk * b * d
  const rhoMin = rhoShrinkage(r.fy)
  const AsMin = rhoMin * b * r.h
  const As = Math.max(Number.isFinite(AsReq) ? AsReq : 0, AsMin)
  const nBar = Math.max(2, Math.ceil(As / r.Ab))
  const AsProv = nBar * r.Ab
  const a = (AsProv * r.fy) / (0.85 * r.fc * b)
  const phiMn = (PHI_F * AsProv * r.fy * (d - a / 2)) / 1e6 // kNm
  const o: CapFlexure = {
    b, d, face, Mp, Mm, Mu, Rn, rho, AsReq, rhoMin, AsMin, AsMinGov: AsReq < AsMin, As, nBar, AsProv,
    spacing: nBar > 1 ? (b - 2 * r.cov) / (nBar - 1) : 0, sMax: Math.min(3 * r.h, 450), a, phiMn,
    dc: phiMn > 0 ? Mu / 1e3 / phiMn : Infinity,
  }
  if (over) o.over = true
  return o
}

/** Fraksi reaksi tiang yang diperhitungkan pada penampang kritis critC (sisi +). */
const fracOneWay = (pileC: number, critC: number, dp: number): number => clamp(0.5 + (pileC - critC) / dp, 0, 1)

function oneWay(r: Ready, axis: 'x' | 'y'): CapOneWay {
  const isX = axis === 'x'
  const face = (isX ? r.cx : r.cy) / 2
  const d = isX ? r.dx : r.dy
  const b = isX ? r.Ly : r.Lx
  const critP = face + d, critM = -(face + d)
  let Vp = 0, Vm = 0
  for (let i = 0; i < r.n; i++) {
    const c = isX ? r.piles[i].x : r.piles[i].y
    Vp += r.R[i] * fracOneWay(c, critP, r.dp)
    Vm += r.R[i] * fracOneWay(-c, -critM, r.dp) // cermin sisi −
  }
  const Vu = Math.max(Vp, Vm)
  const Vc = oneWayVc(r.fc, b, d, LAMBDA) / 1e3
  const phiVc = PHI_V * Vc
  return { d, b, crit: critP, Vu, Vc, phiVc, dc: phiVc > 0 ? Vu / phiVc : Infinity }
}

function punchColumn(r: Ready): CapPunchColumn {
  const d = r.davg
  const bx = r.cx + d, by = r.cy + d
  const b0 = 2 * (bx + by)
  let Vu = 0 // reaksi tiang di luar keliling kritis (fraksi)
  for (let i = 0; i < r.n; i++) {
    const outSigned = Math.max(Math.abs(r.piles[i].x) - bx / 2, Math.abs(r.piles[i].y) - by / 2)
    Vu += r.R[i] * clamp(0.5 + outSigned / r.dp, 0, 1)
  }
  const beta = Math.max(r.cx, r.cy) / Math.min(r.cx, r.cy)
  const { vc } = punchingVc(r.fc, beta, 40, d, b0, LAMBDA) // kolom interior αs = 40
  const Vc = (vc * b0 * d) / 1e3
  const phiVc = PHI_V * Vc
  return { d, b0, bx, by, Vu, beta, vc, Vc, phiVc, dc: phiVc > 0 ? Vu / phiVc : Infinity }
}

/** Pons tiang terkritis; keliling dipangkas tepi poer, αs = 40/30/20 menurut sisi yang hilang. */
function punchPile(r: Ready): CapPunchPile {
  const d = r.davg
  const a = 0.886 * r.dp
  const he = a / 2 + d / 2
  let best: CapPunchPile | null = null
  for (let i = 0; i < r.n; i++) {
    const px = r.piles[i].x, py = r.piles[i].y
    const xl = px - he, xr = px + he, yb = py - he, yt = py + he
    const HX = r.Lx / 2, HY = r.Ly / 2
    let sides = 0, b0 = 0
    if (xl >= -HX) { b0 += Math.min(yt, HY) - Math.max(yb, -HY); sides++ }
    if (xr <= HX) { b0 += Math.min(yt, HY) - Math.max(yb, -HY); sides++ }
    if (yb >= -HY) { b0 += Math.min(xr, HX) - Math.max(xl, -HX); sides++ }
    if (yt <= HY) { b0 += Math.min(xr, HX) - Math.max(xl, -HX); sides++ }
    if (b0 <= 0) continue
    const missing = 4 - sides
    const alphaS = missing >= 2 ? 20 : missing === 1 ? 30 : 40
    const { vc } = punchingVc(r.fc, null, alphaS, d, b0, LAMBDA)
    const Vc = (vc * b0 * d) / 1e3
    const phiVc = PHI_V * Vc
    const dc = phiVc > 0 ? r.R[i] / phiVc : Infinity
    if (!best || dc > best.dc) best = { i, d, a, b0, sides, alphaS, vc, Vc, phiVc, Vu: r.R[i], dc }
  }
  return best || { d, a, b0: 0, Vu: 0, phiVc: 0, dc: Infinity }
}
