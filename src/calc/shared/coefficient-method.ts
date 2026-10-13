// Metode koefisien (modul lama, dikunci golden) — dipakai oleh ../continuous-beam.ts.
// Balok / pelat satu arah menerus — metode koefisien SNI 2847:2019 Ps. 6.5 (+ satu bentang statika eksak),
// desain lentur & geser. Port 1:1 dari modules/continuous-beam/module.js (compute), diverifikasi golden test.
//
//   Koefisien Tabel 6.5.2 (M+ ujung 1/11|1/14, dalam 1/16; M− luar 1/16|1/24|0, muka dalam pertama 1/9|1/10,
//   tumpuan dalam 1/11; opsi 1/12 semua) dan Tabel 6.5.4 (V muka dalam pertama 1,15·wu·ln/2).
//   Satu bentang: SS wl²/8; JS M− wl²/8, M+ 9wl²/128; JJ M− wl²/12, M+ wl²/24.
//   Desain: As tulangan tunggal φ = 0,90 (diverifikasi εt), As,min balok/pelat; geser Vc = 0,17√f'c·bw·d, φ = 0,75.

import { barArea, beta1, rhoMinBeam, rhoShrinkage } from './concrete'

const GAMMA_C = 24 // kN/m³

export const CB_BARS = [10, 13, 16, 19, 22, 25, 29, 32]
export const CB_STIRRUPS = [8, 10, 13]

export type CBElement = 'pelat' | 'balok'

export interface ContinuousBeamInput {
  elem: CBElement
  /** Jumlah bentang 1–12. */
  n: number
  /** Bentang ujung & dalam as–as (m), lebar tumpuan (mm). */
  L: number
  Li: number
  bsup: number
  /** Penampang (mm). */
  b: number
  h: number
  /** Beban tambahan pelat (kN/m²) & balok (kN/m). */
  qDs: number
  qLs: number
  qDb: number
  qLb: number
  ujung: 'bebas' | 'spandrel' | 'kolom'
  m12: 'std' | 'm12'
  tumpuan1: 'ss' | 'js' | 'jj'
  design: 'ya' | 'tidak'
  fc: number
  fy: number
  cc: number
  db: number | string
  fyt: number
  ds: number | string
}

export interface CBAsDesign {
  Mu: number
  As: number
  rho: number
  a: number
  c: number
  et: number
  tc: boolean
  infeasible: boolean
}

export interface CBDesignItem {
  label: string
  Mu: number
  face: 'atas' | 'bawah'
  As: number
  AsReq: number
  et: number
  tc: boolean
  infeasible: boolean
  govMin: boolean
  /** Pelat: spasi (mm); balok: jumlah batang. */
  s?: number
  n?: number
  AsProv?: number
  spacingCap?: boolean
  txt?: string
}

export interface CBShear {
  phi: number
  Vc: number
  phiVc: number
  VuN: number
  Av: number
  VsReq: number
  VsMax: number
  overMax: boolean
  sMax: number
  avMin: number
  zone: 'none' | 'min' | 'calc'
  avUse: number
  sReq: number
  sPakai: number | null
}

export interface CBDesign {
  valid: boolean
  fc: number
  fy: number
  cc: number
  db: number
  Ab: number
  err?: string
  bDes?: number
  d?: number
  ds?: number
  AsMin?: number
  sMaxSlab?: number | null
  items?: CBDesignItem[]
  anyInfeasible?: boolean
  anyNotTC?: boolean
  fyt?: number
  shear?: CBShear
}

export interface ContinuousBeamResult {
  elem: CBElement
  n: number
  warn: string[]
  valid: boolean
  b?: number
  h?: number
  qself?: number
  wD?: number
  wL?: number
  wu14?: number
  wu12?: number
  wu?: number
  gov14?: boolean
  L?: number
  bsup?: number
  lnE?: number
  Li?: number
  lnI?: number
  rasio?: number
  ujung?: string
  m12?: boolean
  cPosEnd?: number
  cNegExt?: number
  cNegFI?: number
  cNegInt?: number
  lnAvgFI?: number
  MposEnd?: number
  MposInt?: number | null
  MnegExt?: number
  MnegFI?: number
  MnegInt?: number | null
  Vext?: number
  VFI?: number
  Vint?: number | null
  tumpuan1?: string
  MnegJ?: number
  Mpos1?: number
  VJ?: number
  VS?: number
  /** Momen negatif & geser di tiap tumpuan, momen positif & panjang tiap bentang (untuk diagram). */
  supM?: (number | null)[]
  supV?: (number | null)[]
  spanM?: (number | null)[]
  spanLen?: number[]
  MnegMax?: number
  MposMax?: number
  VuMax?: number
  des?: CBDesign
}

