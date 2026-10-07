// Batang tarik baja — SNI 1729:2020 (AISC 360-16) Bab D, DFBK & ASD.
// Port 1:1 dari modules/steel-tension/module.js (compute), diverifikasi golden test.
//
//   Leleh bruto Pn = Fy·Ag (φ 0,90 / Ω 1,67); fraktur neto efektif Pn = Fu·Ae, Ae = U·An (φ 0,75 / Ω 2,00).
//   An = Ag − n·dh·t (baut), dh = db + kelonggaran; las/tanpa lubang An = Ag. Kelangsingan L/r ≤ 300 (rekomendasi).
// TIDAK termasuk: blok geser, koreksi zig-zag s²/4g, batas 0,85Ag pelat sambung, desain sambungan.

import { num, type NumLike } from './shared/num'
import { AgMm2, getProfile, rminMm, tGov, typeInfo, type SteelProfile, type SteelTypeInfo } from './shared/steel-profiles'

const PHI_Y = 0.9, PHI_R = 0.75, OM_Y = 1.67, OM_R = 2.0

/** Preset shear lag U (0 = manual). */
export const U_PRESETS: readonly [string, number][] = [
  ['Semua elemen tersambung / las melintang (U=1.0)', 1.0],
  ['WF sayap tersambung, bf≥2/3·d, ≥3 baut (U=0.90)', 0.9],
  ['WF badan / bf<2/3·d ; kanal umum (U=0.85)', 0.85],
  ['Siku, ≥4 baut satu baris (U=0.80)', 0.8],
  ['Siku/kanal, sambungan pendek 2–3 baut (U=0.70)', 0.7],
  ['Manual (isi U sendiri)', 0],
]

export interface SteelTensionInput {
  ptype: string
  psize: string
  Fy: NumLike
  Fu: NumLike
  conn: 'bolt' | 'weld'
  nHole: NumLike
  /** Diameter baut & kelonggaran lubang (mm). */
  db: NumLike
  hole: NumLike
  /** Tebal elemen berlubang (mm), 0 = otomatis dari library. */
  tHole: NumLike
  /** Nilai U preset (teks), '0' = manual. */
  Upreset: string
  Uval: NumLike
  /** Panjang batang (mm) untuk kelangsingan. */
  L: NumLike
  /** Gaya terfaktor DFBK & layan ASD (kN), 0 = lewati. */
  Pu: NumLike
  Pa: NumLike
}

export interface SteelTensionResult {
  warn: string[]
  valid: boolean
  p?: SteelProfile
  type?: string
  ti?: SteelTypeInfo | null
  name?: string
  Fy?: number
  Fu?: number
  /** mm² */
  Ag?: number
  An?: number
  Ae?: number
  U?: number
  conn?: string
  nHole?: number
  db?: number
  hole?: number
  dh?: number
  tHole?: number
  /** kN */
  PnY?: number
  PnR?: number
  phiPnY?: number
  phiPnR?: number
  phiPn?: number
  govLRFD?: string
  PaY?: number
  PaR?: number
  Pa?: number
  govASD?: string
  rmin?: number
  L?: number
  slender?: number | null
  Pu?: number
  Pa_dem?: number
  dcL?: number | null
  dcA?: number | null
}

export function computeSteelTension(v: SteelTensionInput): SteelTensionResult {
  const r: SteelTensionResult = { warn: [], valid: false }
  const type = v.ptype, name = v.psize
  const p = getProfile(type, name)
  if (!p) { r.warn.push('Profil belum dipilih.'); return r }
  const ti = typeInfo(type)
  const Fy = num(v.Fy), Fu = num(v.Fu)
  if (!(Fy > 0) || !(Fu > 0) || Fu < Fy) { r.warn.push('Fy & Fu harus > 0 dan Fu ≥ Fy.'); return r }

  const Ag = AgMm2(p)
  const conn = v.conn
  const nHole = Math.max(0, parseInt(String(v.nHole), 10) || 0)
  const db = num(v.db), hole = num(v.hole)
  const tHole = num(v.tHole) || tGov(type, p)
  const dh = db + hole
  let An: number
  if (conn === 'bolt' && nHole > 0) {
    An = Ag - nHole * dh * tHole
    if (An < 0.3 * Ag) r.warn.push('An sangat kecil (' + Math.round(An) + ' mm²) — periksa jumlah/tebal lubang.')
  } else An = Ag // las / tanpa lubang
  if (An > Ag) An = Ag

  let U = v.Upreset === '0' ? num(v.Uval) : num(v.Upreset)
  if (!(U > 0)) { U = 1.0; r.warn.push('U tidak valid → dipakai 1.0.') }
  if (U > 1) U = 1.0
  const Ae = U * An

  const PnY = (Fy * Ag) / 1000, PnR = (Fu * Ae) / 1000
  const phiPnY = PHI_Y * PnY, phiPnR = PHI_R * PnR
  const PaY = PnY / OM_Y, PaR = PnR / OM_R
  const phiPn = Math.min(phiPnY, phiPnR)
  const Pa = Math.min(PaY, PaR)
  const rmin = rminMm(p)
  const L = num(v.L)
  const slender = rmin > 0 && L > 0 ? L / rmin : null
  const Pu = num(v.Pu), Pa_dem = num(v.Pa)
  const dcL = Pu > 0 ? Pu / phiPn : null
  const dcA = Pa_dem > 0 ? Pa_dem / Pa : null

  Object.assign(r, {
    valid: true, p, type, ti, name, Fy, Fu, Ag, An, Ae, U, conn, nHole, db, hole, dh, tHole, PnY, PnR,
    phiPnY, phiPnR, phiPn, govLRFD: phiPnY <= phiPnR ? 'Leleh (bruto)' : 'Fraktur (neto)',
    PaY, PaR, Pa, govASD: PaY <= PaR ? 'Leleh (bruto)' : 'Fraktur (neto)', rmin, L, slender, Pu, Pa_dem, dcL, dcA,
  })

  if (slender !== null && slender > 300)
    r.warn.push('L/r = ' + Math.round(slender) + ' > 300 — melebihi rekomendasi kelangsingan batang tarik (Ps. 5.4). Pertimbangkan profil lebih kaku.')
  if (dcL !== null && dcL > 1) r.warn.push('DFBK: Pu/φPn = ' + dcL.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.')
  if (dcA !== null && dcA > 1) r.warn.push('ASD: Pa/(Pn/Ω) = ' + dcA.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.')
  if (p.source === 'hitung') r.warn.push('Properti profil ' + (ti as SteelTypeInfo).name + ' DIHITUNG dari geometri (' + (p.note || '') + '); verifikasi terhadap katalog pabrikan.')
  return r
}
