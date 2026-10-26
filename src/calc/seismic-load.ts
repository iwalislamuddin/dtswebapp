// Beban gempa — SNI 1726:2019 (adopsi ASCE 7-16): parameter respons spektral, spektrum desain, kategori desain
// seismik (KDS), sistem pemikul gaya seismik (R, Ω0, Cd, batas tinggi), periode fundamental, geser dasar metode gaya
// lateral ekivalen, distribusi vertikal, geser & momen tingkat, simpangan izin, faktor kombinasi beban gempa.
// Struktur gedung (SNI 1726:2019 Ps. 7 / ASCE 7-16 Bab 12) dan nongedung (ASCE 7-16 Bab 15: mirip gedung Tabel 15.4-1,
// tidak mirip gedung Tabel 15.4-2).
//
//   SMS = Fa·Ss, SM1 = Fv·S1, SDS = ⅔SMS, SD1 = ⅔SM1, T0 = 0,2·SD1/SDS, Ts = SD1/SDS
//   Cs = SDS/(R/Ie) ≤ SD1/(T·R/Ie) (T ≤ TL) atau SD1·TL/(T²·R/Ie) (T > TL), ≥ Cs,min;  V = Cs·W
//   Fx = Cvx·V, Cvx = wx·hx^k / Σ wi·hi^k

export type SiteClass = 'SA' | 'SB' | 'SC' | 'SD' | 'SE' | 'SF'
export type RiskCat = 'I' | 'II' | 'III' | 'IV'
export type SDC = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
/** Gedung · nongedung mirip gedung · nongedung tidak mirip gedung. */
export type StructKind = 'building' | 'nb-similar' | 'nb-other'
/** Tipe struktur untuk Ct, x periode pendekatan (Tabel 18). */
export type CtType = 'steel-mrf' | 'conc-mrf' | 'steel-ebf' | 'other'

export const SITE_LABEL: Record<SiteClass, string> = {
  SA: 'SA — batuan keras (v̄s > 1500 m/s)',
  SB: 'SB — batuan (750–1500 m/s)',
  SC: 'SC — tanah keras, sangat padat & batuan lunak (350–750 m/s)',
  SD: 'SD — tanah sedang (175–350 m/s)',
  SE: 'SE — tanah lunak (< 175 m/s)',
  SF: 'SF — tanah khusus (perlu analisis respons situs)',
}

/** Faktor keutamaan gempa Ie (Tabel 4). */
export const IE: Record<RiskCat, number> = { I: 1, II: 1, III: 1.25, IV: 1.5 }

const FA_SS = [0.25, 0.5, 0.75, 1, 1.25, 1.5]
const FA: Record<Exclude<SiteClass, 'SF'>, number[]> = {
  SA: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  SB: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  SC: [1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
  SD: [1.6, 1.4, 1.2, 1.1, 1.0, 1.0],
  SE: [2.4, 1.7, 1.3, 1.1, 0.9, 0.8],
}
const FV_S1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
const FV: Record<Exclude<SiteClass, 'SF'>, number[]> = {
  SA: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  SB: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  SC: [1.5, 1.5, 1.5, 1.5, 1.5, 1.4],
  SD: [2.4, 2.2, 2.0, 1.9, 1.8, 1.7],
  SE: [4.2, 3.3, 2.8, 2.4, 2.2, 2.0],
}
const FPGA_X = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
const FPGA: Record<Exclude<SiteClass, 'SF'>, number[]> = {
  SA: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  SB: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  SC: [1.3, 1.2, 1.2, 1.2, 1.2, 1.2],
  SD: [1.6, 1.4, 1.3, 1.2, 1.1, 1.1],
  SE: [2.4, 1.9, 1.6, 1.4, 1.2, 1.1],
}

/** Interpolasi linear tabel; di luar rentang memakai nilai ujung. */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  let i = 1
  while (x > xs[i]) i++
  return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
}

/** Koefisien situs Fa (Tabel 6), Fv (Tabel 7), FPGA (ASCE 7-16 Tabel 11.8-1); interpolasi linear. */
export const siteFa = (s: Exclude<SiteClass, 'SF'>, Ss: number) => interp(FA_SS, FA[s], Ss)
export const siteFv = (s: Exclude<SiteClass, 'SF'>, S1: number) => interp(FV_S1, FV[s], S1)
export const siteFpga = (s: Exclude<SiteClass, 'SF'>, PGA: number) => interp(FPGA_X, FPGA[s], PGA)

const SDC_ORDER: SDC[] = ['A', 'B', 'C', 'D', 'E', 'F']

