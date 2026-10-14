import { parseCpt, type CptPoint, type CptUnit } from '../../calc/shared/cpt'
import { Field } from '../../ui/kit'

// Data sondir/CPT bersama tool Daya Dukung CPT dan Daya Dukung Tiang (CPT): teks "z qc [fs]" per baris.

export const CPT_UNITS: { value: CptUnit; label: string }[] = [
  { value: 'kgcm2', label: 'kg/cm²' },
  { value: 'mpa', label: 'MPa' },
]

/** Contoh data sondir (kg/cm²): z (m), qc. */
export const CPT_SAMPLE = '0 5\n0.5 8\n1 10\n1.5 12\n2 15\n2.5 20\n3 28\n3.5 35\n4 45\n4.5 55\n5 70\n6 90\n7 110\n8 130\n10 150\n12 180'

/** Titik CPT dari teks dan satuan (baris tak valid dilewati). */
export const cptPoints = (text: string, unit: CptUnit): CptPoint[] => parseCpt(text, unit)

/** Pesan kesalahan bila tidak ada baris yang terbaca. */
export const cptDataError = (text: string, unit: CptUnit): string | undefined =>
  cptPoints(text, unit).length ? undefined : 'Tempel data: satu baris per titik, "z qc" (opsional "fs")'

/** Kotak tempel data CPT; menampilkan jumlah titik terbaca dan rentang kedalaman. */
export function CptTextField({ value, unit, error, onChange, withFs }: { value: string; unit: CptUnit; error?: string; onChange: (v: string) => void; withFs?: boolean }) {
  const pts = cptPoints(value, unit)
  return (
    <Field
      label={withFs ? 'Data sondir: z, qc, fs' : 'Data sondir: z, qc'}
      error={error}
      hint={`${pts.length} titik terbaca${pts.length ? ` · z ${pts[0].z}–${pts[pts.length - 1].z} m` : ''}. Tempel dari Excel; pemisah spasi/tab/koma.`}
    >
      <textarea
        className="ctl"
        rows={9}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        style={{ fontFamily: 'var(--mono, ui-monospace, monospace)', resize: 'vertical', width: '100%', height: 170, minHeight: 90 }}
      />
    </Field>
  )
}
