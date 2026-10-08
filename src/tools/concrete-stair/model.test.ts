import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/concrete-stair.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildStairReport } from './report'
import { computeStairUI, forceDiagram, rejectReason, STAIR_DEFAULTS, validate, type StairUIInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): StairUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as StairUIInput
}

describe('tangga beton — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeStairUI(STAIR_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['tanpa bordes', 'tanpa bordes atas', 'jepit-jepit', 'sendi-sendi', 'jepit-rol', 'panjang, beban besar', 'waist tebal', 'waist tipis', 'fc 40'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeStairUI(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi; L negatif ditolak di UI; rol-rol & d ≤ 0 → alasan', () => {
    expect(validate(fromGolden('L negatif'))).toEqual({ L1: 'Tidak boleh negatif' })
    expect(validate({ ...STAIR_DEFAULTS, R: '0' })).toEqual({ R: 'Harus > 0' })
    expect(rejectReason({ ...STAIR_DEFAULTS, supA: 'rol', supB: 'rol' })).toMatch(/tidak stabil/)
    expect(rejectReason(fromGolden('d <= 0'))).toMatch(/Tinggi efektif/)
  })

  it('diagram momen: ekstrem = Mpos hasil hitung', () => {
    const r = computeStairUI(STAIR_DEFAULTS)!
    const m = forceDiagram(r, 'Ms')
    expect(Math.max(...m.map((p) => p[1]))).toBeCloseTo(r.Mpos!, 9)
    expect(m.at(-1)![0]).toBeCloseTo(r.Ltot!, 9)
  })
})

describe('tangga beton — laporan', () => {
  it('reaksi seimbang; tabel batang sesuai jumlah elemen', () => {
    const r = computeStairUI(STAIR_DEFAULTS)!
    const rep = buildStairReport(STAIR_DEFAULTS)!
    expect(r.sumRy!).toBeCloseTo(r.Wu!, 6)
    const t = rep.sections[2].blocks.find((b) => b.k === 'table')
    expect(t?.k === 'table' && t.rows.length).toBe(r.elems!.length)
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })
})
