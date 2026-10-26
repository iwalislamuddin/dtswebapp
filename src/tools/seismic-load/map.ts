import gridUrl from './data/rsa-grid.bin.gz?url'
import placesUrl from './data/places.csv?url'

// Peta gempa SNI 1726:2019 dari data Desain Spektra Indonesia (PUPR), dibangun oleh scripts/seismic/build-rsa.mjs:
// grid 0,1° bujur 94…142 × lintang −12…8 (indeks = i·NY + j, i bujur, j lintang), nilai PGA/Ss/S1 (g) dan TL (s).
// Dimuat malas saat pengguna mencari lokasi; nilai di antara titik grid diinterpolasi bilinear (TL: titik terdekat).

export const GRID = { lon0: 94, lat0: -12, step: 0.1, nx: 481, ny: 201 } as const

export interface Grid {
  pga: Uint16Array
  ss: Uint16Array
  s1: Uint16Array
  tl: Uint8Array
}

export interface MapValues {
  PGA: number
  Ss: number
  S1: number
  /** null bila peta TL tidak memberi nilai di lokasi ini. */
  TL: number | null
}

/** Uraikan data grid (sudah didekompresi). */
export function decodeGrid(buf: ArrayBuffer): Grid {
  const N = GRID.nx * GRID.ny
  if (buf.byteLength !== N * 7) throw new Error('Data peta gempa rusak')
  const dv = new DataView(buf)
  const u16 = (off: number) => {
    const a = new Uint16Array(N)
    for (let k = 0; k < N; k++) a[k] = dv.getUint16(off + 2 * k, true)
    return a
  }
  return { pga: u16(0), ss: u16(2 * N), s1: u16(4 * N), tl: new Uint8Array(buf, 6 * N, N) }
}

/** Nilai peta di (bujur, lintang); null di luar cakupan atau tanpa data. */
export function lookup(g: Grid, lon: number, lat: number): MapValues | null {
  const fx = Math.round(((lon - GRID.lon0) / GRID.step) * 1e6) / 1e6
  const fy = Math.round(((lat - GRID.lat0) / GRID.step) * 1e6) / 1e6
  if (!(fx >= 0 && fy >= 0 && fx <= GRID.nx - 1 && fy <= GRID.ny - 1)) return null
  const i0 = Math.min(Math.floor(fx), GRID.nx - 2), j0 = Math.min(Math.floor(fy), GRID.ny - 2)
  const tx = fx - i0, ty = fy - j0
  const at = (i: number, j: number) => i * GRID.ny + j
  const nodes = [
    { k: at(i0, j0), w: (1 - tx) * (1 - ty) },
    { k: at(i0 + 1, j0), w: tx * (1 - ty) },
    { k: at(i0, j0 + 1), w: (1 - tx) * ty },
    { k: at(i0 + 1, j0 + 1), w: tx * ty },
  ].filter((n) => g.ss[n.k] > 0)
  if (!nodes.length) return null
  const wsum = nodes.reduce((a, n) => a + n.w, 0)
  const avg = (a: Uint16Array) =>
    wsum > 1e-12 ? nodes.reduce((s, n) => s + a[n.k] * n.w, 0) / wsum / 1000 : a[nodes[0].k] / 1000
  const near = at(Math.round(fx), Math.round(fy))
  const tl = g.tl[near] || nodes.map((n) => g.tl[n.k]).find((v) => v > 0) || 0
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return { PGA: r3(avg(g.pga)), Ss: r3(avg(g.ss)), S1: r3(avg(g.s1)), TL: tl > 0 ? tl : null }
}

export interface Place {
  name: string
  /** P = ibu kota provinsi, K = ibu kota kabupaten/kota, C = ibu kota kecamatan. */
  kind: 'P' | 'K' | 'C'
  lon: number
  lat: number
}

export const PLACE_KIND: Record<Place['kind'], string> = { P: 'Ibu kota provinsi', K: 'Ibu kota kab./kota', C: 'Kecamatan' }

export function parsePlaces(text: string): Place[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [name, kind, lon, lat] = l.split(';')
      return { name, kind: kind as Place['kind'], lon: Number(lon), lat: Number(lat) }
    })
}

/** Cari lokasi: awalan nama didahulukan, lalu ibu kota provinsi → kab./kota → kecamatan. */
export function searchPlaces(places: Place[], q: string, max = 12): Place[] {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return []
  const rank = { P: 0, K: 1, C: 2 }
  return places
    .map((p) => ({ p, i: p.name.toLowerCase().indexOf(s) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => (a.i === 0 ? 0 : 1) - (b.i === 0 ? 0 : 1) || rank[a.p.kind] - rank[b.p.kind] || a.p.name.localeCompare(b.p.name))
    .slice(0, max)
    .map((x) => x.p)
}

/** Gzip (1f 8b) didekompresi di browser; data yang sudah didekompresi server dipakai apa adanya. */
async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf, 0, 2)
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

let gridP: Promise<Grid> | null = null
let placesP: Promise<Place[]> | null = null

export function loadGrid(): Promise<Grid> {
  gridP ??= fetch(gridUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(gunzip)
    .then(decodeGrid)
    .catch((e) => {
      gridP = null
      throw e
    })
  return gridP
}

export function loadPlaces(): Promise<Place[]> {
  placesP ??= fetch(placesUrl)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(parsePlaces)
    .catch((e) => {
      placesP = null
      throw e
    })
  return placesP
}
