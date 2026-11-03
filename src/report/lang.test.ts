import { describe, expect, it } from 'vitest'
import { EN } from './en'
import { makeTranslator, mapReportText } from './lang'
import type { Report } from './model'

const tr = makeTranslator(EN)

const mods = import.meta.glob<{ default: { defaults: unknown; build: (i: unknown) => Report } }>('../tools/*/report.ts', { eager: true })

// Kata Indonesia yang lazim di laporan; muncul di teks hasil terjemahan = ada teks yang belum masuk kamus.
const INDO = new Set(
  (
    'dan atau yang untuk dengan tidak pada dari belum sudah harus lebih kurang tiap sebagai dipakai terhadap bila jika ' +
    'tanpa akibat beban tulangan balok kolom pelat tanah tiang sengkang lentur geser tekan tarik bentang tumpuan lapangan ' +
    'penampang kapasitas lendutan panjang tinggi lebar tebal jarak arah atas bawah kiri kanan muka ujung batang lapis ' +
    'selimut mutu berat gaya momen rasio nilai dihitung diabaikan menentukan maks izin perlu terpasang gempa angin dinding ' +
    'atap lantai pasir lempung tapak fondasi pondasi baut las baja beton kuat leleh tekuk sayap badan sisi titik garis ' +
    'gambar potongan denah elevasi hasil catatan jumlah luas spasi bersih kedalaman lapisan muka air'
  ).split(' '),
)

const leftovers = (s: string) => (s.replace(/_\{[^{}]*\}/g, '').match(/[A-Za-zÀ-ÿ]+/g) ?? []).filter((w) => INDO.has(w.toLowerCase()))

describe('terjemahan laporan (Inggris)', () => {
  it('templat: placeholder diterjemahkan ulang & boleh berpindah urutan', () => {
    const t = makeTranslator({ phrases: { 'Beban {0}: {1}': 'Load {1} ({0})', tekan: 'compression' }, subscripts: { maks: 'max' } })
    expect(t('Beban 2: tekan')).toBe('Load compression (2)')
    expect(t('M_{maks} = 3')).toBe('M_{max} = 3')
    expect(t('120 kN')).toBe('120 kN')
    // {n} sesudah _ / ^ = markup rumus, bukan placeholder
    const u = makeTranslator({ phrases: { 'Periode T_{0} = {0} s, A = {1} mm^{2}': 'Period T_{0} = {0} s, A = {1} mm^{2}' }, subscripts: {} })
    expect(u('Periode T_{0} = 0.158 s, A = 314 mm^{2}')).toBe('Period T_{0} = 0.158 s, A = 314 mm^{2}')
  })

  it('label PDF & ringkasan tool contoh', () => {
    const r = mods['../tools/bolt-connection/report.ts'].default
    const en = mapReportText(r.build(r.defaults), tr)
    expect(en.title).toBe('Bolted Connection (SNI 1729:2020 Sec. J3)')
  })

  it('laporan bawaan semua tool tidak menyisakan teks Indonesia', () => {
    const left: string[] = []
    for (const [p, m] of Object.entries(mods)) {
      if (!m.default?.build) continue
      mapReportText(m.default.build(m.default.defaults), (s) => {
        const out = tr(s)
        if (leftovers(out).length) left.push(`${p.replace(/^\.\.\/tools\//, '').replace('/report.ts', '')}: ${out}`)
        return out
      })
    }
    expect([...new Set(left)]).toEqual([])
  })
})
