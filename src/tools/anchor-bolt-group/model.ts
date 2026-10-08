import { computeAnchorBoltGroup, type AnchorBoltGroupInput, type AnchorBoltGroupResult } from '../../calc/anchor-bolt-group'
import { parseNum, type FieldErrors } from '../form'

// Input UI Anchor Bolt Group: angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk compute lama.

export { parseNum, type FieldErrors }

/** Batas pola baut di UI (gambar & tabel gaya baut tetap terbaca). */
export const MAX_N = 6

export interface AnchorInput {
  /** Jumlah baut arah X & Y, spasi (mm). */
  nx: string
  ny: string
  sx: string
  sy: string
  /** Diameter, luas tarik efektif (mm, mm²), kedalaman tanam (mm). */
  da: string
  Ase: string
  hef: string
  /** Jarak tepi semua sisi & tebal beton (mm); 0 = tanpa tepi / tak dibatasi. */
  ca: string
  ha: string
  /** MPa */
  fc: string
  futa: string
  crack: 'cracked' | 'uncracked'
  cond: 'A' | 'B'
  grout: 'yes' | 'no'
  /** Tarik (+) kN, momen kN·m, geser kN — di centroid grup. */
  Nu: string
  Mx: string
  My: string
  Vu: string
  shearDir: 'x' | 'y'
}

/** Input bawaan = kasus golden "default 2x2 M24 hef 375". */
export const ANCHOR_DEFAULTS: AnchorInput = {
  nx: '2', ny: '2', sx: '250', sy: '250', da: '24', Ase: '353', hef: '375', ca: '600', ha: '600', fc: '25', futa: '400',
  crack: 'cracked', cond: 'B', grout: 'no', Nu: '120', Mx: '20', My: '0', Vu: '80', shearDir: 'x',
}

/** Perkiraan luas tarik efektif ulir Ase ≈ 0,58·da² (dipakai saat diameter diubah). */
export const aseEstimate = (da: number): number => Math.round(0.58 * da * da)

export function validate(i: AnchorInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof AnchorInput, rule: (n: number) => string | null) => {
    const n = parseNum(i[key])
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  const count = (n: number) => (!Number.isInteger(n) || n < 1 ? 'Bilangan bulat ≥ 1' : n > MAX_N ? `Maksimum ${MAX_N}` : null)
  need('nx', count)
  need('ny', count)
  // spasi hanya berarti (dan tampil) bila lebih dari satu baut pada arah itu
  if ((parseNum(i.nx) ?? 1) > 1) need('sx', pos)
  if ((parseNum(i.ny) ?? 1) > 1) need('sy', pos)
  need('da', pos)
  need('Ase', pos)
  need('hef', pos)
  need('ca', nonneg)
  need('ha', nonneg)
  need('fc', pos)
  need('futa', pos)
  need('Nu', () => null)
  need('Mx', () => null)
  need('My', () => null)
  need('Vu', nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: AnchorInput): AnchorBoltGroupInput {
  const n = (s: string) => parseNum(s) ?? 0
  return {
    nx: n(i.nx), ny: n(i.ny), sx: n(i.sx), sy: n(i.sy), da: n(i.da), Ase: n(i.Ase), hef: n(i.hef), ca: n(i.ca), ha: n(i.ha),
    fc: n(i.fc), futa: n(i.futa), crack: i.crack, cond: i.cond, grout: i.grout, Nu: n(i.Nu), Mx: n(i.Mx), My: n(i.My), Vu: n(i.Vu),
    shearDir: i.shearDir,
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeAnchor(i: AnchorInput): AnchorBoltGroupResult | null {
  if (Object.keys(validate(i)).length) return null
  return computeAnchorBoltGroup(toCalcInput(i))
}
