import { computeBoltConnection, type BoltConnectionInput, type BoltConnectionResult, type BoltGrade } from '../../calc/bolt-connection'
import { parseNum, type FieldErrors } from '../form'

// Input UI Sambungan Baut: angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk compute lama.

export { parseNum, type FieldErrors }

/** Batas pola baut di UI (gambar & tabel tetap terbaca). */
export const MAX_ROWS = 12

export interface BoltInput {
  grade: BoltGrade
  /** 'N' ulir termasuk bidang geser, 'X' di luar. */
  thread: 'N' | 'X'
  /** MPa — dipakai bila mutu = kustom. */
  Fnt: string
  Fnv: string
  /** mm */
  d: string
  planes: '1' | '2'
  /** Baris searah beban, kolom tegak lurus. */
  nr: string
  nc: string
  /** mm */
  s: string
  sg: string
  le: string
  /** Pelat tumpu: mm, MPa. */
  t: string
  Fu: string
  /** kN, terfaktor pada grup. */
  Vu: string
  Tu: string
}

/** Input bawaan = kasus golden "default A325 2x2 M20" (build lama). */
export const BOLT_DEFAULTS: BoltInput = {
  grade: 'a325', thread: 'N', Fnt: '620', Fnv: '372', d: '20', planes: '1', nr: '2', nc: '2', s: '70', sg: '70', le: '40',
  t: '10', Fu: '370', Vu: '150', Tu: '0',
}

export function validate(i: BoltInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof BoltInput, rule: (n: number) => string | null) => {
    const n = parseNum(i[key])
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  const count = (n: number) => (!Number.isInteger(n) || n < 1 ? 'Bilangan bulat ≥ 1' : n > MAX_ROWS ? `Maksimum ${MAX_ROWS}` : null)
  if (i.grade === 'custom') {
    need('Fnt', pos)
    need('Fnv', pos)
  }
  need('d', pos)
  need('nr', count)
  need('nc', count)
  const nr = parseNum(i.nr) ?? 1, nc = parseNum(i.nc) ?? 1
  // s / g hanya berarti (dan tampil di form) bila ada lebih dari satu baris / kolom.
  if (nr > 1) need('s', pos)
  if (nc > 1) need('sg', pos)
  need('le', nonneg)
  need('t', nonneg)
  need('Fu', nonneg)
  need('Vu', nonneg)
  need('Tu', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BoltInput): BoltConnectionInput {
  const n = (s: string) => parseNum(s) ?? 0
  return {
    grade: i.grade, thread: i.thread, Fnt: n(i.Fnt), Fnv: n(i.Fnv), d: n(i.d), planes: Number(i.planes),
    nr: n(i.nr), nc: n(i.nc), s: n(i.s), sg: n(i.sg), le: n(i.le), t: n(i.t), Fu: n(i.Fu), Vu: n(i.Vu), Tu: n(i.Tu),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeBolt(i: BoltInput): BoltConnectionResult | null {
  if (Object.keys(validate(i)).length) return null
  return computeBoltConnection(toCalcInput(i))
}
