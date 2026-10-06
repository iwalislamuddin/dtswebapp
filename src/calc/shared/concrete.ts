// Rumus beton bertulang bersama — SNI 2847:2019 (≈ ACI 318-14/19). Satuan N, mm, MPa kecuali disebut lain.
// Dipakai tapak (footing-design), pile cap, dinding penahan beton; tool beton lain menyusul.

/** β1 blok tegangan persegi ekuivalen (Ps. 22.2.2.4.3). */
export function beta1(fc: number): number {
  return fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7)
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
