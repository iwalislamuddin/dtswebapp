// Kapasitas lentur balok persegi bertulangan tunggal/rangkap, 1–3 lapis — SNI 2847:2019.
// Port 1:1 dari modules/beam-flexure/module.js (compute), diverifikasi golden test.
//
//   Kesetimbangan gaya diselesaikan bisection pada c (fs = min(fy, Es·0,003(d−c)/c), fs' serupa) → benar untuk
//   under- maupun over-reinforced. d = centroid grup tulangan tarik; εt di baja terluar dt.
//   φ dari εt (sengkang ikat, 0,65–0,90); As,min Ps. 9.6.1.2; εt ≥ 0,004 Ps. 9.3.3.1; spasi bersih Ps. 25.2.1.
// Asumsi: Es = 200 000 MPa, perpindahan beton oleh baja tekan diabaikan, batang tersebar merata per lapis.

import { barArea, beta1, ES, rhoMinBeam } from './shared/concrete'

export const BEAM_BARS = [10, 13, 16, 19, 22, 25, 29, 32, 36]

export interface BeamFlexureInput {
  fc: number
  fy: number
  /** Penampang & selimut bersih (mm). */
  b: number
  h: number
  cc: number
  /** Diameter sengkang (mm). */
  ds: number | string
  /** Jumlah & diameter tulangan tarik. */
  n1: number
  db1: number | string
  /** Jumlah lapis 1–3. */
  nLay: number | string
  /** Spasi bersih antar lapis (mm), ≤ 0 = 25. */
  sv: number
  doubly: 'yes' | 'no'
  /** Tulangan tekan. */
  n2: number
  db2: number | string
}

export interface BeamFlexureResult {
  warn: string[]
  valid: boolean
  fc?: number
  fy?: number
  b?: number
  h?: number
  cc?: number
  ds?: number
  sv?: number
  n1?: number
  db1?: number
  nLay?: number
  /** Batang per lapis (indeks 0 = bawah). */
  layers?: number[]
  doubly?: boolean
  n2?: number
  db2?: number
  As?: number
  Asc?: number
  d?: number
  dt?: number
  dp?: number
  b1?: number
  ey?: number
  c?: number
  a?: number
  fs?: number
  fsc?: number
  et?: number
  esc?: number
  steelYield?: boolean
  compYield?: boolean | null
  phi?: number
  /** N·mm */
  Mn?: number
  McC?: number
  McS?: number
  phiMn?: number
  MnkNm?: number
  phiMnkNm?: number
  Asmin?: number
  rho?: number
  belowMin?: boolean
  nmax?: number
  sClear?: number | null
  sMin?: number
  cls?: string
}

interface Eq {
  fc: number
  fy: number
  b: number
  b1: number
  As: number
  Asc: number
  d: number
  dp: number
}

const Asof = (n: number, db: number): number => (n > 0 && db > 0 ? n * barArea(db) : 0)

/** Sebar n batang ke nLay lapis; sisa di lapis bawah (indeks 0). */
export function distributeBars(n: number, nLay: number): number[] {
  const base = Math.floor(n / nLay), rem = n % nLay
  return Array.from({ length: nLay }, (_, i) => base + (i < rem ? 1 : 0))
}

/** Sisa gaya kesetimbangan (N) pada sumbu netral c; naik monoton → akar tunggal. */
function forceResidual(c: number, p: Eq): number {
  const a = p.b1 * c
  const fs = Math.min(p.fy, Math.max(0, (ES * 0.003 * (p.d - c)) / c))
  const fsc = p.Asc > 0 ? Math.min(p.fy, Math.max(0, (ES * 0.003 * (c - p.dp)) / c)) : 0
  return 0.85 * p.fc * p.b * a + p.Asc * fsc - p.As * fs
}

function solveC(p: Eq): number {
  let lo = 1e-4, hi = p.d * 0.999
  if (forceResidual(hi, p) < 0) hi = p.d // sangat over-reinforced
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi)
    if (forceResidual(mid, p) > 0) hi = mid
    else lo = mid
  }
  return 0.5 * (lo + hi)
}

