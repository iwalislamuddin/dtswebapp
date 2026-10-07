// Model laporan perhitungan — SATU sumber per tool untuk tab Detail (HTML), unduhan .txt, dan PDF.
// Murni & deterministik: tanggal/versi aplikasi diberikan saat render (ReportMeta), bukan disimpan di sini.
// Teks ditulis dengan Unicode biasa (φ, ·, ², ≤); versi .txt/PDF mengubahnya ke ASCII (text.ts → toAscii).

/** Primitif gambar vektor (pola core/report.js lama). Koordinat pt, origin kiri-atas, y ke bawah, lebar 528. */
export type FigOp =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; lw?: number; g?: number; dash?: number[] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean; lw?: number; g?: number; dash?: number[] }
  | { t: 'poly'; pts: [number, number][]; close?: boolean; fill?: boolean; lw?: number; g?: number; dash?: number[] }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean; lw?: number; g?: number }
  | { t: 'text'; x: number; y: number; s: string; size?: number; align?: 'l' | 'c' | 'r'; g?: number }

/**
 * Gambar: `h` = tinggi dalam baris teks laporan (1 baris = 11,5 pt), `alt` = pengganti di .txt.
 * `g` = abu-abu 0 (tinta) … 1 (kertas); di tab Detail dipetakan ke warna tema.
 */
export interface Figure {
  h: number
  ops: FigOp[]
  alt: string
}

export type Row =
  /** Label ........ nilai */
  | { k: 'kv'; label: string; value: string }
  /** Cek rasio kebutuhan/kapasitas: OK bila ≤ 1. */
  | { k: 'check'; label: string; ratio: number; note?: string }

export type Block =
  | { k: 'rows'; rows: Row[] }
  | { k: 'figure'; fig: Figure }
  | { k: 'text'; lines: string[] }
  | { k: 'notes'; items: string[] }

export interface Section {
  title: string
  blocks: Block[]
  /** Bagian hasil utama (garis "=" di laporan teks). */
  strong?: boolean
}

export interface Report {
  /** Judul + acuan, mis. "Sambungan Baut (SNI 1729:2020 Ps. J3)". */
  title: string
  /** Metode / catatan singkat di baris kepala, mis. "DFBK, bearing-type". */
  method: string
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

/** Format angka laporan: '-' untuk null/NaN/±∞ (seperti numR lama). */
export function fx(n: number | null | undefined, dp = 2): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '-' : n.toFixed(dp)
}

export const okNg = (ratio: number): 'OK' | 'NG' => (ratio <= 1 ? 'OK' : 'NG')

export const kv = (label: string, value: string): Row => ({ k: 'kv', label, value })
export const check = (label: string, ratio: number, note?: string): Row => ({ k: 'check', label, ratio, note })
