// Catatan rilis (Help > Catatan Rilis). Terbaru di atas; rincian build lama ada di docs/HANDOFF.md.

export interface ReleaseNote {
  version: string
  date: string | null
  items: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.8.0',
    date: null,
    items: [
      'Tampilan baru bergaya aplikasi desktop: menu File & Help, navigasi kiri per kategori, tab Input dan Detail.',
      'Tema Light & Dark dengan warna olive EDFS.',
      'Kategori baru Struktur Bawah (pondasi tapak, pile cap, dinding penahan tanah); Sambungan digabung ke Baja.',
      'Mesin hitung ditulis ulang dalam TypeScript dan dikunci dengan uji terhadap versi sebelumnya.',
      'Masuk dengan akun Edifisia (satu akun untuk semua aplikasi Edifisia).',
    ],
  },
  { version: '0.7.3', date: '2026-08-21', items: ['Tool baru Geser & Torsi Balok (35 tool).'] },
  { version: '0.7.2', date: '2026-08-18', items: ['Tool baru Slab Komposit + Metal Deck.'] },
  { version: '0.7.1', date: '2026-08-06', items: ['Tool baru Desain Tangga Beton; slider skala deformasi.'] },
  { version: '0.7.0', date: '2026-08-04', items: ['Kategori Analisis Struktur: Analisis Portal & Portal Gable.'] },
  { version: '0.6.0', date: '2026-07-28', items: ['Analisis Balok Baja, Desain Pondasi Tapak, Pelat Dua Arah.'] },
  { version: '0.5.0', date: '2026-07-22', items: ['Dinding Penahan Tanah batu kali & beton; laporan PDF bergambar.'] },
  { version: '0.4.0', date: '2026-07-21', items: ['Base Plate & Anchor Rod.'] },
  { version: '0.3.0', date: '2026-07-21', items: ['Tulangan Minimum, Balok Menerus, Pile Cap, Broms, Analisis P-Y.'] },
  { version: '0.2.0', date: '2026-07-14', items: ['19 tool dalam 6 kategori, library profil baja, URL per tool.'] },
  { version: '0.1.0', date: '2026-07-10', items: ['Rilis awal: Panjang Penyaluran Tulangan Tarik.'] },
]