/** Tulangan tarik penampang persegi untuk Mu (kNm), φ = 0,90. */
function designAs(Mu: number, b: number, d: number, fc: number, fy: number): CBAsDesign {
  const o: CBAsDesign = { Mu, As: 0, rho: 0, a: 0, c: 0, et: Infinity, tc: true, infeasible: false }
  if (!(Mu > 0) || !(b > 0) || !(d > 0)) return o
  const phi = 0.9
  const Rn = (Mu * 1e6) / phi / (b * d * d)
  let disc = 1 - (2 * Rn) / (0.85 * fc)
  if (disc < 0) { o.infeasible = true; disc = 0 }
  o.rho = ((0.85 * fc) / fy) * (1 - Math.sqrt(disc))
  o.As = o.rho * b * d
  o.a = (o.As * fy) / (0.85 * fc * b)
  o.c = o.a / beta1(fc)
  o.et = o.c > 0 ? (0.003 * (d - o.c)) / o.c : Infinity
  o.tc = o.et >= 0.005
  return o
}

/** Sengkang 2 kaki terhadap Vu (kN), Ps. 22.5 & 9. */
export function designShear(Vu: number, bw: number, d: number, fc: number, fyt: number, dsDia: number): CBShear {
  const phi = 0.75, VuN = Vu * 1e3
  const Vc = 0.17 * Math.sqrt(fc) * bw * d // N
  const phiVc = (phi * Vc) / 1e3
  const Av = 2 * barArea(dsDia)
  const VsReq = VuN / phi - Vc
  const avMin = (Math.max(0.062 * Math.sqrt(fc), 0.35) * bw) / fyt // Ps. 9.6.3.4
  const avReq = VsReq > 0 ? VsReq / (fyt * d) : 0
  const zone: CBShear['zone'] = VuN <= 0.5 * phiVc * 1e3 ? 'none' : VsReq <= 0 ? 'min' : 'calc'
  const avUse = zone === 'none' ? 0 : Math.max(avReq, avMin)
  const sMax = VsReq <= 0.33 * Math.sqrt(fc) * bw * d ? Math.min(d / 2, 600) : Math.min(d / 4, 300) // Ps. 9.7.6.2.2
  const sReq = Math.min(avUse > 0 ? Av / avUse : Infinity, sMax)
  return {
    phi, Vc: Vc / 1e3, phiVc, VuN, Av, VsReq: Math.max(0, VsReq) / 1e3, VsMax: (0.66 * Math.sqrt(fc) * bw * d) / 1e3,
    overMax: VsReq > 0.66 * Math.sqrt(fc) * bw * d, sMax, avMin, zone, avUse, sReq,
    sPakai: zone === 'none' ? null : Math.max(50, Math.floor(sReq / 10) * 10),
  }
}

