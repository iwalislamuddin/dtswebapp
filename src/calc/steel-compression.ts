// Batang tekan baja — SNI 1729:2020 (AISC 360-16) Bab E, DFBK (φ 0,90) & ASD (Ω 1,67).
// Port 1:1 dari modules/steel-compression/module.js (compute), diverifikasi golden test.
//
//   Tekuk lentur E3: Fe = π²E/(KL/r)², Fcr = 0,658^(Fy/Fe)·Fy (Fy/Fe ≤ 2,25) atau 0,877·Fe; KL/r = maks dua sumbu.
//   Tekuk torsi E4-2 (WF dwi-simetris): Fe = [π²E·Cw/(Kz·Lz)² + G·J]/(Ix + Iy), J thin-wall tanpa fillet.
//   Elemen langsing Tabel B4.1a hanya diperingatkan (E7 tidak diterapkan).
// TIDAK termasuk: tekuk lentur-torsi UNP/siku/CNP (E4/E5), reduksi elemen langsing (E7).
// Catatan: siku memakai ix/iy (bukan iv) — dicatat sebagai perbaikan isi setelah port (docs/TODO.md).

import { num, type NumLike } from './shared/num'
import { E_STEEL as E_MOD } from './shared/steel'
import { AgMm2, getProfile, typeInfo, type SteelProfile, type SteelTypeInfo } from './shared/steel-profiles'

const PHI_C = 0.9, OMEGA_C = 1.67
/** Modulus geser (MPa), ν = 0,3. */
const G_MOD = 77200

/** Preset K (Tabel C-A-7.1, nilai desain; 0 = manual). */
export const K_PRESETS: readonly [string, number][] = [
  ['Sendi–sendi  (K=1,0)', 1.0],
  ['Jepit–jepit  (K=0,65)', 0.65],
  ['Jepit–sendi  (K=0,80)', 0.8],
  ['Jepit–rol geser  (K=1,2)', 1.2],
  ['Sendi–bebas translasi  (K=2,0)', 2.0],
  ['Jepit–bebas / kantilever  (K=2,1)', 2.1],
  ['Manual (isi K sendiri)', 0],
]

export interface SteelCompressionInput {
  ptype: string
  psize: string
  Fy: NumLike
  /** Nilai K preset (teks), '0' = manual. */
  Kpreset: string
  Kval: NumLike
  /** Panjang tak-terkekang sumbu kuat & lemah (mm). */
  Lx: NumLike
  Ly: NumLike
  /** Torsi WF: Kz & Lz (mm), 0 = 1,0 / maks(Lx, Ly). */
  Kz: NumLike
  Lz: NumLike
  Pu: NumLike
  Pa: NumLike
}

export interface SlenderItem {
  el: string
  lam: number
  lamr: number
  slender: boolean
}

export interface TorsionalBuckling {
  G: number
  Cw: number
  J: number
  Kz: number
  Lz: number
  Lcz: number
  Fe: number
  Fcr: number
  lamEq: number
  Pn: number
}

export interface SteelCompressionResult {
  warn: string[]
  valid: boolean
  p?: SteelProfile
  type?: string
  ti?: SteelTypeInfo | null
  name?: string
  Fy?: number
  Ag?: number
  rx?: number
  ry?: number
  K?: number
  Lx?: number
  Ly?: number
  lamX?: number
  lamY?: number
  lam?: number
  govAxis?: string
  lamLimit?: number
  FeFlex?: number
  FcrFlex?: number
  PnFlex?: number
  tors?: TorsionalBuckling | null
  Fe?: number
  Fcr?: number
  govLS?: string
  mode?: string
  Pn?: number
  phiPn?: number
  Pa?: number
  Pu?: number
  Pa_dem?: number
  dcL?: number | null
  dcA?: number | null
  local?: { slender: boolean; items: SlenderItem[]; cnp: boolean }
}

/** Fcr (MPa) dari tegangan tekuk elastis Fe — Pers. E3-2/E3-3. */
export function fcrFromFe(Fe: number, Fy: number): number {
  if (!(Fe > 0)) return 0
  if (Fy / Fe <= 2.25) return Math.pow(0.658, Fy / Fe) * Fy // inelastis
  return 0.877 * Fe // elastis (Euler)
}

