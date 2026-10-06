// Rumus beton bertulang bersama — SNI 2847:2019 (≈ ACI 318-14/19). Satuan N, mm, MPa kecuali disebut lain.
// Dipakai tapak (footing-design), pile cap, dinding penahan beton; tool beton lain menyusul.

/**
 * β1 blok tegangan persegi ekuivalen (Tabel 22.2.2.4.3): 0,85 (f'c ≤ 28), linear, 0,65 (f'c ≥ 55).
 * Beberapa modul lama tidak memakai batas f'c ≥ 55 (rumus memberi 0,657 di 55 MPa); disatukan ke versi tabel.
 */
export function beta1(fc: number): number {
  if (fc <= 28) return 0.85
  if (fc >= 55) return 0.65
  return Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7)
}

/** Rasio tulangan susut-suhu pelat terhadap penampang bruto (Ps. 24.4.3.2). */
export function rhoShrinkage(fy: number): number {
  return fy < 420 ? 0.002 : Math.max((0.0018 * 420) / fy, 0.0014)
}

/** Rn = Mu/(φ·b·d²) (MPa) untuk Mu dalam N·mm. */
export function flexuralRn(MuNmm: number, phi: number, b: number, d: number): number {
  return MuNmm / (phi * b * d * d)
}

/**
 * Diskriminan 1 − 2Rn/(0,85f'c) dan ρ perlu = (0,85f'c/fy)(1 − √disc) penampang persegi bertulangan tunggal.
 * disc < 0 berarti penampang terlalu kecil (tidak ada ρ yang memenuhi); penanganannya diserahkan ke pemanggil.
 */
export function rhoFromRn(Rn: number, fc: number, fy: number): { disc: number; rho: number } {
  const disc = 1 - (2 * Rn) / (0.85 * fc)
  return { disc, rho: ((0.85 * fc) / fy) * (1 - Math.sqrt(Math.max(disc, 0))) }
}

/** Luas satu batang (mm²). */
export const barArea = (db: number): number => (Math.PI / 4) * db * db

/** Vc geser satu arah tanpa tulangan geser = 0,17·λ·√f'c·b·d (N). */
export function oneWayVc(fc: number, b: number, d: number, lambda = 1): number {
  return 0.17 * lambda * Math.sqrt(fc) * b * d
}

export type PunchingGov = 'basic' | 'beta' | 'alpha'

/**
 * Tegangan geser pons vc (MPa) = min dari tiga persamaan ACI 22.6.5.2:
 * 0,33λ√f'c · 0,17(1 + 2/β)λ√f'c · 0,083(2 + αs·d/b0)λ√f'c.
 * β = sisi panjang/sisi pendek kolom (β tak hingga/null melewati persamaan kedua); αs = 40/30/20.
 */
export function punchingVc(
  fc: number, beta: number | null, alphaS: number, d: number, b0: number, lambda = 1,
): { vc: number; gov: PunchingGov } {
  const sq = lambda * Math.sqrt(fc)
  const v1 = 0.33 * sq
  const v2 = beta === null ? Infinity : 0.17 * (1 + 2 / beta) * sq
  const v3 = 0.083 * (2 + (alphaS * d) / b0) * sq
  const vc = Math.min(v1, v2, v3)
  return { vc, gov: vc === v1 ? 'basic' : vc === v2 ? 'beta' : 'alpha' }
}

/** Modulus elastisitas baja tulangan (MPa). */
export const ES = 200000

/** ρ minimum balok lentur max(0,25√f'c/fy; 1,4/fy) (Ps. 9.6.1.2). */
export function rhoMinBeam(fc: number, fy: number): number {
  return Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy)
}

/** Hasil desain tulangan satu arah per meter lebar pelat/tapak. */
export interface StripDesign {
  /** kNm/m */
  Mu: number
  /** As lentur perlu (mm²/m). */
  As: number
  rho: number
  a: number
  c: number
  et: number
  /** Terkendali tarik (εt ≥ 0,005). */
  tc: boolean
  /** Rn melebihi kapasitas penampang (diskriminan < 0, dipakai ρ maksimum rumus). */
  infeasible: boolean
  /** As susut-suhu pada penampang bruto (mm²/m). */
  AsMin: number
  AsReq: number
  govMin: boolean
  /** Spasi terpasang (mm, kelipatan 25, 50 ≤ s ≤ sMax). */
  s: number
  /** Batas spasi absolut min(k·h, 450) (mm). */
  sMax: number
  /** Spasi teoretis melebihi batas. */
  spacingCap: boolean
  AsProv: number
  db: number
}

/**
 * Tulangan lentur per meter (b = 1000) untuk Mu (kNm/m): As perlu dari Rn, minimum susut-suhu, spasi kelipatan
 * 25 mm ≤ min(sMaxFactor·h, 450). Mu ≤ muMin → hanya tulangan minimum.
 */
export function stripDesign(
  Mu: number, d: number, fc: number, fy: number, db: number, h: number, sMaxFactor: number, muMin = 0,
): StripDesign {
  const b = 1000
  let As = 0, rho = 0, a = 0, c = 0, et = Infinity, tc = true, infeasible = false
  if (Mu > muMin && d > 0) {
    const sol = rhoFromRn(flexuralRn(Mu * 1e6, 0.9, b, d), fc, fy)
    infeasible = sol.disc < 0
    rho = sol.rho
    As = rho * b * d
    a = (As * fy) / (0.85 * fc * b)
    c = a / beta1(fc)
    et = c > 0 ? (0.003 * (d - c)) / c : Infinity
    tc = et >= 0.005
  }
  const AsMin = rhoShrinkage(fy) * 1000 * h
  const AsReq = Math.max(As, AsMin)
  const Ab = barArea(db)
  const sTeo = (1000 * Ab) / AsReq
  const sMax = Math.min(sMaxFactor * h, 450)
  let s = Math.floor(sTeo / 25) * 25
  const sCap = Math.floor(sMax / 25) * 25
  if (s > sCap) s = sCap
  if (s < 50) s = 50
  return {
    Mu, As, rho, a, c, et, tc, infeasible, AsMin, AsReq, govMin: AsReq > As + 1e-6,
    s, sMax, spacingCap: sTeo > sMax, AsProv: (1000 * Ab) / s, db,
  }
}
