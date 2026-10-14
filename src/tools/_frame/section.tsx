import { FRAME_PROFILE_TYPES } from '../../calc/portal-frame'
import { getProfile } from '../../calc/shared/steel-profiles'
import { Field, NumField, Segmented } from '../../ui/kit'
import { parseNum, type FieldErrors } from '../form'
import { CUSTOM, gradeOf, GradeFields, gradeValues, ProfileFields } from '../_steel/profile'

// Penampang batang rangka (kolom / balok / rafter): profil baja dari library atau beton persegi (I bruto).
// Kunci error berprefiks nama batang: "col.psize", "beam.fc", …

export interface SectionInput {
  mat: 'baja' | 'beton'
  ptype: string
  psize: string
  /** Mutu baja (kunci STEEL_GRADES) atau "custom" → Fy diisi. Hanya informasi (tegangan elastis). */
  grade: string
  Fy: string
  /** Beton: b × h (mm, h dalam bidang portal), f'c (MPa). */
  b: string
  h: string
  fc: string
}

export function validateSection(e: FieldErrors, pre: string, s: SectionInput) {
  if (s.mat === 'beton') {
    for (const k of ['b', 'h', 'fc'] as const) {
      const n = parseNum(s[k])
      if (n === null) e[`${pre}.${k}`] = 'Isi angka'
      else if (!(n > 0)) e[`${pre}.${k}`] = 'Harus > 0'
    }
    return
  }
  if (!getProfile(s.ptype, s.psize)) e[`${pre}.psize`] = 'Pilih ukuran profil'
  if (s.grade === CUSTOM) {
    const Fy = parseNum(s.Fy)
    if (Fy === null) e[`${pre}.Fy`] = 'Isi angka'
    else if (!(Fy > 0)) e[`${pre}.Fy`] = 'Harus > 0'
  }
}

/** Field datar mesin hitung: {pre}mat, {pre}ptype, {pre}psize, {pre}fy, {pre}b, {pre}h, {pre}fc. */
export function sectionFields(s: SectionInput, pre: string): Record<string, string | number> {
  return {
    [pre + 'mat']: s.mat,
    [pre + 'ptype']: s.ptype,
    [pre + 'psize']: s.psize,
    [pre + 'fy']: gradeValues({ grade: s.grade, Fy: s.Fy, Fu: '' }).Fy,
    [pre + 'b']: parseNum(s.b) ?? 0,
    [pre + 'h']: parseNum(s.h) ?? 0,
    [pre + 'fc']: parseNum(s.fc) ?? 0,
  }
}

/** Kebalikan sectionFields (kasus golden → input UI). */
export function sectionFromFields(a: Record<string, unknown>, pre: string): SectionInput {
  const Fy = Number(a[pre + 'fy'])
  const grade = gradeOf(Fy)
  return {
    mat: (a[pre + 'mat'] as 'baja' | 'beton') ?? 'baja',
    ptype: String(a[pre + 'ptype']),
    psize: String(a[pre + 'psize']),
    grade,
    Fy: String(Fy),
    b: String(a[pre + 'b'] ?? 300),
    h: String(a[pre + 'h'] ?? 400),
    fc: String(a[pre + 'fc'] ?? 25),
  }
}

export function SectionFields({
  value,
  pre,
  errors,
  concrete,
  onChange,
}: {
  value: SectionInput
  pre: string
  errors: FieldErrors
  /** Boleh beton (portal); gable hanya baja. */
  concrete: boolean
  onChange: (p: Partial<SectionInput>) => void
}) {
  const sub = (k: string) => errors[`${pre}.${k}`]
  return (
    <>
      {concrete && (
        <Field label="Material">
          <Segmented
            ariaLabel="Material"
            value={value.mat}
            options={[
              { value: 'baja', label: 'Baja' },
              { value: 'beton', label: 'Beton' },
            ]}
            onChange={(mat) => onChange({ mat })}
          />
        </Field>
      )}
      {value.mat === 'beton' ? (
        <>
          <NumField label="b — lebar" unit="mm" value={value.b} error={sub('b')} onChange={(b) => onChange({ b })} />
          <NumField label="h — tinggi (dalam bidang portal)" unit="mm" value={value.h} error={sub('h')} onChange={(h) => onChange({ h })} />
          <NumField label="f'c — kuat tekan beton" unit="MPa" value={value.fc} error={sub('fc')} hint="E = 4700√f'c, I bruto (tanpa reduksi retak)." onChange={(fc) => onChange({ fc })} />
        </>
      ) : (
        <>
          <ProfileFields ptype={value.ptype} psize={value.psize} types={FRAME_PROFILE_TYPES} error={sub('psize')} onChange={onChange} />
          <GradeFields
            value={{ grade: value.grade, Fy: value.Fy, Fu: '' }}
            errors={sub('Fy') ? { Fy: sub('Fy') } : {}}
            withFu={false}
            onChange={(p) => onChange({ ...(p.grade !== undefined ? { grade: p.grade } : {}), ...(p.Fy !== undefined ? { Fy: p.Fy } : {}) })}
          />
        </>
      )}
    </>
  )
}
