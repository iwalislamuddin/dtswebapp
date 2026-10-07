// Library profil baja — dipakai bersama semua tool baja. Port 1:1 dari core/steel-profiles.js (golden test).
//
//   Hot-rolled (WF, UNP, siku L): nilai TABEL — WF & siku JIS G3192, UNP DIN 1026.
//   Hollow (SHS, RHS, pipa): DIHITUNG dari geometri — pipa eksak; SHS/RHS sudut tajam (≈2–5% > tabel ber-radius).
//   Cold-formed CNP (kanal C berbibir): DIHITUNG metode garis-tengah (linear AISI), radius sudut diabaikan.
//   Satuan tersimpan: dimensi mm · A cm² · w kg/m · I cm⁴ · i cm · S, Z cm³.
// Rencana: sumber diganti tabel JIS EDFS Matrix (docs/TOOL-REVISIONS.md §4) sebagai perubahan angka yang disengaja.

/** kg/m per mm² luas (baja 7850 kg/m³). */
const RHO = 7.85e-3

export type SteelType = 'WF' | 'UNP' | 'L' | 'SHS' | 'RHS' | 'PIPE' | 'CNP'
export type SteelShape = 'I' | 'C' | 'L' | 'box' | 'pipe'

export interface SteelProfile {
  shape: SteelShape
  name: string
  /** mm */
  H?: number
  B?: number
  tw?: number
  tf?: number
  t: number
  a?: number
  D?: number
  /** Bibir CNP (mm). */
  C?: number
  /** Titik berat CNP dari garis-tengah badan (cm). */
  xbar?: number
  /** cm² */
  A: number
  /** kg/m */
  w: number
  /** cm⁴ */
  Ix: number
  Iy: number
  /** cm */
  ix: number
  iy: number
  /** Jari-jari girasi minimum (cm). Siku: undefined akibat bug build lama (lihat LSIKU). */
  imin?: number
  /** cm³ (siku: null bila tidak ada di tabel) */
  Sx: number | null
  Sy: number | null
  Zx?: number
  Zy?: number
  source: 'tabel' | 'hitung'
  note?: string
}

export interface SteelTypeInfo {
  key: SteelType
  name: string
  full: string
  std: string
  src: 'tabel' | 'hitung'
  shape: SteelShape
}

type Row = (string | number)[]

/* ---------- hot-rolled (nilai tabel) ---------- */
/** WF: [name, H, B, tw, tf, A, w, Ix, Iy, ix, iy, Sx, Sy] */
function WF(a: Row): SteelProfile {
  const n = a as number[]
  return {
    shape: 'I', name: a[0] as string, H: n[1], B: n[2], tw: n[3], tf: n[4],
    A: n[5], w: n[6], Ix: n[7], Iy: n[8], ix: n[9], iy: n[10], Sx: n[11], Sy: n[12],
    imin: n[10], t: n[4], source: 'tabel',
  }
}

/** UNP: [name, H, B, tw, tf, A, w, Ix, Iy, ix, iy, Sx, Sy] */
function UNP(a: Row): SteelProfile {
  return { ...WF(a), shape: 'C' }
}

/**
 * Siku sama kaki: builder membaca [name, a, t, A, w, Ix(=Iy), ix(=iy), Sx, imin], tetapi baris DATA_L hanya
 * 8 kolom [name, a, t, A, w, Ix, ix, imin]. BUG build lama (dipertahankan selama port 1:1, golden): Sx = Sy = nilai
 * imin (mis. L75×75×6 → 1,46 "cm³", seharusnya ±8,5) dan imin = undefined (rminMm → NaN). Diperbaiki bersama
 * penggantian sumber ke tabel JIS EDFS Matrix — lihat docs/TODO.md "Perbaikan isi tool".
 */
function LSIKU(a: Row): SteelProfile {
  const n = a as number[]
  return {
    shape: 'L', name: a[0] as string, H: n[1], B: n[1], a: n[1], t: n[2],
    A: n[3], w: n[4], Ix: n[5], Iy: n[5], ix: n[6], iy: n[6], Sx: n[7] || null, Sy: n[7] || null,
    imin: n[8], source: 'tabel',
  }
}

