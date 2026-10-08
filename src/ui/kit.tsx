import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// Komponen bersama tab Input semua tool (docs/UI.md "Tata letak tab Input"). Gaya: src/ui/kit.css.

/**
 * Tata letak tab Input: kiri kartu input (scroll sendiri), kanan atas Preview, kanan bawah hasil.
 * Halaman tidak di-scroll; di layar sempit kolom menumpuk dan halaman boleh scroll.
 */
export function ToolLayout({ inputs, preview, results }: { inputs: ReactNode; preview: ReactNode; results: ReactNode }) {
  return (
    <div className="tl">
      <div className="tl-inputs">{inputs}</div>
      <div className="tl-preview">{preview}</div>
      <div className="tl-results">{results}</div>
    </div>
  )
}

/** Kartu input bernomor: "1. Profil & Bentang". */
export function Card({ n, title, actions, children }: { n?: number; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h3>
          {n !== undefined && <span className="card-n">{n}.</span>} {title}
        </h3>
        {actions}
      </header>
      <div className="card-body">{children}</div>
    </section>
  )
}

/** Panel kanan (Preview / Diagram) dengan judul dan aksi/sub-tab opsional. */
export function Panel({ title, tools, children, className }: { title: ReactNode; tools?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header className="panel-head">
        <h3>{title}</h3>
        {tools}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}

interface FieldProps {
  label: ReactNode
  unit?: string
  hint?: string
  error?: string
  children: ReactNode
}

/** Baris form: label di kiri, kontrol + satuan di kanan, pesan kesalahan/hint di bawah. */
export function Field({ label, unit, hint, error, children }: FieldProps) {
  return (
    <label className={`fld${error ? ' invalid' : ''}`} title={hint}>
      <span className="fld-label">{label}</span>
      <span className="fld-ctl">
        {children}
        {unit !== undefined && <span className="fld-unit">{unit}</span>}
      </span>
      {error && <span className="fld-err">{error}</span>}
    </label>
  )
}

/** Input angka sebagai teks (nilai disimpan apa adanya; validasi milik tool). */
export function NumInput({
  value,
  onChange,
  invalid,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  ariaLabel?: string
}) {
  return (
    <input
      className="ctl num-in"
      inputMode="decimal"
      value={value}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      spellCheck={false}
    />
  )
}

export function NumField(p: { label: ReactNode; unit?: string; hint?: string; error?: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={p.label} unit={p.unit} hint={p.hint} error={p.error}>
      <NumInput value={p.value} onChange={p.onChange} invalid={!!p.error} />
    </Field>
  )
}

export function SelectField<T extends string>(p: {
  label: ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  error?: string
  hint?: string
}) {
  return (
    <Field label={p.label} error={p.error} hint={p.hint}>
      <select className="ctl" value={p.value} onChange={(e) => p.onChange(e.target.value as T)} aria-invalid={!!p.error || undefined}>
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Pilihan 2–4 opsi sebaris. */
export function Segmented<T extends string>(p: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={p.ariaLabel}>
      {p.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={p.value === o.value}
          className={p.value === o.value ? 'on' : ''}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SubTabs<T extends string>(p: { value: T; tabs: { id: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="subtabs" role="tablist" aria-label={p.ariaLabel}>
      {p.tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={p.value === t.id} className={p.value === t.id ? 'on' : ''} onClick={() => p.onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export interface Column<R> {
  key: keyof R & string
  label: string
  unit?: string
}

/**
 * Tabel baris dinamis yang bisa diedit langsung (beban, lapisan tanah, …): Tambah, Hapus per baris.
 * `errors` memakai kunci `${prefix}.${index}.${key}` seperti validate() tool.
 */
export function RowTable<R extends Record<string, string>>(p: {
  columns: Column<R>[]
  rows: R[]
  onChange: (rows: R[]) => void
  newRow: () => R
  max?: number
  errors?: Record<string, string>
  prefix: string
  addLabel: string
  emptyText: string
}) {
  const full = p.max !== undefined && p.rows.length >= p.max
  const set = (i: number, key: keyof R, v: string) => p.onChange(p.rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)))
  return (
    <div className="rt">
      {p.rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>#</th>
              {p.columns.map((c) => (
                <th key={c.key}>
                  {c.label}
                  {c.unit && <span className="rt-unit">{c.unit}</span>}
                </th>
              ))}
              <th aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r, i) => (
              <tr key={i}>
                <td className="rt-n">{i + 1}</td>
                {p.columns.map((c) => {
                  const err = p.errors?.[`${p.prefix}.${i}.${c.key}`]
                  return (
                    <td key={c.key} title={err}>
                      <NumInput value={r[c.key]} onChange={(v) => set(i, c.key, v)} invalid={!!err} ariaLabel={`${c.label} baris ${i + 1}`} />
                    </td>
                  )
                })}
                <td>
                  <button type="button" className="icon-btn" onClick={() => p.onChange(p.rows.filter((_, k) => k !== i))} aria-label={`Hapus baris ${i + 1}`} title="Hapus">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="rt-empty muted">{p.emptyText}</p>
      )}
      <button type="button" className="btn small" disabled={full} onClick={() => p.onChange([...p.rows, p.newRow()])} title={full ? `Maksimum ${p.max}` : undefined}>
        <Plus size={14} /> {p.addLabel}
      </button>
    </div>
  )
}

/** Kartu Nilai Maksimum / ringkasan hasil. */
export function StatTiles({ items }: { items: { label: string; value: string; unit?: string; sub?: string; tone?: 'ok' | 'bad' }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div key={s.label} className={`stat${s.tone ? ' ' + s.tone : ''}`}>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">
            <span className="num">{s.value}</span>
            {s.unit && <span className="stat-unit">{s.unit}</span>}
          </div>
          {s.sub && <div className="stat-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button type="button" className="icon-btn" onClick={onReset} title="Kembalikan input bawaan" aria-label="Kembalikan input bawaan">
      <RotateCcw size={14} />
    </button>
  )
}

/** Ukuran elemen (px) untuk menggambar SVG dengan teks berukuran tetap. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** Wadah yang memberi ukuran piksel ke anak (untuk SVG). */
export function Sized({ children }: { children: (w: number, h: number) => ReactNode }) {
  const [ref, size] = useSize<HTMLDivElement>()
  return (
    <div ref={ref} className="sized">
      {children(size.w, size.h)}
    </div>
  )
}
