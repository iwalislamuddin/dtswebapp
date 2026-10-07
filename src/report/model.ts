// Model laporan perhitungan — SATU sumber per tool untuk tab Detail (HTML) dan PDF.
// Murni & deterministik: tanggal/versi aplikasi diberikan saat render (ReportMeta).
//
// Semua teks boleh memakai markup rumus ringan (src/report/math.ts):
//   x_{A}  → subskrip     10^{4} → superskrip     \frac{a}{b} → pecahan
// Simbol Unicode biasa (φ, ·, ², ≤, Σ) dipakai langsung; PDF memakai font Unicode.

/** Warna semantik gambar — dipetakan ke token --dg-* di layar dan ke palet cetak di PDF. */
export type FigColor = 'ink' | 'muted' | 'grid' | 'accent' | 'load' | 'support' | 'v' | 'm' | 'y' | 'ok' | 'bad'

interface Paint {
  /** Abu-abu 0 (tinta) … 1 (kertas) — dipakai bila `c` tidak diisi (gambar lama). */
  g?: number
  c?: FigColor
  /** Opasitas isian (0–1). */
  op?: number
}

/** Primitif gambar vektor. Koordinat pt, origin kiri-atas, y ke bawah, lebar area 528. */
export type FigOp =
  | ({ t: 'line'; x1: number; y1: number; x2: number; y2: number; lw?: number; dash?: number[] } & Paint)
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean; lw?: number; dash?: number[] } & Paint)
  | ({ t: 'poly'; pts: [number, number][]; close?: boolean; fill?: boolean; lw?: number; dash?: number[] } & Paint)
  | ({ t: 'circle'; cx: number; cy: number; r: number; fill?: boolean; lw?: number } & Paint)
  | ({ t: 'text'; x: number; y: number; s: string; size?: number; align?: 'l' | 'c' | 'r'; bold?: boolean } & Paint)

/** Gambar: `h` = tinggi dalam satuan baris (11,5 pt) — tinggi nyata h·11,5 pt; `alt` teks pengganti. */
export interface Figure {
  h: number
  ops: FigOp[]
  alt: string
  caption?: string
}

export type Row =
  /** Label ........ nilai */
  | { k: 'kv'; label: string; value: string }
  /** Cek rasio kebutuhan/kapasitas: OK bila ≤ 1. */
  | { k: 'check'; label: string; ratio: number; note?: string }

/** Satu langkah hitung: [desc] lhs = expr = subst = value unit  (ref = pasal acuan). */
export interface CalcStep {
  desc?: string
  lhs: string
  expr?: string
  subst?: string
  value: string
  unit?: string
  ref?: string
}

export type Block =
  | { k: 'h'; text: string }
  | { k: 'p'; text: string }
  | { k: 'rows'; rows: Row[] }
  | { k: 'calc'; steps: CalcStep[] }
  | { k: 'table'; head: string[]; rows: string[][]; align?: ('l' | 'c' | 'r')[]; caption?: string }
  | { k: 'figure'; fig: Figure }
  /** Kompatibilitas laporan lama: baris teks bebas. */
  | { k: 'text'; lines: string[] }
  | { k: 'notes'; items: string[] }

export interface Section {
  title: string
  blocks: Block[]
  /** Bagian hasil utama (ditonjolkan). */
  strong?: boolean
}

export interface Report {
  /** Judul + acuan, mis. "Sambungan Baut (SNI 1729:2020 Ps. J3)". */
  title: string
  /** Metode / catatan singkat di kepala laporan. */
  method: string
  /** Ringkasan hasil di awal laporan (opsional). */
  summary?: Row[]
  sections: Section[]
  /** Rasio menentukan, ditonjolkan di akhir perhitungan. */
  governing?: { label: string; ratio: number }
  /** Peringatan hasil hitungan (warn). */
  warnings: string[]
  /** Batas cakupan & disclaimer singkat. */
  scope: string[]
}

export interface ReportMeta {
  appVersion: string
  /** Waktu pembuatan, "YYYY-MM-DD HH:MM". */
  date: string
}

/** Format angka laporan: '-' untuk null/NaN/±∞. */
export function fx(n: number | null | undefined, dp = 2): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '-' : n.toFixed(dp)
}

/** Notasi ilmiah dengan markup: 1.442×10^{12}. Angka kecil/sedang tetap biasa. */
export function sci(n: number, dp = 3): string {
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(n)))
  if (e >= -2 && e < 6) return n.toFixed(Math.max(0, dp - Math.max(0, e)))
  return `${(n / 10 ** e).toFixed(dp)}×10^{${e}}`
}

export const okNg = (ratio: number): 'OK' | 'NG' => (ratio <= 1 ? 'OK' : 'NG')

export const kv = (label: string, value: string): Row => ({ k: 'kv', label, value })
export const check = (label: string, ratio: number, note?: string): Row => ({ k: 'check', label, ratio, note })
