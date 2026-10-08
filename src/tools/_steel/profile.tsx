import type { ReactNode } from 'react'
import { STEEL_GRADES } from '../../calc/shared/steel'
import { getProfile, listProfiles, STEEL_TYPES, typeInfo, type SteelProfile } from '../../calc/shared/steel-profiles'
import { fx, kv, type Row } from '../../report/model'
import { NumField, SelectField } from '../../ui/kit'
import { parseNum, type FieldErrors } from '../form'
import { fillPts, sectionGeom, type Pt } from './section'

// Bagian bersama tool profil baja (tarik, tekan, lentur): pemilih profil, mutu baja, gambar penampang, baris laporan.
// Folder berawalan "_" bukan tool (registry hanya memuat <id>/index.tsx).

export const CUSTOM = 'custom'

/** Ukuran tengah daftar (perilaku build lama saat tipe dipilih). */
export const middleSize = (type: string): string => {
  const list = listProfiles(type)
  return list.length ? list[Math.min(list.length - 1, Math.floor(list.length / 2))].name : ''
}

export interface SteelGradeInput {
  /** Kunci STEEL_GRADES (mis. "BJ 37") atau "custom". */
  grade: string
  Fy: string
  Fu: string
}

/** Fy & Fu efektif (MPa): dari tabel mutu, atau isian bila kustom. */
export function gradeValues(i: SteelGradeInput): { Fy: number; Fu: number } {
  const g = STEEL_GRADES.find((x) => x.key === i.grade)
  return g ? { Fy: g.Fy, Fu: g.Fu } : { Fy: parseNum(i.Fy) ?? 0, Fu: parseNum(i.Fu) ?? 0 }
}

/** Mutu dari pasangan Fy/Fu (kasus golden → input UI). */
export function gradeOf(Fy: number, Fu?: number): string {
  const g = STEEL_GRADES.find((x) => x.Fy === Fy && (Fu === undefined || x.Fu === Fu))
  return g ? g.key : CUSTOM
}

export function validateProfile(e: FieldErrors, ptype: string, psize: string) {
  if (!getProfile(ptype, psize)) e.psize = 'Pilih ukuran profil'
}

/** Fy/Fu hanya diperiksa untuk mutu kustom. `withFu` = tool memakai Fu. */
export function validateGrade(e: FieldErrors, i: SteelGradeInput, withFu: boolean) {
  if (i.grade !== CUSTOM) return
  const Fy = parseNum(i.Fy), Fu = parseNum(i.Fu)
  if (Fy === null) e.Fy = 'Isi angka'
  else if (!(Fy > 0)) e.Fy = 'Harus > 0'
  if (!withFu) return
  if (Fu === null) e.Fu = 'Isi angka'
  else if (!(Fu > 0)) e.Fu = 'Harus > 0'
  else if (Fy !== null && Fu < Fy) e.Fu = 'Fu harus ≥ Fy'
}

/** Kontrol pemilihan profil: tipe + ukuran + ringkas properti. */
export function ProfileFields({
  ptype,
  psize,
  types,
  error,
  onChange,
  extra,
}: {
  ptype: string
  psize: string
  /** Tipe yang diizinkan (default semua). */
  types?: readonly string[]
  error?: string
  onChange: (p: { ptype?: string; psize?: string }) => void
  extra?: (p: SteelProfile) => ReactNode
}) {
  const sizes = listProfiles(ptype)
  const prof = sizes.find((p) => p.name === psize)
  const opts = (types ?? STEEL_TYPES.map((t) => t.key)).map((k) => ({ value: k, label: typeInfo(k)?.name ?? k }))
  return (
    <>
      <SelectField label="Tipe profil" value={ptype} options={opts} onChange={(t) => onChange({ ptype: t, psize: middleSize(t) })} />
      <SelectField
        label="Ukuran"
        value={psize}
        error={error}
        options={sizes.map((p) => ({ value: p.name, label: `${p.name} (${fx(p.w, 1)} kg/m)` }))}
        onChange={(s) => onChange({ psize: s })}
      />
      {prof && (
        <p className="muted card-note">
          A {fx(prof.A, 2)} cm² · Ix {fx(prof.Ix, 0)} cm⁴ · ix / iy {fx(prof.ix, 2)} / {fx(prof.iy, 2)} cm
          {prof.source === 'hitung' ? ' · dihitung dari geometri' : ''}
          {extra?.(prof)}
        </p>
      )}
    </>
  )
}

/** Kontrol mutu baja: pilihan mutu, Fy/Fu diisi hanya bila kustom. */
export function GradeFields({
  value,
  errors,
  withFu,
  onChange,
}: {
  value: SteelGradeInput
  errors: FieldErrors
  withFu: boolean
  onChange: (p: Partial<SteelGradeInput>) => void
}) {
  const opts = [
    ...STEEL_GRADES.map((g) => ({ value: g.key, label: `${g.key} (Fy ${g.Fy}${withFu ? ` / Fu ${g.Fu}` : ''})` })),
    { value: CUSTOM, label: 'Kustom' },
  ]
  const cur = gradeValues(value)
  return (
    <>
      <SelectField
        label="Mutu baja"
        value={value.grade}
        options={opts}
        // pindah ke kustom: isian awal = nilai mutu sebelumnya
        onChange={(grade) => onChange(grade === CUSTOM ? { grade, Fy: String(cur.Fy), Fu: String(cur.Fu) } : { grade })}
      />
      {value.grade === CUSTOM && (
        <>
          <NumField label="Fy — tegangan leleh" unit="MPa" value={value.Fy} error={errors.Fy} onChange={(Fy) => onChange({ Fy })} />
          {withFu && <NumField label="Fu — tegangan putus" unit="MPa" value={value.Fu} error={errors.Fu} onChange={(Fu) => onChange({ Fu })} />}
        </>
      )}
    </>
  )
}

