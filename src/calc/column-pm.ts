// Diagram/permukaan interaksi P–M kolom, uniaksial & biaksial — SNI 2847:2019. Penampang persegi, lingkaran, L, T.
// Port 1:1 dari modules/column-pm/module.js (compute), diverifikasi golden test.
//
//   Penampang = poligon (lingkaran: 128 sisi) dipusatkan di sentroid geometris. Untuk tiap arah sumbu netral θ dan
//   kedalaman c: ε = 0,003(c − u)/c, fs klem ±fy, baja di blok tekan dikoreksi −0,85f'c; blok a = β1·c hasil clip
//   Sutherland–Hodgman (berlaku cembung/cekung). φ dari εt baja terjauh (0,65/0,75 → 0,90); φPn ≤ φ·(0,80|0,85)·Po.
//   Cek biaksial: iris permukaan desain di P = Pu → kontur; D/C = |Mu|/|Mkap| pada arah atan2(Muy, Mux).
// TIDAK termasuk: kelangsingan/orde-2 (Mu sudah diperbesar), detail gempa, sentroid plastis untuk L/T.
// Urutan operasi sengaja identik dengan build lama (banyak nilai mendekati nol yang peka pembulatan).

import { beta1 } from './shared/concrete'
import { numFinite as num, type NumLike } from './shared/num'

const ES = 200000
const ECU = 0.003
const CIRC_SIDES = 128
/** Resolusi permukaan: jumlah meridian θ dan kedalaman c. */
const NTH = 48, NC = 34

export type ColumnShape = 'rect' | 'circle' | 'L' | 'T'
export type ColumnTie = 'tie' | 'spiral'

export interface Pt {
  x: number
  y: number
}

export interface Bar extends Pt {
  As: number
}

export interface ColumnPMInput {
  shape?: ColumnShape
  /** Persegi/L/T: B × H; L: tx, ty; T: bw, tf; lingkaran: D (mm). */
  b: NumLike
  h: NumLike
  D: NumLike
  tx: NumLike
  ty: NumLike
  bw: NumLike
  tf: NumLike
  /** Selimut ke pusat tulangan (mm). */
  dp: NumLike
  fc: NumLike
  fy: NumLike
  db: NumLike
  /** Persegi: batang per muka; lingkaran: jumlah; L/T: spasi maksimum keliling (mm). */
  nx: NumLike
  ny: NumLike
  ncirc: NumLike
  spac: NumLike
  tie?: ColumnTie
  /** kN & kNm. */
  Pu: NumLike
  Mux: NumLike
  Muy: NumLike
}

export type SectionRing = { type: 'circle'; r: number } | { type: 'poly'; pts: Pt[] }

export interface SurfacePoint {
  /** Desain (φ): kNm & kN. */
  Mx: number
  My: number
  P: number
  /** Nominal. */
  nMx?: number
  nMy?: number
  nP?: number
  phi?: number
  c?: number
}

export interface ContourPoint {
  Mx: number
  My: number
  m: number
}

export interface ColumnPMResult {
  valid: boolean
  warn: string[]
  shape: ColumnShape
  fc: number
  fy: number
  db: number
  tie: ColumnTie
  Pu: number
  Mux: number
  Muy: number
  dp: number
  b?: number
  h?: number
  tx?: number
  ty?: number
  bw?: number
  tf?: number
  D?: number
  ncirc?: number
  nx?: number
  ny?: number
  Abar?: number
  nBars?: number
  Ast?: number
  Ag?: number
  rho?: number
  beta1?: number
  ety?: number
  bars?: Bar[]
  poly?: Pt[]
  /** Outline inset sejauh t (gambar sengkang ilustratif); null untuk persegi. */
  ring?: ((t: number) => SectionRing) | null
  Po?: number
  PnMax?: number
  phiPnMax?: number
  alphaMax?: number
  phiC?: number
  Pnt?: number
  phiPnt?: number
  /** Permukaan desain: [θ][titik] dari tarik murni ke plafon aksial. */
  surf?: SurfacePoint[][]
  cBalX?: number
  MbalX?: number
  PbalX?: number
  cBalY?: number
  MbalY?: number
  PbalY?: number
  M0x?: number
  M0y?: number
  Mu?: number
  contour?: ContourPoint[]
  capM?: ContourPoint | null
  dc?: number | null
}

