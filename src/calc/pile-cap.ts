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
  /** Jumlah tiang 2–6 (dari select, boleh teks); diabaikan bila `piles` diisi. */
  n: number | string
  /** Koordinat tiang (mm) relatif pusat kolom — bila diisi menggantikan susunan n/s. */
  piles?: PilePosition[]
  /** Bentuk poer: 'persegi' = bounding box + overhang (bawaan); 'poligon' = selubung cembung tiang diperlebar overhang,
   *  sudut terpangkas (mis. segitiga untuk 3 tiang). Hanya berlaku bila `piles` diisi. */
  shape?: 'persegi' | 'poligon'
  /** Diameter tiang, spasi (susunan n tiang), overhang pusat→tepi (mm). */
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
  /** Sisi penentu (poligon). */
  side?: '+' | '-'
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
  /** Tepi poer (mm) terhadap pusat kolom: bounding box tiang + overhang. */
  xlo?: number
  xhi?: number
  ylo?: number
  yhi?: number
  /** Poligon poer (mm, CCW) — persegi: 4 sudut bounding box. */
  poly?: PilePosition[]
  shape?: 'persegi' | 'poligon'
  /** Titik berat kelompok tiang (mm) & hasil kali inersia Σx'y' (mm²), tiang diukur dari titik berat. */
  xc?: number
  yc?: number
  Sxy?: number
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

/** Selubung cembung (CCW) titik-titik. */
function convexHull(pts: PilePosition[]): PilePosition[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: PilePosition, a: PilePosition, b: PilePosition) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lo: PilePosition[] = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q) }
  const up: PilePosition[] = []
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop(); up.push(q) }
  return [...lo.slice(0, -1), ...up.slice(0, -1)]
}

/** Poligon poer: selubung tiang diperlebar ov ke luar, tiap sudut dipangkas tegak lurus garis bagi pada jarak ov dari pusat tiang sudut. */
export function offsetHull(hull: PilePosition[], ov: number): PilePosition[] {
  const n = hull.length
  const out: PilePosition[] = []
  const dir = hull.map((a, i) => { const b = hull[(i + 1) % n]; const l = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / l, y: (b.y - a.y) / l } })
  const nor = dir.map((d) => ({ x: d.y, y: -d.x }))
  for (let i = 0; i < n; i++) {
    const pe = (i + n - 1) % n // sisi sebelum titik i; sisi i sesudahnya
    const v = hull[i]
    let ux = nor[pe].x + nor[i].x, uy = nor[pe].y + nor[i].y
    const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul
    const cx = v.x + ov * ux, cy = v.y + ov * uy
    // titik potong sisi (digeser ov) dengan garis pangkas
    const hit = (a: PilePosition, d: PilePosition, nn: PilePosition) => {
      const t = ((cx - a.x - ov * nn.x) * ux + (cy - a.y - ov * nn.y) * uy) / (d.x * ux + d.y * uy)
      return { x: a.x + ov * nn.x + t * d.x, y: a.y + ov * nn.y + t * d.y }
    }
    out.push(hit(hull[pe], dir[pe], nor[pe]), hit(v, dir[i], nor[i]))
  }
  return out
}

/** Panjang potongan garis vertikal x = c (axis 'x') atau horizontal y = c (axis 'y') dengan poligon cembung. */
export function chord(poly: PilePosition[], axis: 'x' | 'y', c: number): number {
  const hits: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const [a1, a2, b1, b2] = axis === 'x' ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x]
    if ((a1 - c) * (b1 - c) <= 0 && a1 !== b1) hits.push(a2 + ((c - a1) / (b1 - a1)) * (b2 - a2))
  }
  return hits.length >= 2 ? Math.max(...hits) - Math.min(...hits) : 0
}

/** Panjang ruas p→q yang berada di dalam poligon cembung CCW (Cyrus–Beck). */
export function segmentInside(poly: PilePosition[], p: PilePosition, q: PilePosition): number {
  let t0 = 0, t1 = 1
  const dx = q.x - p.x, dy = q.y - p.y
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ex = b.x - a.x, ey = b.y - a.y
    const num = ex * (p.y - a.y) - ey * (p.x - a.x) // ≥ 0 di dalam (kiri sisi CCW)
    const den = ex * dy - ey * dx
    if (Math.abs(den) < 1e-12) { if (num < 0) return 0; continue }
    const t = -num / den
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
    if (t0 > t1) return 0
  }
  return (t1 - t0) * Math.hypot(dx, dy)
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

type Ready = Required<Pick<PileCapResult, 'n' | 'piles' | 'R' | 'cx' | 'cy' | 'Lx' | 'Ly' | 'xlo' | 'xhi' | 'ylo' | 'yhi' | 'poly' | 'shape' | 'dx' | 'dy' | 'davg' | 'h' | 'cov' | 'fc' | 'fy' | 'Ab' | 'dp'>>

