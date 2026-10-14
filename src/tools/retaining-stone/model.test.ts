import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/retaining-stone.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { basePressures } from '../_retaining/common'
import { buildStoneReport } from './report'
import { computeStone, rejectReason, STONE_DEFAULTS, validate, type StoneInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): StoneInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as StoneInput
}

describe('DPT batu kali — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeStone(STONE_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['opsi miring', 'lereng beta 15', 'opsi miring + lereng', 'tahanan pasif', 'e sedikit', 'tidak aman', 'resultan di luar', 'dinding guling', 'resultan ke arah heel', 'qall 0', 'kf tak valid', 'FS minimum kosong'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeStone(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi: lebar dasar ≥ puncak, β < φ, field kosong', () => {
    expect(validate({ ...STONE_DEFAULTS, bBot: '0.4' })).toEqual({ bBot: 'Harus ≥ lebar puncak' })
    expect(validate({ ...STONE_DEFAULTS, beta: '30' })).toEqual({ beta: 'Harus < φ urugan' })
    expect(validate({ ...STONE_DEFAULTS, H: '', gammaW: '0' })).toEqual({ H: 'Isi angka', gammaW: 'Harus > 0' })
    expect(rejectReason({ ...STONE_DEFAULTS, bBot: '0.4' })).toBeNull()
  })

  it('tekanan dasar sebenarnya: terbesar di heel bila e < 0 (qmax mesin keliru pada kasus ini)', () => {
    const r = computeStone({ ...STONE_DEFAULTS, H: '0.6', bTop: '0.25', bBot: '0.4', tf: '0.3', toe: '0', heel: '4', phi1: '40', beta: '25', q: '0' })!
    const bp = basePressures(r)
    expect(r.e!).toBeLessThan(0)
    expect(bp.max).toBeGreaterThan(r.qmax!)
    expect(bp.max).toBeCloseTo(Math.max(bp.toe, bp.heel), 12)
  })
})

describe('DPT batu kali — laporan', () => {
  it('rasio menentukan terisi; tabel berat memuat jumlahnya; satu gambar', () => {
    const rep = buildStoneReport(STONE_DEFAULTS)!
    expect(rep.governing!.ratio).toBeGreaterThan(0)
    const tbl = rep.sections.flatMap((s) => s.blocks).find((b) => b.k === 'table')
    const r = computeStone(STONE_DEFAULTS)!
    expect(tbl && tbl.k === 'table' ? tbl.rows.length : 0).toBe(r.parts!.length + 1)
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
  })
})
