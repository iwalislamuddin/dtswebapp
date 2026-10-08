import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/continuous-beam.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildCBReport } from './report'
import { CB_DEFAULTS, coefLabels, computeCB, momentDiagram, rejectReason, validate, type CBInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): CBInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as CBInput
}

const UI_CASES = [
  'pelat 2 bentang', 'pelat 3 bentang', 'pelat ujung bebas', 'pelat ujung kolom', 'pelat opsi 1/12', 'pelat bentang <= 3', 'pelat beban hidup', 'pelat tebal',
  'pelat tak layak', 'balok 3 bentang', 'balok geser tinggi', 'balok geser kecil', 'balok Vu tepat', '1 bentang sendi', '1 bentang jepit-sendi', '1 bentang jepit-jepit',
  'tanpa desain', 'select sebagai teks',
]

describe('balok/pelat menerus — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeCB(CB_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(UI_CASES)('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeCB(ui)!, byName(name).output)).toEqual([])
  })

  it('validasi per elemen & mode; n > 12 ditolak di UI; bentang bersih ≤ 0 → alasan', () => {
    expect(validate({ ...CB_DEFAULTS, n: '15' })).toEqual({ n: 'Maksimum 12' })
    expect(validate({ ...CB_DEFAULTS, b: '', qDb: '', fyt: '' })).toEqual({})
    expect(validate({ ...CB_DEFAULTS, elem: 'balok', b: '0' })).toEqual({ b: 'Harus > 0' })
    expect(validate({ ...CB_DEFAULTS, design: 'tidak', fc: '' })).toEqual({})
    expect(computeCB(fromGolden('bentang bersih'))).toBeNull()
    expect(rejectReason(fromGolden('bentang bersih'))).toMatch(/Bentang bersih/)
    expect(rejectReason({ ...CB_DEFAULTS, h: '20' })).toMatch(/Tinggi efektif/)
  })

  it('koefisien & diagram momen: ekstrem = nilai koefisien', () => {
    const r = computeCB(CB_DEFAULTS)!
    expect(coefLabels(r)).toEqual({ sup: ['1/24', '1/10', '1/11', '1/10', '1/24'], span: ['1/14', '1/16', '1/16', '1/14'] })
    const m = momentDiagram(r)
    expect(Math.max(...m.map((p) => p[1]))).toBeCloseTo(r.MposMax!, 6)
    expect(Math.min(...m.map((p) => p[1]))).toBeCloseTo(-r.MnegMax!, 6)
  })
})

describe('balok/pelat menerus — laporan', () => {
  it('tabel momen & desain konsisten; balok punya bagian geser; satu bentang memakai statika', () => {
    const r = computeCB(CB_DEFAULTS)!
    const rep = buildCBReport(CB_DEFAULTS)!
    const tables = rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'table')
    expect(tables[0].k === 'table' && tables[0].rows[0][3]).toBe(r.MposEnd!.toFixed(2))
    expect(tables.at(-1)!.k === 'table' && (tables.at(-1) as { rows: string[][] }).rows.length).toBe(r.des!.items!.length)
    expect(buildCBReport(fromGolden('balok 3 bentang'))!.sections.some((s) => s.title.startsWith('Geser balok'))).toBe(true)
    expect(buildCBReport(fromGolden('1 bentang jepit-jepit'))!.sections.some((s) => s.title.includes('satu bentang'))).toBe(true)
  })
})