/* ---------- hollow & cold-formed (dihitung) ---------- */
/** Pipa bundar D × t, eksak. */
export function PIPE(D: number, t: number): SteelProfile {
  const d = D - 2 * t
  const A = (Math.PI / 4) * (D * D - d * d)
  const I = (Math.PI / 64) * (Math.pow(D, 4) - Math.pow(d, 4))
  const i = Math.sqrt(I / A)
  const S = I / (D / 2)
  const Z = (Math.pow(D, 3) - Math.pow(d, 3)) / 6
  return {
    shape: 'pipe', name: 'Ø' + D + '×' + t, D, t,
    A: A / 100, w: A * RHO, Ix: I / 1e4, Iy: I / 1e4, ix: i / 10, iy: i / 10,
    Sx: S / 1e3, Sy: S / 1e3, Zx: Z / 1e3, imin: i / 10, source: 'hitung', note: 'eksak',
  }
}

const a2 = (n: number): number => Math.round(n * 10) / 10

function rectHollow(H: number, B: number, t: number, square: boolean): SteelProfile {
  const hi = H - 2 * t, bi = B - 2 * t
  const A = H * B - hi * bi
  const Ix = (B * Math.pow(H, 3) - bi * Math.pow(hi, 3)) / 12
  const Iy = (H * Math.pow(B, 3) - hi * Math.pow(bi, 3)) / 12
  const Sx = Ix / (H / 2), Sy = Iy / (B / 2)
  const Zx = (B * H * H - bi * hi * hi) / 4, Zy = (H * B * B - hi * bi * bi) / 4
  const ix = Math.sqrt(Ix / A), iy = Math.sqrt(Iy / A)
  return {
    shape: 'box', name: (square ? a2(H) + '×' + a2(H) : a2(H) + '×' + a2(B)) + '×' + t,
    H, B, t, A: A / 100, w: A * RHO, Ix: Ix / 1e4, Iy: Iy / 1e4, ix: ix / 10, iy: iy / 10,
    Sx: Sx / 1e3, Sy: Sy / 1e3, Zx: Zx / 1e3, Zy: Zy / 1e3,
    imin: Math.min(ix, iy) / 10, source: 'hitung', note: 'geometris (sudut tajam)',
  }
}

/** SHS a × a × t (sudut tajam). */
export const SHS = (a: number, t: number): SteelProfile => rectHollow(a, a, t, true)
/** RHS H (sumbu kuat) × B × t (sudut tajam). */
export const RHS = (H: number, B: number, t: number): SteelProfile => rectHollow(H, B, t, false)

/** CNP kanal C berbibir H × B × C × t, metode garis-tengah; simetris terhadap sumbu-x (tengah badan). */
export function CNP(H: number, B: number, C: number, t: number): SteelProfile {
  const Lw = H - t, Lf = B - t, Lc = C - t / 2
  const yf = (H - t) / 2
  const Aweb = t * Lw, Af = t * Lf, Ac = t * Lc
  const A = Aweb + 2 * Af + 2 * Ac
  const xbar = (2 * Af * (Lf / 2) + 2 * Ac * Lf) / A // dari garis-tengah badan (badan di x = 0)
  const ylip = yf - Lc / 2
  const Ix = (t * Math.pow(Lw, 3)) / 12 + 2 * (Af * yf * yf) + 2 * ((t * Math.pow(Lc, 3)) / 12 + Ac * ylip * ylip)
  const Iy = Aweb * xbar * xbar + 2 * ((t * Math.pow(Lf, 3)) / 12 + Af * Math.pow(Lf / 2 - xbar, 2)) + 2 * (Ac * Math.pow(Lf - xbar, 2))
  const ix = Math.sqrt(Ix / A), iy = Math.sqrt(Iy / A)
  const Sx = Ix / (H / 2)
  const Sy = Iy / Math.max(xbar + t / 2, B - (xbar + t / 2))
  return {
    shape: 'C', name: 'C' + H + '×' + B + '×' + C + '×' + t, H, B, C, t, xbar: xbar / 10, A: A / 100, w: A * RHO,
    Ix: Ix / 1e4, Iy: Iy / 1e4, ix: ix / 10, iy: iy / 10, Sx: Sx / 1e3, Sy: Sy / 1e3, imin: Math.min(ix, iy) / 10,
    source: 'hitung', note: 'garis-tengah (linear, tanpa radius)',
  }
}

