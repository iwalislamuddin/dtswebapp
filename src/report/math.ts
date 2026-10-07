// Markup rumus ringan untuk laporan (dipakai renderer HTML & PDF):
//   a_{b}  subskrip · a^{b} superskrip · \frac{num}{den} pecahan · selain itu teks apa adanya.
// Kurung kurawal harus berpasangan; markup tak lengkap diperlakukan sebagai teks biasa.

export type MathNode =
  | { t: 'text'; s: string }
  | { t: 'sub'; c: MathNode[] }
  | { t: 'sup'; c: MathNode[] }
  | { t: 'frac'; num: MathNode[]; den: MathNode[] }

/** Isi kurung kurawal mulai dari indeks `{`; null bila tak berpasangan. */
function group(s: string, open: number): { inner: string; end: number } | null {
  if (s[open] !== '{') return null
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return { inner: s.slice(open + 1, i), end: i + 1 }
  }
  return null
}

export function parseMath(s: string): MathNode[] {
  const out: MathNode[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', s: buf })
    buf = ''
  }
  let i = 0
  while (i < s.length) {
    if (s.startsWith('\\frac', i)) {
      const a = group(s, i + 5)
      const b = a && group(s, a.end)
      if (a && b) {
        flush()
        out.push({ t: 'frac', num: parseMath(a.inner), den: parseMath(b.inner) })
        i = b.end
        continue
      }
    }
    if ((s[i] === '_' || s[i] === '^') && s[i + 1] === '{') {
      const g = group(s, i + 1)
      if (g) {
        flush()
        out.push({ t: s[i] === '_' ? 'sub' : 'sup', c: parseMath(g.inner) })
        i = g.end
        continue
      }
    }
    buf += s[i++]
  }
  flush()
  return out
}

/** Teks polos (tanpa markup) — untuk alt, title, pencarian. */
export function plainMath(s: string): string {
  const walk = (ns: MathNode[]): string =>
    ns
      .map((n) =>
        n.t === 'text' ? n.s : n.t === 'frac' ? `(${walk(n.num)})/(${walk(n.den)})` : n.t === 'sup' ? `^${walk(n.c)}` : walk(n.c),
      )
      .join('')
  return walk(parseMath(s))
}
