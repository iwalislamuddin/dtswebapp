import { computeRational, RUNOFF_C, type RationalInput, type RationalResult } from '../../calc/rational-method'
import { checker, num, pos, type FieldErrors } from '../form'

// Input UI Debit Banjir Rasional (Kirpich + Mononobe): angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }
/** Hasil hitung yang sah — bidang turunan pasti terisi. */
export type RationalOk = RationalResult & { valid: true; tcMin: number; tcHr: number; i: number; Q: number }

export type TcMode = 'kirpich' | 'manual'

export interface RationalUIInput {
  /** Luas daerah tangkapan (ha). */
  A: string
  /** Kunci RUNOFF_C atau 'custom'. */
  land: string
  /** C kustom (hanya bila land = 'custom'). */
  C: string
  /** Hujan harian rencana (mm). */
  R24: string
  tcMode: TcMode
  /** Kirpich: panjang lintasan & beda tinggi (m). */
  Lf: string
  dH: string
  /** tc manual (menit). */
  tcMan: string
}

/** Input bawaan = kasus golden default (C kustom 0,6 tersimpan, tak dipakai selama tutupan bukan Kustom). */
export const RATIONAL_DEFAULTS: RationalUIInput = { A: '10', land: 'urban', C: '0.6', R24: '120', tcMode: 'kirpich', Lf: '800', dH: '8', tcMan: '30' }

export const LAND_KEYS = Object.keys(RUNOFF_C)

const cMax = (n: number) => (n > 0 && n <= 1 ? null : 'Antara 0 dan 1')

export function validate(i: RationalUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('A', pos)
  need('R24', pos)
  if (i.land === 'custom') need('C', cMax)
  if (i.tcMode === 'kirpich') {
    need('Lf', pos)
    need('dH', pos)
  } else need('tcMan', pos)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: RationalUIInput): RationalInput {
  return { A: num(i.A), land: i.land, C: num(i.C), R24: num(i.R24), tcMode: i.tcMode, Lf: num(i.Lf), dH: num(i.dH), tcMan: num(i.tcMan) }
}

/** Hitung; null bila input tidak valid. */
export function computeRationalUI(i: RationalUIInput): RationalOk | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeRational(toCalcInput(i))
  return r.valid ? (r as RationalOk) : null
}

/** Intensitas Mononobe (mm/jam) untuk durasi t (menit) — rumus yang sama dengan mesin hitung. */
export const mononobe = (R24: number, tMin: number): number => (R24 / 24) * Math.pow(24 / (tMin / 60), 2 / 3)

/** Kurva intensitas–durasi Mononobe, t = 5 menit … max(180, 2·tc) menit. */
export function idfCurve(r: RationalOk, n = 60): [number, number][] {
  const t0 = Math.min(5, r.tcMin), t1 = Math.max(180, 2 * r.tcMin)
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = t0 + ((t1 - t0) * k) / n
    return [t, mononobe(r.R24, t)] as [number, number]
  })
}

/** Debit puncak tiap tutupan lahan baku pada A, i yang sama (+ C kustom bila dipakai); `used` = tutupan terpilih. */
export function qByLand(r: RationalOk): { key: string; label: string; C: number; Q: number; used: boolean }[] {
  const rows = LAND_KEYS.map((k) => ({
    key: k, label: RUNOFF_C[k].label.replace(/\s*\(.*\)$/, ''), C: RUNOFF_C[k].C, Q: 0.00278 * RUNOFF_C[k].C * r.i * r.A, used: RUNOFF_C[k].label === r.landLabel,
  }))
  if (r.landLabel === 'Kustom') rows.push({ key: 'custom', label: 'Kustom', C: r.C, Q: r.Q, used: true })
  return rows.sort((a, b) => b.C - a.C)
}
