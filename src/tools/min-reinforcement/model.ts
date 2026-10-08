import { computeMinRebar, MIN_REBAR_BARS, MIN_REBAR_STIRRUPS, type MinRebarElement, type MinRebarInput, type MinRebarResult } from '../../calc/min-reinforcement'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Tulangan Minimum: satu form untuk 5 jenis elemen; field yang tidak berlaku disembunyikan & tidak divalidasi.

export type { FieldErrors }
export { MIN_REBAR_BARS, MIN_REBAR_STIRRUPS }

export const ELEMENTS: { value: MinRebarElement; label: string }[] = [
  { value: 'balok', label: 'Balok' },
  { value: 'kolom-p', label: 'Kolom persegi' },
  { value: 'kolom-l', label: 'Kolom lingkaran' },
  { value: 'pelat', label: 'Pelat (slab)' },
  { value: 'pilecap', label: 'Pile cap' },
]

export interface MinInput {
  elem: MinRebarElement
  fc: string
  fy: string
  fyt: string
  b: string
  h: string
  D: string
  B: string
  L: string
  cc: string
  db: string
  ds: string
  dsp: string
  tieType: 'ikat' | 'spiral'
  arah: 'satu' | 'dua'
}

/** Input bawaan = kasus golden "balok default". */
export const MIN_DEFAULTS: MinInput = {
  elem: 'balok', fc: '25', fy: '420', fyt: '420', b: '300', h: '500', D: '500', B: '1800', L: '1800', cc: '40', db: '19', ds: '10',
  dsp: '10', tieType: 'ikat', arah: 'satu',
}

/** Field yang tampil/berlaku per jenis elemen. */
export function fieldsOf(i: Pick<MinInput, 'elem' | 'tieType'>) {
  const e = i.elem
  const spiral = e === 'kolom-l' && i.tieType === 'spiral'
  return {
    fyt: e === 'balok' || spiral,
    b: e === 'balok' || e === 'kolom-p',
    h: e !== 'kolom-l',
    D: e === 'kolom-l',
    BL: e === 'pilecap',
    cc: e !== 'pelat',
    ds: e === 'balok' || e === 'kolom-p' || (e === 'kolom-l' && !spiral),
    dsp: spiral,
    tieType: e === 'kolom-l',
    arah: e === 'pelat',
  }
}

export function validate(i: MinInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  const f = fieldsOf(i)
  need('fc', pos)
  need('fy', pos)
  if (f.fyt) need('fyt', pos)
  if (f.b) need('b', pos)
  if (f.h) need('h', pos)
  if (f.D) need('D', pos)
  if (f.BL) {
    need('B', pos)
    need('L', pos)
  }
  if (f.cc) need('cc', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: MinInput): MinRebarInput {
  return {
    elem: i.elem, fc: num(i.fc), fy: num(i.fy), fyt: num(i.fyt), b: num(i.b), h: num(i.h), D: num(i.D), B: num(i.B), L: num(i.L),
    cc: num(i.cc), db: Number(i.db), ds: Number(i.ds), dsp: Number(i.dsp), tieType: i.tieType, arah: i.arah,
  }
}

/** Hitung; null bila input tidak valid atau geometri tidak dapat dihitung. */
export function computeMin(i: MinInput): MinRebarResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeMinRebar(toCalcInput(i))
  return r.valid ? r : null
}

/** Alasan penolakan bila field sah tetapi geometri tidak memungkinkan. */
export function rejectReason(i: MinInput): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeMinRebar(toCalcInput(i))
  if (r.valid) return null
  return i.elem === 'kolom-l' ? 'Diameter kolom terlalu kecil untuk selimut, sengkang, dan tulangan.' : 'Tinggi efektif ≤ 0 — periksa h, selimut, sengkang, dan diameter.'
}
