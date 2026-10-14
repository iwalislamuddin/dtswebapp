import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/lateral-broms.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { BROMS_DEFAULTS, computeBromsUI, validate, type BromsUIInput } from './model'
import { buildBromsReport, ultimatePressure } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): BromsUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as unknown as BromsUIInput
}

describe('lateral tiang Broms — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeBromsUI(BROMS_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'lempung bebas pendek', 'lempung jepit panjang', 'lempung jepit pendek', 'lempung jepit pendek, momen kepala > My', 'lempung dengan e',
    'pasir bebas panjang', 'pasir bebas pendek', 'pasir jepit panjang', 'pasir jepit pendek', 'pasir jepit pendek, momen kepala > My',
    'pasir dengan e, My besar (bisection melebar)',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const c = cases.find((x) => x.name === name)!
    const ui = fromGolden(c.name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeBromsUI(ui)!, c.output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('lempung L <= 1,5D'))).toEqual({ L: 'Harus > 1,5·D (zona reaksi nol di atas)' })
    expect(validate(fromGolden('lempung cu 0'))).toEqual({ cu: 'Harus > 0' })
    expect(validate(fromGolden('pasir phi 0'))).toEqual({ phi: 'Harus > 0' })
    expect(validate(fromGolden('pasir gam 0'))).toEqual({ gam: 'Harus > 0' })
    expect(validate(fromGolden('D 0'))).toEqual({ D: 'Harus > 0' })
    expect(validate(fromGolden('e negatif'))).toEqual({ e: 'Tidak boleh negatif' })
    expect(validate(fromGolden('My 0'))).toEqual({ My: 'Harus > 0' })
    expect(computeBromsUI(fromGolden('D 0'))).toBeNull()
  })

  it('field tanah yang tidak dipakai tidak divalidasi', () => {
    expect(validate({ ...BROMS_DEFAULTS, phi: '', gam: '' })).toEqual({})
    expect(validate({ ...BROMS_DEFAULTS, soil: 'sand', cu: '' })).toEqual({})
  })
})

describe('lateral tiang Broms — laporan', () => {
  it.each([
    ['lempung bebas', BROMS_DEFAULTS],
    ['lempung jepit', { ...BROMS_DEFAULTS, head: 'fixed' as const, L: '3', My: '5000' }],
    ['pasir bebas', { ...BROMS_DEFAULTS, soil: 'sand' as const }],
    ['pasir jepit', { ...BROMS_DEFAULTS, soil: 'sand' as const, head: 'fixed' as const, L: '2', My: '5000' }],
  ])('%s: nilai laporan sama dengan hasil hitung, satu gambar', (_n, ui) => {
    const r = computeBromsUI(ui)!
    const rep = buildBromsReport(ui)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['H_{u}']).toBe(r.Hu.toFixed(1))
    expect(v['M_{maks}']).toBe(r.Mmax.toFixed(1))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.governing!.ratio).toBeCloseTo(r.dcMom, 12)
  })

  it('tekanan batas: lempung nol di 0–1,5D lalu 9cuD; pasir bertambah linear', () => {
    const c = computeBromsUI(BROMS_DEFAULTS)!
    expect(ultimatePressure(c, 0.5 * c.D)).toBe(0)
    expect(ultimatePressure(c, 5)).toBeCloseTo(9 * 50 * 0.5, 9)
    const s = computeBromsUI({ ...BROMS_DEFAULTS, soil: 'sand' })!
    expect(ultimatePressure(s, 4) / ultimatePressure(s, 2)).toBeCloseTo(2, 9)
  })
})
