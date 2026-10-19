import { APP_NAME, BRAND_OWNER, SITE_URL } from '../app/appInfo'

// Syarat Layanan & Kebijakan Privasi (dialog dari Tentang). Ubah LEGAL_DATE setiap kali isi berubah.
export const LEGAL_DATE = '19 Oktober 2026'

const SITE = SITE_URL.replace(/^https:\/\//, '')

export function TermsContent() {
  return (
    <div className="relnotes legal">
      <p className="muted">Berlaku sejak {LEGAL_DATE}</p>
      <p>
        Dengan menggunakan {APP_NAME} di {SITE} (“Layanan”), Anda menyetujui syarat berikut. Layanan dikelola oleh{' '}
        {BRAND_OWNER}.
      </p>
      <h3>1. Sifat Layanan</h3>
      <p>
        Layanan adalah kumpulan kalkulator rekayasa sipil yang mengacu pada SNI dan standar terkait. Hasil perhitungan
        adalah alat bantu, bukan pengganti penilaian teknis. Pengguna wajib memverifikasi seluruh masukan dan keluaran
        oleh insinyur profesional yang bertanggung jawab sebelum digunakan untuk desain, gambar kerja, atau konstruksi.
      </p>
      <h3>2. Batasan Tanggung Jawab</h3>
      <p>
        Layanan disediakan “sebagaimana adanya”. {BRAND_OWNER} tidak menjamin Layanan bebas galat, selalu tersedia,
        atau sesuai untuk keperluan tertentu, dan tidak bertanggung jawab atas kerugian langsung maupun tidak langsung
        akibat penggunaan hasil perhitungan, sejauh diizinkan hukum yang berlaku.
      </p>
      <h3>3. Akun & Premium</h3>
      <ul>
        <li>Perhitungan pada tab Input dapat digunakan tanpa akun.</li>
        <li>
          Fitur Premium (laporan Detail, unduh PDF, dan fitur lain yang ditandai) memerlukan akun Edifisia dengan
          langganan Premium atau masa uji coba yang aktif.
        </li>
        <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi dan seluruh aktivitas pada akun Anda.</li>
      </ul>
      <h3>4. Penggunaan yang Dilarang</h3>
      <ul>
        <li>Mengakses fitur Premium tanpa hak, termasuk membobol atau mengakali pembatasan akses.</li>
        <li>Mengganggu, membebani secara sengaja, atau merekayasa balik Layanan.</li>
        <li>Menyalin dan mendistribusikan ulang Layanan, kode, atau laporan sebagai produk Anda sendiri.</li>
      </ul>
      <h3>5. Hak Kekayaan Intelektual</h3>
      <p>
        Merek, logo, tampilan, dan kode Layanan milik {BRAND_OWNER}. Laporan perhitungan yang Anda buat boleh digunakan
        untuk keperluan proyek Anda sendiri.
      </p>
      <h3>6. Perubahan</h3>
      <p>
        Layanan dan syarat ini dapat berubah sewaktu-waktu. Perubahan berlaku sejak dipublikasikan di halaman ini;
        penggunaan berkelanjutan berarti Anda menyetujuinya.
      </p>
      <h3>7. Hukum yang Berlaku</h3>
      <p>Syarat ini tunduk pada hukum Republik Indonesia.</p>
    </div>
  )
}

export function PrivacyContent() {
  return (
    <div className="relnotes legal">
      <p className="muted">Berlaku sejak {LEGAL_DATE}</p>
      <p>
        Kebijakan ini menjelaskan data apa yang dikumpulkan {APP_NAME} dan bagaimana data tersebut digunakan, sejalan
        dengan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
      </p>
      <h3>1. Data Perhitungan Tetap di Perangkat Anda</h3>
      <p>
        Seluruh perhitungan berjalan di browser Anda. Nilai masukan disimpan sementara di penyimpanan sesi browser
        (sessionStorage) agar pulih saat halaman dimuat ulang, dan tidak dikirim ke server kami. Preferensi tampilan
        (tema, panel navigasi) dan deskripsi PDF terakhir disimpan di localStorage perangkat Anda.
      </p>
      <h3>2. Data Akun</h3>
      <p>
        Bila Anda masuk, kami memproses data akun Edifisia Anda — email, nama, dan status langganan — untuk autentikasi
        dan menentukan akses Premium. Masuk dengan Google hanya membagikan data profil dasar yang Anda setujui di layar
        Google. Data akun disimpan oleh penyedia basis data kami (Supabase).
      </p>
      <h3>3. Analitik</h3>
      <p>
        Kami menggunakan Google Analytics 4 untuk mengukur halaman yang dikunjungi, perkiraan lokasi (tingkat
        kota/negara), jenis perangkat, dan browser, guna memahami tool yang paling bermanfaat. Google Analytics memakai
        cookie dan hanya aktif di {SITE}. Kami tidak mengirim nilai masukan perhitungan atau data akun ke Google
        Analytics. Anda dapat menolak pelacakan dengan pemblokir iklan/pelacak atau{' '}
        <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
          add-on opt-out Google Analytics
        </a>
        .
      </p>
      <h3>4. Pembagian Data</h3>
      <p>
        Kami tidak menjual data pribadi Anda. Data hanya dibagikan kepada penyedia layanan yang disebut di atas
        (Supabase, Google, dan Cloudflare sebagai hosting) sebatas yang diperlukan untuk menjalankan Layanan, atau bila
        diwajibkan hukum.
      </p>
      <h3>5. Hak Anda</h3>
      <p>
        Anda berhak mengakses, memperbaiki, atau meminta penghapusan data akun Anda. Hapus data lokal kapan saja dengan
        membersihkan data situs di pengaturan browser. Untuk permintaan terkait akun, hubungi {BRAND_OWNER} melalui
        kanal kontak di{' '}
        <a href="https://edifisia.com" target="_blank" rel="noreferrer">
          edifisia.com
        </a>
        .
      </p>
      <h3>6. Perubahan Kebijakan</h3>
      <p>Kebijakan ini dapat diperbarui; tanggal berlaku di atas menunjukkan versi terakhir.</p>
    </div>
  )
}