/** Fcr untuk kelangsingan lentur KL/r. */
export function fcrFlexural(lam: number, Fy: number): number {
  if (!(lam > 0)) return Fy // batang sangat pendek → leleh
  return fcrFromFe((Math.PI * Math.PI * E_MOD) / (lam * lam), Fy)
}

/** Elemen langsing komponen tekan (Tabel B4.1a). */
function localCheck(type: string, p: SteelProfile, Fy: number) {
  const kE = Math.sqrt(E_MOD / Fy)
  const items: SlenderItem[] = []
  const add = (el: string, lam: number, lamr: number) => items.push({ el, lam, lamr, slender: lam > lamr })
  const B = p.B as number, H = p.H as number, tf = p.tf as number, tw = p.tw as number
  if (p.shape === 'I') {
    add('Sayap (b/2tf)', B / 2 / tf, 0.56 * kE)
    add('Badan (h/tw)', (H - 2 * tf) / tw, 1.49 * kE)
  } else if (type === 'UNP') {
    add('Sayap (b/tf)', B / tf, 0.56 * kE)
    add('Badan (h/tw)', (H - 2 * tf) / tw, 1.49 * kE)
  } else if (p.shape === 'L') {
    add('Kaki (b/t)', (p.a as number) / p.t, 0.45 * kE)
  } else if (p.shape === 'box') {
    add('Dinding (b/t)', (Math.max(B, H) - 2 * p.t) / p.t, 1.4 * kE)
  } else if (p.shape === 'pipe') {
    add('Dinding (D/t)', (p.D as number) / p.t, (0.11 * E_MOD) / Fy)
  }
  return { slender: items.some((it) => it.slender), items, cnp: type === 'CNP' }
}

