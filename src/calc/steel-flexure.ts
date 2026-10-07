// Balok baja (lentur) — SNI 1729:2020 (AISC 360-16) Bab F, DFBK (φ 0,90) & ASD (Ω 1,67).
// Port 1:1 dari modules/steel-flexure/module.js (compute), diverifikasi golden test.
//
//   F2/F3 I dwi-simetris & kanal sumbu kuat (LTB + FLB); F6 WF sumbu lemah; F7 HSS kotak (FLB, WLB, LTB RHS sumbu kuat);
//   F8 HSS bundar; siku/CNP (F10/F12) hanya leleh elastis indikatif.
//   Zx/Zy, J, Cw dihitung dari geometri (J thin-wall tanpa fillet → konservatif; Cw kanal rumus pendekatan).
// TIDAK termasuk: badan non-kompak/langsing penuh (F4/F5 Rpc/Rpg), F10/F12 lengkap, geser (Bab G), lendutan.

import { num, type NumLike } from './shared/num'
import { E_STEEL as E_MOD } from './shared/steel'
import { getProfile, typeInfo, type SteelProfile, type SteelTypeInfo } from './shared/steel-profiles'

const PHI_B = 0.9, OMEGA_B = 1.67

/** Preset Cb (0 = manual). */
export const CB_PRESETS: readonly [string, number][] = [
  ['Momen seragam / konservatif  (Cb=1,0)', 1.0],
  ['Balok sederhana + beban merata  (Cb=1,14)', 1.14],
  ['Balok sederhana + beban titik tengah  (Cb=1,32)', 1.32],
  ['Kantilever ujung terbeban  (Cb=1,0)', 1.0],
  ['Manual (isi Cb sendiri)', 0],
]

export interface SteelFlexureInput {
  ptype: string
  psize: string
  Fy: NumLike
  axis?: 'x' | 'y'
  /** Panjang tak-terkekang lateral (mm). */
  Lb: NumLike
  /** Nilai Cb preset (teks), '0' = manual. */
  Cbpreset: string | number
  Cbval: NumLike
  /** Momen terfaktor & layan (kNm), 0 = lewati. */
  Mu: NumLike
  Ma: NumLike
}

export type ElementClass = 'kompak' | 'nonkompak' | 'langsing'

export interface Classification {
  cls: ElementClass
  lam: number
  lp: number
  lr: number
}

/** Hasil keadaan batas lentur (satuan N, mm). Field bergantung pada pasal (F2/F3, F6, F7, F8, indikatif). */
export interface FlexureState {
  axis: 'x' | 'y'
  section: string
  Fy: number
  Mp: number
  Mn: number
  gov: string
  ltb: boolean
  Zx?: number
  Zy?: number
  Z?: number
  Sx?: number
  Sy?: number
  S?: number
  Mr?: number
  MpCap?: number
  ry?: number
  rts?: number
  ho?: number
  J?: number
  Cw?: number
  c?: number
  Lb?: number
  Lp?: number
  Lr?: number
  Cb?: number
  ltbMode?: string
  Mn_ltb?: number
  Mn_flb?: number
  Mn_f?: number
  Mn_w?: number
  flbMode?: string
  flange?: Classification
  web?: Classification
  lamF?: number
  bflat?: number
  hflat?: number
  Dt?: number
  lp?: number
  lr?: number
  lmax?: number
  cls?: ElementClass
  indicative?: boolean
}

export interface SteelFlexureResult {
  warn: string[]
  valid: boolean
  p?: SteelProfile
  type?: string
  ti?: SteelTypeInfo | null
  name?: string
  axis?: 'x' | 'y'
  f?: FlexureState
  /** kNm */
  Mn?: number
  Mp?: number
  phiMn?: number
  Ma?: number
  Mu?: number
  MaDem?: number
  dcL?: number | null
  dcA?: number | null
  Cb?: number
  Lb?: number
}

/** Klasifikasi elemen lentur (Tabel B4.1b). */
function classify(lam: number, lp: number, lr: number): Classification {
  return { cls: lam <= lp ? 'kompak' : lam <= lr ? 'nonkompak' : 'langsing', lam, lp, lr }
}