/** KDS berdasarkan SDS (Tabel 8). */
export function sdcFromSDS(SDS: number, risk: RiskCat): SDC {
  const iv = risk === 'IV'
  return SDS < 0.167 ? 'A' : SDS < 0.33 ? (iv ? 'C' : 'B') : SDS < 0.5 ? (iv ? 'D' : 'C') : 'D'
}

/** KDS berdasarkan SD1 (Tabel 9). */
export function sdcFromSD1(SD1: number, risk: RiskCat): SDC {
  const iv = risk === 'IV'
  return SD1 < 0.067 ? 'A' : SD1 < 0.133 ? (iv ? 'C' : 'B') : SD1 < 0.2 ? (iv ? 'D' : 'C') : 'D'
}

/** Koefisien batas atas periode Cu (Tabel 17). */
export function coefCu(SD1: number): number {
  return interp([0.1, 0.15, 0.2, 0.3, 0.4], [1.7, 1.6, 1.5, 1.4, 1.4], SD1)
}

/** Parameter periode pendekatan Ct, x (Tabel 18). */
export const CT: Record<CtType, { Ct: number; x: number; label: string }> = {
  'steel-mrf': { Ct: 0.0724, x: 0.8, label: 'Rangka baja pemikul momen' },
  'conc-mrf': { Ct: 0.0466, x: 0.9, label: 'Rangka beton pemikul momen' },
  'steel-ebf': { Ct: 0.0731, x: 0.75, label: 'Rangka baja bresing eksentris / terkekang tekuk' },
  other: { Ct: 0.0488, x: 0.75, label: 'Semua sistem struktur lainnya' },
}

/**
 * Sistem pemikul gaya seismik. `h` = batas tinggi struktur hn (m) untuk KDS B, C, D, E, F:
 * null = tidak dibatasi (TB), 0 = tidak diizinkan (TI).
 */
export interface SeismicSystem {
  id: string
  group: string
  label: string
  R: number
  Om: number
  Cd: number
  h: [number | null, number | null, number | null, number | null, number | null]
  ct: CtType
  /** Rangka pemikul momen (simpangan izin dibagi ρ pada KDS D–F, Ps. 7.12.1.1). */
  mrf?: boolean
}

const TB = null, TI = 0
const sys = (
  id: string, group: string, label: string, R: number, Om: number, Cd: number,
  h: SeismicSystem['h'], ct: CtType = 'other', mrf = false,
): SeismicSystem => ({ id, group, label, R, Om, Cd, h, ct, mrf })

const GA = 'A. Sistem dinding penumpu'
const GB = 'B. Sistem rangka bangunan'
const GC = 'C. Sistem rangka pemikul momen'
const GD = 'D. Sistem ganda dengan SRPM khusus'
const GE = 'E. Sistem ganda dengan SRPM menengah'
const GF = 'F. Sistem interaktif dinding geser–rangka'
const GG = 'G. Sistem kolom kantilever'
const GH = 'H. Sistem baja tanpa detail seismik khusus'

