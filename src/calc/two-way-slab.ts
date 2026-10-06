// Pelat dua arah tertumpu 4 sisi — metode jalur silang (Grashof–Marcus) + SNI 2847:2019.
// Port 1:1 dari modules/two-way-slab/module.js (compute), diverifikasi golden test.
//
//   Pembagian beban dari kompatibilitas lendutan pusat: wx = w·Sy/(Sx+Sy), S = k·L⁴ (k: SS 5/384, FF 1/384, FP 1/192).
//   Momen jalur: SS wL²/8; FF +wL²/24, −wL²/12; FP +9wL²/128, −wL²/8. Desain pakai wu (maks 1,4D; 1,2D+1,6L).
//   Jalur tepi memakai M/3 (ACI 314R-16 Ps. 7.9.2). Lendutan dengan Ie Branson (Ps. 24.2.3.5), Ec = 4700√f'c.
// Ly/Lx ≤ 2; pendekatan (puntir pelat diabaikan).

import { effectiveInertia, stripDesign, type EffectiveInertia, type StripDesign } from './shared/concrete'
import { numFinite as num, type NumLike } from './shared/num'

const GAMMA_C = 24

export type EdgeCondition = 'ss' | 'ff' | 'fp'

/** Koefisien lendutan pusat balok/jalur. */
const KDEF: Record<EdgeCondition, number> = { ss: 5 / 384, ff: 1 / 384, fp: 1 / 192 }

export interface TwoWaySlabInput {
  /** Bentang (m), tebal (mm). */
  Lx: NumLike
  Ly: NumLike
  h: NumLike
  condX?: EdgeCondition
  condY?: EdgeCondition
  /** Beban mati tambahan & hidup (kN/m²). */
  qDL: NumLike
  qLL: NumLike
  fc: NumLike
  fy: NumLike
  cc: NumLike
  db: NumLike
}

export interface StripMoments {
  Mpos: number
  Mneg: number
}

export interface TwoWaySlabResult {
  warn: string[]
  valid: boolean
  Lx?: number
  Ly?: number
  h?: number
  fc?: number
  fy?: number
  cc?: number
  db?: number
  condX?: EdgeCondition
  condY?: EdgeCondition
  qDL?: number
  qLL?: number
  ratio?: number
  qsw?: number
  qD?: number
  qL?: number
  wu?: number
  gov14?: boolean
  wSvc?: number
  wux?: number
  wuy?: number
  wsx?: number
  wsy?: number
  shareX?: number
  mX?: StripMoments
  mY?: StripMoments
  mXs?: StripMoments
  mYs?: StripMoments
  dx?: number
  dy?: number
  asXpos?: StripDesign
  asXneg?: StripDesign
  asYpos?: StripDesign
  asYneg?: StripDesign
  asXposC?: StripDesign
  asXnegC?: StripDesign
  asYposC?: StripDesign
  asYnegC?: StripDesign
  anyInfeasible?: boolean
  Ec?: number
  ieX?: EffectiveInertia
  ieY?: EffectiveInertia
  /** Lendutan (mm). */
  dX?: number
  dY?: number
  dMax?: number
  dGovArah?: string
  limit240?: number
  limit360?: number
}

/** Momen jalur per meter menurut kondisi ujung. */
export function stripMoments(cond: EdgeCondition, w: number, Lm: number): StripMoments {
  const wl2 = w * Lm * Lm
  if (cond === 'ff') return { Mpos: wl2 / 24, Mneg: wl2 / 12 }
  if (cond === 'fp') return { Mpos: (9 * wl2) / 128, Mneg: wl2 / 8 }
  return { Mpos: wl2 / 8, Mneg: 0 }
}

