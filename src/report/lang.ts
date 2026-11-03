import type { Block, FigOp, Report, ReportMeta, Row } from './model'

// Bahasa laporan PDF. Laporan selalu disusun dalam Bahasa Indonesia (sama dengan tab Detail); versi Inggris dibuat
// saat cetak dengan menerjemahkan setiap teks laporan memakai kamus templat (src/report/en.ts):
//   1. cocok persis dengan entri kamus, atau
//   2. cocok dengan templat ber-placeholder {0}, {1}, … — isi placeholder diterjemahkan ulang (rekursif), lalu
//   3. isi subskrip rumus x_{…} diterjemahkan per kata (mis. b_{atas} → b_{top}).
// Teks yang tidak dikenal dibiarkan apa adanya (angka, simbol, nama profil, kode acuan).

export type ReportLang = NonNullable<ReportMeta['lang']>

export const REPORT_LANGS: { value: ReportLang; label: string }[] = [
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
]

/** Terapkan `f` ke setiap teks laporan (judul, baris, langkah hitung, tabel, teks gambar, catatan). */
export function mapReportText(r: Report, f: (s: string) => string): Report {
  const row = (x: Row): Row =>
    x.k === 'kv' ? { ...x, label: f(x.label), value: f(x.value) } : { ...x, label: f(x.label), note: x.note === undefined ? undefined : f(x.note) }
  const op = (o: FigOp): FigOp => (o.t === 'text' ? { ...o, s: f(o.s) } : o)
  const opt = (s: string | undefined) => (s === undefined ? undefined : f(s))
  const block = (b: Block): Block => {
    switch (b.k) {
      case 'h':
      case 'p':
        return { ...b, text: f(b.text) }
      case 'rows':
        return { ...b, rows: b.rows.map(row) }
      case 'calc':
        return {
          ...b,
          steps: b.steps.map((s) => ({ ...s, desc: opt(s.desc), lhs: f(s.lhs), expr: opt(s.expr), subst: opt(s.subst), value: f(s.value), unit: opt(s.unit), ref: opt(s.ref) })),
        }
      case 'table':
        return { ...b, head: b.head.map(f), rows: b.rows.map((rw) => rw.map(f)), caption: opt(b.caption) }
      case 'figure':
        return { ...b, fig: { ...b.fig, alt: f(b.fig.alt), caption: opt(b.fig.caption), ops: b.fig.ops.map(op) } }
      case 'text':
        return { ...b, lines: b.lines.map(f) }
      case 'notes':
        return { ...b, items: b.items.map(f) }
    }
  }
  return {
    ...r,
    title: f(r.title),
    summary: r.summary?.map(row),
    sections: r.sections.map((s) => ({ ...s, title: f(s.title), blocks: s.blocks.map(block) })),
    governing: r.governing && { ...r.governing, label: f(r.governing.label) },
    warnings: r.warnings.map(f),
    scope: r.scope.map(f),
  }
}

export interface Dictionary {
  /** Teks utuh (boleh ber-placeholder {0}, {1}, …) → terjemahan dengan placeholder yang sama. */
  phrases: Record<string, string>
  /** Kata di dalam subskrip rumus: atas → top. */
  subscripts: Record<string, string>
}