/** Sistem struktur gedung (SNI 1726:2019 Tabel 12 / ASCE 7-16 Tabel 12.2-1). */
export const BUILDING_SYSTEMS: SeismicSystem[] = [
  sys('A1', GA, 'Dinding geser beton bertulang khusus', 5, 2.5, 5, [TB, TB, 48, 48, 30]),
  sys('A2', GA, 'Dinding geser beton bertulang biasa', 4, 2.5, 4, [TB, TB, TI, TI, TI]),
  sys('A3', GA, 'Dinding geser beton polos didetail', 2, 2.5, 2, [TB, TI, TI, TI, TI]),
  sys('A4', GA, 'Dinding geser beton polos biasa', 1.5, 2.5, 1.5, [TB, TI, TI, TI, TI]),
  sys('A7', GA, 'Dinding geser batu bata bertulang khusus', 5, 2.5, 3.5, [TB, TB, 48, 48, 30]),
  sys('A9', GA, 'Dinding geser batu bata bertulang biasa', 2, 2.5, 1.75, [TB, 48, TI, TI, TI]),
  sys('A13', GA, 'Dinding rangka ringan (kayu) dilapis panel struktur kayu', 6.5, 3, 4, [TB, TB, 20, 20, 20]),
  sys('A16', GA, 'Dinding rangka ringan baja canai dingin dilapis panel/pelat baja', 6.5, 3, 4, [TB, TB, 20, 20, 20]),
  sys('A17', GA, 'Dinding rangka ringan dengan panel geser bahan lain', 2, 2.5, 2, [TB, TB, 10, TI, TI]),
  sys('A18', GA, 'Dinding rangka ringan baja canai dingin bresing strip datar', 4, 2, 3.5, [TB, TB, 20, 20, 20]),
  sys('B1', GB, 'Rangka baja bresing eksentris (RBE)', 8, 2, 4, [TB, TB, 48, 48, 30], 'steel-ebf'),
  sys('B2', GB, 'Rangka baja bresing konsentris khusus (SRBKK)', 6, 2, 5, [TB, TB, 48, 48, 30]),
  sys('B3', GB, 'Rangka baja bresing konsentris biasa (SRBKB)', 3.25, 2, 3.25, [TB, TB, 10, 10, TI]),
  sys('B4', GB, 'Dinding geser beton bertulang khusus', 6, 2.5, 5, [TB, TB, 48, 48, 30]),
  sys('B5', GB, 'Dinding geser beton bertulang biasa', 5, 2.5, 4.5, [TB, TB, TI, TI, TI]),
  sys('B6', GB, 'Dinding geser beton polos didetail', 2, 2.5, 2, [TB, TI, TI, TI, TI]),
  sys('B8', GB, 'Dinding geser pracetak menengah', 5, 2.5, 4.5, [TB, TB, 12, 12, 12]),
  sys('B9', GB, 'Rangka bresing eksentris komposit', 8, 2, 4, [TB, TB, 48, 48, 30], 'steel-ebf'),
  sys('B10', GB, 'Rangka bresing konsentris khusus komposit', 5, 2, 4.5, [TB, TB, 48, 48, 30]),
  sys('B11', GB, 'Rangka bresing biasa komposit', 3, 2, 3, [TB, TB, TI, TI, TI]),
  sys('B12', GB, 'Dinding geser pelat baja dan beton komposit', 6.5, 2.5, 5.5, [TB, TB, 48, 48, 30]),
  sys('B13', GB, 'Dinding geser baja dan beton komposit khusus', 6, 2.5, 5, [TB, TB, 48, 48, 30]),
  sys('B14', GB, 'Dinding geser baja dan beton komposit biasa', 5, 2.5, 4.5, [TB, TB, TI, TI, TI]),
  sys('B15', GB, 'Dinding geser batu bata bertulang khusus', 5.5, 2.5, 4, [TB, TB, 48, 48, 30]),
  sys('B17', GB, 'Dinding geser batu bata bertulang biasa', 2, 2.5, 2, [TB, 48, TI, TI, TI]),
  sys('B22', GB, 'Dinding rangka ringan (kayu) dilapis panel struktur kayu', 7, 2.5, 4.5, [TB, TB, 20, 20, 20]),
  sys('B25', GB, 'Rangka baja dengan bresing terkekang tekuk (BRBF)', 8, 2.5, 5, [TB, TB, 48, 48, 30], 'steel-ebf'),
  sys('B26', GB, 'Dinding geser pelat baja khusus', 7, 2, 6, [TB, TB, 48, 48, 30]),
  sys('C1', GC, 'Rangka baja pemikul momen khusus (SRPMK)', 8, 3, 5.5, [TB, TB, TB, TB, TB], 'steel-mrf', true),
  sys('C2', GC, 'Rangka batang baja pemikul momen khusus', 7, 3, 5.5, [TB, TB, 48, 30, TI], 'steel-mrf', true),
  sys('C3', GC, 'Rangka baja pemikul momen menengah (SRPMM)', 4.5, 3, 4, [TB, TB, 10, TI, TI], 'steel-mrf', true),
  sys('C4', GC, 'Rangka baja pemikul momen biasa (SRPMB)', 3.5, 3, 3, [TB, TB, TI, TI, TI], 'steel-mrf', true),
  sys('C5', GC, 'Rangka beton bertulang pemikul momen khusus (SRPMK)', 8, 3, 5.5, [TB, TB, TB, TB, TB], 'conc-mrf', true),
  sys('C6', GC, 'Rangka beton bertulang pemikul momen menengah (SRPMM)', 5, 3, 4.5, [TB, TB, TI, TI, TI], 'conc-mrf', true),
  sys('C7', GC, 'Rangka beton bertulang pemikul momen biasa (SRPMB)', 3, 3, 2.5, [TB, TI, TI, TI, TI], 'conc-mrf', true),
  sys('C8', GC, 'Rangka baja dan beton komposit pemikul momen khusus', 8, 3, 5.5, [TB, TB, TB, TB, TB], 'other', true),
  sys('C9', GC, 'Rangka baja dan beton komposit pemikul momen menengah', 5, 3, 4.5, [TB, TB, TI, TI, TI], 'other', true),
  sys('C10', GC, 'Rangka komposit terkekang parsial pemikul momen', 6, 3, 5.5, [48, 48, 30, TI, TI], 'other', true),
  sys('C11', GC, 'Rangka baja dan beton komposit pemikul momen biasa', 3, 3, 2.5, [TB, TI, TI, TI, TI], 'other', true),
  sys('C12', GC, 'Rangka baja canai dingin pemikul momen khusus dengan pembautan', 3.5, 3, 3.5, [10, 10, 10, 10, 10], 'steel-mrf', true),
  sys('D1', GD, 'Rangka baja bresing eksentris', 8, 2.5, 4, [TB, TB, TB, TB, TB]),
  sys('D2', GD, 'Rangka baja bresing konsentris khusus', 7, 2.5, 5.5, [TB, TB, TB, TB, TB]),
  sys('D3', GD, 'Dinding geser beton bertulang khusus', 7, 2.5, 5.5, [TB, TB, TB, TB, TB]),
  sys('D4', GD, 'Dinding geser beton bertulang biasa', 6, 2.5, 5, [TB, TB, TI, TI, TI]),
  sys('D5', GD, 'Rangka bresing eksentris komposit', 8, 2.5, 4, [TB, TB, TB, TB, TB]),
  sys('D6', GD, 'Rangka bresing konsentris khusus komposit', 6, 2.5, 5, [TB, TB, TB, TB, TB]),
  sys('D7', GD, 'Dinding geser pelat baja dan beton komposit', 7.5, 2.5, 6, [TB, TB, TB, TB, TB]),
  sys('D8', GD, 'Dinding geser baja dan beton komposit khusus', 7, 2.5, 6, [TB, TB, TB, TB, TB]),
  sys('D9', GD, 'Dinding geser baja dan beton komposit biasa', 6, 2.5, 5, [TB, TB, TI, TI, TI]),
  sys('D10', GD, 'Dinding geser batu bata bertulang khusus', 5.5, 3, 5, [TB, TB, TB, TB, TB]),
  sys('D12', GD, 'Rangka baja dengan bresing terkekang tekuk', 8, 2.5, 5, [TB, TB, TB, TB, TB]),
  sys('D13', GD, 'Dinding geser pelat baja khusus', 8, 2.5, 6.5, [TB, TB, TB, TB, TB]),
  sys('E1', GE, 'Rangka baja bresing konsentris khusus', 6, 2.5, 5, [TB, TB, 10, TI, TI]),
  sys('E2', GE, 'Dinding geser beton bertulang khusus', 6.5, 2.5, 5, [TB, TB, 48, 30, 30]),
  sys('E3', GE, 'Dinding geser batu bata bertulang biasa', 3, 3, 2.5, [TB, 48, TI, TI, TI]),
  sys('E4', GE, 'Dinding geser batu bata bertulang menengah', 3.5, 3, 3, [TB, TB, TI, TI, TI]),
  sys('E5', GE, 'Rangka bresing konsentris khusus komposit', 5.5, 2.5, 4.5, [TB, TB, 48, 30, TI]),
  sys('E6', GE, 'Rangka bresing biasa komposit', 3.5, 2.5, 3, [TB, TB, TI, TI, TI]),
  sys('E7', GE, 'Dinding geser baja dan beton komposit biasa', 5, 3, 4.5, [TB, TB, TI, TI, TI]),
  sys('E8', GE, 'Dinding geser beton bertulang biasa', 5.5, 2.5, 4.5, [TB, TB, TI, TI, TI]),
  sys('F1', GF, 'SRPM beton bertulang biasa + dinding geser beton bertulang biasa', 4.5, 2.5, 4, [TB, TI, TI, TI, TI]),
  sys('G1', GG, 'Kolom kantilever — rangka baja pemikul momen khusus', 2.5, 1.25, 2.5, [10, 10, 10, 10, 10]),
  sys('G2', GG, 'Kolom kantilever — rangka baja pemikul momen menengah', 1.5, 1.25, 1.5, [10, 10, 10, TI, TI]),
  sys('G3', GG, 'Kolom kantilever — rangka baja pemikul momen biasa', 1.25, 1.25, 1.25, [10, 10, TI, TI, TI]),
  sys('G4', GG, 'Kolom kantilever — rangka beton bertulang pemikul momen khusus', 2.5, 1.25, 2.5, [10, 10, 10, 10, 10]),
  sys('G5', GG, 'Kolom kantilever — rangka beton bertulang pemikul momen menengah', 1.5, 1.25, 1.5, [10, 10, TI, TI, TI]),
  sys('G6', GG, 'Kolom kantilever — rangka beton bertulang pemikul momen biasa', 1, 1.25, 1, [10, TI, TI, TI, TI]),
  sys('G7', GG, 'Kolom kantilever — rangka kayu', 1.5, 1.5, 1.5, [10, 10, 10, TI, TI]),
  sys('H1', GH, 'Sistem baja tidak didetail khusus untuk ketahanan seismik', 3, 3, 3, [TB, TB, TI, TI, TI]),
]

