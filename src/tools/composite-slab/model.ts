import { computeCompositeSlab, DECK, deckDefaults, type CompositeSlabInput, type CompositeSlabResult, type DeckProfile } from '../../calc/composite-slab'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Slab Komposit + Metal Deck: properti dek terisi dari tabel saat profil/BMT diganti (tetap bisa ditimpa).

export type { FieldErrors }
export { DECK }

export interface CompInput {
  L: string
  D: string
  spans: '1' | '2' | '3'
  prop: 'none' | 'mid'
  composite: 'comp' | 'noncomp'
  profile: DeckProfile
  bmt: string
  fc: string
  fy: string
  SDL: string
  LL: string
  cLL: string
  cover: string
  db: string
  dbSt: string
  dbBot: string
  hr: string
  Ase: string
  ye: string
  Ideck: string
  Mcap: string
  fyd: string
  bc: string
  conType: 'stud' | 'rebar'
  ds: string
  fuS: string
}

/** Properti dek (teks form) dari tabel pabrikan untuk profil & BMT. */
export function deckFields(profile: DeckProfile, bmt: string): Pick<CompInput, 'hr' | 'Ase' | 'ye' | 'Ideck' | 'Mcap' | 'fyd' | 'bc'> {
  const d = deckDefaults(profile, bmt)
  return { hr: String(d.hr), Ase: String(d.Ase), ye: String(d.ye), Ideck: String(d.Ideck), Mcap: String(d.Mcap), fyd: String(d.fyd), bc: String(d.bc) }
}

/** Input bawaan = kasus golden "default Bondek 2 bentang". */
export const COMP_DEFAULTS: CompInput = {
  L: '3', D: '120', spans: '2', prop: 'none', composite: 'comp', profile: 'heavy', bmt: '0.75', fc: '25', fy: '420', SDL: '1.5', LL: '2.5', cLL: '1',
  cover: '20', db: '10', dbSt: '8', dbBot: '10', ...deckFields('heavy', '0.75'), conType: 'stud', ds: '19', fuS: '450',
}

export function validate(i: CompInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  for (const k of ['L', 'D', 'fc', 'fy', 'hr', 'Ase', 'ye', 'Ideck', 'fyd', 'bc', 'fuS'] as const) need(k, pos)
  for (const k of ['SDL', 'LL', 'cLL', 'cover', 'Mcap'] as const) need(k, nonneg)
  return e
}

/** Bentuk compute lama. Hanya dipanggil untuk input yang lolos validate(). */
export function toCalcInput(i: CompInput): CompositeSlabInput {
  return {
    L: num(i.L), D: num(i.D), spans: i.spans, prop: i.prop, composite: i.composite, profile: i.profile, fc: num(i.fc), fy: num(i.fy),
    SDL: num(i.SDL), LL: num(i.LL), cLL: num(i.cLL), cover: num(i.cover), db: Number(i.db), dbSt: Number(i.dbSt), dbBot: Number(i.dbBot),
    hr: num(i.hr), Ase: num(i.Ase), ye: num(i.ye), Ideck: num(i.Ideck), Mcap: num(i.Mcap), fyd: num(i.fyd), bc: num(i.bc), conType: i.conType,
    ds: Number(i.ds), fuS: num(i.fuS),
  }
}

/** Hitung; null bila input tidak valid. */
export function computeComp(i: CompInput): CompositeSlabResult | null {
  if (Object.keys(validate(i)).length) return null
  const r = computeCompositeSlab(toCalcInput(i))
  return r.valid ? r : null
}
