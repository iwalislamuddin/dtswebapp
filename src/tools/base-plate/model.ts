import {
  ANCHOR_GRADES,
  ANCHOR_SIZES,
  computeBasePlate,
  type AnchorHead,
  type BasePlateInput,
  type BasePlateResult,
  type BaseSupport,
  type ColumnKind,
  type Fixity,
  type LoadMode,
  type ShearMode,
} from '../../calc/base-plate'
import { getProfile } from '../../calc/shared/steel-profiles'
import { parseNum, type FieldErrors } from '../form'
import { gradeValues, validateGrade, validateProfile, type SteelGradeInput } from '../_steel/profile'

// Input UI Base Plate: angka sebagai teks form; toCalcInput() menerjemahkannya ke bentuk mesin hitung.

export { parseNum, type FieldErrors }

export const COLUMN_TYPES: ColumnKind[] = ['WF', 'UNP', 'SHS', 'PIPE']

export interface BasePlateUIInput extends SteelGradeInput {
  fixity: Fixity
  ptype: ColumnKind
  psize: string
  /** Ry kolom (desain kapasitas). */
  Ry: string
  /** Pelat. */
  N: string
  B: string
  tp: string
  /** Mutu pelat: kunci STEEL_GRADES atau "custom" dengan plateFy. */
  plateGrade: string
  plateFy: string
  /** Angkur. */
  anchorGrade: string
  da: string
  nRow: string
  aN: string
  aB: string
  hef: string
  head: AnchorHead
  eh: string
  /** Beton. */
  fc: string
  support: BaseSupport
  Lp: string
  Bp: string
  ha: string
  caN: string
  caB: string
  cracked: 'yes' | 'no'
  cond: 'A' | 'B'
  grout: string
  /** Beban. */
  loadMode: LoadMode
  Pu: string
  Mu: string
  Vu: string
  H: string
  K: string
  shearMode: ShearMode
  /** Las. */
  weld: string
  FEXX: string
}

/** Input bawaan: kolom WF 250×250 jepit di atas pedestal 500×500, beban aktual. */
export const BASE_PLATE_DEFAULTS: BasePlateUIInput = {
  fixity: 'fixed', ptype: 'WF', psize: '250×250×9×14', grade: 'BJ 37', Fy: '240', Fu: '370', Ry: '1.5',
  N: '400', B: '350', tp: '28', plateGrade: 'BJ 37', plateFy: '240',
  anchorGrade: 'F1554-36', da: '24', nRow: '2', aN: '50', aB: '60', hef: '400', head: 'headed', eh: '100',
  fc: '25', support: 'pedestal', Lp: '600', Bp: '550', ha: '800', caN: '150', caB: '150', cracked: 'yes', cond: 'B', grout: '30',
  loadMode: 'actual', Pu: '400', Mu: '60', Vu: '50', H: '4000', K: '1', shearMode: 'friction',
  weld: '8', FEXX: '490',
}

/** Ry anjuran SNI 7860:2020 Tabel A3.1 dari Fy kolom. */
export const ryFor = (Fy: number): string => (Fy <= 250 ? '1.5' : Fy <= 290 ? '1.3' : '1.1')

export function plateFyOf(i: BasePlateUIInput): number {
  return gradeValues({ grade: i.plateGrade, Fy: i.plateFy, Fu: '0' }).Fy
}

export function validate(i: BasePlateUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = (key: keyof BasePlateUIInput, rule: (n: number) => string | null) => {
    const n = parseNum(i[key] as string)
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
  const pos = (n: number) => (n > 0 ? null : 'Harus > 0')
  const nonneg = (n: number) => (n >= 0 ? null : 'Tidak boleh negatif')
  validateProfile(e, i.ptype, i.psize)
  validateGrade(e, i, false)
  if (i.plateGrade === 'custom') need('plateFy', pos)
  need('N', pos)
  need('B', pos)
  need('tp', pos)
  need('nRow', (n) => (!Number.isInteger(n) || n < 1 ? 'Bilangan bulat ≥ 1' : n > 6 ? 'Maksimum 6' : null))
  need('aN', pos)
  need('aB', pos)
  need('hef', pos)
  if (i.head === 'hooked') need('eh', pos)
  need('fc', pos)
  need('ha', pos)
  if (i.support === 'pedestal') {
    need('Lp', pos)
    need('Bp', pos)
  }
  if (i.support === 'manual') {
    need('caN', pos)
    need('caB', pos)
  }
  need('grout', nonneg)
  need('weld', nonneg)
  need('FEXX', pos)
  if (!ANCHOR_SIZES.some((s) => String(s.d) === i.da)) e.da = 'Pilih diameter'
  if (!ANCHOR_GRADES.some((g) => g.key === i.anchorGrade)) e.anchorGrade = 'Pilih mutu'

  const N = parseNum(i.N) ?? 0, B = parseNum(i.B) ?? 0
  if (!e.aN && !e.N && 2 * (parseNum(i.aN) ?? 0) >= N) e.aN = 'Harus < N/2'
  if (!e.aB && !e.B && 2 * (parseNum(i.aB) ?? 0) >= B && i.nRow !== '1') e.aB = 'Harus < B/2'

  if (i.loadMode === 'actual') {
    need('Pu', () => null)
    if (i.fixity === 'fixed') need('Mu', () => null)
    need('Vu', () => null)
  } else if (i.fixity === 'fixed') {
    need('Pu', () => null)
    need('Ry', (n) => (n >= 1 ? null : 'Harus ≥ 1'))
    need('H', pos)
  } else {
    need('K', pos)
    need('H', pos)
    need('Vu', () => null)
  }
  return e
}

/** Bentuk mesin hitung. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: BasePlateUIInput): BasePlateInput {
  const n = (s: string) => parseNum(s) ?? 0
  const prof = getProfile(i.ptype, i.psize)!
  return {
    fixity: i.fixity, colType: i.ptype, prof, colFy: gradeValues(i).Fy, Ry: n(i.Ry),
    N: n(i.N), B: n(i.B), tp: n(i.tp), plateFy: plateFyOf(i),
    anchorGrade: i.anchorGrade, da: n(i.da), nRow: n(i.nRow), aN: n(i.aN), aB: n(i.aB), hef: n(i.hef), head: i.head, eh: n(i.eh),
    fc: n(i.fc), support: i.support, Lp: n(i.Lp), Bp: n(i.Bp), ha: n(i.ha), caN: n(i.caN), caB: n(i.caB),
    cracked: i.cracked === 'yes', condA: i.cond === 'A', grout: n(i.grout),
    loadMode: i.loadMode, Pu: n(i.Pu), Mu: n(i.Mu), Vu: n(i.Vu), H: n(i.H), K: n(i.K), shearMode: i.shearMode,
    weld: n(i.weld), FEXX: n(i.FEXX),
  }
}

/** Hitung; null bila ada field tidak valid (UI memakai hasil terakhir, diredupkan). */
export function computeBasePlateUI(i: BasePlateUIInput): BasePlateResult | null {
  if (Object.keys(validate(i)).length) return null
  return computeBasePlate(toCalcInput(i))
}
