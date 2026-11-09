// Identitas produk (murni — dipakai juga pre-render saat build). Nama Edifisia/DTS hanya di dialog Tentang.
// Versi & tanggal build: version.ts.
export const APP_NAME = 'EDFS Civil Tools'
export const APP_TAGLINE = 'Alat Bantu Rekayasa Sipil'
export const APP_DESCRIPTION =
  'Kumpulan kalkulator rekayasa sipil sesuai SNI: beton bertulang, baja, struktur bawah, geoteknik, pembebanan, dan hidraulika. Gratis, berjalan di browser.'
/** URL kanonik (DOMAIN_MIGRATION.md §5) — juga dipakai pre-render SEO. */
export const SITE_URL = 'https://tools.edifisia.com'
/** Pemilik merek (dialog Tentang, pola EDFS Matrix). */
export const BRAND_OWNER = 'Edifisia'
/** GA4 — hanya dikirim dari domain produksi (bukan *.pages.dev / localhost). */
export const GA4_ID = 'G-0PKEJMNY18'
/** Meta Pixel keluarga Edifisia (docs/meta-pixel.md) — hanya dimuat di host produksi ini. */
export const PIXEL_ID = '1250093348350553'
export const PIXEL_HOST = 'tools.edifisia.com'
