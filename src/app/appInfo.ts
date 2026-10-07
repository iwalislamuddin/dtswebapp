// Identitas produk. Nama Edifisia/DTS hanya muncul di dialog Tentang (kredit).
export const APP_NAME = 'EDFS Civil Tools'
export const APP_TAGLINE = 'Alat Bantu Rekayasa Sipil'
export const APP_DESCRIPTION =
  'Kumpulan kalkulator rekayasa sipil sesuai SNI: beton bertulang, baja, struktur bawah, geoteknik, pembebanan, dan hidraulika. Gratis, berjalan di browser.'
/** URL kanonik (DOMAIN_MIGRATION.md §5) — juga dipakai pre-render SEO. */
export const SITE_URL = 'https://tools.edifisia.com'
export const CREDIT = ['Iwal', 'Edifisia', 'DTS Engineering'] as const
/** GA4 — hanya dikirim dari domain produksi (bukan *.pages.dev / localhost). */
export const GA4_ID = 'G-2MDVZFKNSE'
export const APP_VERSION = __APP_VERSION__
export const BUILD_DATE = __BUILD_DATE__
