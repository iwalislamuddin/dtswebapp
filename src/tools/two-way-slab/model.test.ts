import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/two-way-slab.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildSlabReport } from './report'
import { computeSlab, rejectReason, SLAB_DEFAULTS, validate, type SlabInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): SlabInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as SlabInput
}

describe('pelat dua arah — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeSlab(SLAB_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['sendi-sendi', 'jepit-sendi', 'campuran', 'Ly < Lx', 'Ly/Lx > 2', 'beban 1,4D', 'bentang besar', 'pelat tipis', 'fc 40', 'nilai string'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeSlab(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi; tinggi efektif ≤ 0 → alasan', () => {
    expect(validate({ ...SLAB_DEFAULTS, Lx: '0', qLL: '-1' })).toEqual({ Lx: 'Harus > 0', qLL: 'Tidak boleh negatif' })
    const tipis = fromGolden('tinggi efektif')
    expect(computeSlab(tipis)).toBeNull()
    expect(rejectReason(tipis)).toMatch(/Tinggi efektif/)
  })
})

describe('pelat dua arah — laporan', () => {
  it('momen tabel & lendutan konsisten dengan hasil hitung; jalur tepi ikut ditabelkan', () => {
    const r = computeSlab(SLAB_DEFAULTS)!
    const rep = buildSlabReport(SLAB_DEFAULTS)!
    const mt = rep.sections[3].blocks.find((b) => b.k === 'table')
    expect(mt?.k === 'table' && mt.rows[0][5]).toBe(r.mX!.Mpos.toFixed(2))
    const dt = rep.sections[4].blocks.find((b) => b.k === 'table')
    expect(dt?.k === 'table' && dt.rows.length).toBe(8) // jepit-jepit: lapangan + tumpuan × 2 arah × 2 jalur
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'δ_{x}')!.value).toBe(r.dX!.toFixed(2))
    expect(steps.find((s) => s.lhs === 'w_{u}')!.value).toBe(r.wu!.toFixed(2))
  })
})
