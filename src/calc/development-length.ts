// Panjang penyaluran tulangan tarik lurus — SNI 2847:2019 Ps. 25.4.2.4a (bentuk SI).
// Port 1:1 dari modules/development-length/module.js (compute), diverifikasi golden test.
//
//   ld = fy·ψt·ψe·ψs·ψg / (1,1·λ·√f'c·((cb + Ktr)/db)) · db ≥ 300 mm
//   √f'c ≤ 8,3; (cb + Ktr)/db ≤ 2,5; ψt·ψe ≤ 1,7; Ktr = 40·Atr/(s·n).
//   Polos: pendekatan konservatif 2,0 × ld ulir setara (SNI mensyaratkan kait standar untuk polos).

export type BarType = 'ulir' | 'polos'

export const BARS_ULIR = [10, 13, 16, 19, 22, 25, 29, 32, 36]
export const BARS_POLOS = [8, 10, 12, 16, 19]
const POLOS_FACTOR = 2.0

export interface DevLengthInput {
  fc: number
  fy: number
  barType: BarType
  /** Diameter (mm), dari select. */
  db: number | string
  psit: number | string
  psie: number | string
  lambda: number | string
  /** min(selimut ke pusat, ½ spasi) (mm). */
  cb: number
  ktrMode: 'zero' | 'calc'
  /** Luas tulangan transversal (mm²), spasi (mm), jumlah batang di bidang belah. */
  Atr: number
  s: number
  n: number
}

export interface DevLengthResult {
  db: number
  cb: number
  ok: boolean
  warn: string[]
  valid?: boolean
  polos?: boolean
  polosFactor?: number
  psis?: number
  psig?: number
  lambda?: number
  psit?: number
  psie?: number
  psite?: number
  sqrtfc?: number
  Ktr?: number
  ratio?: number
  ldBase?: number
  /** Panjang penyaluran (mm). */
  ld?: number
  ldMin?: boolean
  /** Dibulatkan ke atas kelipatan 10 mm. */
  ldRound?: number
  ldbratio?: number
}

/** ψg mutu tulangan (Tabel 25.4.2.5). */
export const psiG = (fy: number): number => (fy <= 420 ? 1.0 : fy <= 550 ? 1.15 : 1.3)
/** ψs ukuran batang (Tabel 25.4.2.5). */
export const psiS = (db: number): number => (db <= 19 ? 0.8 : 1.0)

export function computeDevLength(v: DevLengthInput): DevLengthResult {
  const { fc, fy, cb } = v
  const db = parseFloat(String(v.db))
  const psit = parseFloat(String(v.psit)), psie = parseFloat(String(v.psie)), lambda = parseFloat(String(v.lambda))
  const Ktr = v.ktrMode === 'calc' ? (40 * (v.Atr || 0)) / ((v.s || 1) * (v.n || 1)) : 0

  const r: DevLengthResult = { db, cb, ok: true, warn: [] }
  if (!(fc > 0) || !(fy > 0) || !(cb > 0)) { r.valid = false; return r }
  r.valid = true

  const polos = v.barType === 'polos'
  const polosFactor = polos ? POLOS_FACTOR : 1.0
  const psis = psiS(db), psig = psiG(fy)

  let psite = psit * psie
  if (psite > 1.7) { psite = 1.7; r.warn.push('Produk ψt·ψe dibatasi 1,7 (Ps. 25.4.2.5).') }
  let sqrtfc = Math.sqrt(fc)
  if (sqrtfc > 8.3) { sqrtfc = 8.3; r.warn.push("√f'c dibatasi 8,3 MPa (Ps. 25.4.1.4).") }
  let ratio = (cb + Ktr) / db
  if (ratio > 2.5) { ratio = 2.5; r.warn.push('(cb+Ktr)/db dibatasi 2,5 (Ps. 25.4.2.4).') }

  const ldBase = ((fy * psite * psis * psig) / (1.1 * lambda * sqrtfc * ratio)) * db
  let ld = ldBase * polosFactor
  let ldMin = false
  if (ld < 300) { ld = 300; ldMin = true }

  Object.assign(r, {
    polos, polosFactor, psis, psig, lambda, psit, psie, psite, sqrtfc, Ktr, ratio, ldBase, ld, ldMin,
    ldRound: Math.ceil(ld / 10) * 10, ldbratio: ld / db,
  })
  return r
}
