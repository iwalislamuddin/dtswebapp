import {
  computeSeismic,
  findSystem,
  systemsFor,
  type CtType,
  type RiskCat,
  type SeismicResult,
  type SiteClass,
  type StructKind,
} from '../../calc/seismic-load'
import { checker, nonneg, num, pos, type FieldErrors } from '../form'

// Input UI Beban Gempa (SNI 1726:2019): angka sebagai teks form. Parameter Ss/S1/PGA/TL diisi tangan atau diambil dari
// peta (map.ts) — perhitungan tetap sinkron dari isi field.

export type { FieldErrors }
export type SeismicOk = SeismicResult & { valid: true }

export interface LevelRow extends Record<string, string> {
  /** Tinggi tingkat (m). */
  h: string
  /** Berat seismik efektif (kN). */
  w: string
}

export interface SeismicUIInput {
  /** Label lokasi terpilih (teks bebas, untuk laporan). */
  loc: string
  lon: string
  lat: string
  Ss: string
  S1: string
  PGA: string
  TL: string
  site: SiteClass
  risk: RiskCat
  kind: StructKind
  /** Id sistem per jenis struktur (pilihan diingat saat berganti jenis). */
  sysB: string
  sysS: string
  sysO: string
  /** Sistem kustom. */
  R: string
  Om: string
  Cd: string
  ctType: CtType
  /** Periode: pendekatan Ta atau hasil analisis Tc. */
  period: 'approx' | 'analysis'
  Tc: string
  rho: '1' | '1.3'
  levels: LevelRow[]
}

export const KIND_LABEL: Record<StructKind, string> = {
  building: 'Gedung',
  'nb-similar': 'Nongedung mirip gedung',
  'nb-other': 'Nongedung tidak mirip gedung',
}

export const RISK_LABEL: Record<RiskCat, string> = {
  I: 'I — risiko rendah (gudang pertanian, fasilitas sementara)',
  II: 'II — umum (rumah, kantor, toko, apartemen, pabrik)',
  III: 'III — risiko tinggi (sekolah, gedung pertemuan, penjara)',
  IV: 'IV — fasilitas penting (rumah sakit, damkar, pusat energi/air)',
}

/** Bawaan: Jakarta Pusat, tanah sedang, gedung kantor 5 lantai SRPMK beton. */
export const SEISMIC_DEFAULTS: SeismicUIInput = {
  loc: 'Jakarta Pusat (DKI Jakarta)',
  lon: '106.83',
  lat: '-6.18',
  Ss: '0.786',
  S1: '0.383',
  PGA: '0.375',
  TL: '20',
  site: 'SD',
  risk: 'II',
  kind: 'building',
  sysB: 'C5',
  sysS: 'N1',
  sysO: 'T6',
  R: '3',
  Om: '2',
  Cd: '2.5',
  ctType: 'other',
  period: 'approx',
  Tc: '1.0',
  rho: '1.3',
  levels: [
    { h: '4.5', w: '5200' },
    { h: '4', w: '5000' },
    { h: '4', w: '5000' },
    { h: '4', w: '5000' },
    { h: '4', w: '3800' },
  ],
}

/** Id sistem aktif untuk jenis struktur input. */
export const systemOf = (i: SeismicUIInput): string => (i.kind === 'building' ? i.sysB : i.kind === 'nb-similar' ? i.sysS : i.sysO)
export const systemKey = (k: StructKind) => (k === 'building' ? 'sysB' : k === 'nb-similar' ? 'sysS' : 'sysO')

/** Periode dari analisis dipakai (selalu untuk nongedung tidak mirip gedung). */
export const usesTc = (i: SeismicUIInput) => i.kind === 'nb-other' || i.period === 'analysis'

export function validate(i: SeismicUIInput): FieldErrors {
  const e: FieldErrors = {}
  const need = checker(i, e)
  need('Ss', pos)
  need('S1', pos)
  need('PGA', nonneg)
  need('TL', pos)
  if (i.site === 'SF') e.site = 'SF memerlukan analisis respons spesifik situs'
  const id = systemOf(i)
  if (id === 'custom') for (const k of ['R', 'Om', 'Cd'] as const) need(k, pos)
  else if (!systemsFor(i.kind).some((s) => s.id === id)) e.system = 'Pilih sistem struktur'
  if (usesTc(i)) need('Tc', pos)
  if (!i.levels.length) e.levels = 'Isi minimal satu lantai/massa'
  i.levels.forEach((l, k) => {
    for (const c of ['h', 'w'] as const) {
      const n = num(l[c])
      if (l[c].trim() === '' || !Number.isFinite(Number(l[c].replace(',', '.')))) e[`lv.${k}.${c}`] = 'Isi angka'
      else if (n <= 0) e[`lv.${k}.${c}`] = 'Harus > 0'
    }
  })
  return e
}

/** Hitung; null bila input tidak valid atau hasil tidak sah. */
export function computeSeismicUI(i: SeismicUIInput): SeismicOk | null {
  if (Object.keys(validate(i)).length) return null
  const id = systemOf(i)
  const r = computeSeismic({
    Ss: num(i.Ss),
    S1: num(i.S1),
    PGA: num(i.PGA),
    TL: num(i.TL),
    site: i.site,
    risk: i.risk,
    kind: i.kind,
    system: id,
    R: num(i.R),
    Om: num(i.Om),
    Cd: num(i.Cd),
    ctType: id === 'custom' ? i.ctType : findSystem(id)?.ct,
    Tc: usesTc(i) ? num(i.Tc) : null,
    rho: num(i.rho),
    levels: i.levels.map((l) => ({ h: num(l.h), w: num(l.w) })),
  })
  return r.valid ? (r as SeismicOk) : null
}
