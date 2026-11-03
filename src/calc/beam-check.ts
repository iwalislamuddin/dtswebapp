// Cek desain balok beton persegi: lentur lapangan (M+) & tumpuan (M−) + geser (+ torsi opsional) — SNI 2847:2019.
// Menyusun computeBeamFlexure & computeShearTorsion; tidak ada rumus baru. Ukuran tulangan memanjang sama di
// lapangan & tumpuan, jumlahnya berbeda. Torsi (bila aktif) dianggap konstan sepanjang balok.

import { computeBeamFlexure, type BeamFlexureResult } from './beam-flexure'
import { computeShearTorsion, type ShearTorsionResult } from './beam-shear-torsion'

export interface BeamCheckInput {
  fc: number
  fy: number
  fyt: number
  b: number
  h: number
  cc: number
  ds: number
  /** Diameter tulangan memanjang (mm), sama untuk semua posisi. */
  db: number
  nLegs: number
  /** Lapangan: tarik bawah (M+), tekan atas; jumlah lapis tarik. */
  nPosT: number
  nPosC: number
  layPos: number
  /** Tumpuan: tarik atas (M−), tekan bawah; jumlah lapis tarik. */
  nNegT: number
  nNegC: number
  layNeg: number
  /** Momen (kN·m, besaran positif) & geser (kN) terfaktor. */
  Mpos: number
  Mneg: number
  Vu: number
  /** Spasi sengkang tumpuan (mm). */
  sSup: number
  /** Sengkang lapangan berbeda (opsional): spasi (mm) & Vu lapangan (kN). */
  midStir: boolean
  sMid: number
  VuMid: number
  /** Torsi (opsional): Tu (kN·m), tulangan samping total (kedua sisi) & diameternya. */
  torsion: boolean
  Tu: number
  nSide: number
  dbSide: number
}

export interface FlexCheck {
  flex: BeamFlexureResult
  Mu: number
  /** Mu / φMn */
  ratioM: number
  /** As,min / As */
  ratioMin: number
  /** 0,004 / εt */
  ratioEt: number
}

export interface ShearCheck {
  r: ShearTorsionResult
  /** Vu / φVn */
  ratioV: number
  /** Tu / φTn (0 bila torsi tidak aktif atau boleh diabaikan) */
  ratioT: number
  ratioSec: number
  /** Sengkang perlu / terpasang (min. gabungan bila torsi aktif; Av,min & geser bila tidak) */
  ratioStir: number
  /** Al perlu / terpasang (0 bila torsi tidak aktif) */
  ratioAl: number
  /** s / s,maks */
  ratioS: number
  sMax: number
  gov: number
}

export interface BeamCheckResult {
  valid: boolean
  warn: string[]
  input?: BeamCheckInput
  pos?: FlexCheck
  neg?: FlexCheck
  sup?: ShearCheck
  mid?: ShearCheck | null
  gov?: number
}

function flexCheck(v: BeamCheckInput, nT: number, nC: number, lay: number, Mu: number, tag: string, warn: string[]): FlexCheck | null {
  const flex = computeBeamFlexure({ fc: v.fc, fy: v.fy, b: v.b, h: v.h, cc: v.cc, ds: v.ds, n1: nT, db1: v.db, nLay: lay, sv: 25, doubly: 'yes', n2: nC, db2: v.db })
  if (!flex.valid) { warn.push(...flex.warn.map((w) => `${tag}: ${w}`)); return null }
  warn.push(...flex.warn.map((w) => `${tag}: ${w}`))
  return { flex, Mu, ratioM: flex.phiMnkNm! > 0 ? Mu / flex.phiMnkNm! : Infinity, ratioMin: flex.Asmin! / flex.As!, ratioEt: 0.004 / Math.max(flex.et!, 1e-9) }
}

function shearCheck(v: BeamCheckInput, nTop: number, nBot: number, d: number, s: number, Vu: number, tag: string, warn: string[]): ShearCheck | null {
  const r = computeShearTorsion({
    fc: v.fc, fy: v.fy, fyt: v.fyt, lam: 1, b: v.b, h: v.h, cc: v.cc, ds: v.ds, nLegs: v.nLegs, s,
    nTop, dbTop: v.db, nBot, dbBot: v.db, nSide: v.torsion ? v.nSide : 0, dbSide: v.dbSide || v.db,
    Vu, Tu: v.torsion ? v.Tu : 0, d,
  })
  if (!r.valid) { warn.push(...r.warn.map((w) => `${tag}: ${w}`)); return null }
  const tors = v.torsion && !r.torsionNeglig
  const avs = r.Av! / r.s!
  const ratioStir = v.torsion ? r.ratioTrans! : Math.max(r.AvsShear!, r.minTrans!) / avs
  const sMax = v.torsion ? r.smax! : r.smaxShear!
  const out: ShearCheck = {
    r, ratioV: r.ratioV!, ratioT: tors ? r.ratioT! : 0, ratioSec: r.ratioSec!, ratioStir,
    ratioAl: v.torsion ? r.ratioAl! : 0, ratioS: r.s! / sMax, sMax, gov: 0,
  }
  out.gov = Math.max(out.ratioV, out.ratioT, out.ratioSec, out.ratioStir, out.ratioAl, out.ratioS)
  // Peringatan bawaan mesin geser diganti rasio di atas; hanya ambil yang tidak berupa rasio.
  warn.push(...r.warn.filter((w) => /kelipatan|inti sengkang|Tinggi efektif/.test(w)).map((w) => `${tag}: ${w}`))
  return out
}

export function computeBeamCheck(v: BeamCheckInput): BeamCheckResult {
  const warn: string[] = []
  const bad = (): BeamCheckResult => ({ valid: false, warn })
  const pos = flexCheck(v, v.nPosT, v.nPosC, v.layPos, v.Mpos, 'Lapangan', warn)
  const neg = flexCheck(v, v.nNegT, v.nNegC, v.layNeg, v.Mneg, 'Tumpuan', warn)
  if (!pos || !neg) return bad()
  const sup = shearCheck(v, v.nNegT, v.nNegC, neg.flex.d!, v.sSup, v.Vu, 'Geser tumpuan', warn)
  const mid = v.midStir ? shearCheck(v, v.nPosC, v.nPosT, pos.flex.d!, v.sMid, v.VuMid, 'Geser lapangan', warn) : null
  if (!sup || (v.midStir && !mid)) return bad()
  const gov = Math.max(pos.ratioM, neg.ratioM, pos.ratioMin, neg.ratioMin, pos.ratioEt, neg.ratioEt, sup.gov, mid?.gov ?? 0)
  return { valid: true, warn, input: v, pos, neg, sup, mid, gov }
}