export function computeContinuousBeam(v: ContinuousBeamInput): ContinuousBeamResult {
  const r: ContinuousBeamResult = { elem: v.elem, n: Math.round(v.n), warn: [], valid: true }
  let n = r.n
  if (!(n >= 1) || !(v.L > 0) || !(v.bsup >= 0) || !(v.h > 0)) { r.valid = false; return r }
  if (n > 12) r.n = n = 12

  // Beban per meter (pelat: lajur 1 m).
  let wD: number, wL: number
  if (v.elem === 'pelat') {
    r.qself = (GAMMA_C * v.h) / 1000
    wD = r.qself + (v.qDs || 0)
    wL = v.qLs || 0
  } else {
    if (!(v.b > 0)) { r.valid = false; return r }
    r.b = v.b
    r.qself = (GAMMA_C * v.b * v.h) / 1e6
    wD = r.qself + (v.qDb || 0)
    wL = v.qLb || 0
  }
  r.wD = wD
  r.wL = wL
  r.h = v.h
  if (!(wD > 0)) { r.valid = false; return r }

  const wu14 = 1.4 * wD, wu12 = 1.2 * wD + 1.6 * wL
  const wu = Math.max(wu14, wu12)
  Object.assign(r, { wu14, wu12, wu, gov14: wu14 >= wu12, L: v.L, bsup: v.bsup })

  // Bentang bersih.
  const lnE = v.L - v.bsup / 1000
  const Li = n >= 3 && v.Li > 0 ? v.Li : v.L
  const lnI = Li - v.bsup / 1000
  Object.assign(r, { lnE, Li, lnI })
  if (!(lnE > 0) || !(lnI > 0)) { r.valid = false; return r }

  if (wL > 3 * wD)
    r.warn.push('qL = ' + wL.toFixed(2) + ' > 3·qD = ' + (3 * wD).toFixed(2) +
      ' — syarat Ps. 6.5.1(c) TIDAK terpenuhi; metode koefisien tidak boleh dipakai, analisis elastis diperlukan.')

  if (n === 1) {
    singleSpan(r, v, lnE, wu)
    if (v.design === 'ya') design(r, v)
    return r
  }

  if (n >= 3) {
    const rasio = Math.max(lnE, lnI) / Math.min(lnE, lnI)
    r.rasio = rasio
    if (rasio > 1.2) r.warn.push('Bentang bersebelahan berbeda ' + ((rasio - 1) * 100).toFixed(0) + '% > 20% — syarat Ps. 6.5.1(e) TIDAK terpenuhi.')
  }

  const m12 = v.m12 === 'm12'
  const cPosEnd = v.ujung === 'bebas' ? 11 : 14
  let cNegExt = v.ujung === 'bebas' ? 0 : v.ujung === 'spandrel' ? 24 : 16
  let cNegFI: number, cNegInt: number
  if (m12) {
    if (cNegExt) cNegExt = 12
    cNegFI = 12
    cNegInt = 12
    if (v.elem === 'pelat' && (lnE > 3 || lnI > 3))
      r.warn.push('Opsi 1/12 untuk pelat hanya berlaku bila SEMUA bentang ≤ 3 m (Tabel 6.5.2) — bentang Anda lebih panjang.')
  } else {
    cNegFI = n === 2 ? 9 : 10
    cNegInt = 11
    if (v.elem === 'pelat' && lnE <= 3 && lnI <= 3)
      r.warn.push('Semua bentang ≤ 3 m — boleh memakai opsi M− = wu·ln²/12 di semua tumpuan (Tabel 6.5.2).')
  }
  const lnAvgFI = n >= 3 ? (lnE + lnI) / 2 : lnE
  const MposEnd = (wu * lnE * lnE) / cPosEnd
  const MposInt = n >= 3 ? (wu * lnI * lnI) / 16 : null
  const MnegExt = cNegExt ? (wu * lnE * lnE) / cNegExt : 0
  const MnegFI = (wu * lnAvgFI * lnAvgFI) / cNegFI
  const MnegInt = n >= 4 ? (wu * lnI * lnI) / cNegInt : null
  const Vext = (wu * lnE) / 2
  const VFI = (1.15 * wu * lnE) / 2
  const Vint = n >= 3 ? (wu * lnI) / 2 : null
  Object.assign(r, {
    ujung: v.ujung, m12, cPosEnd, cNegExt, cNegFI, cNegInt, lnAvgFI, MposEnd, MposInt, MnegExt, MnegFI, MnegInt,
    Vext, VFI, Vint,
  })

  // Momen tumpuan (negatif) & lapangan (positif) untuk diagram.
  const supM: (number | null)[] = [], supV: (number | null)[] = [], spanM: (number | null)[] = [], spanLen: number[] = []
  for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n) { supM.push(MnegExt); supV.push(Vext) }
    else if (i === 1 || i === n - 1) { supM.push(MnegFI); supV.push(VFI) }
    else { supM.push(MnegInt); supV.push(Vint) }
  }
  for (let i = 0; i < n; i++) {
    const end = i === 0 || i === n - 1
    spanM.push(end ? MposEnd : MposInt)
    spanLen.push(end ? v.L : Li)
  }
  Object.assign(r, {
    supM, supV, spanM, spanLen, MnegMax: Math.max(...(supM as number[])), MposMax: Math.max(MposEnd, MposInt || 0), VuMax: VFI,
  })
  if (v.design === 'ya') design(r, v)
  return r
}

