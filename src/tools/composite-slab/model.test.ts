import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/composite-slab.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildCompReport } from './report'
import { COMP_DEFAULTS, computeComp, deckFields, validate, type CompInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): CompInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as CompInput
}

describe('slab komposit — input UI', () => {
  it('input bawaan UI (properti dek dari tabel) = kasus default golden', () => {
    expect(goldenDiff(computeComp(COMP_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['1 bentang', '3 bentang', 'topangan tengah', 'non-komposit', 'non-komposit 1', 'Smartdek', 'bentang panjang', 'konektor tulangan', 'D terlalu tipis', 'Mcap 0', 'fc 35'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeComp(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('properti dek dari tabel; validasi', () => {
    expect(deckFields('light', '1.0')).toMatchObject({ hr: '50', Ase: '1270', fyd: '450' })
    expect(validate({ ...COMP_DEFAULTS, L: '0', Mcap: '-1' })).toEqual({ L: 'Harus > 0', Mcap: 'Tidak boleh negatif' })
    expect(computeComp({ ...COMP_DEFAULTS, Ase: '' })).toBeNull()
  })
})

describe('slab komposit — laporan', () => {
  it('bagian & langkah utama konsisten dengan hasil hitung', () => {
    const r = computeComp(COMP_DEFAULTS)!
    const rep = buildCompReport(COMP_DEFAULTS)!
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    const v = (lhs: string) => steps.find((s) => s.lhs === lhs)?.value
    expect(v('M_{cu}')).toBe(r.McU!.toFixed(2))
    expect(v('φM_{n}^{+}')).toBe(r.phiMnPos!.toFixed(2))
    expect(v('Q_{n}')).toBe(r.Qn!.toFixed(2))
    expect(rep.sections.some((s) => s.title.startsWith('Momen negatif'))).toBe(true)
    expect(buildCompReport(fromGolden('1 bentang'))!.sections.some((s) => s.title.startsWith('Momen negatif'))).toBe(false)
    expect(buildCompReport(fromGolden('non-komposit'))!.sections.some((s) => s.title.includes('non-komposit'))).toBe(true)
  })
})