interface Geo {
  poly: Pt[]
  fc: number
  fy: number
  beta1: number
  bars: Bar[]
}

interface Section {
  shape: ColumnShape
  valid: boolean
  errors: string[]
  poly?: Pt[]
  bars?: Bar[]
  ring?: ((t: number) => SectionRing) | null
  b?: number
  h?: number
  tx?: number
  ty?: number
  bw?: number
  tf?: number
  D?: number
  ncirc?: number
  nx?: number
  ny?: number
}

const translatePoly = (poly: Pt[], dx: number, dy: number): Pt[] => poly.map((p) => ({ x: p.x + dx, y: p.y + dy }))

/** L: kaki vertikal (tx × H) + kaki horizontal (B × ty), notch di kanan-atas. */
const lRaw = (B: number, H: number, tx: number, ty: number): Pt[] =>
  [{ x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: ty }, { x: tx, y: ty }, { x: tx, y: H }, { x: 0, y: H }]

/** T: sayap (B × tf) di atas + badan (bw × (H − tf)) di tengah. */
function tRaw(B: number, H: number, bw: number, tf: number): Pt[] {
  const x0 = (B - bw) / 2, x1 = (B + bw) / 2
  return [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: H - tf }, { x: B, y: H - tf },
    { x: B, y: H }, { x: 0, y: H }, { x: 0, y: H - tf }, { x: x0, y: H - tf }]
}

/** Batang di tiap sudut poligon inset + disisipi agar spasi keliling ≤ maxSpacing (L & T). */
function perimeterBars(poly: Pt[], maxSpacing: number, Abar: number): Bar[] {
  const bars: Bar[] = [], n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]
    bars.push({ x: a.x, y: a.y, As: Abar })
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy)
    const nseg = Math.max(1, Math.ceil(len / maxSpacing))
    for (let k = 1; k < nseg; k++) {
      const t = k / nseg
      bars.push({ x: a.x + dx * t, y: a.y + dy * t, As: Abar })
    }
  }
  return bars
}

/** Pola keliling simetris nx × ny (persegi), relatif sentroid. */
function barList(b: number, h: number, dp: number, nx: number, ny: number, Abar: number): Bar[] {
  const bars: Bar[] = [], xe = b / 2 - dp, ye = h / 2 - dp
  nx = Math.max(2, Math.round(nx))
  ny = Math.max(2, Math.round(ny))
  for (let i = 0; i < nx; i++) {
    const x = nx === 1 ? 0 : -xe + (2 * xe * i) / (nx - 1)
    bars.push({ x, y: ye, As: Abar })
    bars.push({ x, y: -ye, As: Abar })
  }
  for (let i = 1; i < ny - 1; i++) {
    const y = -ye + (2 * ye * i) / (ny - 1)
    bars.push({ x: -xe, y, As: Abar })
    bars.push({ x: xe, y, As: Abar })
  }
  return bars
}