/* ---------- tabel hot-rolled ---------- */
const DATA_WF = ([
  ['100×50×5×7', 100, 50, 5, 7, 11.85, 9.30, 187, 14.8, 3.98, 1.12, 37.5, 5.91],
  ['125×60×6×8', 125, 60, 6, 8, 16.84, 13.2, 413, 29.2, 4.95, 1.32, 66.1, 9.73],
  ['150×75×5×7', 150, 75, 5, 7, 17.85, 14.0, 666, 49.5, 6.11, 1.66, 88.8, 13.2],
  ['175×90×5×8', 175, 90, 5, 8, 22.90, 18.0, 1210, 97.6, 7.26, 2.06, 138, 21.7],
  ['200×100×5.5×8', 200, 100, 5.5, 8, 27.16, 21.3, 1840, 134, 8.24, 2.22, 184, 26.8],
  ['250×125×6×9', 250, 125, 6, 9, 37.66, 29.6, 4050, 294, 10.4, 2.79, 324, 47.0],
  ['300×150×6.5×9', 300, 150, 6.5, 9, 46.78, 36.7, 7210, 508, 12.4, 3.29, 481, 67.7],
  ['350×175×7×11', 350, 175, 7, 11, 63.14, 49.6, 13600, 984, 14.7, 3.95, 775, 112],
  ['400×200×8×13', 400, 200, 8, 13, 84.12, 66.0, 23700, 1740, 16.8, 4.54, 1190, 174],
  ['450×200×9×14', 450, 200, 9, 14, 96.76, 76.0, 33500, 1870, 18.6, 4.40, 1490, 187],
  ['500×200×10×16', 500, 200, 10, 16, 114.2, 89.6, 47800, 2140, 20.5, 4.33, 1910, 214],
  ['588×300×12×20', 588, 300, 12, 20, 192.5, 151, 118000, 9020, 24.8, 6.85, 4020, 601],
  ['600×200×11×17', 600, 200, 11, 17, 131.7, 103, 77600, 2280, 24.3, 4.16, 2590, 228],
  // Seri sayap lebar (kolom)
  ['100×100×6×8', 100, 100, 6, 8, 21.90, 17.2, 383, 134, 4.18, 2.47, 76.5, 26.7],
  ['150×150×7×10', 150, 150, 7, 10, 40.14, 31.5, 1640, 563, 6.39, 3.75, 219, 75.1],
  ['200×200×8×12', 200, 200, 8, 12, 63.53, 49.9, 4720, 1600, 8.62, 5.02, 472, 160],
  ['250×250×9×14', 250, 250, 9, 14, 91.43, 71.8, 10800, 3650, 10.9, 6.32, 867, 292],
  ['300×300×10×15', 300, 300, 10, 15, 118.5, 93.0, 20200, 6750, 13.1, 7.55, 1350, 450],
  ['350×350×12×19', 350, 350, 12, 19, 173.9, 137, 40300, 13600, 15.2, 8.84, 2300, 776],
  ['400×400×13×21', 400, 400, 13, 21, 218.7, 172, 66600, 22400, 17.5, 10.1, 3330, 1120],
] as Row[]).map(WF)

