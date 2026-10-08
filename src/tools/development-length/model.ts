import { BARS_POLOS, BARS_ULIR, computeDevLength, type BarType, type DevLengthInput, type DevLengthResult } from '../../calc/development-length'
import { checker, intRange, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Panjang Penyaluran Tulangan Tarik: angka sebagai teks form; toCalcInput() → bentuk compute lama.

export type { FieldErrors }

export const PSIE_OPTIONS = [
  { value: '1', label: 'Tanpa pelapis / galvanis (1,0)' },
  { value: '1.5', label: 'Epoksi, selimut < 3db / spasi < 6db (1,5)' },
  { value: '1.2', label: 'Epoksi lainnya (1,2)' },
]

export interface DevInput {
  fc: string
  fy: string
  barType: BarType
  /** Diameter (mm) dari daftar ulir/polos. */
  db: string
  psit: '1' | '1.3'
  psie: string
  lambda: '1' | '0.75'
  /** min(selimut ke pusat, ½ spasi) (mm). */
  cb: string
  ktrMode: 'zero' | 'calc'
  Atr: string
  s: string
  n: string
}

/** Input bawaan = kasus golden default (D19, f'c 25, fy 420 → ld 560 mm). */
export const DEV_DEFAULTS: DevInput = {
  fc: '25', fy: '420', barType: 'ulir', db: '19', psit: '1', psie: '1', lambda: '1', cb: '40', ktrMode: 'zero', Atr: '0', s: '100', n: '1',
}

export const barsOf = (t: BarType) => (t === 'polos' ? BARS_POLOS : BARS_ULIR)

export function validate(i: DevInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('fc', pos)
  need('fy', pos)
  need('cb', pos)
  if (!barsOf(i.barType).includes(Number(i.db))) e.db = 'Pilih diameter'
  if (i.ktrMode === 'calc') {
    need('Atr', nonneg)
    need('s', pos)
    need('n', intRange(1, 50))
  }
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: DevInput, db = Number(i.db)): DevLengthInput {
  return {
    fc: num(i.fc), fy: num(i.fy), barType: i.barType, db, psit: Number(i.psit), psie: Number(i.psie), lambda: Number(i.lambda),
    cb: num(i.cb), ktrMode: i.ktrMode, Atr: num(i.Atr), s: num(i.s), n: num(i.n),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeDev(i: DevInput): DevLengthResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeDevLength(toCalcInput(i))
  return r.valid ? r : null
}

/** ld (mm) untuk tiap diameter dalam daftar jenis yang sama — parameter lain tetap. */
export function ldPerDiameter(i: DevInput): { db: number; ld: number }[] {
  return barsOf(i.barType).map((db) => ({ db, ld: computeDevLength(toCalcInput(i, db)).ld ?? 0 }))
}