function buildSection(v: ColumnPMInput, Abar: number): Section {
  const shape = v.shape || 'rect'
  const dp = num(v.dp)
  const out: Section = { shape, valid: true, errors: [] }

  if (shape === 'circle') {
    const D = num(v.D), ncirc = Math.max(4, Math.round(num(v.ncirc)))
    if (D <= 0 || dp <= 0 || dp >= D / 2) {
      out.valid = false
      out.errors.push("Lengkapi diameter D dan d' (0 < d' < D/2).")
      return out
    }
    const poly: Pt[] = []
    for (let i = 0; i < CIRC_SIDES; i++) {
      const a = (2 * Math.PI * i) / CIRC_SIDES
      poly.push({ x: (D / 2) * Math.cos(a), y: (D / 2) * Math.sin(a) })
    }
    const Rb = D / 2 - dp, bars: Bar[] = []
    for (let j = 0; j < ncirc; j++) {
      const ang = Math.PI / 2 + (2 * Math.PI * j) / ncirc
      bars.push({ x: Rb * Math.cos(ang), y: Rb * Math.sin(ang), As: Abar })
    }
    return { ...out, poly, bars, D, ncirc, ring: (t) => ({ type: 'circle', r: Math.max(1, D / 2 - t) }) }
  }

  if (shape === 'L') {
    const b = num(v.b), h = num(v.h), tx = num(v.tx), ty = num(v.ty)
    if (b <= 0 || h <= 0 || tx <= 0 || ty <= 0 || tx >= b || ty >= h || dp <= 0 || 2 * dp >= tx || 2 * dp >= ty) {
      out.valid = false
      out.errors.push("Lengkapi B, H, tx, ty, d' (0 < tx < B, 0 < ty < H, d' < tx/2 dan ty/2).")
      return out
    }
    const cg = polyProps(lRaw(b, h, tx, ty))
    const inset = translatePoly(lRaw(b - 2 * dp, h - 2 * dp, tx - 2 * dp, ty - 2 * dp), dp, dp)
    return {
      ...out, b, h, tx, ty,
      poly: translatePoly(lRaw(b, h, tx, ty), -cg.cx, -cg.cy),
      bars: perimeterBars(translatePoly(inset, -cg.cx, -cg.cy), Math.max(30, num(v.spac) || 200), Abar),
      ring: (t) => ({ type: 'poly', pts: translatePoly(translatePoly(lRaw(b - 2 * t, h - 2 * t, tx - 2 * t, ty - 2 * t), t, t), -cg.cx, -cg.cy) }),
    }
  }

  if (shape === 'T') {
    const B = num(v.b), H = num(v.h), bw = num(v.bw), tf = num(v.tf)
    if (B <= 0 || H <= 0 || bw <= 0 || tf <= 0 || bw >= B || tf >= H || dp <= 0 || 2 * dp >= bw || 2 * dp >= tf) {
      out.valid = false
      out.errors.push("Lengkapi B, H, bw, tf, d' (0 < bw < B, 0 < tf < H, d' < bw/2 dan tf/2).")
      return out
    }
    const cg = polyProps(tRaw(B, H, bw, tf))
    const inset = translatePoly(tRaw(B - 2 * dp, H - 2 * dp, bw - 2 * dp, tf - 2 * dp), dp, dp)
    return {
      ...out, b: B, h: H, bw, tf,
      poly: translatePoly(tRaw(B, H, bw, tf), -cg.cx, -cg.cy),
      bars: perimeterBars(translatePoly(inset, -cg.cx, -cg.cy), Math.max(30, num(v.spac) || 200), Abar),
      ring: (t) => ({ type: 'poly', pts: translatePoly(translatePoly(tRaw(B - 2 * t, H - 2 * t, bw - 2 * t, tf - 2 * t), t, t), -cg.cx, -cg.cy) }),
    }
  }

  // Persegi (default).
  const b = num(v.b), h = num(v.h)
  const nx = Math.max(2, Math.round(num(v.nx))), ny = Math.max(2, Math.round(num(v.ny)))
  if (b <= 0 || h <= 0 || dp <= 0 || dp >= Math.min(b, h) / 2) {
    out.valid = false
    out.errors.push("Lengkapi dimensi, material, dan d' (0 < d' < sisi terkecil/2).")
    return out
  }
  return {
    ...out, b, h, nx, ny, ring: null, // persegi: roundRect ilustratif di UI
    poly: [{ x: -b / 2, y: -h / 2 }, { x: b / 2, y: -h / 2 }, { x: b / 2, y: h / 2 }, { x: -b / 2, y: h / 2 }],
    bars: barList(b, h, dp, nx, ny, Abar),
  }
}

/** Label penampang untuk tampilan/laporan. */
export function sectionLabel(r: ColumnPMResult): string {
  if (r.shape === 'circle') return 'D' + r.D
  if (r.shape === 'L') return 'L ' + r.b + '×' + r.h + ' (tx' + r.tx + '/ty' + r.ty + ')'
  if (r.shape === 'T') return 'T ' + r.b + '×' + r.h + ' (bw' + r.bw + '/tf' + r.tf + ')'
  return r.b + '×' + r.h
}

/** Clip poligon terhadap halfplane p·n ≥ k (Sutherland–Hodgman). */
function clipPoly(poly: Pt[], n: Pt, k: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const da = a.x * n.x + a.y * n.y - k
    const db = b.x * n.x + b.y * n.y - k
    if (da >= 0) out.push(a)
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db)
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
    }
  }
  return out
}

/** Luas + centroid (shoelace, berlaku CW/CCW). */
export function polyProps(poly: Pt[]): { A: number; cx: number; cy: number } {
  let A = 0, cx = 0, cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    const cr = p.x * q.y - q.x * p.y
    A += cr
    cx += (p.x + q.x) * cr
    cy += (p.y + q.y) * cr
  }
  A /= 2
  if (Math.abs(A) < 1e-9) return { A: 0, cx: 0, cy: 0 }
  return { A: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) }
}

