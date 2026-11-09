# Meta Pixel di aplikasi Edifisia (matrix., tools., …)

Satu Pixel untuk seluruh keluarga Edifisia: **`1250093348350553`** ("Personal Pixel", dipakai juga di edifisia.com dan
lynk.id). Cookie `_fbp` diset Meta di `.edifisia.com`, jadi satu pengunjung dikenali lintas subdomain (seperti GA4
`G-0PKEJMNY18`). Implementasi acuan: `web/src/components/MetaPixel.astro` + `web/src/lib/pixel.ts` di repo ini.

Pembelian Premium terjadi di edifisia.com (Pixel + Conversions API sudah ada di sana). **Aplikasi tidak mengirim `Purchase`.**
Tugas Pixel di aplikasi: `PageView` (+ event opsional di bawah) untuk audiens iklan ("orang yang pernah membuka Matrix").

## Aturan wajib (sama untuk semua aplikasi)

1. **Hanya produksi.** Muat Pixel hanya bila `location.hostname` = domain produksi aplikasi (`matrix.edifisia.com`,
   `tools.edifisia.com`). Dev, preview, dan staging tidak dilacak.
2. **URL harus bersih dulu.** Pixel mengirim URL lengkap (`dl`). Jangan nyalakan selama query berisi parameter selain
   `utm_*`, `fbclid`, `next`, atau hash berisi `=` (mis. `?code=` dari Supabase, `#access_token=`). Tunggu sampai klien
   Supabase menghapusnya (`history.replaceState`), maksimal ~10 detik; lewat dari itu jangan lacak halaman tersebut.
3. **`autoConfig` mati** (`fbq('set', 'autoConfig', false, PIXEL_ID)`): tidak ada event otomatis dari klik tombol/form.
4. **Tanpa data pribadi.** Jangan kirim email, nama, atau data apa pun dari akun Google ke Meta (tanpa advanced matching,
   tanpa `em`). Kebijakan privasi (edifisia.com/privasi bagian 4 & 7) menjanjikan data Google tidak pernah ke Meta.
   Isi proyek/model pengguna juga jangan masuk parameter event.
5. **Jangan di halaman admin** atau halaman internal aplikasi.
6. **SPA:** kirim `PageView` lagi setiap pindah rute (pushState/popstate), bukan hanya saat halaman pertama dimuat.
7. **CSP** (bila aplikasi punya): `script-src https://connect.facebook.net`; `img-src` dan `connect-src
   https://www.facebook.com https://connect.facebook.net`.
8. **PWA / service worker:** jangan cache atau intersep permintaan ke `connect.facebook.net` / `www.facebook.com`
   (biarkan lewat jaringan; offline = event hilang, tidak apa-apa).

## Kode

Taruh di `index.html` (sebelum `</head>`) atau jalankan sekali saat aplikasi mulai. Ganti `APP` dengan `matrix` / `civil-tools`.

```html
<script>
  (function () {
    var PIXEL_ID = '1250093348350553';
    var APP = 'matrix';
    if (location.hostname !== 'matrix.edifisia.com') return; // hanya produksi (tools.edifisia.com untuk Civil Tools)

    var SAFE = /^(utm_\w+|fbclid|next)$/;
    function clean() {
      var ok = !/=/.test(location.hash);
      new URLSearchParams(location.search).forEach(function (_v, k) { if (!SAFE.test(k)) ok = false; });
      return ok;
    }
    var started = false, lastPath = '';
    function pageView() {
      if (!started || !clean() || location.pathname === lastPath) return;
      lastPath = location.pathname;
      fbq('track', 'PageView');
    }
    function start() {
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('set', 'autoConfig', false, PIXEL_ID);
      fbq('init', PIXEL_ID);
      started = true;
      pageView();
      // Satu kali per sesi peramban: audiens "membuka aplikasi X" (lebih tahan daripada filter URL).
      try {
        if (!sessionStorage.getItem('edfs-px-open')) {
          sessionStorage.setItem('edfs-px-open', '1');
          fbq('trackCustom', 'AppOpen', { app: APP });
        }
      } catch (e) {}
    }
    // SPA: PageView tiap pindah rute.
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); setTimeout(pageView, 0); return r; };
    });
    addEventListener('popstate', pageView);

    if (clean()) return start();
    var tries = 0, timer = setInterval(function () {
      if (clean()) { clearInterval(timer); start(); } else if (++tries >= 40) clearInterval(timer);
    }, 250);
  })();
</script>
```

Catatan:
- `replaceState` ikut dibungkus supaya `PageView` pertama juga terkirim setelah Supabase membersihkan `?code=`;
  `lastPath` mencegah `PageView` ganda untuk path yang sama.
- Bila router aplikasi mengubah hanya hash (`#/model`), ganti `location.pathname` dengan `location.pathname + location.hash`
  di `lastPath` (hash rute tanpa `=` tetap dianggap bersih).
