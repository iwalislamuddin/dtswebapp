// Bangun data peta gempa Beban Gempa dari berkas referensi Desain Spektra Indonesia (PUPR):
//   references (do not commit)/TABVAL.BIN       — grid 0,1° (bujur 94…142 × lintang −12…8), 6 float64 per titik:
//                                                PGA, Ss, S1, 0, 0, TL; urutan bujur luar, lintang dalam.
//   references (do not commit)/TabelKoordinat.csv — ibu kota provinsi/kabupaten/kecamatan (No., Nama, Keterangan, LON, LAT).
// Keluaran (dimuat malas oleh tool seismic-load):
//   src/tools/seismic-load/data/rsa-grid.bin.gz — gzip dari PGA[N], Ss[N], S1[N] (uint16 LE, ×1000) lalu TL[N] (uint8, s)
//   src/tools/seismic-load/data/places.csv      — "nama;jenis;bujur;lintang", jenis P/K/C (provinsi/kab-kota/kecamatan)
// Jalankan: node scripts/seismic/build-rsa.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ref = root + 'references (do not commit)/'
const out = root + 'src/tools/seismic-load/data/'
mkdirSync(out, { recursive: true })

const NX = 481, NY = 201, N = NX * NY
const raw = readFileSync(ref + 'TABVAL.BIN')
if (raw.length !== N * 48) throw new Error(`TABVAL.BIN: ukuran ${raw.length}, diharapkan ${N * 48}`)
const buf = Buffer.alloc(N * 7)
for (let k = 0; k < N; k++) {
  const at = (c) => raw.readDoubleLE(k * 48 + c * 8)
  const u16 = (v) => {
    const n = Math.round(v * 1000)
    if (n < 0 || n > 65535) throw new Error(`nilai di luar rentang: ${v}`)
    return n
  }
  buf.writeUInt16LE(u16(at(0)), k * 2)
  buf.writeUInt16LE(u16(at(1)), 2 * N + k * 2)
  buf.writeUInt16LE(u16(at(2)), 4 * N + k * 2)
  const tl = at(5)
  if (!Number.isInteger(tl) || tl < 0 || tl > 255) throw new Error(`TL tidak bulat: ${tl}`)
  buf.writeUInt8(tl, 6 * N + k)
}
const gz = gzipSync(buf, { level: 9 })
writeFileSync(out + 'rsa-grid.bin.gz', gz)

// Koordinat 34 ibu kota provinsi di TabelKoordinat.csv melenceng 20–45 km (mis. Bandung 107,37/−6,54, Palu
// 119,51/−0,53) — tidak cocok dengan entri kab./kota & kecamatan yang akurat maupun dengan sesar pada grid. Diganti
// koordinat pusat kota (± 1–2 km); entri kab./kota & kecamatan dipakai apa adanya.
const CAPITALS = {
  Pangkalpinang: [106.11, -2.13], Bandarlampung: [105.26, -5.43], 'Banda Aceh': [95.32, 5.55], Pekanbaru: [101.45, 0.51],
  Bengkulu: [102.26, -3.8], Palembang: [104.76, -2.98], Jambi: [103.61, -1.61], Padang: [100.36, -0.95], Medan: [98.67, 3.59],
  Tanjungpinang: [104.45, 0.92], Makassar: [119.42, -5.14], Kendari: [122.51, -3.97], Mamuju: [118.89, -2.68], Palu: [119.87, -0.9],
  Gorontalo: [123.06, 0.54], Manado: [124.84, 1.47], Pontianak: [109.34, -0.03], Palangkaraya: [113.92, -2.21],
  Banjarmasin: [114.59, -3.32], Tanjungselor: [117.37, 2.84], Samarinda: [117.15, -0.5], Denpasar: [115.22, -8.66],
  Kupang: [123.6, -10.18], Mataram: [116.11, -8.58], Serang: [106.15, -6.12], Yogyakarta: [110.37, -7.8], Jakarta: [106.83, -6.18],
  Bandung: [107.61, -6.91], Semarang: [110.42, -6.97], Surabaya: [112.75, -7.25], Ambon: [128.18, -3.7], Ternate: [127.38, 0.79],
  Manokwari: [134.06, -0.86], Jayapura: [140.72, -2.53],
}
const KIND = { 'Ibukota Provinsi': 'P', 'Ibukota Kabupaten/Kota': 'K', 'Ibukota Kecamatan': 'C' }
const lines = readFileSync(ref + 'TabelKoordinat.csv', 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
const places = lines.map((l) => {
  const [, name0, ket, lon0, lat0] = l.split(',')
  if (!KIND[ket]) throw new Error(`jenis tidak dikenal: ${ket}`)
  const name = name0.trim()
  let lon = Number(lon0), lat = Number(lat0)
  if (KIND[ket] === 'P') {
    if (!CAPITALS[name]) throw new Error(`ibu kota provinsi tanpa koordinat koreksi: ${name}`)
    ;[lon, lat] = CAPITALS[name]
  }
  return `${name};${KIND[ket]};${lon.toFixed(4)};${lat.toFixed(4)}`
})
writeFileSync(out + 'places.csv', places.join('\n') + '\n')
console.log(`grid ${buf.length} B → gzip ${gz.length} B; ${places.length} lokasi`)
