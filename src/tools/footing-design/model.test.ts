import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/footing-design.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildFootingReport } from './report'
import { computeFootingUI, FOOTING_DEFAULTS, rejectReason, validate, type FootingUIInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): FootingUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as FootingUIInput
}

describe('pondasi tapak — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeFootingUI(FOOTING_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['tanpa momen', 'uplift', 'daya dukung terlampaui', 'guling & geser', 'fc > 28', 'tulangan minimum', 'kolom pipih', 'persegi panjang', 'Df < tf', 'LF, gc, gs kosong'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      const e = validate(ui)
      expect(e).toEqual({})
      expect(goldenDiff(computeFootingUI(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi; tinggi efektif ≤ 0 dilaporkan sebagai alasan penolakan', () => {
    expect(validate({ ...FOOTING_DEFAULTS, P: '0', L: '' })).toEqual({ P: 'Harus > 0', L: 'Isi angka' })
    expect(validate({ ...FOOTING_DEFAULTS, LF: '', gc: '', gs: '' })).toEqual({})
    const tipis = { ...FOOTING_DEFAULTS, tf: '60' }
    expect(computeFootingUI(tipis)).toBeNull()
    expect(rejectReason(tipis)).toMatch(/Tinggi efektif/)
  })
})

describe('pondasi tapak — laporan', () => {
  const steps = (i: FootingUIInput) => buildFootingReport(i)!.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computeFootingUI(FOOTING_DEFAULTS)!
    const v = Object.fromEntries(steps(FOOTING_DEFAULTS).map((s) => [s.lhs, s.value]))
    expect(v['N']).toBe(r.N!.toFixed(1))
    expect(v['P_{u}']).toBe(r.Pu!.toFixed(1))
    expect(v['φV_{c}'] ?? '').toBeDefined()
  })

  it('dua gambar; rasio menentukan terisi', () => {
    const rep = buildFootingReport(FOOTING_DEFAULTS)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
    expect(rep.governing!.ratio).toBeGreaterThan(0)
  })
})