const DATA_UNP = ([
  ['UNP 65', 65, 42, 5.5, 7.5, 9.03, 7.09, 57.5, 14.1, 2.52, 1.25, 17.7, 5.07],
  ['UNP 80', 80, 45, 6, 8, 11.0, 8.64, 106, 19.4, 3.10, 1.33, 26.5, 6.36],
  ['UNP 100', 100, 50, 6, 8.5, 13.5, 10.6, 206, 29.3, 3.91, 1.47, 41.2, 8.49],
  ['UNP 120', 120, 55, 7, 9, 17.0, 13.4, 364, 43.2, 4.62, 1.59, 60.7, 11.1],
  ['UNP 140', 140, 60, 7, 10, 20.4, 16.0, 605, 62.7, 5.45, 1.75, 86.4, 14.8],
  ['UNP 160', 160, 65, 7.5, 10.5, 24.0, 18.8, 925, 85.3, 6.21, 1.89, 116, 18.3],
  ['UNP 180', 180, 70, 8, 11, 28.0, 22.0, 1350, 114, 6.95, 2.02, 150, 22.4],
  ['UNP 200', 200, 75, 8.5, 11.5, 32.2, 25.3, 1910, 148, 7.70, 2.14, 191, 27.0],
  ['UNP 220', 220, 80, 9, 12.5, 37.4, 29.4, 2690, 197, 8.48, 2.30, 245, 33.6],
  ['UNP 240', 240, 85, 9.5, 13, 42.3, 33.2, 3600, 248, 9.22, 2.42, 300, 39.6],
  ['UNP 260', 260, 90, 10, 14, 48.3, 37.9, 4820, 317, 9.99, 2.56, 371, 47.7],
  ['UNP 280', 280, 95, 10, 15, 53.3, 41.8, 6280, 399, 10.9, 2.74, 448, 57.2],
  ['UNP 300', 300, 100, 10, 16, 58.8, 46.2, 8030, 495, 11.7, 2.90, 535, 67.8],
] as Row[]).map(UNP)

const DATA_L = ([
  ['L 50×50×5', 50, 5, 4.80, 3.77, 11.1, 1.52, 0.98],
  ['L 50×50×6', 50, 6, 5.64, 4.43, 12.6, 1.50, 0.97],
  ['L 60×60×5', 60, 5, 5.80, 4.55, 19.6, 1.84, 1.17],
  ['L 60×60×6', 60, 6, 6.88, 5.42, 22.8, 1.82, 1.16],
  ['L 65×65×6', 65, 6, 7.53, 5.91, 29.4, 1.98, 1.26],
  ['L 70×70×6', 70, 6, 8.13, 6.38, 37.1, 2.14, 1.36],
  ['L 75×75×6', 75, 6, 8.73, 6.85, 46.1, 2.30, 1.46],
  ['L 75×75×9', 75, 9, 12.69, 9.96, 64.4, 2.25, 1.44],
  ['L 80×80×6', 80, 6, 9.33, 7.32, 56.4, 2.46, 1.57],
  ['L 90×90×7', 90, 7, 12.22, 9.59, 93.0, 2.76, 1.76],
  ['L 90×90×10', 90, 10, 17.00, 13.3, 125, 2.71, 1.74],
  ['L 100×100×7', 100, 7, 13.62, 10.7, 129, 3.08, 1.95],
  ['L 100×100×10', 100, 10, 19.00, 14.9, 175, 3.04, 1.95],
  ['L 100×100×13', 100, 13, 24.31, 19.1, 220, 3.00, 1.94],
  ['L 120×120×8', 120, 8, 18.76, 14.7, 258, 3.71, 2.35],
  ['L 130×130×9', 130, 9, 22.74, 17.9, 366, 4.01, 2.53],
  ['L 150×150×10', 150, 10, 29.21, 22.9, 627, 4.63, 2.95],
  ['L 150×150×12', 150, 12, 34.77, 27.3, 740, 4.61, 2.95],
  ['L 150×150×15', 150, 15, 42.74, 33.6, 888, 4.56, 2.92],
  ['L 200×200×15', 200, 15, 57.75, 45.3, 2180, 6.14, 3.93],
  ['L 200×200×20', 200, 20, 76.00, 59.7, 2820, 6.09, 3.90],
] as Row[]).map(LSIKU)

/* ---------- hollow & cold-formed ---------- */
const DATA_SHS = ([
  [40, [2.3, 3.2]], [50, [2.3, 3.2, 4.5]], [60, [2.3, 3.2, 4.5]], [75, [3.2, 4.5, 6]],
  [90, [3.2, 4.5, 6]], [100, [3.2, 4.5, 6, 8]], [125, [4.5, 6, 9]], [150, [6, 9, 12]],
  [200, [6, 9, 12]], [250, [9, 12]],
] as [number, number[]][]).flatMap(([a, ts]) => ts.map((t) => SHS(a, t)))

