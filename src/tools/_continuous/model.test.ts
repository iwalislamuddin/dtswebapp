import { describe, expect, it } from 'vitest'
import { BALOK_DEFAULTS, PELAT_DEFAULTS, computeCM, rejectReason, toCalcInput, validate, type CMUI } from './model'
import { buildCMReport } from './report'

describe('balok & pelat menerus — input UI', () => {
  it('input bawaan valid & terhitung untuk kedua tool', () => {
    expect(validate(PELAT_DEFAULTS, 'pelat')).toEqual({})
    expect(validate(BALOK_DEFAULTS, 'balok')).toEqual({})
    const p = computeCM(PELAT_DEFAULTS, 'pelat')!, b = computeCM(BALOK_DEFAULTS, 'balok')!
    expect(p.valid && b.valid).toBe(true)
    expect(p.defl?.valid).toBe(true)
    expect(b.kind).toBe('T')
    expect(b.des!.shear).toBeDefined()
    expect(p.des!.shear).toBeUndefined()
  })

  it('validasi per elemen: lebar tributari/hf wajib untuk T/L; n > 12 ditolak', () => {
    expect(validate({ ...PELAT_DEFAULTS, n: '15' }, 'pelat')).toEqual({ n: 'Maksimum 12' })
    expect(validate({ ...BALOK_DEFAULTS, bt: '0' }, 'balok')).toEqual({ bt: 'Harus > 0' })
    expect(validate({ ...BALOK_DEFAULTS, hf: '700' }, 'balok').hf).toMatch(/tinggi balok/)
    expect(validate({ ...BALOK_DEFAULTS, sect: 'persegi', bt: '0', hf: '0' }, 'balok')).toEqual({})
    expect(validate({ ...PELAT_DEFAULTS, sustL: '120' }, 'pelat')).toEqual({ sustL: 'Antara 0 dan 100' })
    expect(validate({ ...PELAT_DEFAULTS, design: 'tidak', fc: '' }, 'pelat')).toEqual({})
  })

  it('alasan penolakan: bentang bersih ≤ 0 & tinggi efektif ≤ 0', () => {
    expect(rejectReason({ ...PELAT_DEFAULTS, bsup: '5000' }, 'pelat')).toMatch(/Bentang bersih/)
    expect(rejectReason({ ...PELAT_DEFAULTS, h: '20' }, 'pelat')).toMatch(/Tinggi efektif/)
  })

  it('pelat tidak membawa data balok T/L ke mesin', () => {
    const c = toCalcInput({ ...PELAT_DEFAULTS, sect: 'T', bt: '3', hf: '120' } as CMUI, 'pelat')
    expect(c.sect).toBe('persegi')
    expect(c.bt).toBe(0)
  })

  it('syarat tak terpenuhi → solver otomatis; dipaksa koefisien → peringatan', () => {
    const r = computeCM({ ...PELAT_DEFAULTS, qLs: '20' }, 'pelat')!
    expect(r.metode).toBe('solver')
    expect(r.nPola!).toBeGreaterThan(3)
    const f = computeCM({ ...PELAT_DEFAULTS, qLs: '20', metode: 'koef' }, 'pelat')!
    expect(f.metode).toBe('koef')
    expect(f.warn.join(' ')).toMatch(/6\.5\.1/)
  })
})

describe('balok & pelat menerus — laporan', () => {
  it('semua bagian utama ada untuk balok T dengan solver + retak variabel', () => {
    const rep = buildCMReport({ ...BALOK_DEFAULTS, metode: 'solver', retak: 'variabel' }, 'balok')!
    const titles = rep.sections.map((s) => s.title)
    expect(titles.some((t) => t.startsWith('Penampang balok T'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Analisis elastis'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Geser balok'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Lendutan'))).toBe(true)
  })

  it('metode koefisien: tabel Tabel 6.5.2; satu bentang memakai statika; pelat tanpa bagian penampang T', () => {
    const k = buildCMReport({ ...PELAT_DEFAULTS, metode: 'koef' }, 'pelat')!
    expect(k.sections.some((s) => s.title.startsWith('Momen & geser terfaktor'))).toBe(true)
    expect(k.sections.some((s) => s.title.startsWith('Penampang balok'))).toBe(false)
    expect(buildCMReport({ ...PELAT_DEFAULTS, n: '1', tumpuan1: 'jj' }, 'pelat')!.sections.some((s) => s.title.includes('satu bentang'))).toBe(true)
  })

  it('tabel desain memuat satu baris per lokasi', () => {
    const r = computeCM(PELAT_DEFAULTS, 'pelat')!
    const rep = buildCMReport(PELAT_DEFAULTS, 'pelat')!
    const tables = rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'table') as { head: string[]; rows: string[][] }[]
    const design = tables.find((t) => t.head[1] === 'Sisi')!
    expect(design.rows.length).toBe(r.des!.items!.length)
  })
})
