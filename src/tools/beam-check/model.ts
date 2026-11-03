import { computeBeamCheck, type BeamCheckInput, type BeamCheckResult } from '../../calc/beam-check'
import { checker, intRange, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Cek Desain Balok Beton: angka sebagai teks form; toCalcInput() → bentuk mesin hitung (src/calc/beam-check).

export type { FieldErrors }

export const BARS = [10, 13, 16, 19, 22, 25, 29, 32, 36]
export const STIRRUPS = [8, 10, 13, 16]

export interface BeamCheckForm {
  fc: string
  fy: string
  fyt: string
  b: string
  h: string
  /** Selimut bersih ke sengkang (mm). */
  cc: string
  ds: string
  /** Diameter tulangan memanjang — sama di lapangan & tumpuan. */
  db: string
  nLegs: '2' | '3' | '4'
  /** Lapangan (M+): tarik bawah, tekan atas, jumlah lapis tarik. */
  nPosT: string
  nPosC: string
  layPos: '1' | '2' | '3'
  /** Tumpuan (M−): tarik atas, tekan bawah, jumlah lapis tarik. */
  nNegT: string
  nNegC: string
  layNeg: '1' | '2' | '3'
  /** kN·m dan kN terfaktor (besaran positif). */
  Mpos: string
  Mneg: string
  Vu: string
  sSup: string
  midStir: 'yes' | 'no'
  sMid: string
  VuMid: string
  torsion: 'yes' | 'no'
  Tu: string
  nSide: string
  dbSide: string
}

/** Input bawaan: 300×500, f'c 25, fy 420; lapangan 3D19 / tumpuan 5D19 (2 lapis), sengkang Ø10-100. */
export const BEAM_CHECK_DEFAULTS: BeamCheckForm = {
  fc: '25', fy: '420', fyt: '420', b: '300', h: '500', cc: '40', ds: '10', db: '19', nLegs: '2',
  nPosT: '3', nPosC: '2', layPos: '1', nNegT: '5', nNegC: '3', layNeg: '2',
  Mpos: '90', Mneg: '140', Vu: '150', sSup: '100', midStir: 'no', sMid: '150', VuMid: '60',
  torsion: 'no', Tu: '10', nSide: '2', dbSide: '13',
}

const evenOrZero = (n: number) => (!Number.isInteger(n) || n < 0 || n % 2 ? 'Kelipatan 2 (kiri = kanan)' : n > 20 ? 'Maksimum 20' : null)

export function validate(i: BeamCheckForm): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  for (const k of ['fc', 'fy', 'fyt', 'b', 'h', 'sSup'] as const) need(k, pos)
  need('cc', nonneg)
  need('nPosT', intRange(1, 30))
  need('nPosC', intRange(2, 30))
  need('nNegT', intRange(1, 30))
  need('nNegC', intRange(2, 30))
  need('Mpos', nonneg)
  need('Mneg', nonneg)
  need('Vu', nonneg)
  if (i.midStir === 'yes') {
    need('sMid', pos)
    need('VuMid', nonneg)
  }
  if (i.torsion === 'yes') {
    need('Tu', nonneg)
    need('nSide', evenOrZero)
  }
  return e
}

/** Bentuk mesin hitung. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BeamCheckForm): BeamCheckInput {
  return {
    fc: num(i.fc), fy: num(i.fy), fyt: num(i.fyt), b: num(i.b), h: num(i.h), cc: num(i.cc), ds: Number(i.ds), db: Number(i.db),
    nLegs: Number(i.nLegs), nPosT: num(i.nPosT), nPosC: num(i.nPosC), layPos: Number(i.layPos),
    nNegT: num(i.nNegT), nNegC: num(i.nNegC), layNeg: Number(i.layNeg),
    Mpos: num(i.Mpos), Mneg: num(i.Mneg), Vu: num(i.Vu), sSup: num(i.sSup),
    midStir: i.midStir === 'yes', sMid: i.midStir === 'yes' ? num(i.sMid) : 0, VuMid: i.midStir === 'yes' ? num(i.VuMid) : 0,
    torsion: i.torsion === 'yes', Tu: i.torsion === 'yes' ? num(i.Tu) : 0, nSide: i.torsion === 'yes' ? num(i.nSide) : 0, dbSide: Number(i.dbSide),
  }
}

/** Hitung; null bila input tidak valid atau geometri tidak dapat dihitung. */
export function computeCheck(i: BeamCheckForm): BeamCheckResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeBeamCheck(toCalcInput(i))
  return r.valid ? r : null
}

/** Alasan penolakan bila field sah tetapi geometri tidak memungkinkan. */
export function rejectReason(i: BeamCheckForm): string | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeBeamCheck(toCalcInput(i))
  return r.valid ? null : r.warn.find((w) => /Tinggi efektif|inti sengkang/.test(w)) ?? r.warn[0] ?? 'Input tidak dapat dihitung.'
}
