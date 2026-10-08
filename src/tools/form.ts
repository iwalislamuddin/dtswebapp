// Pembantu form bersama semua tool (angka sebagai teks form, kesalahan per field).

/** Angka dari teks form ("1,5" diterima); null bila kosong/tidak valid. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  return Number(t)
}

/** Kunci field ("L", "dist.0.w1", "point.1.a") → pesan kesalahan. Kosong = input sah. */
export type FieldErrors = Record<string, string>

/** Aturan angka: null = sah, teks = pesan kesalahan. */
export type Rule = (n: number) => string | null

export const pos: Rule = (n) => (n > 0 ? null : 'Harus > 0')
export const nonneg: Rule = (n) => (n >= 0 ? null : 'Tidak boleh negatif')
export const anyNum: Rule = () => null
export const intRange = (min: number, max: number): Rule => (n) =>
  !Number.isInteger(n) || n < min ? `Bilangan bulat ≥ ${min}` : n > max ? `Maksimum ${max}` : null

/** Pemeriksa field: `need(key, rule)` mengisi `e[key]` bila teks bukan angka atau melanggar aturan. */
export function checker<I extends object>(i: I, e: FieldErrors) {
  return (key: keyof I & string, rule: Rule) => {
    const n = parseNum(String(i[key]))
    if (n === null) e[key] = 'Isi angka'
    else {
      const msg = rule(n)
      if (msg) e[key] = msg
    }
  }
}

/** Ubah semua field teks angka ke number (0 bila kosong) — untuk adapter ke mesin hitung. */
export const num = (s: string): number => parseNum(s) ?? 0
