import { describe, expect, it } from 'vitest'
import { computeBoltConnection } from '../calc/bolt-connection'
import boltModule, { BOLT_DEFAULTS, boltReport } from '../tools/bolt-connection/report'
import { buildPdf, paginate, PER_PAGE } from './pdf'
import { leader, reportLines, reportText, RW, toAscii, wrap, type Line } from './text'
import type { Report } from './model'

const META = { appVersion: '0.8.0', date: '2026-10-07 21:00' }

describe('teks laporan', () => {
  it('toAscii: simbol teknik terbaca, sisa non-ASCII → ?', () => {
    expect(toAscii('φRn = 0,75·Fnv·Ab ≤ 2,4·d·t·Fu')).toBe('phiRn = 0,75*Fnv*Ab <= 2,4*d*t*Fu')
    expect(toAscii('Ab 314 mm² — ψed λ √f′c θ 45°')).toBe("Ab 314 mm2 - psied lambda sqrtf'c theta 45 deg")
    expect(toAscii('Σxi² 1,5·hef ε₅₀ ×')).toBe('sumxi2 1,5*hef eps50 x')
    expect(toAscii('Ø 中')).toBe('? ?')
  })
  it('leader selebar RW, minimal dua titik', () => {
    expect(leader('Label', 'nilai')).toHaveLength(RW + 1)
    expect(leader('x'.repeat(80), 'y')).toContain(' .. y')
  })
  it('wrap memecah di batas RW dengan indentasi lanjutan', () => {
    const lines = wrap('- ' + 'kata '.repeat(40).trim())
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(RW + 1)
    expect(lines[1].startsWith('    ')).toBe(true)
  })
})

describe('laporan sambungan baut', () => {
  const report = boltReport(computeBoltConnection(BOLT_DEFAULTS))
  const lines = reportLines(report, META)
  const text = lines.filter((l): l is string => typeof l === 'string')

  it('kepala, bagian, cek D/C, kaki laporan', () => {
    expect(text).toContain(' ' + '='.repeat(RW))
    expect(text.some((l) => l.includes('SAMBUNGAN BAUT (SNI 1729:2020 PS. J3)'))).toBe(true)
    expect(text.some((l) => l.includes('DFBK, bearing-type') && l.endsWith('2026-10-07 21:00'))).toBe(true)
    expect(text.find((l) => l.includes('>> D/C geser grup'))).toMatch(/\.\. 0\.43 OK$/)
    expect(text.find((l) => l.includes('>> D/C MENENTUKAN (GESER)'))).toMatch(/0\.43 OK$/)
    expect(text.some((l) => l.includes('EDFS Civil Tools v0.8.0'))).toBe(true)
    expect(lines.some((l) => typeof l === 'object')).toBe(true) // gambar pola baut
  })
  it('semua baris ASCII dan tidak melebihi lebar', () => {
    for (const l of text) {
      expect(l).toMatch(/^[\x20-\x7E]*$/)
      expect(l.length).toBeLessThanOrEqual(RW + 1)
    }
  })
  it('bagian tarik hanya bila Tu > 0; catatan dari warn', () => {
    expect(report.sections.some((s) => s.title.startsWith('Tarik'))).toBe(false)
    const r2 = boltReport(computeBoltConnection({ ...BOLT_DEFAULTS, Vu: 300, Tu: 300, s: 50 }))
    expect(r2.sections.some((s) => s.title.startsWith('Tarik'))).toBe(true)
    expect(reportText(r2, META)).toContain('CATATAN')
  })
  it('.txt: CRLF, gambar diganti teks alt', () => {
    const t = reportText(report, META)
    expect(t).toContain('\r\n')
    expect(t).toContain('[Gbr. 1 Denah pola baut & kapasitas - lihat versi PDF]')
  })
  it('modul laporan registry = input bawaan + build', () => {
    expect(boltModule.build(boltModule.defaults)).toEqual(report)
  })
})

/** Periksa struktur PDF: tiap offset xref menunjuk "n 0 obj", startxref ke "xref", Length = panjang stream. */
function checkPdf(pdf: string) {
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
  expect(pdf.endsWith('%%EOF')).toBe(true)
  expect([...pdf].every((c) => c.charCodeAt(0) < 128)).toBe(true) // ASCII: offset xref = byte
  const startxref = Number(/startxref\n(\d+)\n%%EOF$/.exec(pdf)![1])
  expect(pdf.slice(startxref, startxref + 4)).toBe('xref')
  const [, count] = /xref\n0 (\d+)\n/.exec(pdf.slice(startxref))!.map(Number)
  const entries = pdf.slice(startxref).split('\n').slice(3, 2 + count)
  entries.forEach((e, i) => {
    const off = Number(e.slice(0, 10))
    expect(pdf.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
  })
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index! + m[0].length
    expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + '\nendstream'.length)).toBe('\nendstream')
  }
  return count
}

describe('PDF', () => {
  it('laporan baut: struktur valid, jumlah halaman = paginasi, ada gambar', () => {
    const lines = reportLines(boltReport(computeBoltConnection(BOLT_DEFAULTS)), META)
    const pdf = buildPdf(lines, 'Sambungan Baut')
    expect(checkPdf(pdf)).toBe(5 + 2 * paginate(lines).length)
    expect(pdf).toContain(`/Count ${paginate(lines).length}`)
    expect(pdf).toContain(' re f\n') // batang kapasitas terisi
    expect(pdf).toContain('/Title (Sambungan Baut)')
  })
  it('paginasi: teks panjang pecah halaman; gambar tidak dibelah', () => {
    const many: Line[] = Array.from({ length: PER_PAGE * 2 + 5 }, (_, i) => ` baris ${i}`)
    expect(paginate(many)).toHaveLength(3)
    const fig = { fig: { h: 20, ops: [], alt: '' } }
    const withFig: Line[] = [...many.slice(0, PER_PAGE - 5), fig]
    const pages = paginate(withFig)
    expect(pages).toHaveLength(2)
    expect(pages[1][0].item).toBe(fig)
    checkPdf(buildPdf(many))
  })
  it('karakter khusus PDF di-escape', () => {
    const pdf = buildPdf([' a (b) \\ c'])
    expect(pdf).toContain('(a \\(b\\) \\\\ c)'.replace('(a', '( a'))
    checkPdf(pdf)
  })
  it('laporan kosong tetap satu halaman valid', () => {
    const empty: Report = { title: 'X', method: 'm', sections: [], warnings: [], scope: [] }
    checkPdf(buildPdf(reportLines(empty, META)))
    expect(paginate([])).toHaveLength(1)
  })
})
