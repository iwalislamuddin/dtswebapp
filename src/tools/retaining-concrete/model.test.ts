import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/retaining-concrete.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildConcreteWallReport } from './report'
import { computeConcrete, rejectReason, structRatios, validate, WALL_DEFAULTS, type ConcreteWallUIInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): ConcreteWallUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as ConcreteWallUIInput
}

describe('DPT beton — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    const r = computeConcrete(WALL_DEFAULTS)!
    // quAt adalah fungsi (tidak ikut golden); sisanya identik
    expect(goldenDiff(r, byName('default').output)).toEqual([])
  })

  it.each(['opsi miring', 'lereng beta 15', 'tahanan pasif', 'tanpa toe', 'tanpa heel', 'stem prismatik', 'tinggi, tidak aman', 'resultan di luar', 'resultan ke arah heel', 'dinding guling', 'lereng curam', 'stem tipis', 'spasi < 50', 'fc 35', 'qall 0', 'kf tak valid', 'selimut kosong', 'FS minimum kosong'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeConcrete(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi', () => {
    expect(validate({ ...WALL_DEFAULTS, bBot: '0.2' })).toEqual({ bBot: 'Harus ≥ lebar puncak' })
    expect(validate({ ...WALL_DEFAULTS, fc: '0', gammaC: '' })).toEqual({ fc: 'Harus > 0', gammaC: 'Isi angka' })
    expect(rejectReason({ ...WALL_DEFAULTS, toe: '-0.1' })).toBeNull()
  })
})

describe('DPT beton — laporan', () => {
  it('semua bagian ada; dua gambar; tabel BOQ memuat jumlah besi', () => {
    const rep = buildConcreteWallReport(WALL_DEFAULTS)!
    const blocks = rep.sections.flatMap((s) => s.blocks)
    expect(blocks.filter((b) => b.k === 'figure')).toHaveLength(2)
    const r = computeConcrete(WALL_DEFAULTS)!
    const boq = blocks.filter((b) => b.k === 'table').pop()!
    expect(boq.k === 'table' && boq.rows.length).toBe(r.sets!.length + 1)
    expect(boq.k === 'table' && boq.rows[boq.rows.length - 1][3]).toBe(r.steelM!.toFixed(2))
  })

  it('stem tipis: rasio lentur tak hingga tidak merusak laporan; tanpa toe/heel dilewati', () => {
    const tipis = fromGolden('stem tipis')
    expect(buildConcreteWallReport(tipis)).not.toBeNull()
    const r = computeConcrete(fromGolden('tanpa toe'))!
    expect(structRatios(r).some((x) => x.label.includes('toe'))).toBe(false)
    expect(buildConcreteWallReport(fromGolden('tanpa heel'))).not.toBeNull()
  })

  it('langkah stem: Mu laporan = hasil hitung', () => {
    const r = computeConcrete(WALL_DEFAULTS)!
    const steps = buildConcreteWallReport(WALL_DEFAULTS)!.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'M_{u}')!.value).toBe(r.MuStem!.toFixed(2))
  })
})