/** Satu titik permukaan nominal untuk (θ, c): N & N·mm terhadap sentroid. */
function pointAt(theta: number, c: number, geo: Geo) {
  const n = { x: Math.cos(theta), y: Math.sin(theta) }
  let umax = -Infinity, umin = Infinity
  for (const p of geo.poly) {
    const d = p.x * n.x + p.y * n.y
    if (d > umax) umax = d
    if (d < umin) umin = d
  }
  const extent = umax - umin
  const a = Math.min(geo.beta1 * c, extent)
  const pp = polyProps(clipPoly(geo.poly, n, umax - a)) // blok tekan u ≤ a
  const Cc = 0.85 * geo.fc * pp.A
  let P = Cc, Mx = Cc * pp.cy, My = Cc * pp.cx
  let uTmax = -Infinity // baja tarik terjauh
  for (const bar of geo.bars) {
    const u = umax - (bar.x * n.x + bar.y * n.y)
    if (u > uTmax) uTmax = u
    const eps = (ECU * (c - u)) / c
    const fs = Math.max(-geo.fy, Math.min(geo.fy, eps * ES))
    const fsEff = u <= a ? fs - 0.85 * geo.fc : fs
    const F = bar.As * fsEff
    P += F
    Mx += F * bar.y
    My += F * bar.x
  }
  return { P, Mx, My, epsT: (ECU * (uTmax - c)) / c, extent }
}

/** Kedalaman baja tarik terjauh dari serat tekan pada arah θ. */
function farthestSteelDepth(theta: number, geo: Geo): number {
  const n = { x: Math.cos(theta), y: Math.sin(theta) }
  let umax = -Infinity
  for (const p of geo.poly) { const d = p.x * n.x + p.y * n.y; if (d > umax) umax = d }
  let dt = -Infinity
  for (const bar of geo.bars) { const u = umax - (bar.x * n.x + bar.y * n.y); if (u > dt) dt = u }
  return dt
}

/** Jarak pusat-ke-pusat terkecil antar batang. */
function minBarGap(bars: Bar[]): number {
  let m = Infinity
  for (let i = 0; i < bars.length; i++)
    for (let j = i + 1; j < bars.length; j++) {
      const dx = bars[i].x - bars[j].x, dy = bars[i].y - bars[j].y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < m) m = d
    }
  return m
}

/** φ dari regangan tarik neto (Tabel 21.2.2). */
export function phiOf(epsT: number, ety: number, tie: ColumnTie): number {
  const lo = tie === 'spiral' ? 0.75 : 0.65
  if (epsT <= ety) return lo
  if (epsT >= ety + 0.003) return 0.9
  return lo + ((0.9 - lo) * (epsT - ety)) / 0.003
}