/** Properti turunan I / kanal: Zx, Zy, J, Cw, ho, rts, c (mm). */
export function torsionProps(p: SteelProfile, type: string) {
  const d = p.H as number, bf = p.B as number, tw = p.tw as number, tf = p.tf as number
  const Sx = (p.Sx as number) * 1e3
  const Iy = p.Iy * 1e4
  const ho = d - tf
  const J = (2 * bf * Math.pow(tf, 3) + (d - 2 * tf) * Math.pow(tw, 3)) / 3
  const Zx = bf * tf * (d - tf) + (tw * Math.pow(d - 2 * tf, 2)) / 4
  const Zy = (tf * bf * bf) / 2 + ((d - 2 * tf) * tw * tw) / 4
  let Cw: number, c: number
  if (type === 'WF') {
    Cw = (Iy * ho * ho) / 4
    c = 1
  } else { // kanal (UNP)
    Cw = ((ho * ho * Math.pow(bf, 3) * tf) / 12) * (3 * bf * tf + 2 * ho * tw) / (6 * bf * tf + ho * tw)
    c = (ho / 2) * Math.sqrt(Iy / Cw)
  }
  return { Zx, Zy, J, Cw, ho, rts: Math.sqrt(Math.sqrt(Iy * Cw) / Sx), c, Sx, Iy }
}

/** F2/F3 — I dwi-simetris & kanal, sumbu kuat. */
function flexImajor(p: SteelProfile, type: string, Fy: number, Lb: number, Cb: number): FlexureState {
  const kE = Math.sqrt(E_MOD / Fy)
  const d = p.H as number, bf = p.B as number, tw = p.tw as number, tf = p.tf as number
  const tp = torsionProps(p, type)
  const { Sx, ho, rts, J, c, Zx } = tp
  const ry = p.iy * 10
  const Mp = Fy * Zx
  const Mr = 0.7 * Fy * Sx
  const lamF = type === 'WF' ? bf / 2 / tf : bf / tf
  const flange = classify(lamF, 0.38 * kE, 1.0 * kE)
  const hw = d - 2 * tf
  const web = classify(hw / tw, 3.76 * kE, 5.7 * kE)

  // (1) LTB — F2.
  const Lp = 1.76 * ry * kE
  const jcSxho = (J * c) / (Sx * ho)
  const Lr = 1.95 * rts * (E_MOD / (0.7 * Fy)) * Math.sqrt(jcSxho + Math.sqrt(jcSxho * jcSxho + 6.76 * Math.pow((0.7 * Fy) / E_MOD, 2)))
  let Mn_ltb: number, ltbMode: string
  if (Lb <= Lp) { Mn_ltb = Mp; ltbMode = 'Plastis (Lb ≤ Lp)' }
  else if (Lb <= Lr) {
    Mn_ltb = Math.min(Cb * (Mp - ((Mp - Mr) * (Lb - Lp)) / (Lr - Lp)), Mp)
    ltbMode = 'LTB inelastis (Lp < Lb ≤ Lr)'
  } else {
    const lamb = Lb / rts
    const Fcr = ((Cb * Math.PI * Math.PI * E_MOD) / (lamb * lamb)) * Math.sqrt(1 + 0.078 * jcSxho * lamb * lamb)
    Mn_ltb = Math.min(Fcr * Sx, Mp)
    ltbMode = 'LTB elastis (Lb > Lr)'
  }

  // (2) FLB — F3.
  let Mn_flb = Mp, flbMode = 'sayap kompak'
  if (flange.cls === 'nonkompak') {
    Mn_flb = Mp - ((Mp - Mr) * (lamF - flange.lp)) / (flange.lr - flange.lp)
    flbMode = 'FLB non-kompak'
  } else if (flange.cls === 'langsing') {
    const kc = Math.max(0.35, Math.min(0.76, 4 / Math.sqrt(hw / tw)))
    Mn_flb = (0.9 * E_MOD * kc * Sx) / (lamF * lamF)
    flbMode = 'FLB langsing'
  }

  const flbGov = Mn_flb < Mn_ltb
  return {
    axis: 'x', section: type === 'WF' ? 'F2/F3' : 'F2', Fy, Zx, Sx, Mp, Mr,
    Mn: flbGov ? Mn_flb : Mn_ltb,
    gov: flbGov ? 'Tekuk lokal sayap (F3)' : ltbMode.indexOf('Plastis') === 0 ? 'Leleh / plastis (F2)' : 'Tekuk torsi-lateral (F2)',
    ry, rts, ho, J, Cw: tp.Cw, c, Lb, Lp, Lr, Cb, ltb: true, ltbMode, Mn_ltb, Mn_flb, flbMode, flange, web, lamF,
  }
}

