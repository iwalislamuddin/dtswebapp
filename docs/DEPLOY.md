# Deploy Runbook — EDFS Civil Tools (cPanel)

Prosedur baku menaikkan rilis ke hosting produksi
**`https://tools.dtsengineering.co.id`** (subdomain di cPanel, document root =
folder subdomain, mis. `public_html/tools/` atau document root khusus subdomain).

Aplikasi ini **zero build** — semua HTML/CSS/JS murni. Deploy = menyalin berkas
publik apa adanya ke document root. Tidak ada `npm`/bundler.

---

## 0. Sebelum deploy — checklist bump versi

Saat menambah/mengubah tool, pastikan **empat titik versi** ini sudah naik
(biasanya sudah dilakukan di commit tool tsb.):

| Berkas | Yang dinaikkan |
|---|---|
| `sw.js` | `const CACHE = 'civil-tools-vNN'` — **wajib naik** tiap rilis, ini pemicu cache-busting SW |
| `sw.js` | tambahkan `modules/<id>/icon.svg` baru ke array `PRECACHE` |
| `index.html` | `<div class="modal-ver">v0.7.x …</div>` + satu blok catatan rilis baru |
| `core/module-registry.js` | entry tool baru (id, entry, seo, dst.) |
| `sitemap.xml` | satu `<url>` untuk tool `active` baru |

Verifikasi cepat konsistensi:
```bash
grep -n "const CACHE" sw.js
grep -n "modal-ver" index.html
```

---

## 1. Berkas yang di-upload (HANYA publik)

**Sertakan:**
```
index.html  sw.js  manifest.json  sitemap.xml  robots.txt  .htaccess
assets/  core/  modules/  favicon/
```

**JANGAN sertakan** (bukan aset runtime): `.git/`, `.claude/`, `.gitignore`,
`README.md`, `ARCHITECTURE.md`, `docs/`.

> `.htaccess` **wajib** ikut — dialah SPA fallback yang membuat deep-link
> `/beam-shear-torsion` & reload halaman tidak 404. Letaknya di **document root**
> subdomain.

---

## 2. Membuat paket zip

Zip harus memakai **pemisah path forward-slash** (`/`). `Compress-Archive`
bawaan Windows PowerShell 5.1 menulis backslash (`assets\shell.css`) yang bisa
salah diekstrak sebagai nama file literal di server Linux/cPanel. Gunakan skrip
.NET berikut (menghasilkan entri forward-slash), jalankan dari root repo:

```powershell
$src   = (Get-Location).Path
$stage = Join-Path $env:TEMP ("ct-stage-" + (Get-Date -Format "yyyyMMddHHmmss"))
New-Item -ItemType Directory $stage -Force | Out-Null
"index.html","sw.js","manifest.json","sitemap.xml","robots.txt",".htaccess" |
  ForEach-Object { Copy-Item (Join-Path $src $_) (Join-Path $stage $_) -Force }
"assets","core","modules","favicon" |
  ForEach-Object { Copy-Item (Join-Path $src $_) (Join-Path $stage $_) -Recurse -Force }

$zip = Join-Path $src "civil-tools-deploy.zip"
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$fs = [IO.File]::Open($zip,[IO.FileMode]::Create)
$ar = New-Object IO.Compression.ZipArchive($fs,[IO.Compression.ZipArchiveMode]::Create)
$base = $stage.TrimEnd('\') + '\'
Get-ChildItem $stage -Recurse -File -Force | ForEach-Object {
  $rel = $_.FullName.Substring($base.Length) -replace '\\','/'
  $e = $ar.CreateEntry($rel,[IO.Compression.CompressionLevel]::Optimal)
  $o = $e.Open(); $b = [IO.File]::ReadAllBytes($_.FullName)
  $o.Write($b,0,$b.Length); $o.Close()
}
$ar.Dispose(); $fs.Close()
Write-Host "OK -> $zip"
```

Cek isi zip sebelum upload (harus ada `.htaccess`, tanpa backslash):
```powershell
$z=[IO.Compression.ZipFile]::OpenRead($zip)
$n=$z.Entries.FullName; "$($n.Count) entri; backslash=$(($n|?{$_ -match '\\'}).Count); htaccess=$($n -contains '.htaccess')"
$z.Dispose()
```

---

## 3. Upload & ekstrak di cPanel

1. Login cPanel → **File Manager** → masuk ke **document root subdomain**
   `tools.dtsengineering.co.id` (bukan `public_html` domain utama).
2. **Upload** `civil-tools-deploy.zip` ke folder tsb.
3. Klik kanan zip → **Extract** → target = folder yang sama →
   **overwrite** semua (Yes to all). Ini menimpa berkas versi lama di tempat
   (nama file tidak ber-hash).
4. **Hapus** `civil-tools-deploy.zip` dari server setelah ekstrak.
5. Pastikan **File Manager menampilkan file tersembunyi** (Settings → Show Hidden
   Files) untuk memverifikasi `.htaccess` benar-benar ada di root.

> Alternatif: upload via FTP/SFTP (drag folder `assets/core/modules/favicon` +
> file root, overwrite). Zip lebih cepat & atomik untuk banyak file.

---

## 4. Verifikasi live (wajib)

```bash
# 1) SW cache version harus versi rilis ini
curl -s https://tools.dtsengineering.co.id/sw.js | grep "const CACHE"
#   -> const CACHE = 'civil-tools-v58'

# 2) SPA fallback: deep-link tool baru tidak 404 (harus balas 200 + HTML shell)
curl -s -o /dev/null -w "%{http_code}\n" https://tools.dtsengineering.co.id/beam-shear-torsion
#   -> 200
```

Di browser:
- Buka `https://tools.dtsengineering.co.id/beam-shear-torsion` langsung (deep-link) —
  tool tampil, bukan 404.
- Tool baru muncul di navigasi kiri (kategori **Beton Bertulang**).
- Modal **Tentang** menampilkan versi rilis & catatan rilis baru.
- Ganti input tulangan atas/bawah/samping → potongan penampang meng-update.

**PWA/SW update:** service worker versi baru meng-install di kunjungan berikut
dan mengambil alih; sering butuh **satu reload** (atau tutup semua tab lalu buka
lagi) agar shell versi baru aktif. Jika ragu: DevTools → Application → Service
Workers → *Update* / *Unregister*, atau hard-reload `Ctrl+Shift+R`.

---

## 5. Catatan

- **HTTP cache** diatur konservatif di `.htaccess` (`max-age=3600, must-revalidate`
  untuk aset; `no-cache` untuk `index.html`, `sw.js`, `manifest.json`), jadi bump
  `CACHE` di `sw.js` cukup untuk memaksa klien mengambil versi baru.
- **HTTPS paksa** opsional — blok redirect di `.htaccess` (baris `RewriteCond
  %{HTTPS} off`) bisa diaktifkan setelah SSL subdomain terpasang.
- Riwayat rilis app ada di modal **Tentang** (`index.html`). Rilis terakhir yang
  disiapkan: **v0.7.3 / SW civil-tools-v58 / 35 tool aktif**.