const DATA_RHS = ([
  [50, 30, [2.3, 3.2]], [75, 45, [2.3, 3.2, 4.5]], [100, 50, [3.2, 4.5, 6]],
  [125, 75, [3.2, 4.5, 6]], [150, 75, [4.5, 6, 9]], [150, 100, [4.5, 6, 9]],
  [200, 100, [6, 9, 12]], [250, 150, [6, 9, 12]], [300, 200, [9, 12]],
] as [number, number, number[]][]).flatMap(([H, B, ts]) => ts.map((t) => RHS(H, B, t)))

const DATA_PIPE = ([
  [48.3, [2.8, 3.2, 3.7]], [60.3, [2.9, 3.2, 4.0]], [76.3, [3.2, 4.0, 5.0]],
  [88.9, [3.2, 4.0, 5.5]], [114.3, [3.5, 4.5, 6.0]], [139.8, [4.0, 5.0, 6.6]],
  [165.2, [5.0, 6.6, 7.1]], [216.3, [5.8, 7.0, 8.2]], [267.4, [6.6, 7.9, 9.3]],
  [318.5, [6.9, 8.4, 10.3]],
] as [number, number[]][]).flatMap(([D, ts]) => ts.map((t) => PIPE(D, t)))

const DATA_CNP = ([
  [75, 45, 15, [1.6, 2.0]], [100, 50, 20, [1.6, 2.0, 2.3]], [125, 50, 20, [2.0, 2.3, 3.2]],
  [150, 65, 20, [2.0, 2.3, 3.2]], [200, 75, 20, [2.3, 3.2]],
] as [number, number, number, number[]][]).flatMap(([H, B, C, ts]) => ts.map((t) => CNP(H, B, C, t)))

/* ---------- registry & API ---------- */
export const STEEL_DB: Record<SteelType, SteelProfile[]> = {
  WF: DATA_WF, UNP: DATA_UNP, L: DATA_L, SHS: DATA_SHS, RHS: DATA_RHS, PIPE: DATA_PIPE, CNP: DATA_CNP,
}

export const STEEL_TYPES: SteelTypeInfo[] = [
  { key: 'WF', name: 'WF / IWF', full: 'Wide Flange (profil H/I)', std: 'JIS G3192', src: 'tabel', shape: 'I' },
  { key: 'UNP', name: 'UNP', full: 'Kanal U (channel)', std: 'DIN 1026', src: 'tabel', shape: 'C' },
  { key: 'L', name: 'Siku (L)', full: 'Baja siku sama kaki', std: 'JIS G3192', src: 'tabel', shape: 'L' },
  { key: 'SHS', name: 'SHS', full: 'Hollow persegi', std: 'geometris', src: 'hitung', shape: 'box' },
  { key: 'RHS', name: 'RHS', full: 'Hollow persegi panjang', std: 'geometris', src: 'hitung', shape: 'box' },
  { key: 'PIPE', name: 'Pipa', full: 'Hollow bundar (pipe)', std: 'geometris', src: 'hitung', shape: 'pipe' },
  { key: 'CNP', name: 'CNP', full: 'Kanal C berbibir (ringan)', std: 'garis-tengah', src: 'hitung', shape: 'C' },
]

export const listProfiles = (type: string): SteelProfile[] => (STEEL_DB[type as SteelType] ? STEEL_DB[type as SteelType].slice() : [])

export const getProfile = (type: string, name: string): SteelProfile | null =>
  (STEEL_DB[type as SteelType] || []).find((p) => p.name === name) ?? null

export const typeInfo = (type: string): SteelTypeInfo | null => STEEL_TYPES.find((t) => t.key === type) ?? null

/** Luas bruto (mm²). */
export const AgMm2 = (p: SteelProfile): number => p.A * 100
/** Jari-jari girasi minimum (mm). */
export const rminMm = (p: SteelProfile): number => (p.imin as number) * 10

/** Tebal elemen yang lazim dilubangi baut (luas neto): WF/UNP → tf, lainnya → t. */
export function tGov(type: string, p: SteelProfile): number {
  if (type === 'WF' || type === 'UNP') return p.tf as number
  return p.t
}
