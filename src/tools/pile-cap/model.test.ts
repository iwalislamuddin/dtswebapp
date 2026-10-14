import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/pile-cap.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildPileCapReport } from './report'
import { CAP_DEFAULTS, computePileCapUI, rejectReason, validate, type PileCapUIInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): PileCapUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as PileCapUIInput
}

describe('pile cap — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computePileCapUI(CAP_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['2 tiang', '3 tiang', '5 tiang', '6 tiang', 'momen biaksial', 'tiang tertarik', 'mode kapasitas', 'spasi kecil', 'kolom persegi panjang', 'poer tipis', 'fy < 420', '2 batang cukup', 'lentur tak layak', 'tulangan minimum menentukan', 'nilai select string'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computePileCapUI(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi bersyarat menurut mode; tebal terlalu kecil → alasan penolakan', () => {
    expect(validate({ ...CAP_DEFAULTS, Pu: '0', dp: '' })).toEqual({ Pu: 'Harus > 0', dp: 'Isi angka' })
    expect(validate({ ...CAP_DEFAULTS, mode: 'kapasitas', Pu: '', Q: '0' })).toEqual({ Q: 'Harus > 0' })
    expect(validate({ ...CAP_DEFAULTS, mode: 'kapasitas', Pu: '', Mux: '', Muy: '' })).toEqual({})
    const tipis = { ...CAP_DEFAULTS, h: '100' }
    expect(computePileCapUI(tipis)).toBeNull()
    expect(rejectReason(tipis)).toMatch(/Tebal poer/)
  })
})

describe('pile cap — laporan', () => {
  it('tabel reaksi memuat satu baris per tiang; satu gambar; rasio menentukan sama', () => {
    for (const name of ['default', '3 tiang', '6 tiang']) {
      const ui = fromGolden(name)
      const r = computePileCapUI(ui)!
      const rep = buildPileCapReport(ui)!
      const tbl = rep.sections.flatMap((s) => s.blocks).find((b) => b.k === 'table')
      expect(tbl && tbl.k === 'table' ? tbl.rows.length : 0).toBe(r.n)
      expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
      expect(rep.governing!.ratio).toBeCloseTo(r.gov!.dc, 12)
    }
  })

  it('mode kapasitas: langkah reaksi memakai Q', () => {
    const rep = buildPileCapReport(fromGolden('mode kapasitas'))!
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'R_{i}')!.expr).toBe('Q')
  })
})
