// Debit banjir rencana — metode rasional, tc Kirpich, intensitas Mononobe.
// Port 1:1 dari modules/rational-method/module.js (compute), diverifikasi golden test.
//
//   tc = 0,0195·L^0,77·S^−0,385 (menit, Kirpich) atau manual; i = (R24/24)·(24/tc)^(2/3) (mm/jam, Mononobe);
//   Q = 0,00278·C·i·A (m³/s, A dalam ha).

import { numFinite as num, type NumLike } from './shared/num'

/** Koefisien limpasan C per tutupan lahan. */
export const RUNOFF_C: Record<string, { label: string; C: number }> = {
  roof: { label: 'Atap/perkerasan (0,85)', C: 0.85 },
  urban: { label: 'Permukiman padat (0,70)', C: 0.7 },
  suburb: { label: 'Permukiman renggang (0,50)', C: 0.5 },
  garden: { label: 'Taman/halaman (0,25)', C: 0.25 },
  farm: { label: 'Sawah/ladang (0,45)', C: 0.45 },
  forest: { label: 'Hutan/vegetasi rapat (0,15)', C: 0.15 },
}

export interface RationalInput {
  /** Luas (ha). */
  A: NumLike
  /** Kunci RUNOFF_C atau 'custom'. */
  land: string
  C: NumLike
  /** Hujan harian rencana (mm). */
  R24: NumLike
  tcMode?: 'kirpich' | 'manual'
  /** Panjang lintasan & beda tinggi (m). */
  Lf: NumLike
  dH: NumLike
  /** tc manual (menit). */
  tcMan: NumLike
}

export interface RationalResult {
  valid: boolean
  warn: string[]
  A: number
  C: number
  R24: number
  tcMode: string
  Lf: number
  dH: number
  landLabel: string
  S?: number | null
  /** menit & jam */
  tcMin?: number
  tcHr?: number
  /** mm/jam */
  i?: number
  /** m³/s */
  Q?: number
}

export function computeRational(v: RationalInput): RationalResult {
  const A = num(v.A)
  const C = v.land === 'custom' ? num(v.C) : RUNOFF_C[v.land] ? RUNOFF_C[v.land].C : 0.5
  const R24 = num(v.R24)
  const tcMode = v.tcMode || 'kirpich'
  const Lf = num(v.Lf), dH = num(v.dH), tcMan = num(v.tcMan)
  const r: RationalResult = {
    valid: false, warn: [], A, C, R24, tcMode, Lf, dH,
    landLabel: v.land === 'custom' ? 'Kustom' : RUNOFF_C[v.land] ? RUNOFF_C[v.land].label : '-',
  }
  if (A <= 0 || C <= 0 || R24 <= 0) { r.warn.push('Isi A, C, dan R24 (> 0).'); return r }

  let tcMin: number, S: number | null = null
  if (tcMode === 'kirpich') {
    if (Lf <= 0 || dH <= 0) { r.warn.push('Isi panjang lintasan L dan beda tinggi ΔH (> 0) untuk Kirpich.'); return r }
    S = dH / Lf
    tcMin = 0.0195 * Math.pow(Lf, 0.77) * Math.pow(S, -0.385)
  } else {
    if (tcMan <= 0) { r.warn.push('Isi tc manual (> 0 menit).'); return r }
    tcMin = tcMan
  }
  const tcHr = tcMin / 60
  const i = (R24 / 24) * Math.pow(24 / tcHr, 2 / 3)
  Object.assign(r, { S, tcMin, tcHr, i, Q: 0.00278 * C * i * A, valid: true })

  if (A > 300) r.warn.push('A = ' + A.toFixed(0) + ' ha — melampaui batas lazim metode rasional (±80–300 ha); gunakan hidrograf satuan (HSS).')
  else if (A > 80) r.warn.push('A = ' + A.toFixed(0) + ' ha — di ambang atas metode rasional; hasil makin kasar.')
  if (tcMin < 5) r.warn.push('tc = ' + tcMin.toFixed(1) + ' menit < 5 menit — dipakai minimum praktis 5 menit? Nilai i sangat sensitif; di sini tc TIDAK diklamp (hasil konservatif).')
  if (S != null && S > 0.1) r.warn.push('Kemiringan S = ' + (S * 100).toFixed(1) + '% curam — Kirpich dikembangkan untuk lereng pertanian; hasil indikatif.')
  r.warn.push('Mononobe adalah PENDEKATAN intensitas dari hujan harian — bila tersedia kurva IDF lokal (analisis frekuensi), gunakan itu.')
  r.warn.push('R24 harus hujan rencana sesuai periode ulang (mis. R24 kala ulang 5–10 th untuk drainase kota).')
  return r
}
