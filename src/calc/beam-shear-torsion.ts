// Geser & torsi balok persegi beton bertulang — SNI 2847:2019 (≈ ACI 318-19), φ = 0,75, θ = 45°.
// Port 1:1 dari modules/beam-shear-torsion/module.js (compute), diverifikasi golden test.
//
//   Geser: Vc = 0,17λ√f'c·bw·d; Vs = Av·fyt·d/s ≤ 0,66√f'c·bw·d.
//   Torsi: Tn = 2·Ao·At·fyt·cotθ/s, Ao = 0,85·Aoh; Tth = 0,083λ√f'c·Acp²/pcp; cek dimensi Ps. 22.7.7.1a.
//   Minimum: (Av + 2At)/s ≥ max(0,062√f'c; 0,35)·bw/fyt; Al Ps. 22.7.6.1.2 & 9.6.4.3; spasi maks geser & ph/8.
// √f'c ≤ 8,3 MPa.

import { barArea } from './shared/concrete'

const PHI = 0.75
const COT = 1.0 // θ = 45°

export interface ShearTorsionInput {
  fc: number
  fy: number
  fyt: number
  lam: number | string
  /** Penampang & selimut bersih ke sengkang (mm). */
  b: number
  h: number
  cc: number
  /** Sengkang: diameter, jumlah kaki (≥ 2), spasi (mm). */
  ds: number | string
  nLegs: number | string
  s: number
  /** Tulangan longitudinal atas, bawah, samping (jumlah & diameter). */
  nTop: number | string
  dbTop: number | string
  nBot: number | string
  dbBot: number | string
  nSide: number | string
  dbSide: number | string
  /** Geser (kN) & torsi (kNm) terfaktor. */
  Vu: number
  Tu: number
}

export interface ShearTorsionResult {
  warn: string[]
  valid: boolean
  /** Satuan internal N & N·mm; field ...kN / ...kNm untuk tampilan. */
  fc?: number
  fy?: number
  fyt?: number
  lam?: number
  b?: number
  h?: number
  cc?: number
  ds?: number
  nLegs?: number
  s?: number
  nTop?: number
  dbTop?: number
  nBot?: number
  dbBot?: number
  nSide?: number
  dbSide?: number
  nLong?: number
  Vu?: number
  Tu?: number
  sqrtfc?: number
  d?: number
  Ab?: number
  x1?: number
  y1?: number
  Aoh?: number
  ph?: number
  Ao?: number
  Acp?: number
  pcp?: number
  Vc?: number
  Av?: number
  Vs?: number
  VsMax?: number
  VsEff?: number
  phiVn?: number
  ratioV?: number
  At?: number
  Tn?: number
  phiTn?: number
  ratioT?: number
  Tth?: number
  phiTth?: number
  lhs?: number
  rhs?: number
  ratioSec?: number
  AvsShear?: number
  AtsTors?: number
  demandTrans?: number
  minTrans?: number
  demandTransGov?: number
  provTrans?: number
  ratioTrans?: number
  AlReq?: number
  AlMin?: number
  AlGov?: number
  AlProv?: number
  ratioAl?: number
  smaxShear?: number
  smaxTors?: number
  smax?: number
  VckN?: number
  VskN?: number
  phiVnkN?: number
  VukN?: number
  VsMaxkN?: number
  phiTnkNm?: number
  TukNm?: number
  phiTthkNm?: number
  torsionNeglig?: boolean
  sectionOK?: boolean
  sOK?: boolean
}

