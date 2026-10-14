import { computePileCap, pileLayout, type PileCapInput, type PileCapResult } from '../../calc/pile-cap'
import { anyNum, checker, nonneg, num, parseNum, pos, type FieldErrors } from '../form'

// Input UI Desain Pile Cap: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export const CAP_BARS = [16, 19, 22, 25, 29, 32, 36] as const
export const CAP_COUNTS = ['2', '3', '4', '5', '6'] as const
export const MAX_PILES = 16

/** Satu tiang: koordinat (mm) relatif pusat kolom. */
export interface PileRow {
  x: string
  y: string
  [k: string]: string
}

export interface PileCapUIInput {
  /** 'pu' = beban kolom terfaktor; 'kapasitas' = tiap tiang dibebani kapasitas terfaktor Q. */
  mode: 'pu' | 'kapasitas'
  Pu: string
  Mux: string
  Muy: string
  Q: string
  /** Koordinat tiang (mm) terhadap pusat kolom (+x ke kanan, +y ke atas). */
  piles: PileRow[]
  /** Spasi untuk tombol "Isi dari pola" (mm) — hanya membantu mengisi tabel. */
  s: string
  /** Bentuk poer: persegi (bounding box) atau poligon (selubung tiang + overhang, sudut terpangkas — mis. segitiga). */
  shape: 'persegi' | 'poligon'
  /** Diameter tiang & overhang pusat tiang → tepi poer (mm). */
  dp: string
  ov: string
  /** Kolom, tebal poer, selimut ke pusat tulangan bawah (mm). */
  cx: string
  cy: string
  h: string
  cov: string
  fc: string
  fy: string
  db: string
}

/** Input bawaan = kasus golden default (4 tiang D400, Pu 4000 kN → lentur & pons terhitung). */
export const CAP_DEFAULTS: PileCapUIInput = {
  mode: 'pu', Pu: '4000', Mux: '0', Muy: '0', Q: '1200',
  piles: [{ x: '-600', y: '-600' }, { x: '600', y: '-600' }, { x: '-600', y: '600' }, { x: '600', y: '600' }], s: '1200', shape: 'persegi', dp: '400', ov: '400', cx: '500', cy: '500', h: '800', cov: '75',
  fc: '30', fy: '420', db: '25',
}

export function validate(i: PileCapUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  if (i.mode === 'pu') {
    need('Pu', pos)
    need('Mux', anyNum)
    need('Muy', anyNum)
  } else need('Q', pos)
  for (const k of ['dp', 'ov', 'cx', 'cy', 'h', 'fc', 'fy'] as const) need(k, pos)
  if (i.piles.length < 2) e.piles = 'Minimal 2 tiang'
  i.piles.forEach((p, k) => {
    for (const c of ['x', 'y'] as const) {
      const n = parseNum(p[c])
      if (n === null) e[`piles.${k}.${c}`] = 'Isi angka'
    }
  })
  need('cov', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: PileCapUIInput): PileCapInput {
  return {
    mode: i.mode, Pu: num(i.Pu), Mux: num(i.Mux), Muy: num(i.Muy), Q: num(i.Q), n: i.piles.length, piles: i.piles.map((p) => ({ x: num(p.x), y: num(p.y) })), shape: i.shape, dp: num(i.dp), s: Math.max(1, num(i.s)), ov: num(i.ov),
    cx: num(i.cx), cy: num(i.cy), h: num(i.h), cov: num(i.cov), fc: num(i.fc), fy: num(i.fy), db: i.db,
  }
}

/** Hitung; null bila input tidak valid atau poer terlalu tipis (UI memakai hasil terakhir, diredupkan). */
export function computePileCapUI(i: PileCapUIInput): PileCapResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computePileCap(toCalcInput(i))
  return r.valid ? r : null
}

/** Pesan bila mesin hitung menolak meski field sah. */
export function rejectReason(i: PileCapUIInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computePileCap(toCalcInput(i))
  return r.valid ? null : r.warn[r.warn.length - 1] ?? 'Input tidak dapat dihitung.'
}

/** Susunan pola n tiang (2–6) dengan spasi s sebagai isi awal tabel koordinat (dibulatkan 0,1 mm). */
export function patternPiles(n: number, s: number): PileRow[] {
  const f = (v: number) => String(Math.round(v * 10) / 10 + 0)
  return pileLayout(n, s).map((p) => ({ x: f(p.x), y: f(p.y) }))
}