/** F6 — WF sumbu lemah. */
function flexIminor(p: SteelProfile, Fy: number): FlexureState {
  const kE = Math.sqrt(E_MOD / Fy)
  const bf = p.B as number, tf = p.tf as number
  const Zy = torsionProps(p, 'WF').Zy, Sy = (p.Sy as number) * 1e3
  const MpCap = 1.6 * Fy * Sy
  const Mp = Math.min(Fy * Zy, MpCap)
  const lamF = bf / 2 / tf
  const flange = classify(lamF, 0.38 * kE, 1.0 * kE)
  let Mn: number, gov: string, flbMode: string
  if (flange.cls === 'kompak') { Mn = Mp; gov = 'Leleh (F6)'; flbMode = 'sayap kompak' }
  else if (flange.cls === 'nonkompak') {
    Mn = Mp - ((Mp - 0.7 * Fy * Sy) * (lamF - flange.lp)) / (flange.lr - flange.lp)
    gov = 'Tekuk lokal sayap (F6)'
    flbMode = 'FLB non-kompak'
  } else {
    Mn = ((0.69 * E_MOD) / (lamF * lamF)) * Sy
    gov = 'Tekuk lokal sayap langsing (F6)'
    flbMode = 'FLB langsing'
  }
  return { axis: 'y', section: 'F6', Fy, Zy, Sy, Mp, MpCap, Mn, gov, ltb: false, flange, lamF, flbMode }
}

/** F7 — HSS persegi/kotak. */
function flexBox(p: SteelProfile, axis: 'x' | 'y', Fy: number, Lb: number, Cb: number): FlexureState {
  const kE = Math.sqrt(E_MOD / Fy)
  const t = p.t, H = p.H as number, B = p.B as number
  const Hd = axis === 'x' ? H : B
  const Bd = axis === 'x' ? B : H
  const Z = ((axis === 'x' ? p.Zx : p.Zy) as number) * 1e3
  const S = ((axis === 'x' ? p.Sx : p.Sy) as number) * 1e3
  const Mp = Fy * Z
  const bflat = Math.max(1, Bd - 3 * t), hflat = Math.max(1, Hd - 3 * t)
  const flange = classify(bflat / t, 1.12 * kE, 1.4 * kE)
  const web = classify(hflat / t, 2.42 * kE, 5.7 * kE)

  // Tekuk lokal sayap (F7.2).
  let Mn_f = Mp
  if (flange.cls === 'nonkompak') {
    Mn_f = Math.min(Mp - (Mp - Fy * S) * (3.57 * (bflat / t) * Math.sqrt(Fy / E_MOD) - 4.0), Mp)
  } else if (flange.cls === 'langsing') {
    const be = Math.min(1.92 * t * Math.sqrt(E_MOD / Fy) * (1 - (0.38 / (bflat / t)) * Math.sqrt(E_MOD / Fy)), bflat)
    Mn_f = Fy * S * (be / bflat) // pendekatan konservatif lebar efektif
  }
  // Tekuk lokal badan (F7.3).
  let Mn_w = Mp
  if (web.cls === 'nonkompak') {
    Mn_w = Math.min(Mp - (Mp - Fy * S) * (0.305 * (hflat / t) * Math.sqrt(Fy / E_MOD) - 0.738), Mp)
  } else if (web.cls === 'langsing') {
    Mn_w = Fy * S // pendekatan
  }

  // LTB kotak (F7.4) — hanya RHS lentur sumbu kuat (H > B).
  let ltb = false, Lp = 0, Lr = 0, Mn_ltb = Mp, ltbMode = '', Jbox = 0
  const ry = p.iy * 10, Mr = 0.7 * Fy * S
  if (axis === 'x' && Lb > 0 && H > B) {
    const A = p.A * 100
    const a = B - t, b = H - t
    Jbox = (2 * t * a * a * b * b) / (a + b) // tabung tertutup thin-wall
    Lp = (0.13 * E_MOD * ry * Math.sqrt(Jbox * A)) / Mp
    Lr = (2 * E_MOD * ry * Math.sqrt(Jbox * A)) / (0.7 * Fy * S)
    ltb = true
    if (Lb <= Lp) { Mn_ltb = Mp; ltbMode = 'Plastis (Lb ≤ Lp)' }
    else if (Lb <= Lr) {
      Mn_ltb = Math.min(Cb * (Mp - ((Mp - Mr) * (Lb - Lp)) / (Lr - Lp)), Mp)
      ltbMode = 'LTB inelastis'
    } else {
      Mn_ltb = Math.min((2 * E_MOD * Cb * Math.sqrt(Jbox * A)) / (Lb / ry), Mp)
      ltbMode = 'LTB elastis'
    }
  }

  // Leleh lebih dulu agar saat seri (semua = Mp) dilaporkan sebagai leleh, bukan tekuk lokal.
  const cands = [
    { m: Mn_ltb, g: ltb && ltbMode.indexOf('Plastis') !== 0 ? 'LTB kotak (F7.4)' : 'Leleh / plastis (F7.1)' },
    { m: Mn_f, g: 'Tekuk lokal sayap (F7.2)' },
    { m: Mn_w, g: 'Tekuk lokal badan (F7.3)' },
  ]
  let min = cands[0]
  for (const cc of cands) if (cc.m < min.m) min = cc
  return {
    axis, section: 'F7', Fy, Z, S, Mp, Mr, Mn: min.m, gov: min.g, flange, web, bflat, hflat, Mn_f, Mn_w,
    ltb, Lb, Lp, Lr, Cb, Mn_ltb, ltbMode, ry, J: Jbox,
  }
}

