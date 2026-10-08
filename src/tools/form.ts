// Pembantu form bersama semua tool (angka sebagai teks form, kesalahan per field).

/** Angka dari teks form ("1,5" diterima); null bila kosong/tidak valid. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  return Number(t)
}

/** Kunci field ("L", "dist.0.w1", "point.1.a") → pesan kesalahan. Kosong = input sah. */
export type FieldErrors = Record<string, string>