export function computePileCap(v: PileCapInput): PileCapResult {
  const r: PileCapResult = { warn: [], valid: true }
  const n = v.piles ? v.piles.length : parseInt(String(v.n), 10)
  const { fc, fy, dp, s, ov, cx, cy, h, cov } = v
  const db = parseFloat(String(v.db))
  if (!(fc > 0) || !(fy > 0) || !(dp > 0) || !(s > 0) || !(ov > 0) ||
      !(cx > 0) || !(cy > 0) || !(h > 0) || !(cov >= 0)) { r.valid = false; return r }
  Object.assign(r, { n, fc, fy, dp, s, ov, cx, cy, h, cov, db, Ab: barArea(db), mode: v.mode })

  if (!v.piles && s < 2.5 * dp) r.warn.push('Spasi tiang s = ' + s.toFixed(0) + ' mm < 2,5·dp (' +
    (2.5 * dp).toFixed(0) + ' mm) — jarak antar tiang lazimnya ≥ 2,5–3·dp.')
  if (ov < dp / 2 + 50) r.warn.push('Overhang tepi ' + ov.toFixed(0) + ' mm terlalu kecil — jarak pusat tiang ke tepi poer sebaiknya ≥ dp/2 + selimut.')

  // Geometri poer dari bounding box tiang + overhang.
  const P = v.piles ? v.piles.map((p) => ({ x: p.x, y: p.y })) : pileLayout(n, s)
  if (v.piles) {
    let dmin = Infinity
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dmin = Math.min(dmin, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y))
    if (n > 1 && dmin < 2.5 * dp) r.warn.push('Jarak antar tiang terdekat ' + dmin.toFixed(0) + ' mm < 2,5·dp (' + (2.5 * dp).toFixed(0) + ' mm)' + (dmin < dp ? ' — tiang saling tumpang tindih.' : ' — lazimnya ≥ 2,5–3·dp.'))
  }
  r.piles = P
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  // Tepi poer: koordinat tiang eksplisit → bounding box sebenarnya; susunan n/s lama → simetris terhadap kolom (perilaku
  // build lama; tidak tepat untuk 3 tiang yang kotak-batasnya tak simetris — lihat TODO).
  const xlo = v.piles ? Math.min(...xs) - ov : -(spanX / 2 + ov), xhi = v.piles ? Math.max(...xs) + ov : spanX / 2 + ov
  const ylo = v.piles ? Math.min(...ys) - ov : -(spanY / 2 + ov), yhi = v.piles ? Math.max(...ys) + ov : spanY / 2 + ov
  let poly: PilePosition[] = [{ x: xlo, y: ylo }, { x: xhi, y: ylo }, { x: xhi, y: yhi }, { x: xlo, y: yhi }]
  let shape: 'persegi' | 'poligon' = 'persegi'
  if (v.piles && v.shape === 'poligon') {
    const hull = convexHull(P)
    if (hull.length >= 3) { poly = offsetHull(hull, ov); shape = 'poligon' }
    else r.warn.push('Semua tiang segaris — bentuk poligon tidak terdefinisi, dipakai poer persegi.')
  }
  const pxs = poly.map((q) => q.x), pys = poly.map((q) => q.y)
  Object.assign(r, shape === 'poligon'
    ? { spanX, spanY, Lx: Math.max(...pxs) - Math.min(...pxs), Ly: Math.max(...pys) - Math.min(...pys), xlo: Math.min(...pxs), xhi: Math.max(...pxs), ylo: Math.min(...pys), yhi: Math.max(...pys), poly, shape }
    : { spanX, spanY, Lx: spanX + 2 * ov, Ly: spanY + 2 * ov, xlo, xhi, ylo, yhi, poly, shape })

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

  // Reaksi tiang: dihitung terhadap titik berat kelompok; eksentrisitas kolom terhadap titik berat menjadi momen tambahan.
  const xc = xs.reduce((a, x) => a + x, 0) / n, yc = ys.reduce((a, y) => a + y, 0) / n
  const Sx2 = xs.reduce((a, x) => a + (x - xc) * (x - xc), 0)
  const Sy2 = ys.reduce((a, y) => a + (y - yc) * (y - yc), 0)
  const Sxy = P.reduce((a, p) => a + (p.x - xc) * (p.y - yc), 0)
  Object.assign(r, { Sx2, Sy2, Sxy, xc, yc })
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
    // momen terhadap titik berat (kN·m): momen kolom + Pu × eksentrisitas
    const MyC = Muy - (Pu * xc) / 1000, MxC = Mux - (Pu * yc) / 1000
    if (Math.abs(xc) > 1e-6 || Math.abs(yc) > 1e-6)
      r.warn.push('Titik berat kelompok tiang (' + xc.toFixed(0) + '; ' + yc.toFixed(0) + ') mm tidak berimpit dengan pusat kolom — momen tambahan Pu·e diikutkan pada reaksi tiang.')
    const det = Sx2 * Sy2 - Sxy * Sxy
    let a = 0, b = 0
    if (Math.abs(Sxy) > 1e-6 * Math.max(Sx2, Sy2, 1) && det > 1e-9) {
      // kelompok tak simetris (Ixy ≠ 0): selesaikan [Sx2 Sxy; Sxy Sy2][a; b] = [MyC; MxC]
      a = (MyC * 1000 * Sy2 - MxC * 1000 * Sxy) / det
      b = (MxC * 1000 * Sx2 - MyC * 1000 * Sxy) / det
    } else {
      a = Sx2 > 1e-6 ? (MyC * 1000) / Sx2 : 0
      b = Sy2 > 1e-6 ? (MxC * 1000) / Sy2 : 0
    }
    for (let j = 0; j < n; j++) R.push(Pu / n + a * (P[j].x - xc) + b * (P[j].y - yc))
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
  let b = isX ? r.Ly : r.Lx
  const d = isX ? r.dx : r.dy
  let Mp = 0, Mm = 0 // kN·mm
  for (let i = 0; i < r.n; i++) {
    const c = isX ? r.piles[i].x : r.piles[i].y
    if (c > face) Mp += r.R[i] * (c - face)
    else if (c < -face) Mm += r.R[i] * (-face - c)
  }
  let Mu = Math.max(Mp, Mm)
  let side: '+' | '-' | undefined
  if (r.shape === 'poligon') {
    // lebar penampang = panjang potongan poligon di muka kolom tiap sisi; sisi penentu = momen per lebar terbesar
    const bp = chord(r.poly, axis, face), bm = chord(r.poly, axis, -face)
    const useP = Mp / Math.max(bp, 1e-9) >= Mm / Math.max(bm, 1e-9)
    side = useP ? '+' : '-'
    Mu = useP ? Mp : Mm
    b = useP ? bp : bm
    if (!(b > 0)) b = isX ? r.Ly : r.Lx
  }
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
    b, d, face, Mp, Mm, ...(side ? { side } : {}), Mu, Rn, rho, AsReq, rhoMin, AsMin, AsMinGov: AsReq < AsMin, As, nBar, AsProv,
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
  const bRect = isX ? r.Ly : r.Lx
  const critP = face + d, critM = -(face + d)
  let Vp = 0, Vm = 0
  for (let i = 0; i < r.n; i++) {
    const c = isX ? r.piles[i].x : r.piles[i].y
    Vp += r.R[i] * fracOneWay(c, critP, r.dp)
    Vm += r.R[i] * fracOneWay(-c, -critM, r.dp) // cermin sisi −
  }
  let Vu = Math.max(Vp, Vm)
  let b = bRect
  if (r.shape === 'poligon') {
    // lebar = panjang potongan poligon pada penampang kritis tiap sisi; sisi penentu = rasio D/C terbesar
    const bp = chord(r.poly, axis, critP) || bRect, bm = chord(r.poly, axis, critM) || bRect
    const dcP = Vp / (PHI_V * oneWayVc(r.fc, bp, d, LAMBDA)), dcM = Vm / (PHI_V * oneWayVc(r.fc, bm, d, LAMBDA))
    if (dcP >= dcM) { Vu = Vp; b = bp } else { Vu = Vm; b = bm }
  }
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
    let sides = 0, b0 = 0
    if (r.shape === 'poligon') {
      // keliling kritis persegi di sekitar tiang dipangkas tepi poligon; sisi yang seluruhnya di luar = hilang
      const seg: [PilePosition, PilePosition][] = [
        [{ x: xl, y: yb }, { x: xl, y: yt }], [{ x: xr, y: yb }, { x: xr, y: yt }],
        [{ x: xl, y: yb }, { x: xr, y: yb }], [{ x: xl, y: yt }, { x: xr, y: yt }],
      ]
      for (const [p, q] of seg) { const len = segmentInside(r.poly, p, q); if (len > 1e-6) { b0 += len; sides++ } }
    } else {
    if (xl >= r.xlo) { b0 += Math.min(yt, r.yhi) - Math.max(yb, r.ylo); sides++ }
    if (xr <= r.xhi) { b0 += Math.min(yt, r.yhi) - Math.max(yb, r.ylo); sides++ }
    if (yb >= r.ylo) { b0 += Math.min(xr, r.xhi) - Math.max(xl, r.xlo); sides++ }
    if (yt <= r.yhi) { b0 += Math.min(xr, r.xhi) - Math.max(xl, r.xlo); sides++ }
    }
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