/** F8 — HSS bundar. */
function flexPipe(p: SteelProfile, Fy: number): FlexureState {
  const Dt = (p.D as number) / p.t
  const lp = (0.07 * E_MOD) / Fy, lr = (0.31 * E_MOD) / Fy, lmax = (0.45 * E_MOD) / Fy
  const Z = (p.Zx as number) * 1e3, S = (p.Sx as number) * 1e3
  const Mp = Fy * Z
  let Mn: number, gov: string, cls: ElementClass
  if (Dt <= lp) { Mn = Mp; cls = 'kompak'; gov = 'Leleh (F8.1)' }
  else if (Dt <= lr) { Mn = ((0.021 * E_MOD) / Dt + Fy) * S; cls = 'nonkompak'; gov = 'Tekuk lokal (F8.2)' }
  else { Mn = ((0.33 * E_MOD) / Dt) * S; cls = 'langsing'; gov = 'Tekuk lokal langsing (F8.3)' }
  return { axis: 'x', section: 'F8', Fy, Z, S, Mp, Mn: Math.min(Mn, Mp), gov, ltb: false, Dt, lp, lr, lmax, cls }
}

/** Siku & CNP: leleh elastis indikatif (F10/F12 butuh sumbu utama & pusat geser). */
function flexOther(p: SteelProfile, type: string, Fy: number): FlexureState {
  const S = (p.Sx as number) * 1e3
  const My = Fy * S
  return { axis: 'x', section: type === 'L' ? 'F10*' : 'F12*', Fy, S, Mp: My, Mn: My, gov: 'Leleh elastis (indikatif)', ltb: false, indicative: true }
}