- Bila aplikasi dibangun dengan bundler dan punya variabel env, boleh pindahkan `PIXEL_ID` ke env produksi
  (`VITE_META_PIXEL_ID`, dsb.) dan ganti cek hostname dengan "env terisi", seperti edifisia.com.

### Event opsional di dalam aplikasi

Pakai hanya bila berguna untuk iklan, tanpa data pribadi:

| Event | Kapan | Kode |
|---|---|---|
| `AppOpen` (custom) | sudah ada di atas, sekali per sesi | `fbq('trackCustom', 'AppOpen', { app })` |
| `Lead` | pengguna Free menekan "Upgrade / Beli Premium" (sebelum diarahkan ke edifisia.com/harga) | `fbq('track', 'Lead', { content_name: 'premium', app })` |
| `ActivateApp` (custom) | aksi inti pertama, mis. analisis pertama berhasil di Matrix | `fbq('trackCustom', 'ActivateApp', { app })` |

Panggil `fbq` hanya bila `typeof fbq === 'function'` (di dev/staging Pixel tidak dimuat). Tautan ke /harga sebaiknya
memakai `?utm_source=matrix&utm_medium=app` agar sumbernya terbaca di GA4.

## Setelan Meta (sekali)

- Events Manager → Personal Pixel → Settings → **Traffic permissions**: pastikan allow list berisi `edifisia.com`,
  `matrix.edifisia.com`, `tools.edifisia.com`, `lynk.id` (subdomain ditulis eksplisit agar pasti).
- Domain `edifisia.com` sudah diverifikasi → subdomain ikut.
- Audiens di Ads Manager: *Website* → Pixel → "People who visited specific web pages", URL contains
  `matrix.edifisia.com` (atau event `AppOpen` dengan parameter `app` = `matrix`).

## Uji

1. Deploy produksi aplikasi, buka dengan ekstensi **Meta Pixel Helper**: harus terlihat Pixel `1250093348350553`,
   `PageView` (dan `AppOpen` sekali).
2. Events Manager → **Test events** → tab browser → isi URL aplikasi → buka → `PageView` muncul dari domain aplikasi.
3. Buka `https://matrix.edifisia.com/?code=abc`: Pixel **tidak** boleh menyala selama `?code=` masih di URL.
4. Pindah beberapa halaman/rute di aplikasi: tiap rute satu `PageView`, tidak ganda.

## Prompt siap pakai (untuk Claude Code di repo aplikasi)

> Pasang Meta Pixel `1250093348350553` di aplikasi ini mengikuti panduan berikut (salin isi `docs/meta-pixel.md` dari
> repo edifisia-platform). Hanya produksi di `<domain aplikasi>`, URL harus bersih sebelum Pixel menyala, autoConfig mati,
> tanpa data pribadi, PageView per rute (SPA), `AppOpen` sekali per sesi, `Lead` saat tombol upgrade Premium. Sesuaikan
> dengan framework, CSP, dan service worker aplikasi ini, lalu uji di build produksi lokal.

---

## Penerapan di EDFS Civil Tools (repo ini)

Disesuaikan dari kode di atas (bukan disalin ke `index.html`), karena aplikasi ini React + Vite:

| Bagian | Lokasi |
|---|---|
| Logika Pixel (cek host produksi, URL bersih maks. 10 detik, autoConfig mati, PageView per rute, AppOpen per sesi) | `src/app/pixel.ts` — `setupPixel()` dengan lingkungan diinjeksi agar bisa diuji; `initPixel()` untuk peramban |
| Dipasang sekali sebelum render pertama (agar pembungkus `history` aktif sebelum router `src/app/router.ts`) | `src/main.tsx` |
| ID & host | `src/app/appInfo.ts` → `PIXEL_ID`, `PIXEL_HOST = 'tools.edifisia.com'`; hanya `import.meta.env.PROD` |
| `Lead` (`trackLead()`) | Tombol **Beli Premium** → `edifisia.com/harga?utm_source=civil-tools&utm_medium=app` (`pricingUrl`, `src/app/auth/config.ts`): di tab Detail terkunci untuk akun Free / Premium berakhir (`src/ui/ReportView.tsx`) dan di menu akun bila Premium tidak aktif (`src/ui/MenuBar.tsx`) |
| Uji | `src/app/pixel.test.ts` |

- `APP` = `civil-tools`. Parameter event hanya `{ app }` / `{ content_name: 'premium', app }` — tanpa email, id akun, atau
  input tool.
- **CSP:** aplikasi ini belum memakai header CSP (`web/public/_headers`). Bila kelak ditambahkan, sertakan domain di
  aturan 7.
- **Service worker:** Workbox `generateSW` tanpa `runtimeCaching` (hanya precache + fallback navigasi), jadi permintaan ke
  `connect.facebook.net` / `www.facebook.com` tidak diintersep. Jangan tambah runtime caching untuk domain itu
  (catatan di `vite.config.ts`).
- Build lama (`index.html` di akar repo, cPanel) tidak dipasangi Pixel.