export function computeTwoWaySlab(v: TwoWaySlabInput): TwoWaySlabResult {
  const r: TwoWaySlabResult = { warn: [], valid: false }
  let Lx = num(v.Lx), Ly = num(v.Ly)
  const h = num(v.h), fc = num(v.fc), fy = num(v.fy)
  const qDL = num(v.qDL), qLL = num(v.qLL), cc = num(v.cc), db = num(v.db)
  let condX = v.condX || 'ff', condY = v.condY || 'ff'
  if (!(Lx > 0) || !(Ly > 0) || !(h > 0) || !(fc > 0) || !(fy > 0)) return r
  if (Ly < Lx) { [Lx, Ly] = [Ly, Lx]; [condX, condY] = [condY, condX] } // Lx = pendek
  const ratio = Ly / Lx
  Object.assign(r, { Lx, Ly, h, fc, fy, cc, db, condX, condY, qDL, qLL, ratio })
  if (ratio > 2) r.warn.push('Ly/Lx = ' + ratio.toFixed(2) + ' > 2 — pelat berperilaku SATU arah; gunakan tool Balok/Pelat Menerus.')

  const qsw = (GAMMA_C * h) / 1000
  const qD = qsw + qDL, qL = qLL
  const wu = Math.max(1.4 * qD, 1.2 * qD + 1.6 * qL)
  const wSvc = qD + qL
  // Pembagian beban jalur silang (I bruto sama dua arah).
  const kx = KDEF[condX], ky = KDEF[condY]
  const Sx = kx * Math.pow(Lx, 4), Sy = ky * Math.pow(Ly, 4)
  const wux = (wu * Sy) / (Sx + Sy), wuy = (wu * Sx) / (Sx + Sy)
  const wsx = (wSvc * Sy) / (Sx + Sy), wsy = (wSvc * Sx) / (Sx + Sy)
  const mX = stripMoments(condX, wux, Lx), mY = stripMoments(condY, wuy, Ly)
  const mXs = stripMoments(condX, wsx, Lx), mYs = stripMoments(condY, wsy, Ly)
  const dx = h - cc - db / 2 // arah pendek di lapis luar
  const dy = h - cc - 1.5 * db
  Object.assign(r, {
    qsw, qD, qL, wu, gov14: 1.4 * qD >= 1.2 * qD + 1.6 * qL, wSvc, wux, wuy, wsx, wsy, shareX: (100 * Sy) / (Sx + Sy),
    mX, mY, mXs, mYs, dx, dy,
  })
  if (!(dx > 0) || !(dy > 0)) { r.warn.push('Tinggi efektif ≤ 0 — pertebal pelat / kurangi selimut.'); r.valid = true; return r }

  // Jalur tengah (momen penuh) & jalur tepi (M/3); spasi ≤ min(2h, 450).
  const des = (Mu: number, d: number) => stripDesign(Mu, d, fc, fy, db, h, 2, 0.005)
  const asXpos = des(mX.Mpos, dx), asXneg = des(mX.Mneg, dx)
  const asYpos = des(mY.Mpos, dy), asYneg = des(mY.Mneg, dy)
  Object.assign(r, {
    asXpos, asXneg, asYpos, asYneg,
    asXposC: des(mX.Mpos / 3, dx), asXnegC: des(mX.Mneg / 3, dx),
    asYposC: des(mY.Mpos / 3, dy), asYnegC: des(mY.Mneg / 3, dy),
    anyInfeasible: [asXpos, asXneg, asYpos, asYneg].some((a) => a.infeasible),
  })

  // Lendutan jalur lapangan dengan Ie: δ = k·w·L⁴/(Ec·Ie) (w kN/m² ≈ N/mm per m, L mm) → mm.
  const Ec = 4700 * Math.sqrt(fc)
  const ieX = effectiveInertia(mXs.Mpos, asXpos.AsProv, dx, fc, h)
  const ieY = effectiveInertia(mYs.Mpos, asYpos.AsProv, dy, fc, h)
  const dX = (kx * wsx * Math.pow(Lx * 1000, 4)) / (Ec * ieX.Ie)
  const dY = (ky * wsy * Math.pow(Ly * 1000, 4)) / (Ec * ieY.Ie)
  Object.assign(r, {
    Ec, ieX, ieY, dX, dY, dMax: Math.max(dX, dY), dGovArah: dX >= dY ? 'x (pendek)' : 'y (panjang)',
    limit240: (Lx * 1000) / 240, limit360: (Lx * 1000) / 360, valid: true,
  })
  return r
}