function singleSpan(r: ContinuousBeamResult, v: ContinuousBeamInput, ln: number, wu: number): void {
  const c = v.tumpuan1
  r.tumpuan1 = c
  r.spanLen = [r.L as number]
  let MnegJ: number, Mpos1: number, VJ: number, VS: number
  if (c === 'js') {
    MnegJ = (wu * ln * ln) / 8
    Mpos1 = (9 * wu * ln * ln) / 128
    VJ = (5 * wu * ln) / 8
    VS = (3 * wu * ln) / 8
    r.supM = [MnegJ, 0]
    r.supV = [VJ, VS]
  } else if (c === 'jj') {
    MnegJ = (wu * ln * ln) / 12
    Mpos1 = (wu * ln * ln) / 24
    VJ = VS = (wu * ln) / 2
    r.supM = [MnegJ, MnegJ]
    r.supV = [VJ, VJ]
  } else {
    MnegJ = 0
    Mpos1 = (wu * ln * ln) / 8
    VJ = VS = (wu * ln) / 2
    r.supM = [0, 0]
    r.supV = [VJ, VJ]
  }
  Object.assign(r, { MnegJ, Mpos1, VJ, VS, spanM: [Mpos1], MnegMax: MnegJ, MposMax: Mpos1, VuMax: VJ })
}

/** Desain lentur (balok & pelat) + geser (balok). */
function design(r: ContinuousBeamResult, v: ContinuousBeamInput): void {
  const { fc, fy, cc } = v
  const db = parseFloat(String(v.db))
  const Ab = barArea(db)
  const d: CBDesign = { valid: false, fc, fy, cc, db, Ab }
  r.des = d
  if (!(fc > 0) || !(fy > 0) || !(cc >= 0) || !(db > 0)) return

  const pelat = r.elem === 'pelat'
  const h = r.h as number
  const bDes = pelat ? 1000 : (r.b as number)
  const ds = pelat ? 0 : parseFloat(String(v.ds))
  const dEff = h - cc - ds - db / 2 // satu lapis
  if (!(dEff > 0)) { d.err = 'Tinggi efektif ≤ 0 — periksa h, selimut, atau diameter.'; return }
  Object.assign(d, { bDes, d: dEff, ds })
  const AsMin = pelat ? rhoShrinkage(fy) * bDes * h : rhoMinBeam(fc, fy) * bDes * dEff
  const sMaxSlab = pelat ? Math.min(3 * h, 450) : null
  d.AsMin = AsMin
  d.sMaxSlab = sMaxSlab

  const items: CBDesignItem[] = []
  const add = (label: string, Mu: number | null | undefined, face: 'atas' | 'bawah') => {
    if (!((Mu as number) > 0)) return
    const a = designAs(Mu as number, bDes, dEff, fc, fy)
    const AsReq = Math.max(a.As, AsMin)
    const it: CBDesignItem = {
      label, Mu: Mu as number, face, As: a.As, AsReq, et: a.et, tc: a.tc, infeasible: a.infeasible, govMin: AsReq > a.As + 1e-6,
    }
    if (pelat) {
      const s = (1000 * Ab) / AsReq
      let sPakai = Math.floor(s / 25) * 25
      const sCap = Math.floor((sMaxSlab as number) / 25) * 25
      if (sPakai > sCap) sPakai = sCap
      it.s = Math.max(50, sPakai)
      it.AsProv = (1000 * Ab) / it.s
      it.spacingCap = s > (sMaxSlab as number)
      it.txt = 'D' + db + '-' + it.s
    } else {
      it.n = Math.max(2, Math.ceil(AsReq / Ab))
      it.AsProv = it.n * Ab
      it.txt = it.n + ' D' + db
    }
    items.push(it)
  }
  if (r.n === 1) {
    add('M+ lapangan', r.Mpos1, 'bawah')
    add('M− tumpuan jepit', r.MnegJ, 'atas')
  } else {
    add('M+ bentang ujung', r.MposEnd, 'bawah')
    if (r.MposInt !== null) add('M+ bentang dalam', r.MposInt, 'bawah')
    add('M− tumpuan luar', r.MnegExt, 'atas')
    add('M− tumpuan dalam-1', r.MnegFI, 'atas')
    if (r.MnegInt !== null) add('M− tumpuan dalam lain', r.MnegInt, 'atas')
  }
  d.items = items
  d.anyInfeasible = items.some((i) => i.infeasible)
  d.anyNotTC = items.some((i) => !i.tc && !i.infeasible)
  if (!pelat) {
    const fyt = v.fyt > 0 ? v.fyt : fy
    d.fyt = fyt
    d.shear = designShear(r.VuMax as number, r.b as number, dEff, fc, fyt, ds)
  }
  d.valid = true
}