export function computeShearTorsion(v: ShearTorsionInput): ShearTorsionResult {
  const { fc, fy, fyt, b, h, cc, s } = v
  const lam = parseFloat(String(v.lam))
  const ds = parseFloat(String(v.ds))
  const nLegs = Math.max(2, parseInt(String(v.nLegs), 10) || 2)
  const nTop = parseInt(String(v.nTop), 10) || 0, dbTop = parseFloat(String(v.dbTop))
  const nBot = parseInt(String(v.nBot), 10) || 0, dbBot = parseFloat(String(v.dbBot))
  const nSideRaw = parseInt(String(v.nSide), 10) || 0, dbSide = parseFloat(String(v.dbSide))
  const Vu = v.Vu * 1e3 // kN → N
  const Tu = v.Tu * 1e6 // kNm → N·mm

  const r: ShearTorsionResult = { warn: [], valid: false }
  if (!(fc > 0) || !(fy > 0) || !(fyt > 0) || !(b > 0) || !(h > 0) || !(ds > 0) || !(s > 0) ||
      !(nBot >= 2) || !(dbBot > 0) || !(nTop >= 2) || !(dbTop > 0)) return r

  // Tulangan samping kelipatan 2 (kiri = kanan); ganjil dibulatkan turun.
  let nSide = nSideRaw
  if (nSide < 0) nSide = 0
  if (nSide % 2 !== 0) { nSide = nSide - 1; r.warn.push('Jumlah tulangan samping harus kelipatan 2 (kiri = kanan); dipakai ' + nSide + ' batang.') }

  const sqrtfc = Math.min(Math.sqrt(fc), 8.3)
  const Ab = barArea(ds) // satu kaki sengkang
  const d = h - cc - ds - dbBot / 2
  if (!(d > 0)) { r.warn.push('Tinggi efektif d ≤ 0 — periksa h, selimut, diameter sengkang & tulangan.'); return r }

  // Geometri torsi (as sengkang tertutup terluar).
  const x1 = b - 2 * cc - ds, y1 = h - 2 * cc - ds
  if (!(x1 > 0) || !(y1 > 0)) { r.warn.push('Dimensi inti sengkang ≤ 0 — selimut terlalu besar terhadap b/h.'); return r }
  const Aoh = x1 * y1, ph = 2 * (x1 + y1), Ao = 0.85 * Aoh
  const Acp = b * h, pcp = 2 * (b + h)
  r.valid = true

  // Geser.
  const Vc = 0.17 * lam * sqrtfc * b * d // N
  const Av = nLegs * Ab
  const Vs = (Av * fyt * d) / s
  const VsMax = 0.66 * sqrtfc * b * d
  const VsEff = Math.min(Vs, VsMax)
  const phiVn = PHI * (Vc + VsEff)
  const ratioV = phiVn > 0 ? Vu / phiVn : Infinity

  // Torsi.
  const At = Ab
  const Tn = (2 * Ao * At * fyt * COT) / s
  const phiTn = PHI * Tn
  const ratioT = phiTn > 0 ? Tu / phiTn : Infinity
  const Tth = (0.083 * lam * sqrtfc * Acp * Acp) / pcp
  const phiTth = PHI * Tth
  const torsionNeglig = Tu < phiTth

  // Dimensi penampang (Ps. 22.7.7.1a).
  const lhs = Math.sqrt(Math.pow(Vu / (b * d), 2) + Math.pow((Tu * ph) / (1.7 * Aoh * Aoh), 2))
  const rhs = PHI * (Vc / (b * d) + 0.66 * sqrtfc)
  const sectionOK = lhs <= rhs

  // Tulangan transversal perlu.
  const AvsShear = Math.max(0, (Vu / PHI - Vc) / (fyt * d))
  const AtsTors = Tu / (PHI * 2 * Ao * fyt * COT)
  const demandTrans = AvsShear + 2 * AtsTors
  const minTrans = Math.max((0.062 * sqrtfc * b) / fyt, (0.35 * b) / fyt)
  const demandTransGov = Math.max(demandTrans, minTrans)
  const provTrans = ((nLegs + 2) * Ab) / s
  const ratioTrans = provTrans > 0 ? demandTransGov / provTrans : Infinity

  // Tulangan longitudinal torsi.
  const AtsForAl = Math.max(AtsTors, (0.175 * b) / fyt)
  const AlReq = AtsTors * ph * (fyt / fy) * COT * COT
  const AlMin = Math.max(0, (0.42 * sqrtfc * Acp) / fy - AtsForAl * ph * (fyt / fy))
  const AlGov = Math.max(AlReq, AlMin)
  const AlProv = nTop * barArea(dbTop) + nBot * barArea(dbBot) + nSide * barArea(dbSide)

  // Spasi maksimum.
  const smaxShear = Vs <= 0.33 * sqrtfc * b * d ? Math.min(d / 2, 600) : Math.min(d / 4, 300)
  const smaxTors = Math.min(ph / 8, 300)
  const smax = Math.min(smaxShear, smaxTors)
  const sOK = s <= smax + 1e-6

  Object.assign(r, {
    fc, fy, fyt, lam, b, h, cc, ds, nLegs, s, nTop, dbTop, nBot, dbBot, nSide, dbSide,
    nLong: nTop + nBot + nSide, Vu, Tu, sqrtfc, d, Ab, x1, y1, Aoh, ph, Ao, Acp, pcp,
    Vc, Av, Vs, VsMax, VsEff, phiVn, ratioV, At, Tn, phiTn, ratioT, Tth, phiTth, torsionNeglig,
    lhs, rhs, sectionOK, ratioSec: rhs > 0 ? lhs / rhs : Infinity,
    AvsShear, AtsTors, demandTrans, minTrans, demandTransGov, provTrans, ratioTrans,
    AlReq, AlMin, AlGov, AlProv, ratioAl: AlGov > 0 ? AlGov / AlProv : 0,
    smaxShear, smaxTors, smax, sOK,
    VckN: Vc / 1e3, VskN: VsEff / 1e3, phiVnkN: phiVn / 1e3, VukN: Vu / 1e3, VsMaxkN: VsMax / 1e3,
    phiTnkNm: phiTn / 1e6, TukNm: Tu / 1e6, phiTthkNm: phiTth / 1e6,
  })

  if (!sectionOK) r.warn.push('Dimensi penampang TIDAK cukup untuk kombinasi geser+torsi (Ps. 22.7.7.1): √(…) = ' + lhs.toFixed(2) + ' > φ(…) = ' + rhs.toFixed(2) + " MPa. Perbesar b/h atau naikkan f'c.")
  if (Vs > VsMax) r.warn.push('Vs = ' + (Vs / 1e3).toFixed(1) + ' kN > Vs,maks = ' + (VsMax / 1e3).toFixed(1) + ' kN (Ps. 22.5.1.2). Kapasitas dibatasi Vs,maks; perbesar penampang.')
  if (!torsionNeglig && ratioT > 1.0) r.warn.push('φTn = ' + (phiTn / 1e6).toFixed(2) + ' kN·m < Tu = ' + (Tu / 1e6).toFixed(2) + ' kN·m. Perkecil spasi sengkang, perbesar diameter, atau tambah dimensi.')
  if (ratioV > 1.0) r.warn.push('φVn = ' + (phiVn / 1e3).toFixed(1) + ' kN < Vu = ' + (Vu / 1e3).toFixed(1) + ' kN. Sengkang geser kurang.')
  if (ratioTrans > 1.0) r.warn.push('Sengkang tersedia ((Av+2At)/s = ' + provTrans.toFixed(3) + ' mm²/mm) < perlu gabungan (Av+2At)/s = ' + demandTransGov.toFixed(3) + ' mm²/mm.')
  if (!sOK) r.warn.push('Spasi s = ' + Math.round(s) + ' mm > spasi maks ' + Math.round(smax) + ' mm (geser ' + Math.round(smaxShear) + ' / torsi ph/8 = ' + Math.round(smaxTors) + ' mm).')
  if (AlProv < AlGov - 1e-6) r.warn.push('Tulangan longitudinal torsi tersedia Al = ' + Math.round(AlProv) + ' mm² < perlu Al = ' + Math.round(AlGov) + ' mm² (sebar merata keliling sengkang).')
  if (torsionNeglig && Tu > 0) r.warn.push('Tu = ' + (Tu / 1e6).toFixed(2) + ' kN·m < φ·Tth = ' + (phiTth / 1e6).toFixed(2) + ' kN·m → torsi boleh DIABAIKAN (Ps. 22.7.4.1); desain cukup terhadap geser.')
  return r
}