/** Sub-teks & warna kartu ringkasan dari rasio D/C (null = beban belum diisi). */
export const dcSub = (v: number | null | undefined) =>
  v == null ? { sub: 'beban belum diisi' } : { sub: `D/C ${fx(v, 2)} · ${v <= 1 ? 'OK' : 'NG'}`, tone: v <= 1 ? ('ok' as const) : ('bad' as const) }

/** Baris laporan: profil & mutu. */
export function profileRows(ptype: string, p: SteelProfile, Fy: number, Fu?: number): Row[] {
  const ti = typeInfo(ptype)
  const dims =
    p.shape === 'I' || (p.shape === 'C' && p.C === undefined)
      ? `H ${fx(p.H, 0)} · B ${fx(p.B, 0)} · t_{w} ${fx(p.tw, 1)} · t_{f} ${fx(p.tf, 1)} mm`
      : p.shape === 'C'
        ? `H ${fx(p.H, 0)} · B ${fx(p.B, 0)} · C ${fx(p.C, 0)} · t ${fx(p.t, 1)} mm`
        : p.shape === 'L'
          ? `a ${fx(p.a, 0)} · t ${fx(p.t, 1)} mm`
          : p.shape === 'box'
            ? `H ${fx(p.H, 0)} · B ${fx(p.B, 0)} · t ${fx(p.t, 1)} mm`
            : `D ${fx(p.D, 1)} · t ${fx(p.t, 1)} mm`
  return [
    kv('Profil', `${ti ? ti.name : ptype} ${p.name} (${p.source === 'tabel' ? 'nilai tabel' : 'dihitung dari geometri'})`),
    kv('Dimensi', dims),
    kv('Luas A_{g} / berat', `${fx(p.A * 100, 0)} mm^{2} / ${fx(p.w, 1)} kg/m`),
    kv('I_{x} / I_{y}', `${fx(p.Ix, 1)} / ${fx(p.Iy, 1)} cm^{4}`),
    kv('r_{x} / r_{y}', `${fx(p.ix * 10, 1)} / ${fx(p.iy * 10, 1)} mm`),
    kv(Fu !== undefined ? 'Mutu F_{y} / F_{u}' : 'Mutu F_{y}', Fu !== undefined ? `${fx(Fy, 0)} / ${fx(Fu, 0)} MPa` : `${fx(Fy, 0)} MPa`),
  ]
}

/**
 * Penampang sebagai SVG di kotak (x, y, w, h) dengan label H/B. `overlay` menerima fungsi transformasi mm → px
 * untuk menggambar tambahan (lubang baut, sumbu lentur, …).
 */
export function SectionSvg({
  p,
  x,
  y,
  w,
  h,
  overlay,
}: {
  p: SteelProfile
  x: number
  y: number
  w: number
  h: number
  overlay?: (T: (q: Pt) => Pt, sc: number) => ReactNode
}) {
  const g = sectionGeom(p)
  if (!g || w < 30 || h < 30) return null
  // ruang label: kanan 64 px (H), bawah 30 px (B)
  const sc = Math.min((w - 84) / g.w, (h - 36) / g.h)
  const ox = x + 20 + (w - 84 - g.w * sc) / 2, oy = y + 6 + (h - 36 - g.h * sc) / 2
  const T = (q: Pt): Pt => [ox + q[0] * sc, oy + q[1] * sc]
  const d = (pts: Pt[]) => pts.map((q, k) => `${k ? 'L' : 'M'}${T(q)[0].toFixed(1)},${T(q)[1].toFixed(1)}`).join(' ') + ' Z'
  const W = g.w * sc, Hh = g.h * sc
  return (
    <g>
      <g className="bp-plate">
        {g.rings.map((r, k) => (
          <g key={k}>
            <path d={d(fillPts(r))} style={{ stroke: 'none' }} />
            <path d={d(r.outer)} style={{ fill: 'none' }} />
            {r.inner && <path d={d(r.inner)} style={{ fill: 'none' }} />}
          </g>
        ))}
      </g>
      <g className="bp-dim">
        <line x1={ox} y1={oy + Hh + 12} x2={ox + W} y2={oy + Hh + 12} />
        <text x={ox + W / 2} y={oy + Hh + 25} textAnchor="middle">
          {p.shape === 'pipe' ? `D ${fx(p.D, 1)}` : p.shape === 'L' ? `a ${fx(p.a, 0)}` : `B ${fx(p.B, 0)}`}
        </text>
        {p.shape !== 'pipe' && p.shape !== 'L' && (
          <>
            <line x1={ox + W + 12} y1={oy} x2={ox + W + 12} y2={oy + Hh} />
            <text x={ox + W + 17} y={oy + Hh / 2 + 4}>
              H {fx(p.H, 0)}
            </text>
          </>
        )}
      </g>
      {overlay?.(T, sc)}
    </g>
  )
}
