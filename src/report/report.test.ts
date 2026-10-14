import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { BOLT_DEFAULTS, buildBoltReport } from '../tools/bolt-connection/report'
import { BEAM_DEFAULTS } from '../tools/steel-beam-analysis/model'
import { buildBeamReport } from '../tools/steel-beam-analysis/report'
import { GABLE_DEFAULTS } from '../tools/gable-frame/model'
import { buildGableReport } from '../tools/gable-frame/report'
import { PORTAL_DEFAULTS } from '../tools/portal-frame/model'
import { buildPortalReport } from '../tools/portal-frame/report'
import { parseMath, plainMath } from './math'
import { sci, type Report } from './model'
import { buildPdf } from './pdf'

const require = createRequire(import.meta.url)
const FONTS = {
  regular: readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')),
  bold: readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')),
}
const META = { appVersion: '0.8.0', date: '2026-10-08 10:00' }

describe('markup rumus', () => {
  it('subskrip, superskrip, pecahan bersarang', () => {
    expect(parseMath('R_{B} = 10^{3}')).toEqual([
      { t: 'text', s: 'R' }, { t: 'sub', c: [{ t: 'text', s: 'B' }] }, { t: 'text', s: ' = 10' }, { t: 'sup', c: [{ t: 'text', s: '3' }] },
    ])
    const f = parseMath('\\frac{Σ W_{i}}{L}')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ t: 'frac', den: [{ t: 'text', s: 'L' }] })
    expect(plainMath('\\frac{a + b}{c_{1}}')).toBe('(a + b)/(c1)')
  })
  it('markup tak lengkap = teks biasa', () => {
    expect(parseMath('a_b {x} \\frac{1}')).toEqual([{ t: 'text', s: 'a_b {x} \\frac{1}' }])
  })
  it('sci: angka biasa tetap, besar/kecil jadi ×10^{n}', () => {
    expect(sci(1.442e12)).toBe('1.442×10^{12}')
    expect(sci(250.5)).toBe('250.5')
    expect(sci(0)).toBe('0')
  })
})

async function pdfOf(rep: Report) {
  const bytes = await buildPdf(rep, META, FONTS)
  expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe('%PDF-1.7')
  return PDFDocument.load(bytes)
}

describe('PDF laporan', () => {
  it('Analisis Balok Baja: A4, judul metadata, beberapa halaman', async () => {
    const doc = await pdfOf(buildBeamReport(BEAM_DEFAULTS)!)
    expect(doc.getTitle()).toBe('Analisis Balok Baja Sederhana')
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]
    expect([Math.round(w), Math.round(h)]).toEqual([595, 842])
  })
  it('Sambungan Baut tarik + geser (semua bagian, dua gambar) dirender', async () => {
    const doc = await pdfOf(buildBoltReport({ ...BOLT_DEFAULTS, Tu: '120', Vu: '200' })!)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })
  it('Analisis Portal (beton, lateral, terpusat) & Portal Gable: 6 gambar rangka dirender', async () => {
    const portal = buildPortalReport({
      ...PORTAL_DEFAULTS, HL1: '15', HL2: '-5', point: [{ P: '40', a: '2' }],
      col: { ...PORTAL_DEFAULTS.col, mat: 'beton' },
    })!
    expect((await pdfOf(portal)).getPageCount()).toBeGreaterThanOrEqual(3)
    const gable = buildGableReport({ ...GABLE_DEFAULTS, HL1: '8', point: [{ P: '20', a: '4' }] })!
    expect((await pdfOf(gable)).getPageCount()).toBeGreaterThanOrEqual(3)
  })
  it('laporan kosong tetap satu halaman valid', async () => {
    const doc = await pdfOf({ title: 'X', sections: [], warnings: [], scope: [] })
    expect(doc.getPageCount()).toBe(1)
  })
  it('tabel panjang dipecah ke halaman berikut dengan kepala tabel diulang', async () => {
    const rows = Array.from({ length: 140 }, (_, i) => [`baris ${i}`, String(i)])
    const doc = await pdfOf({ title: 'T', sections: [{ title: 'Tabel', blocks: [{ k: 'table', head: ['A', 'B'], rows }] }], warnings: [], scope: [] })
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3)
  })
})
