import { anyNum, nonneg, pos, type FieldErrors, parseNum } from '../form'
import type { StoneWallResult } from '../../calc/retaining-stone'

// Bagian bersama dinding penahan tanah (pasangan batu & beton kantilever): input geometri/tanah, validasi,
// poligon penampang untuk gambar, dan tekanan dasar sebenarnya (toe/heel).

export type WallOpsi = 'tegak' | 'miring'

export interface WallCommonInput {
  opsi: WallOpsi
  /** Geometri (m): tinggi badan di atas tapak, lebar puncak & dasar badan, tebal tapak, toe, heel. */
  H: string
  bTop: string
  bBot: string
  tf: string
  toe: string
  heel: string
  /** Kedalaman tanah depan (m). */
  D: string
  /** Urugan: γ (kN/m³), φ (°), lereng β (°), beban merata q (kPa). */
  gamma1: string
  phi1: string
  beta: string
  q: string
  /** Tanah fondasi: γ, φ, c (kPa), daya dukung izin (kPa; 0 = lewati), faktor gesekan dasar. */
  gamma2: string
  phi2: string
  c2: string
  qall: string
  kf: string
  passive: 'tidak' | 'ya'
  FSot: string
  FSsl: string
  /** Panjang dinding untuk volume total (m); 0 = per meter. */
  Lwall: string
}

export const WALL_COMMON_DEFAULTS: Omit<WallCommonInput, 'H' | 'bTop' | 'bBot' | 'tf' | 'toe' | 'heel'> = {
  opsi: 'tegak', D: '0.8', gamma1: '18', phi1: '30', beta: '0', q: '10', gamma2: '18', phi2: '28', c2: '10', qall: '150', kf: '0.67',
  passive: 'tidak', FSot: '2', FSsl: '1.5', Lwall: '10',
}

type Need = (key: keyof WallCommonInput & string, rule: (n: number) => string | null) => void

/** Aturan bersama (cerminan penolakan di mesin hitung); aturan khusus tool ditambahkan pemanggil. */
export function validateWallCommon(i: WallCommonInput, e: FieldErrors, need: Need): void {
  for (const k of ['H', 'bTop', 'bBot', 'tf', 'gamma1', 'phi1'] as const) need(k, pos)
  for (const k of ['toe', 'heel', 'D', 'q', 'gamma2', 'phi2', 'c2', 'qall', 'FSot', 'FSsl', 'Lwall'] as const) need(k, nonneg)
  need('beta', nonneg)
  need('kf', anyNum)
  const bTop = parseNum(i.bTop), bBot = parseNum(i.bBot)
  if (!e.bBot && bTop !== null && bBot !== null && bBot < bTop) e.bBot = 'Harus ≥ lebar puncak'
  const beta = parseNum(i.beta), phi1 = parseNum(i.phi1)
  if (!e.beta && beta !== null && phi1 !== null && beta >= phi1) e.beta = 'Harus < φ urugan'
}

export interface WallGeom {
  opsi: WallOpsi
  H: number
  bTop: number
  bBot: number
  tf: number
  toe: number
  heel: number
  B: number
  D: number
  beta: number
}

export type Pt = [number, number]

export interface WallPolys {
  foot: Pt[]
  stem: Pt[]
  /** Urugan di belakang badan sampai bidang semu (x = B). */
  back: Pt[]
  /** Tanah depan setinggi D di atas dasar tapak. */
  front: Pt[]
  /** Puncak belakang badan (awal lereng urugan) dan ws. */
  xTopBack: number
  ws: number
  /** Tinggi muka urugan di bidang semu (dari dasar tapak). */
  yTopSoil: number
}

/** Poligon penampang (x dari ujung toe, y dari dasar tapak; satuan m). */
export function wallPolys(g: WallGeom): WallPolys {
  const { H, bTop, bBot, tf, toe, B, D } = g
  const bw = bBot - bTop
  const tanB = Math.tan((g.beta * Math.PI) / 180)
  const stem: Pt[] =
    g.opsi === 'tegak'
      ? [[toe, tf], [toe + bw, tf + H], [toe + bBot, tf + H], [toe + bBot, tf]]
      : [[toe, tf], [toe, tf + H], [toe + bTop, tf + H], [toe + bBot, tf]]
  const xTopBack = g.opsi === 'tegak' ? toe + bBot : toe + bTop
  const ws = B - xTopBack
  const yTopSoil = tf + H + ws * tanB
  const back: Pt[] = [[xTopBack, tf + H], [B, yTopSoil], [B, tf], [toe + bBot, tf]]
  return {
    foot: [[0, 0], [B, 0], [B, tf], [0, tf]],
    stem,
    back,
    front: [[-Math.max(0.4, B * 0.2), 0], [-Math.max(0.4, B * 0.2), D], [toe, D], [toe, 0]],
    xTopBack,
    ws,
    yTopSoil,
  }
}

/** Bagian hasil yang dibaca bersama oleh stabilitas pasangan batu & beton. */
export type WallStab = StoneWallResult

export function geomOf(r: WallStab): WallGeom {
  return { opsi: r.opsi!, H: r.H!, bTop: r.bTop!, bBot: r.bBot!, tf: r.tf!, toe: r.toe!, heel: r.heel!, B: r.B!, D: r.D!, beta: r.beta! }
}

/**
 * Tekanan dasar layan di toe dan heel. Mesin hitung memberi `qmax` = tekanan di toe pada kasus trapesium — bila
 * resultan condong ke heel (e < 0) itu justru yang terkecil (lihat TODO "Perbaikan isi tool"), jadi tampilan memakai
 * nilai sebenarnya dari V, B, x̄.
 */
export function basePressures(r: WallStab): { toe: number; heel: number; max: number } {
  const V = r.sumV!, B = r.B!, xbar = r.xbar!, e = r.e!
  if (xbar <= 0) return { toe: Infinity, heel: 0, max: Infinity }
  if (Math.abs(e) <= B / 6 + 1e-12) {
    const toe = (V / B) * (1 + (6 * e) / B), heel = (V / B) * (1 - (6 * e) / B)
    return { toe, heel, max: Math.max(toe, heel) }
  }
  if (e > 0) {
    const m = (2 * V) / (3 * xbar)
    return { toe: m, heel: 0, max: m }
  }
  const m = (2 * V) / (3 * (B - xbar))
  return { toe: 0, heel: m, max: m }
}

/** Rasio D/C tahap stabilitas layan (≤ 1 = OK). */
export function stabilityRatios(r: WallStab): { label: string; ratio: number }[] {
  const out = [
    { label: `Guling ${r.FSotT!.toFixed(1)}/SF`, ratio: r.FSotT! / r.FSot! },
    { label: `Geser ${r.FSslT!.toFixed(1)}/SF`, ratio: r.FSslT! / r.FSsl! },
    { label: 'Eksentrisitas e/(B/6)', ratio: Math.abs(r.e!) / (r.B! / 6) },
  ]
  if (r.qall! > 0) out.push({ label: 'Daya dukung qmax/qizin', ratio: basePressures(r).max / r.qall! })
  return out
}
