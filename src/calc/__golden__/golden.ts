// Pembanding golden: hasil port src/calc harus sama dengan compute() modul lama (src/calc/__golden__/<id>.json,
// direkam oleh scripts/golden/extract.mjs). Angka: toleransi relatif 1e-9; teks/boolean/null: persis.
// Semua kunci di acuan wajib ada di hasil port; kunci tambahan di port boleh.

export interface GoldenCase {
  name: string
  args: unknown[]
  output: unknown
}

const REL_TOL = 1e-9
const ABS_TOL = 1e-12

/** Daftar perbedaan (kosong = sama). Hasil port dinormalisasi lewat JSON seperti acuannya (NaN → null). */
export function goldenDiff(actual: unknown, expected: unknown): string[] {
  const diffs: string[] = []
  walk(JSON.parse(JSON.stringify(actual ?? null)), expected, '$', diffs)
  return diffs
}

function walk(a: unknown, e: unknown, path: string, out: string[]): void {
  if (out.length >= 20) return
  if (typeof e === 'number') {
    if (typeof a !== 'number') { out.push(`${path}: acuan ${e}, port ${JSON.stringify(a)}`); return }
    const tol = Math.max(ABS_TOL, REL_TOL * Math.abs(e))
    if (Math.abs(a - e) > tol) out.push(`${path}: acuan ${e}, port ${a}`)
    return
  }
  if (Array.isArray(e)) {
    if (!Array.isArray(a)) { out.push(`${path}: acuan array, port ${typeof a}`); return }
    if (a.length !== e.length) out.push(`${path}: panjang acuan ${e.length}, port ${a.length}`)
    e.forEach((item, i) => walk(a[i], item, `${path}[${i}]`, out))
    return
  }
  if (e !== null && typeof e === 'object') {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) { out.push(`${path}: acuan objek, port ${JSON.stringify(a)}`); return }
    const ao = a as Record<string, unknown>
    for (const [k, v] of Object.entries(e)) {
      if (!(k in ao)) out.push(`${path}.${k}: tidak ada di port`)
      else walk(ao[k], v, `${path}.${k}`, out)
    }
    return
  }
  if (a !== e) out.push(`${path}: acuan ${JSON.stringify(e)}, port ${JSON.stringify(a)}`)
}