interface Template {
  re: RegExp
  en: string
  /** Panjang bagian literal — templat paling spesifik dicoba lebih dulu. */
  weight: number
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Placeholder {n}; {n} sesudah _ atau ^ adalah markup rumus (T_{0}, mm^{2}), bukan placeholder. */
const HOLE = /(?<![_^])\{(\d+)\}/g

export function makeTranslator(dict: Dictionary): (s: string) => string {
  const exact = new Map<string, string>()
  const templates: Template[] = []
  for (const [id, en] of Object.entries(dict.phrases)) {
    if (!id.match(HOLE)) {
      exact.set(id, en)
      continue
    }
    const parts = id.split(/(?<![_^])\{(\d+)\}/)
    let src = '^'
    let weight = 0
    const order: number[] = []
    parts.forEach((p, i) => {
      if (i % 2) {
        order.push(Number(p))
        src += '([\\s\\S]*?)'
      } else {
        src += esc(p)
        weight += p.length
      }
    })
    // placeholder ke-n di teks Inggris merujuk {n} di teks Indonesia, apa pun urutan kemunculannya
    const en2 = en.replace(HOLE, (_, n) => `{#${order.indexOf(Number(n))}}`)
    templates.push({ re: new RegExp(src + '$'), en: en2, weight })
  }
  templates.sort((a, b) => b.weight - a.weight)

  const subs = (s: string) =>
    s.replace(/_\{([^{}]*)\}/g, (m, inner: string) => {
      const whole = dict.subscripts[inner]
      if (whole !== undefined) return `_{${whole}}`
      const t = inner.replace(/[A-Za-zÀ-ÿ]+/g, (w) => dict.subscripts[w] ?? w)
      return t === inner ? m : `_{${t}}`
    })

  // Kata yang hanya muncul di sisi Indonesia kamus: penanda teks yang masih perlu diterjemahkan.
  const words = (s: string) => s.replace(/_\{[^{}]*\}|\{\d+\}/g, ' ').match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []
  const enWords = new Set(Object.values(dict.phrases).flatMap(words))
  const idWords = new Set(Object.keys(dict.phrases).flatMap(words).filter((w) => !enWords.has(w)))
  const hasId = (s: string) => words(s).some((w) => idWords.has(w))

  const whole = (s: string, depth: number): string | null => {
    const hit = exact.get(s)
    if (hit !== undefined) return hit
    for (const t of templates) {
      const m = t.re.exec(s)
      if (m) return t.en.replace(/\{#(\d+)\}/g, (_, i) => tr(m[Number(i) + 1] ?? '', depth + 1))
    }
    return null
  }

  const tr = (s: string, depth: number): string => {
    if (!s || !/[A-Za-z]/.test(s)) return s
    const hit = exact.get(s)
    if (hit !== undefined) return hit
    if (depth >= 4) return s
    const w = whole(s, depth)
    if (w !== null) return w
    if (!hasId(s)) return s
    // dua placeholder berdempetan ("D{3}{4}") memotong isian di tempat yang salah: cari akhiran terpanjang yang
    // dikenal kamus, sisanya diterjemahkan terpisah
    for (let k = 1; k < s.length; k++) {
      if (!/[\s;,(+]/.test(s[k]) && !/[\s;,(]/.test(s[k - 1])) continue
      const tail = whole(s.slice(k), depth + 1)
      if (tail !== null) return tr(s.slice(0, k), depth + 1) + tail
    }
    // teks gabungan "a · b" / "a; b": terjemahkan tiap bagian
    for (const sep of [' · ', '; ', ' — ', ', ']) {
      if (!s.includes(sep)) continue
      const parts = s.split(sep)
      const out = parts.map((p) => tr(p, depth + 1))
      if (out.some((o, i) => o !== parts[i])) return out.join(sep)
    }
    return s
  }
  const cache = new Map<string, string>()
  return (s: string) => {
    let r = cache.get(s)
    if (r === undefined) cache.set(s, (r = tokens(subs(tr(s, 0)))))
    return r
  }
}

/** Singkatan acuan & fungsi rumus yang tersisa di teks mana pun: "Ps. 22.5" → "Sec. 22.5", "maks(…)" → "max(…)". */
const tokens = (s: string) =>
  s
    .replace(/\bmaks\(/g, 'max(')
    .replace(/\bPs\. (?=\d)/g, 'Sec. ')
    .replace(/\bPers\. (?=\d)/g, 'Eq. ')
    .replace(/\bGbr\. (?=\d)/g, 'Fig. ')
    .replace(/\bTabel (?=[\dA-Z])/g, 'Table ')
    .replace(/\bBab (?=\d)/g, 'Ch. ')

let enP: Promise<(s: string) => string> | null = null

/** Laporan dalam bahasa `lang` (kamus Inggris dimuat hanya saat diperlukan). */
export async function localizeReport(r: Report, lang: ReportLang): Promise<Report> {
  if (lang === 'id') return r
  enP ??= import('./en').then((m) => makeTranslator(m.EN))
  return mapReportText(r, await enP)
}