export function computeBeamFlexure(v: BeamFlexureInput): BeamFlexureResult {
  const { fc, fy, b, h, cc, n1, n2 } = v
  const ds = parseFloat(String(v.ds)), db1 = parseFloat(String(v.db1)), db2 = parseFloat(String(v.db2))
  let nLay = Math.max(1, parseInt(String(v.nLay), 10) || 1)
  const sv = v.sv > 0 ? v.sv : 25
  const doubly = v.doubly === 'yes'

  const r: BeamFlexureResult = { warn: [], valid: false }
  if (!(fc > 0) || !(fy > 0) || !(b > 0) || !(h > 0) || !(n1 > 0) || !(db1 > 0)) return r

  if (nLay > n1) nLay = n1
  const layers = distributeBars(n1, nLay)
  const As = Asof(n1, db1)
  const Asc = doubly ? Asof(n2, db2) : 0

  // Kedalaman lapis dari serat tekan; centroid grup → d.
  const yBot0 = cc + ds + db1 / 2
  const pitch = db1 + sv
  let sumN = 0, sumNy = 0
  layers.forEach((nl, li) => {
    if (!nl) return
    sumN += nl
    sumNy += nl * (h - (yBot0 + li * pitch))
  })
  const d = sumNy / sumN
  const dt = h - yBot0
  const dp = cc + ds + (Asc > 0 ? db2 / 2 : 0)
  if (!(d > 0) || !(dt > 0)) { r.warn.push('Tinggi efektif ≤ 0 — periksa h, selimut, sengkang, atau jumlah lapis.'); return r }
  r.valid = true

  const b1 = beta1(fc)
  const ey = fy / ES
  const c = solveC({ fc, fy, b, b1, As, Asc, d, dp })
  const a = b1 * c
  const fs = Math.min(fy, (ES * 0.003 * (d - c)) / c)
  const fsc = Asc > 0 ? Math.min(fy, Math.max(0, (ES * 0.003 * (c - dp)) / c)) : 0
  const et = (0.003 * (dt - c)) / c
  const esc = Asc > 0 ? (0.003 * (c - dp)) / c : 0

  let phi: number
  if (et >= 0.005) phi = 0.9
  else if (et <= ey) phi = 0.65
  else phi = 0.65 + (0.25 * (et - ey)) / (0.005 - ey)

  const McC = 0.85 * fc * b * a * (d - a / 2)
  const McS = Asc > 0 ? Asc * fsc * (d - dp) : 0
  const Mn = McC + McS
  const phiMn = phi * Mn
  const Asmin = rhoMinBeam(fc, fy) * b * d
  const nmax = Math.max(...layers)
  const sClear = nmax > 1 ? (b - 2 * (cc + ds) - nmax * db1) / (nmax - 1) : null
  const sMin = Math.max(25, db1) // 4/3·d_agregat diabaikan
  const compYield = Asc > 0 ? esc >= ey : null

  Object.assign(r, {
    fc, fy, b, h, cc, ds, sv, n1, db1, nLay, layers, doubly, n2, db2, As, Asc, d, dt, dp, b1, ey, c, a,
    fs, fsc, et, esc, steelYield: fs >= fy - 0.5, compYield, phi, Mn, McC, McS, phiMn, MnkNm: Mn / 1e6,
    phiMnkNm: phiMn / 1e6, Asmin, rho: As / (b * d), belowMin: As < Asmin - 1e-6, nmax, sClear, sMin,
    cls: et >= 0.005 ? 'Terkendali tarik (daktail)' : et <= ey ? 'Terkendali tekan (getas)' : 'Transisi',
  })

  if (et < 0.004) r.warn.push('εt = ' + et.toFixed(4) + ' < 0,004 — TIDAK memenuhi Ps. 9.3.3.1 untuk komponen lentur. Kurangi tulangan tarik / tambah tinggi / pakai tulangan tekan.')
  else if (et < 0.005) r.warn.push('Penampang berada di zona transisi (φ < 0,90). Untuk desain daktail, targetkan εt ≥ 0,005.')
  if (r.belowMin) r.warn.push('As = ' + Math.round(As) + ' mm² < As,min = ' + Math.round(Asmin) + ' mm² (Ps. 9.6.1.2).')
  if (Asc > 0 && !compYield) r.warn.push("Baja tekan belum leleh (fs' = " + fsc.toFixed(0) + ' MPa < fy); kontribusinya tereduksi.')
  if (sClear !== null && sClear < 0) r.warn.push(nmax + ' batang D' + db1 + ' TIDAK MUAT dalam satu lapis (lebar bersih kurang ' + Math.round(-sClear) + ' mm). Tambah lapis, perbesar b, atau kurangi batang.')
  else if (sClear !== null && sClear < sMin) r.warn.push('Spasi bersih antar-tulangan = ' + sClear.toFixed(0) + ' mm < minimum ' + Math.round(sMin) + ' mm (Ps. 25.2.1: maks 25 mm & db). Tambah lapis atau perbesar b.')
  return r
}
