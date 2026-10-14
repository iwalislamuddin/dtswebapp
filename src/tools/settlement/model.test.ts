import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/settlement.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { computeSettlementUI, SETTLEMENT_DEFAULTS, validate, type SettlementUIInput } from './model'
import { buildSettlementReport, timeCurve } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): SettlementUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as SettlementUIInput
}

describe('penurunan fondasi — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeSettlementUI(SETTLEMENT_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'NC: sigc', 'OC tanpa', 'sigc < sig0', 'OCR 1,005', 'strip', 'lingkaran', 'persegi panjang', 'persegi panjang L<B', 'kaku', 'cv 0', 't 0',
    'drainase tunggal', 'U > 60%', 'U sangat kecil', 'U mendekati', 'tanpa lempung', 'lempung tak lengkap', 'sig0 0', 'puncak lempung',
    'mu 0,5', 'mu 0 ->', 'Hs 0', 'Hs < 2B', 'If 0,8',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const c = cases.find((x) => x.name === name) ?? byName(name)
    const ui = fromGolden(c.name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeSettlementUI(ui)!, c.output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('B 0'))).toEqual({ B: 'Harus > 0' })
    expect(validate(fromGolden('Df negatif'))).toEqual({ Df: 'Tidak boleh negatif' })
    expect(validate(fromGolden('q0 0'))).toEqual({ q0: 'Harus > 0' })
    expect(validate(fromGolden('Es 0'))).toEqual({ Es: 'Harus > 0' })
    expect(validate(fromGolden('persegi panjang L kosong'))).toEqual({ L: 'Harus > 0' })
    expect(validate(fromGolden('Cr negatif'))).toEqual({ Cr: 'Tidak boleh negatif' })
    expect(computeSettlementUI(fromGolden('B 0'))).toBeNull()
  })

  it('lempung & laju opsional: kosong tidak memblokir', () => {
    const kosong = { ...SETTLEMENT_DEFAULTS, mu: '', Hs: '', If: '', ztop: '', Hc: '', e0: '', Cc: '', Cr: '', sig0: '', sigc: '', cv: '', t: '' }
    expect(validate(kosong)).toEqual({})
    expect(computeSettlementUI(kosong)!.consol.active).toBe(false)
  })
})

describe('penurunan fondasi — laporan', () => {
  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computeSettlementUI(SETTLEMENT_DEFAULTS)!
    const rep = buildSettlementReport(SETTLEMENT_DEFAULTS)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['S_{e}']).toBe(r.Se.toFixed(2))
    expect(v['S_{total}']).toBe(r.Stotal.toFixed(2))
  })

  it('dua gambar bila ada laju; satu bila tanpa lempung', () => {
    const figs = (i: SettlementUIInput) => buildSettlementReport(i)!.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure').length
    expect(figs(SETTLEMENT_DEFAULTS)).toBe(2)
    expect(figs({ ...SETTLEMENT_DEFAULTS, Hc: '' })).toBe(1)
  })

  it('kurva waktu: mulai di Se, berakhir mendekati total, naik monoton', () => {
    const r = computeSettlementUI(SETTLEMENT_DEFAULTS)!
    const c = timeCurve(r)!
    expect(c.S[0]).toBeCloseTo(r.Se, 9)
    expect(c.S[c.S.length - 1]).toBeLessThanOrEqual(r.Stotal)
    expect(c.S[c.S.length - 1]).toBeGreaterThan(r.Se + 0.85 * r.Sc)
    for (let k = 1; k < c.S.length; k++) expect(c.S[k]).toBeGreaterThanOrEqual(c.S[k - 1])
  })
})