export function computeSteelCompression(v: SteelCompressionInput): SteelCompressionResult {
  const r: SteelCompressionResult = { warn: [], valid: false }
  const type = v.ptype, name = v.psize
  const p = getProfile(type, name)
  if (!p) { r.warn.push('Profil belum dipilih.'); return r }
  const ti = typeInfo(type)
  const Fy = num(v.Fy)
  if (!(Fy > 0)) { r.warn.push('Fy harus > 0.'); return r }

  const Ag = AgMm2(p)
  const rx = p.ix * 10, ry = p.iy * 10
  if (!(rx > 0) || !(ry > 0)) { r.warn.push('Jari-jari girasi profil tidak tersedia.'); return r }

  let K = v.Kpreset === '0' ? num(v.Kval) : num(v.Kpreset)
  if (!(K > 0)) { K = 1.0; r.warn.push('K tidak valid → dipakai 1,0.') }
  const Lx = num(v.Lx), Ly = num(v.Ly)
  const lamX = Lx > 0 ? (K * Lx) / rx : 0
  const lamY = Ly > 0 ? (K * Ly) / ry : 0
  const lam = Math.max(lamX, lamY)
  if (!(lam > 0)) { r.warn.push('Panjang batang (Lx/Ly) harus > 0.'); return r }

  // (1) Tekuk lentur E3.
  const FeFlex = (Math.PI * Math.PI * E_MOD) / (lam * lam)
  const FcrFlex = fcrFlexural(lam, Fy)
  const PnFlex = (FcrFlex * Ag) / 1000

  // (2) Tekuk torsi E4-2 — WF dwi-simetris.
  let tors: TorsionalBuckling | null = null
  if (type === 'WF') {
    const B = p.B as number, H = p.H as number, tf = p.tf as number, tw = p.tw as number
    const Ix4 = p.Ix * 1e4, Iy4 = p.Iy * 1e4
    const ho = H - tf
    const Cw = (Iy4 * ho * ho) / 4
    const J = (2 * B * Math.pow(tf, 3) + (H - 2 * tf) * Math.pow(tw, 3)) / 3 // thin-wall, tanpa fillet → konservatif
    let Kz = num(v.Kz)
    if (!(Kz > 0)) Kz = 1.0
    let Lz = num(v.Lz)
    if (!(Lz > 0)) Lz = Math.max(Lx, Ly)
    const Lcz = Kz * Lz
    const Fe = ((Math.PI * Math.PI * E_MOD * Cw) / (Lcz * Lcz) + G_MOD * J) / (Ix4 + Iy4)
    const Fcr = fcrFromFe(Fe, Fy)
    tors = { G: G_MOD, Cw, J, Kz, Lz, Lcz, Fe, Fcr, lamEq: Math.PI * Math.sqrt(E_MOD / Fe), Pn: (Fcr * Ag) / 1000 }
  }

  // (3) Keadaan batas menentukan.
  const torsGov = !!tors && tors.Pn < PnFlex
  const Pn = torsGov ? (tors as TorsionalBuckling).Pn : PnFlex
  const Fcr = torsGov ? (tors as TorsionalBuckling).Fcr : FcrFlex
  const Fe = torsGov ? (tors as TorsionalBuckling).Fe : FeFlex
  const phiPn = PHI_C * Pn, Pa = Pn / OMEGA_C
  const Pu = num(v.Pu), Pa_dem = num(v.Pa)
  const dcL = Pu > 0 ? Pu / phiPn : null
  const dcA = Pa_dem > 0 ? Pa_dem / Pa : null
  const lc = localCheck(type, p, Fy)

  Object.assign(r, {
    valid: true, p, type, ti, name, Fy, Ag, rx, ry, K, Lx, Ly, lamX, lamY, lam,
    govAxis: lamY >= lamX ? 'y-y (sumbu lemah)' : 'x-x (sumbu kuat)', lamLimit: 4.71 * Math.sqrt(E_MOD / Fy),
    FeFlex, FcrFlex, PnFlex, tors, Fe, Fcr, govLS: torsGov ? 'Tekuk torsi (E4)' : 'Tekuk lentur (E3)',
    mode: Fy / Fe <= 2.25 ? 'Inelastis (tekuk tak-elastis)' : 'Elastis (Euler)',
    Pn, phiPn, Pa, Pu, Pa_dem, dcL, dcA, local: lc,
  })

  if (lam > 200) r.warn.push('KL/r = ' + Math.round(lam) + ' > 200 — melebihi rekomendasi kelangsingan batang tekan (Ps. E2). Perbesar profil atau kurangi panjang tekuk.')
  if (lc.slender) r.warn.push('Penampang punya elemen LANGSING (rasio b/t melebihi λr) — Ps. E7 (luas efektif) TIDAK diterapkan; φPn di atas berpotensi TERLALU BESAR. Perlu analisis elemen langsing.')
  if (lc.cnp) r.warn.push('Profil CNP (cold-formed) mengikuti AISI/SNI 7971 dengan luas efektif; hasil di sini hanya perkiraan tekuk lentur kolom — verifikasi terpisah.')
  if (type === 'SHS' || type === 'RHS' || type === 'PIPE')
    r.warn.push('Penampang tertutup (HSS) — tekuk torsi/lentur-torsi dikecualikan dari Ps. E4 (konstanta torsi J besar → tak menentukan); cukup tekuk lentur.')
  else if (type === 'UNP' || type === 'L' || type === 'CNP')
    r.warn.push('Penampang tunggal/tak-simetris — tekuk lentur-torsi (Ps. E4' + (type === 'L' ? '/E5' : '') + ') dapat MENENTUKAN dan belum dihitung (perlu properti pusat geser & torsi). Hanya tekuk lentur ditampilkan — hasil berpotensi tidak konservatif.')
  if (torsGov)
    r.warn.push('Tekuk TORSI (E4) menentukan: φPn torsi ' + (PHI_C * (tors as TorsionalBuckling).Pn).toFixed(1) + ' kN < φPn lentur ' + (PHI_C * PnFlex).toFixed(1) + ' kN. Periksa panjang tak-terkekang torsi Lz (biasanya terjadi bila Lz > Ly).')
  if (dcL !== null && dcL > 1) r.warn.push('DFBK: Pu/φPn = ' + dcL.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.')
  if (dcA !== null && dcA > 1) r.warn.push('ASD: Pa/(Pn/Ω) = ' + dcA.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.')
  if (p.source === 'hitung') r.warn.push('Properti profil ' + (ti as SteelTypeInfo).name + ' DIHITUNG dari geometri (' + (p.note || '') + '); verifikasi terhadap katalog pabrikan.')
  return r
}
