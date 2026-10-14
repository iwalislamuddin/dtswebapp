import { computeOpenChannel, MANNING_N, sectionAt, type ChannelShape, type OpenChannelInput, type OpenChannelResult } from '../../calc/open-channel'
import { GRAVITY } from '../../calc/shared/hydraulics'
import { checker, num, parseNum, pos, type FieldErrors } from '../form'

// Input UI Saluran Terbuka (Manning): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors, ChannelShape }
/** Hasil hitung yang sah — bidang turunan pasti terisi. */
export type ChannelOk = OpenChannelResult & {
  valid: true; mat: string; y: number; Q: number; A: number; P: number; T: number; R: number; V: number; yc: number | null; Fr: number; regime: string
}

export type ChannelMode = 'fromY' | 'fromQ'

export interface ChannelUIInput {
  shape: ChannelShape
  mode: ChannelMode
  /** Lebar dasar (m), talud m (H:1V), diameter (m). */
  b: string
  m: string
  D: string
  /** Kunci MANNING_N atau 'custom'. */
  mat: string
  nman: string
  /** Kemiringan dasar (m/m). */
  S: string
  /** Kedalaman (m) / debit (m³/s) yang diketahui. */
  y: string
  Q: string
}

/** Input bawaan = kasus golden default (trapesium dari y). */
export const CHANNEL_DEFAULTS: ChannelUIInput = { shape: 'trap', mode: 'fromY', b: '1', m: '1.5', D: '1', mat: 'concrete', nman: '0.013', S: '0.001', y: '0.8', Q: '1' }

export const SHAPE_LABEL: Record<ChannelShape, string> = { rect: 'Persegi', trap: 'Trapesium', tri: 'Segitiga', circle: 'Lingkaran (gorong-gorong)' }

export const MAT_LABEL: Record<string, string> = {
  concrete: 'Beton halus / plester',
  concreteRough: 'Beton kasar',
  masonry: 'Pasangan batu',
  earth: 'Tanah, lurus & bersih',
  grass: 'Tanah berumput',
  pvc: 'PVC / HDPE',
}
export const MAT_KEYS = Object.keys(MANNING_N)

export const usesB = (s: ChannelShape) => s === 'rect' || s === 'trap'
export const usesM = (s: ChannelShape) => s === 'trap' || s === 'tri'

export function validate(i: ChannelUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  if (i.mat === 'custom') need('nman', pos)
  need('S', pos)
  if (usesB(i.shape)) need('b', pos)
  if (usesM(i.shape)) need('m', pos)
  if (i.shape === 'circle') need('D', pos)
  if (i.mode === 'fromY') {
    need('y', pos)
    const y = parseNum(i.y), D = parseNum(i.D)
    if (!e.y && i.shape === 'circle' && y !== null && D !== null && D > 0 && y >= D) e.y = 'Harus < D (penuh = aliran bertekanan, pakai tool Aliran Pipa)'
  } else need('Q', pos)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: ChannelUIInput): OpenChannelInput {
  return { shape: i.shape, mode: i.mode, b: num(i.b), m: num(i.m), D: num(i.D), mat: i.mat, nman: num(i.nman), S: num(i.S), y: num(i.y), Q: num(i.Q) }
}

/** Hitung; null bila input tidak valid atau debit melampaui kapasitas gravitasi lingkaran. */
export function computeChannelUI(i: ChannelUIInput): ChannelOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeOpenChannel(toCalcInput(i))
  return r.valid ? ({ ...r, mat: i.mat } as ChannelOk) : null
}

/** Alasan input yang lolos validasi tetap ditolak mesin hitung (Q > kapasitas gravitasi gorong-gorong). */
export function rejectReason(i: ChannelUIInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeOpenChannel(toCalcInput(i))
  return r.valid ? null : (r.warn[0] ?? 'Input tidak dapat dihitung.')
}

/** Debit Manning pada kedalaman y — rumus yang sama dengan mesin hitung. */
export function manningQ(r: ChannelOk, y: number): number {
  const g = sectionAt(r.shape, y, r.b, r.m, r.D)
  if (g.A <= 0) return 0
  return (1 / r.n) * Math.pow(g.A / g.P, 2 / 3) * Math.sqrt(r.S) * g.A
}

/** Kedalaman tertinggi grafik: lingkaran sampai ±D, lainnya 1,6× max(y, yc). */
export const yTop = (r: ChannelOk): number => (r.shape === 'circle' ? r.D * 0.999 : 1.6 * Math.max(r.y, r.yc ?? 0))

/** Kurva debit (rating curve) Q(y), y = 0 … yTop. Titik [Q, y] — kedalaman sumbu tegak. */
export function ratingCurve(r: ChannelOk, n = 60): [number, number][] {
  const top = yTop(r)
  return Array.from({ length: n + 1 }, (_, k) => {
    const y = (top * k) / n
    return [manningQ(r, y), y] as [number, number]
  })
}

/**
 * Energi spesifik E = y + Q²/(2gA²) untuk debit hasil, y dari ±0,3·min(y, yc) … yTop. Titik [E, y]; cabang
 * superkritis dipotong di E ≤ 1,4·max(E(y), yTop) agar skala grafik tetap terbaca.
 */
export function specificEnergy(r: ChannelOk, n = 80): [number, number][] {
  const top = yTop(r)
  const lo = Math.max(top / 200, 0.3 * Math.min(r.yc ?? r.y, r.y))
  const pts: [number, number][] = []
  for (let k = 0; k <= n; k++) {
    const y = lo + ((top - lo) * k) / n
    const A = sectionAt(r.shape, y, r.b, r.m, r.D).A
    pts.push([y + (r.Q * r.Q) / (2 * GRAVITY * A * A), y])
  }
  const cap = 1.4 * Math.max(energyAt(r, r.y), top)
  return pts.filter((p) => p[0] <= cap)
}

/** Energi spesifik di kedalaman y (m). */
export function energyAt(r: ChannelOk, y: number): number {
  const A = sectionAt(r.shape, y, r.b, r.m, r.D).A
  return y + (r.Q * r.Q) / (2 * GRAVITY * A * A)
}

/**
 * Bentuk penampang (m, x dari as saluran, y ke atas dari dasar): garis dinding, poligon air pada kedalaman y,
 * tinggi tebing gambar Hb (open: 1,3·max(y, yc), lingkaran: D) dan lebar muka air T.
 */
export function sectionShape(r: ChannelOk) {
  if (r.shape === 'circle') {
    const R = r.D / 2
    const wall: [number, number][] = Array.from({ length: 73 }, (_, k) => {
      const a = (2 * Math.PI * k) / 72
      return [R * Math.sin(a), R - R * Math.cos(a)]
    })
    const th = 2 * Math.acos(1 - (2 * r.y) / r.D)
    const water: [number, number][] = Array.from({ length: 49 }, (_, k) => {
      const a = -th / 2 + (th * k) / 48
      return [R * Math.sin(a), R - R * Math.cos(a)]
    })
    return { Hb: r.D, wall, water, halfTop: R }
  }
  const b = usesB(r.shape) ? r.b : 0, m = usesM(r.shape) ? r.m : 0
  const Hb = 1.3 * Math.max(r.y, r.yc ?? 0)
  const wall: [number, number][] = [[-b / 2 - m * Hb, Hb], [-b / 2, 0], [b / 2, 0], [b / 2 + m * Hb, Hb]]
  const water: [number, number][] = [[-b / 2 - m * r.y, r.y], [-b / 2, 0], [b / 2, 0], [b / 2 + m * r.y, r.y]]
  return { Hb, wall, water, halfTop: b / 2 + m * Hb }
}