const NA = 'Nongedung mirip gedung (ASCE 7-16 Tabel 15.4-1)'
/** Struktur nongedung mirip gedung — sistem khusus Tabel 15.4-1 (sistem Tabel 12 juga boleh dipakai). */
export const NB_SIMILAR_SYSTEMS: SeismicSystem[] = [
  sys('N1', NA, 'Rak penyimpanan baja (steel storage racks)', 4, 2, 3.5, [TB, TB, TB, TB, TB]),
  sys('N2', NA, 'Rangka baja bresing konsentris biasa — kenaikan batas tinggi', 2.5, 2, 2.5, [TB, TB, 30, 30, 30]),
  sys('N3', NA, 'Rangka baja bresing konsentris biasa — tinggi tak dibatasi', 1.5, 1, 1.5, [TB, TB, TB, TB, TB]),
  sys('N6', NA, 'Rangka baja pemikul momen biasa — tinggi tak dibatasi', 1, 1, 1, [TB, TB, TB, TB, TB], 'steel-mrf', true),
]

const NO = 'Nongedung tidak mirip gedung (ASCE 7-16 Tabel 15.4-2)'
/** Struktur nongedung tidak mirip gedung (Tabel 15.4-2). */
export const NB_OTHER_SYSTEMS: SeismicSystem[] = [
  sys('T1', NO, 'Tangki/bejana elevasi — kaki berbresing simetris', 3, 2, 2.5, [TB, TB, 48, 30, 30]),
  sys('T2', NO, 'Tangki/bejana elevasi — kaki tak berbresing / bresing asimetris', 2, 2, 2.5, [TB, TB, 30, 18, 18]),
  sys('T3', NO, 'Tangki elevasi — pedestal/skirt tunggal baja las, detail khusus', 3, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T4', NO, 'Tangki elevasi — pedestal/skirt tunggal baja las', 2, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T5', NO, 'Bejana horizontal baja las bertumpu pelana (saddle)', 3, 2, 2.5, [TB, TB, TB, TB, TB]),
  sys('T6', NO, 'Tangki di atas tanah — baja las', 3, 2, 2.5, [TB, TB, TB, TB, TB]),
  sys('T7', NO, 'Tangki di atas tanah — baja baut/keling', 2.5, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T8', NO, 'Tangki di atas tanah — beton bertulang/prategang', 2, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T9', NO, 'Silo beton cor di tempat, dinding menerus ke pondasi', 3, 1.75, 3, [TB, TB, TB, TB, TB]),
  sys('T10', NO, 'Cerobong/silo/bejana tegak kantilever massa terdistribusi — baja las', 3, 2, 2.5, [TB, TB, TB, TB, TB]),
  sys('T11', NO, 'Cerobong/silo/bejana tegak kantilever massa terdistribusi — baja las, detail khusus', 3, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T12', NO, 'Cerobong & tumpukan (stack) beton', 2, 1.5, 2, [TB, TB, TB, TB, TB]),
  sys('T13', NO, 'Menara rangka batang (berdiri bebas/ber-guy), cerobong ber-guy', 3, 2, 2.5, [TB, TB, TB, TB, TB]),
  sys('T14', NO, 'Menara pendingin — beton atau baja', 3.5, 1.75, 3, [TB, TB, TB, TB, TB]),
  sys('T15', NO, 'Menara telekomunikasi — rangka batang baja', 3, 1.5, 3, [TB, TB, TB, TB, TB]),
  sys('T16', NO, 'Menara telekomunikasi — tiang (pole) baja/beton/kayu', 1.5, 1.5, 1.5, [TB, TB, TB, TB, TB]),
  sys('T17', NO, 'Struktur hiburan & monumen', 2, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T18', NO, 'Struktur tipe bandul terbalik (selain tangki elevasi)', 2, 2, 2, [TB, TB, TB, TB, TB]),
  sys('T19', NO, 'Papan reklame & rambu', 3, 1.75, 3, [TB, TB, TB, TB, TB]),
  sys('T20', NO, 'Struktur/tangki/bejana berdiri sendiri lainnya', 1.25, 2, 2.5, [TB, TB, 15, 15, 15]),
]

/** Daftar sistem yang boleh dipilih untuk jenis struktur. */
export function systemsFor(kind: StructKind): SeismicSystem[] {
  return kind === 'building' ? BUILDING_SYSTEMS : kind === 'nb-similar' ? [...NB_SIMILAR_SYSTEMS, ...BUILDING_SYSTEMS] : NB_OTHER_SYSTEMS
}

export const findSystem = (id: string): SeismicSystem | undefined =>
  [...BUILDING_SYSTEMS, ...NB_SIMILAR_SYSTEMS, ...NB_OTHER_SYSTEMS].find((s) => s.id === id)

export interface Level {
  /** Tinggi tingkat (m) — jarak dari lantai di bawahnya. */
  h: number
  /** Berat seismik efektif lantai (kN). */
  w: number
}

export interface SeismicInput {
  /** Parameter percepatan batuan dasar MCER periode pendek & 1 detik, PGA (g); TL (s). */
  Ss: number
  S1: number
  PGA: number
  TL: number
  site: SiteClass
  risk: RiskCat
  kind: StructKind
  /** Id sistem, atau 'custom' dengan R/Ω0/Cd dan tipe Ct sendiri. */
  system: string
  R?: number
  Om?: number
  Cd?: number
  ctType?: CtType
  /** Periode hasil analisis Tc (s); null = pakai Ta (gedung / mirip gedung). Wajib untuk nongedung tidak mirip gedung. */
  Tc: number | null
  /** Faktor redundansi ρ (1,0 atau 1,3). */
  rho: number
  /** Lantai dari bawah ke atas. */
  levels: Level[]
}

export interface LevelForce {
  /** Nomor lantai (1 = terbawah). */
  i: number
  hx: number
  wx: number
  whk: number
  Cvx: number
  Fx: number
  /** Geser tingkat di bawah lantai x (kN). */
  Vx: number
  /** Momen guling di dasar tingkat x (kN·m). */
  Mx: number
  /** Simpangan antar tingkat izin (mm). */
  drift: number
}

export interface SeismicResult {
  valid: boolean
  warn: string[]
  inp: SeismicInput
  Ie: number
  Fa: number
  Fv: number
  Fpga: number
  SMS: number
  SM1: number
  SDS: number
  SD1: number
  PGAM: number
  T0: number
  Ts: number
  sdcS: SDC
  sdc1: SDC
  sdc: SDC
  sys: SeismicSystem
  /** Batas tinggi berlaku untuk KDS (m), null = TB, 0 = TI; undefined untuk KDS A. */
  hLimit: number | null | undefined
  hn: number
  W: number
  Ct: number
  x: number
  Ta: number
  Cu: number
  CuTa: number
  T: number
  /** Asal T: 'Ta' | 'Tc' | 'CuTa'. */
  Tsrc: 'Ta' | 'Tc' | 'CuTa'
  Cs0: number
  CsMax: number
  CsMin: number
  CsMinNote: string
  Cs: number
  /** Struktur nongedung kaku (T < 0,06 s): V = 0,30·SDS·W·Ie. */
  rigid: boolean
  V: number
  k: number
  levels: LevelForce[]
  M0: number
  /** Koefisien simpangan antar tingkat izin Δa/hsx (sebelum dibagi ρ). */
  driftCoef: number
  /** Faktor kombinasi: (1,2 + 0,2SDS), (0,9 − 0,2SDS). */
  cD1: number
  cD2: number
  /** Ev = 0,2·SDS·D (koefisien). */
  ev: number
}

/** Percepatan respons spektral desain Sa (g) pada periode T (Ps. 6.4). */
export function spectrumSa(T: number, SDS: number, SD1: number, TL: number): number {
  if (SDS <= 0) return 0
  const T0 = (0.2 * SD1) / SDS, Ts = SD1 / SDS
  if (T < T0) return SDS * (0.4 + (0.6 * T) / T0)
  if (T <= Ts) return SDS
  if (T <= TL) return SD1 / T
  return (SD1 * TL) / (T * T)
}

const worse = (a: SDC, b: SDC): SDC => (SDC_ORDER.indexOf(a) >= SDC_ORDER.indexOf(b) ? a : b)

export function computeSeismic(inp: SeismicInput): SeismicResult {
  const warn: string[] = []
  const { Ss, S1, PGA, TL, site, risk, kind } = inp
  const Ie = IE[risk]
  const base = findSystem(inp.system)
  const sysv: SeismicSystem =
    inp.system === 'custom' || !base
      ? sys('custom', 'Kustom', 'Sistem kustom (R, Ω0, Cd ditentukan sendiri)', inp.R ?? 1, inp.Om ?? 1, inp.Cd ?? 1, [TB, TB, TB, TB, TB], inp.ctType ?? 'other')
      : base
  let valid = true
  const sc = site === 'SF' ? 'SE' : site
  if (site === 'SF') {
    valid = false
    warn.push('Kelas situs SF memerlukan analisis respons spesifik situs (ASCE 7-16 Ps. 11.4.8, Bab 21) — Fa/Fv tabel tidak berlaku. Hasil di bawah memakai SE hanya sebagai gambaran.')
  }
  const Fa = siteFa(sc, Ss), Fv = siteFv(sc, S1), Fpga = siteFpga(sc, PGA)
  const SMS = Fa * Ss, SM1 = Fv * S1
  const SDS = (2 / 3) * SMS, SD1 = (2 / 3) * SM1
  const PGAM = Fpga * PGA
  const T0 = SDS > 0 ? (0.2 * SD1) / SDS : 0
  const Ts = SDS > 0 ? SD1 / SDS : 0

  let sdcS = sdcFromSDS(SDS, risk), sdc1 = sdcFromSD1(SD1, risk)
  let sdc = worse(sdcS, sdc1)
  if (S1 >= 0.75) {
    const e: SDC = risk === 'IV' ? 'F' : 'E'
    sdcS = worse(sdcS, e)
    sdc1 = worse(sdc1, e)
    sdc = e
  }

  if (site === 'SD' && S1 >= 0.2)
    warn.push('ASCE 7-16 Ps. 11.4.8: situs SD dengan S1 ≥ 0,2 memerlukan analisis bahaya spesifik situs, kecuali Cs dihitung dengan pengecualian pasal tersebut — periksa ketentuan yang berlaku untuk proyek.')
  if (site === 'SE' && (Ss >= 1 || S1 >= 0.2))
    warn.push('ASCE 7-16 Ps. 11.4.8: situs SE dengan Ss ≥ 1,0 atau S1 ≥ 0,2 memerlukan analisis bahaya spesifik situs (dengan pengecualian terbatas) — periksa ketentuan yang berlaku untuk proyek.')

  const hLimit = sdc === 'A' ? undefined : sysv.h[SDC_ORDER.indexOf(sdc) - 1]
  const hn = inp.levels.reduce((a, l) => a + l.h, 0)
  const W = inp.levels.reduce((a, l) => a + l.w, 0)
  if (hLimit === 0) warn.push(`Sistem "${sysv.label}" TIDAK DIIZINKAN untuk KDS ${sdc} (Tabel 12). Pilih sistem lain.`)
  else if (hLimit !== null && hLimit !== undefined && hn > hLimit + 1e-9)
    warn.push(`Tinggi struktur hn = ${hn.toFixed(1)} m melampaui batas ${hLimit} m untuk sistem ini pada KDS ${sdc} (Tabel 12).`)
  if (sdc === 'A') warn.push('KDS A: cukup memenuhi persyaratan integritas struktur (ASCE 7-16 Ps. 1.4, gaya lateral 1% berat per lantai); geser dasar di bawah ditampilkan sebagai pembanding.')

  // periode fundamental
  const ct = CT[sysv.ct]
  const Ta = ct.Ct * Math.pow(hn, ct.x)
  const Cu = coefCu(SD1)
  const CuTa = Cu * Ta
  let T: number, Tsrc: SeismicResult['Tsrc']
  if (kind === 'nb-other') {
    T = inp.Tc ?? 0
    Tsrc = 'Tc'
  } else if (inp.Tc === null) {
    T = Ta
    Tsrc = 'Ta'
  } else if (inp.Tc > CuTa) {
    T = CuTa
    Tsrc = 'CuTa'
  } else if (inp.Tc < Ta) {
    T = Ta
    Tsrc = 'Ta'
  } else {
    T = inp.Tc
    Tsrc = 'Tc'
  }
  if (kind === 'nb-other' && T <= 0) {
    valid = false
    warn.push('Struktur nongedung tidak mirip gedung: periode fundamental T dari analisis wajib diisi.')
  }

  // koefisien respons seismik
  const RI = sysv.R / Ie
  const Cs0 = SDS / RI
  const CsMax = T <= 0 ? Infinity : T <= TL ? SD1 / (T * RI) : (SD1 * TL) / (T * T * RI)
  let CsMin: number, CsMinNote: string
  if (kind === 'nb-other') {
    CsMin = Math.max(0.044 * SDS * Ie, 0.03)
    CsMinNote = 'max(0,044·SDS·Ie; 0,03)'
    if (S1 >= 0.6) {
      CsMin = Math.max(CsMin, (0.8 * S1) / RI)
      CsMinNote += ', ≥ 0,8·S1/(R/Ie)'
    }
  } else {
    CsMin = Math.max(0.044 * SDS * Ie, 0.01)
    CsMinNote = 'max(0,044·SDS·Ie; 0,01)'
    if (S1 >= 0.6) {
      CsMin = Math.max(CsMin, (0.5 * S1) / RI)
      CsMinNote += ', ≥ 0,5·S1/(R/Ie)'
    }
  }
  const rigid = kind !== 'building' && T > 0 && T < 0.06
  const Cs = rigid ? 0.3 * SDS * Ie : Math.max(Math.min(Cs0, CsMax), CsMin)
  const V = Cs * W

  // distribusi vertikal
  const k = T <= 0.5 ? 1 : T >= 2.5 ? 2 : 1 + (T - 0.5) / 2
  let z = 0
  const hx = inp.levels.map((l) => (z += l.h))
  const whk = inp.levels.map((l, i) => l.w * Math.pow(hx[i], k))
  const sum = whk.reduce((a, b) => a + b, 0)
  const driftCoef = risk === 'IV' ? 0.01 : risk === 'III' ? 0.015 : 0.02
  const driftDiv = sysv.mrf && 'DEF'.includes(sdc) ? inp.rho : 1
  const levels: LevelForce[] = inp.levels.map((l, i) => {
    const Cvx = sum > 0 ? whk[i] / sum : 0
    return { i: i + 1, hx: hx[i], wx: l.w, whk: whk[i], Cvx, Fx: Cvx * V, Vx: 0, Mx: 0, drift: (driftCoef * l.h * 1000) / driftDiv }
  })
  for (let i = levels.length - 1; i >= 0; i--) {
    const below = i === 0 ? 0 : hx[i - 1]
    let Vx = 0, Mx = 0
    for (let j = i; j < levels.length; j++) {
      Vx += levels[j].Fx
      Mx += levels[j].Fx * (hx[j] - below)
    }
    levels[i].Vx = Vx
    levels[i].Mx = Mx
  }
  const M0 = levels.reduce((a, l) => a + l.Fx * l.hx, 0)

  if ('BC'.includes(sdc) && inp.rho !== 1) warn.push('KDS B dan C: faktor redundansi ρ boleh diambil 1,0 (Ps. 7.3.4.1).')
  if ('DEF'.includes(sdc) && inp.rho === 1)
    warn.push('KDS D–F: ρ = 1,0 hanya bila syarat Ps. 7.3.4.2 terpenuhi (kehilangan satu elemen tidak mengurangi kekuatan tingkat > 33%, atau struktur beraturan dengan ≥ 2 bentang perimeter); jika tidak, ρ = 1,3.')
  if (kind === 'building' && Tsrc === 'Ta' && inp.Tc === null && ('DEF'.includes(sdc)))
    warn.push('Periode memakai Ta pendekatan (konservatif). Untuk struktur besar, periode dari analisis modal dibatasi Cu·Ta dapat menurunkan geser dasar.')
  if (T > 3.5 * Ts && 'DEF'.includes(sdc) && kind === 'building')
    warn.push('T > 3,5·Ts pada KDS D–F: prosedur gaya lateral ekivalen tidak diizinkan (Ps. 7.6) — gunakan analisis spektrum respons ragam; V statik tetap dipakai untuk skala 100% (Ps. 7.9.1.4).')
  if (TL <= 0) warn.push('TL tidak tersedia — isi periode transisi panjang dari peta TL SNI 1726:2019.')

  return {
    valid: valid && W > 0 && hn > 0,
    warn,
    inp,
    Ie, Fa, Fv, Fpga, SMS, SM1, SDS, SD1, PGAM, T0, Ts, sdcS, sdc1, sdc,
    sys: sysv, hLimit, hn, W, Ct: ct.Ct, x: ct.x, Ta, Cu, CuTa, T, Tsrc,
    Cs0, CsMax, CsMin, CsMinNote, Cs, rigid, V, k, levels, M0, driftCoef,
    cD1: 1.2 + 0.2 * SDS, cD2: 0.9 - 0.2 * SDS, ev: 0.2 * SDS,
  }
}
