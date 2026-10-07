import { fx, okNg, type Figure, type Report, type ReportMeta, type Row } from './model'

// Laporan → baris monospace (gaya build lama) untuk .txt dan PDF. Hanya ASCII: font PDF bawaan (Courier) tanpa
// embed, dan offset xref PDF dihitung per karakter = per byte.

/** Lebar isi baris (karakter), di luar spasi indentasi pertama. */
export const RW = 72

export type Line = string | { fig: Figure }

const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'eps', θ: 'theta', λ: 'lambda', μ: 'mu', ν: 'nu', π: 'pi',
  ρ: 'rho', σ: 'sigma', τ: 'tau', φ: 'phi', ϕ: 'phi', ψ: 'psi', ω: 'omega', Δ: 'Delta', Σ: 'sum', Ω: 'Omega',
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUB = '₀₁₂₃₄₅₆₇₈₉'

/** Unicode → ASCII yang terbaca (φ → phi, ² → 2, · → *, ≤ → <=); sisa non-ASCII → '?'. */
export function toAscii(s: string): string {
  return s
    .replace(/[α-ωΑ-Ωϕ]/g, (c) => GREEK[c] ?? '?')
    .replace(/[⁰-⁹¹²³₀-₉]/g, (c) => {
      const k = SUP.indexOf(c) >= 0 ? SUP.indexOf(c) : SUB.indexOf(c)
      return k >= 0 ? String(k) : '?'
    })
    .replace(/·/g, '*')
    .replace(/×/g, 'x')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/≈/g, '~')
    .replace(/[–—−]/g, '-')
    .replace(/[′’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/°/g, ' deg')
    .replace(/…/g, '...')
    .replace(/√/g, 'sqrt')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^\x20-\x7E]/g, '?')
}

const rep = (c: string, n: number) => (n > 0 ? c.repeat(n) : '')
const rule = (c = '-') => ' ' + rep(c, RW)
const center = (t: string) => {
  const a = toAscii(t)
  return ' ' + rep(' ', Math.max(0, Math.floor((RW - a.length) / 2))) + a
}

// Teks diubah ke ASCII SEBELUM diukur (φ → phi memperpanjang baris).

/** "Label ........ nilai" selebar RW (minimal 2 titik). */
export function leader(label: string, value: string): string {
  const l = toAscii(label) + ' ', v = ' ' + toAscii(value)
  return ' ' + l + rep('.', Math.max(2, RW - l.length - v.length)) + v
}

/** Bungkus kata ke lebar RW; baris lanjutan diindentasi `indent`. */
export function wrap(text: string, indent = '   '): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of toAscii(text).split(' ')) {
    if (cur && (cur + ' ' + w).length > RW) {
      out.push(' ' + cur)
      cur = indent + w
    } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) out.push(' ' + cur)
  return out.length ? out : ['']
}

function rowLine(r: Row): string {
  if (r.k === 'kv') return leader(r.label, r.value)
  return leader('>> ' + r.label, fx(r.ratio, 2) + ' ' + okNg(r.ratio) + (r.note ? ' (' + r.note + ')' : ''))
}

/** Seluruh laporan sebagai baris (string ASCII atau gambar). */
export function reportLines(rep0: Report, meta: ReportMeta): Line[] {
  const L: Line[] = []
  L.push(rule('='), center('EDFS CIVIL TOOLS'), center(rep0.title.toUpperCase()), rule('='))
  L.push(leader(rep0.method, meta.date), '')
  for (const s of rep0.sections) {
    L.push(' ' + toAscii(s.title.toUpperCase()), rule(s.strong ? '=' : '-'))
    for (const b of s.blocks) {
      if (b.k === 'rows') for (const r of b.rows) L.push(rowLine(r))
      else if (b.k === 'figure') L.push({ fig: b.fig })
      else if (b.k === 'text') for (const t of b.lines) L.push(...wrap(t, ''))
      else for (const it of b.items) L.push(...wrap('- ' + it))
    }
    L.push('')
  }
  if (rep0.governing) {
    L.push(rule('='), leader('>> ' + rep0.governing.label.toUpperCase(), fx(rep0.governing.ratio, 2) + ' ' + okNg(rep0.governing.ratio)))
    L.push(rule('='), '')
  }
  if (rep0.warnings.length) {
    L.push(' CATATAN', rule('-'))
    for (const w of rep0.warnings) L.push(...wrap('- ' + w))
    L.push('')
  }
  for (const s of rep0.scope) L.push(...wrap(s, ''))
  L.push('', rule('='), center(`EDFS Civil Tools v${meta.appVersion}  -  tools.edifisia.com`), rule('='))
  return L
}

/** Isi berkas .txt (CRLF, gambar diganti teks alt). */
export function reportText(rep0: Report, meta: ReportMeta): string {
  return reportLines(rep0, meta)
    .flatMap((l) => (typeof l === 'string' ? [l] : l.fig.alt ? [' [' + toAscii(l.fig.alt) + ']'] : []))
    .join('\r\n')
}