export function computeSteelFlexure(v: SteelFlexureInput): SteelFlexureResult {
  const r: SteelFlexureResult = { warn: [], valid: false }
  const type = v.ptype, name = v.psize
  const p = getProfile(type, name)
  if (!p) { r.warn.push('Profil belum dipilih.'); return r }
  const ti = typeInfo(type) as SteelTypeInfo
  const Fy = num(v.Fy)
  if (!(Fy > 0)) { r.warn.push('Fy harus > 0.'); return r }

  const axis = v.axis || 'x'
  const Lb = num(v.Lb)
  let Cb = String(v.Cbpreset) === '0' ? num(v.Cbval) : num(v.Cbpreset)
  if (!(Cb > 0)) Cb = 1.0

  let f: FlexureState
  if (type === 'WF') f = axis === 'y' ? flexIminor(p, Fy) : flexImajor(p, type, Fy, Lb, Cb)
  else if (type === 'UNP') {
    if (axis === 'y') r.warn.push('Sumbu lemah kanal (UNP) bersifat tak-simetris (pusat geser ≠ centroid) — F6 untuk kanal butuh properti yang belum tersedia di library. Gunakan sumbu KUAT, atau verifikasi terpisah. Ditampilkan sumbu kuat.')
    f = flexImajor(p, type, Fy, Lb, Cb)
  } else if (type === 'SHS' || type === 'RHS') f = flexBox(p, axis, Fy, Lb, Cb)
  else if (type === 'PIPE') f = flexPipe(p, Fy)
  else f = flexOther(p, type, Fy) // siku, CNP

  if (!(f.Mn > 0)) { r.warn.push('Perhitungan Mn gagal — periksa properti profil.'); return r }

  const Mn = f.Mn / 1e6, Mp = f.Mp / 1e6
  const phiMn = PHI_B * Mn, Ma_cap = Mn / OMEGA_B
  const Mu = num(v.Mu), MaDem = num(v.Ma)
  const dcL = Mu > 0 ? Mu / phiMn : null
  const dcA = MaDem > 0 ? MaDem / Ma_cap : null
  Object.assign(r, { valid: true, p, type, ti, name, axis, f, Mn, Mp, phiMn, Ma: Ma_cap, Mu, MaDem, dcL, dcA, Cb, Lb })

  if (f.web && f.web.cls !== 'kompak')
    r.warn.push('Badan penampang ' + f.web.cls.toUpperCase() + ' (h/tw = ' + f.web.lam.toFixed(1) + ' > λp ' + f.web.lp.toFixed(1) + ') — provisi badan non-kompak/langsing (F4/F5, faktor Rpc/Rpg) TIDAK diterapkan penuh; Mn di atas berpotensi tidak konservatif.')
  // Build lama memakai f.lamF yang tidak ada pada F7 (HSS kotak) → crash; dipakai λ klasifikasi sayap (perbaikan).
  if (f.flange && f.flange.cls === 'langsing')
    r.warn.push('Sayap LANGSING (λ = ' + (f.lamF ?? f.flange.lam).toFixed(1) + ' > λr) — kekuatan diatur tekuk lokal sayap; verifikasi tekuk lokal & lebar efektif.')
  if (f.section === 'F7' && ((f.flange as Classification).cls === 'langsing' || (f.web && f.web.cls === 'langsing')))
    r.warn.push('HSS dengan elemen langsing — perhitungan lebar/luas efektif (F7) dipakai pendekatan konservatif; verifikasi terpisah.')
  if (f.indicative)
    r.warn.push('Penampang ' + ti.name + ' (tak-simetris / sudut tunggal): kekuatan lentur AISC F10 (siku, sumbu utama & LTB) / F12 (tak-simetris) butuh sumbu utama & pusat geser yang BELUM ada di library. Yang ditampilkan hanya LELEH ELASTIS Mn=Fy·Sx (indikatif) — BUKAN untuk desain akhir; LTB & tekuk lokal belum diperhitungkan.')
  if (f.section === 'F8' && (f.Dt as number) > (f.lmax as number))
    r.warn.push('D/t = ' + (f.Dt as number).toFixed(1) + ' > 0,45E/Fy (' + (f.lmax as number).toFixed(0) + ') — di luar batas terapan lentur HSS bundar (F8). Hasil tidak berlaku.')
  if (type === 'CNP')
    r.warn.push('Profil CNP (cold-formed) sepenuhnya diatur SNI 7971 / AISI (lebar efektif, tekuk distorsi) — hasil di sini hanya indikasi kasar.')
  if (f.ltb && (f.Lb as number) <= 0)
    r.warn.push('Lb = 0 (dianggap terkekang penuh) → kapasitas = kekuatan plastis Mp tanpa reduksi LTB. Isi Lb (panjang tak-terkekang lateral) untuk cek tekuk torsi-lateral.')
  if (dcL !== null && dcL > 1) r.warn.push('DFBK: Mu/φMn = ' + dcL.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.')
  if (dcA !== null && dcA > 1) r.warn.push('ASD: Ma/(Mn/Ω) = ' + dcA.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.')
  if (p.source === 'hitung' && !f.indicative)
    r.warn.push('Properti profil ' + ti.name + ' DIHITUNG dari geometri (' + (p.note || '') + '); verifikasi terhadap katalog pabrikan.')
  return r
}