function angDiff(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** Momen saat P = 0 sepanjang meridian θ (interpolasi). */
function zeroCross(geo: Geo, theta: number, key: 'Mx' | 'My'): number {
  let prev: ReturnType<typeof pointAt> | null = null
  for (let i = 0; i < 60; i++) {
    const ext = pointAt(theta, 1, geo).extent
    const c = 0.03 * ext * Math.pow(80, i / 59)
    const p = pointAt(theta, c, geo)
    if (prev && prev.P <= 0 && p.P > 0) {
      const t = (0 - prev.P) / (p.P - prev.P)
      const M = key === 'Mx' ? prev.Mx + t * (p.Mx - prev.Mx) : prev.My + t * (p.My - prev.My)
      return M / 1e6
    }
    prev = p
  }
  return 0
}

export function computeColumnPM(v: ColumnPMInput): ColumnPMResult {
  const shape = v.shape || 'rect'
  const fc = num(v.fc), fy = num(v.fy), db = num(v.db)
  const tie = v.tie || 'tie'
  const Pu = num(v.Pu), Mux = num(v.Mux), Muy = num(v.Muy)
  const r: ColumnPMResult = { valid: false, warn: [], shape, fc, fy, db, tie, Pu, Mux, Muy, dp: num(v.dp) }

  if (fc <= 0 || fy <= 0 || db <= 0 || num(v.dp) <= 0) {
    r.warn.push("Lengkapi mutu material, diameter tulangan, dan d'.")
    return r
  }
  const Abar = (Math.PI * db * db) / 4
  const sec = buildSection(v, Abar)
  if (!sec.valid) {
    r.warn.push(sec.errors[0] || 'Lengkapi dimensi penampang.')
    return r
  }
  for (const k of ['b', 'h', 'tx', 'ty', 'bw', 'tf', 'D', 'ncirc', 'nx', 'ny'] as const) {
    if (sec[k] !== undefined) r[k] = sec[k]
  }
  const poly = sec.poly as Pt[], bars = sec.bars as Bar[]
  const nBars = bars.length
  const Ast = nBars * Abar
  const Ag = polyProps(poly).A
  const rho = Ast / Ag
  const b1 = beta1(fc)
  const ety = fy / ES
  Object.assign(r, { Abar, nBars, Ast, Ag, rho, beta1: b1, ety, bars, poly, ring: sec.ring })
  const geo: Geo = { poly, fc, fy, beta1: b1, bars }

  // Titik acuan.
  const Po = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1000
  const alphaMax = tie === 'spiral' ? 0.85 : 0.8
  const phiC = tie === 'spiral' ? 0.75 : 0.65
  const phiPnMax = phiC * alphaMax * Po
  const Pnt = (-fy * Ast) / 1000
  const phiPnt = 0.9 * Pnt
  Object.assign(r, { Po, PnMax: alphaMax * Po, phiPnMax, alphaMax, phiC, Pnt, phiPnt })

  // Permukaan desain: grid θ × c (c spasi logaritmik).
  const surf: SurfacePoint[][] = []
  for (let it = 0; it <= NTH; it++) {
    const th = (2 * Math.PI * it) / NTH
    const row: SurfacePoint[] = [{ Mx: 0, My: 0, P: phiPnt }]
    const ext = pointAt(th, 1, geo).extent
    for (let ic = 0; ic < NC; ic++) {
      const c = 0.04 * ext * Math.pow((2.4 * ext) / (0.04 * ext), ic / (NC - 1))
      const p = pointAt(th, c, geo)
      const phi = phiOf(p.epsT, ety, tie)
      row.push({
        Mx: (phi * p.Mx) / 1e6, My: (phi * p.My) / 1e6, P: Math.min((phi * p.P) / 1000, phiPnMax),
        nMx: p.Mx / 1e6, nMy: p.My / 1e6, nP: p.P / 1000, phi, c,
      })
    }
    row.push({ Mx: 0, My: 0, P: phiPnMax })
    surf.push(row)
  }
  r.surf = surf

  // Titik seimbang uniaksial (θ = 90°: lentur thd sumbu-x; θ = 0: thd sumbu-y).
  const dtX = farthestSteelDepth(Math.PI / 2, geo)
  const cBalX = (ECU / (ECU + ety)) * dtX
  const pbX = pointAt(Math.PI / 2, cBalX, geo)
  const dtY = farthestSteelDepth(0, geo)
  const cBalY = (ECU / (ECU + ety)) * dtY
  const pbY = pointAt(0, cBalY, geo)
  Object.assign(r, {
    cBalX, MbalX: pbX.Mx / 1e6, PbalX: pbX.P / 1000, cBalY, MbalY: pbY.My / 1e6, PbalY: pbY.P / 1000,
    M0x: zeroCross(geo, Math.PI / 2, 'Mx'), M0y: zeroCross(geo, 0, 'My'),
  })

  // Cek biaksial: iris permukaan di P = Pu.
  let dc: number | null = null
  let capM: ContourPoint | null = null
  let contour: ContourPoint[] = []
  const Mu = Math.sqrt(Mux * Mux + Muy * Muy)
  r.Mu = Mu
  if (Pu > phiPnMax) {
    dc = Pu / phiPnMax
    r.warn.push('Pu = ' + Pu.toFixed(0) + ' kN > plafon φPn,maks = ' + phiPnMax.toFixed(0) + ' kN — aksial saja sudah NG.')
  } else if (Pu < phiPnt) {
    dc = Math.abs(Pu / phiPnt)
    r.warn.push('Pu tarik melampaui φPnt.')
  } else {
    const sparse: (ContourPoint | undefined)[] = []
    for (let jt = 0; jt < NTH; jt++) {
      const rowj = surf[jt]
      for (let jc = 0; jc < rowj.length - 1; jc++) {
        const p1 = rowj[jc], p2 = rowj[jc + 1]
        if ((p1.P - Pu) * (p2.P - Pu) <= 0 && p2.P !== p1.P) {
          const t = (Pu - p1.P) / (p2.P - p1.P)
          const Mxi = p1.Mx + t * (p2.Mx - p1.Mx)
          const Myi = p1.My + t * (p2.My - p1.My)
          const mm = Math.sqrt(Mxi * Mxi + Myi * Myi) // cabang luar permukaan
          const cur = sparse[jt]
          if (!cur || mm > cur.m) sparse[jt] = { Mx: Mxi, My: Myi, m: mm }
        }
      }
    }
    contour = sparse.filter((x): x is ContourPoint => !!x)
    if (contour.length >= 8 && Mu > 0.001) {
      const beta = Math.atan2(Muy, Mux)
      let best: number | null = null
      for (let kk = 0; kk < contour.length; kk++) {
        const q1 = contour[kk], q2 = contour[(kk + 1) % contour.length]
        const d1 = angDiff(beta, Math.atan2(q1.My, q1.Mx)), d2 = angDiff(beta, Math.atan2(q2.My, q2.Mx))
        if (d1 * d2 <= 0 && Math.abs(d1) < 1 && Math.abs(d2) < 1) {
          const tt = Math.abs(d1) + Math.abs(d2) < 1e-12 ? 0 : Math.abs(d1) / (Math.abs(d1) + Math.abs(d2))
          const Mxc = q1.Mx + tt * (q2.Mx - q1.Mx)
          const Myc = q1.My + tt * (q2.My - q1.My)
          best = Math.sqrt(Mxc * Mxc + Myc * Myc)
          capM = { Mx: Mxc, My: Myc, m: best }
          break
        }
      }
      if (best) dc = Mu / best
    } else if (Mu <= 0.001) {
      dc = Pu > 0 ? Pu / phiPnMax : 0
    }
  }
  Object.assign(r, { contour, capM, dc, valid: true })

  if (rho < 0.01) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% < 1% (Ps. 10.6.1.1) — tambah tulangan.')
  if (rho > 0.08) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% > 8% — melampaui batas maksimum.')
  else if (rho > 0.04) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% > 4% — sulit di sambungan lewatan (praktik).')
  if (shape === 'rect') {
    const nx = r.nx as number
    const clear = ((r.b as number) - 2 * r.dp) / Math.max(1, nx - 1) - db
    if (nx > 1 && clear < Math.max(40, 1.5 * db))
      r.warn.push('Spasi bersih antar batang muka lebar ≈ ' + clear.toFixed(0) + ' mm < maks(40, 1,5db) (Ps. 25.2.3).')
  } else {
    const minGap = minBarGap(bars) - db
    if (Number.isFinite(minGap) && minGap < Math.max(40, 1.5 * db))
      r.warn.push('Spasi bersih antar batang terdekat ≈ ' + minGap.toFixed(0) + ' mm < maks(40, 1,5db) (Ps. 25.2.3) — perbesar spasi maks atau kurangi jumlah batang.')
  }
  if (shape === 'circle') {
    r.warn.push('Penampang lingkaran didekati poligon ' + CIRC_SIDES + ' sisi untuk perhitungan blok tekan — galat luas < 0,1%, memadai.')
    if (tie === 'spiral' && (r.ncirc as number) < 6) r.warn.push('Jumlah batang < 6 untuk pengikat spiral (Ps. 10.7.3.1).')
    else if ((r.ncirc as number) < 4) r.warn.push('Jumlah batang < 4 (Ps. 10.7.3.1).')
  }
  if (shape === 'L' || shape === 'T')
    r.warn.push('Penampang tak-simetris: momen dihitung terhadap SENTROID GEOMETRIS beton bruto (bukan sentroid plastis) — disarankan verifikasi tambahan untuk kombinasi beban kritis pada kolom ' + shape + '.')
  if (dc != null && dc > 1) r.warn.push('D/C = ' + dc.toFixed(2) + ' > 1 — titik beban di LUAR permukaan desain.')
  r.warn.push('Kelangsingan/momen orde-2 TIDAK diperhitungkan — Mux & Muy harus sudah termasuk pembesaran momen (Ps. 6.6.4).')
  return r
}
