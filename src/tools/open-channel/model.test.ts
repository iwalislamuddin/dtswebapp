import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/open-channel.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { CHANNEL_DEFAULTS, computeChannelUI, energyAt, manningQ, ratingCurve, rejectReason, sectionShape, validate, type ChannelUIInput } from './model'
import { buildChannelReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name === n)!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): ChannelUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as unknown as ChannelUIInput
}

describe('saluran terbuka — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeChannelUI(CHANNEL_DEFAULTS)!, byName('default trapesium dari y').output)).toEqual([])
  })

  it.each([
    'persegi', 'segitiga', 'lingkaran dari y', 'lingkaran y/D > 0,8', 'lingkaran y/D tepat di atas 0,8', 'trapesium dari Q',
    'persegi dari Q besar (hi diperluas)', 'lingkaran dari Q', 'superkritis (curam)', 'mendekati kritis', 'Fr antara 0,9 dan 0,95',
    'lambat, sedimentasi', 'material tanah', 'n kustom',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeChannelUI(ui)!, byName(name).output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('y 0'))).toEqual({ y: 'Harus > 0' })
    expect(validate(fromGolden('b 0'))).toEqual({ b: 'Harus > 0' })
    expect(validate(fromGolden('m 0 trapesium'))).toEqual({ m: 'Harus > 0' })
    expect(validate(fromGolden('D 0 lingkaran'))).toEqual({ D: 'Harus > 0' })
    expect(validate(fromGolden('Q 0'))).toEqual({ Q: 'Harus > 0' })
    expect(validate(fromGolden('S 0'))).toEqual({ S: 'Harus > 0' })
    expect(validate(fromGolden('n kustom kosong'))).toEqual({ nman: 'Harus > 0' })
    expect(Object.keys(validate(fromGolden('lingkaran y >= D')))).toEqual(['y'])
  })

  it('field tersembunyi tidak divalidasi', () => {
    expect(validate({ ...CHANNEL_DEFAULTS, D: '', Q: 'x', nman: '' })).toEqual({})
    expect(validate({ ...CHANNEL_DEFAULTS, shape: 'circle', b: '', m: '' })).toEqual({})
    expect(validate({ ...CHANNEL_DEFAULTS, shape: 'rect', m: '' })).toEqual({})
    expect(validate({ ...CHANNEL_DEFAULTS, shape: 'tri', b: '' })).toEqual({})
  })

  it('Q melampaui kapasitas gorong-gorong: lolos validasi, ditolak mesin dengan pesan', () => {
    const ui = fromGolden('lingkaran Q melebihi kapasitas')
    expect(validate(ui)).toEqual({})
    expect(computeChannelUI(ui)).toBeNull()
    expect(rejectReason(ui)).toBe((byName('lingkaran Q melebihi kapasitas').output as { warn: string[] }).warn[0])
    expect(rejectReason(CHANNEL_DEFAULTS)).toBeNull()
  })

  it('angka validasi HANDOFF: trapesium b 1, m 1,5, y 0,8 → A 1,76, P 3,884, V 1,435, Q 2,526, Fr 0,637, yc 0,634', () => {
    const r = computeChannelUI(CHANNEL_DEFAULTS)!
    expect(r.A).toBeCloseTo(1.76, 3)
    expect(r.P).toBeCloseTo(3.884, 3)
    expect(r.V).toBeCloseTo(1.435, 3)
    expect(r.Q).toBeCloseTo(2.526, 3)
    expect(r.Fr).toBeCloseTo(0.637, 3)
    expect(r.yc!).toBeCloseTo(0.634, 3)
  })

  it('kurva debit melewati titik hasil; energi spesifik minimum di yc', () => {
    for (const ui of [CHANNEL_DEFAULTS, fromGolden('lingkaran dari y'), fromGolden('segitiga')]) {
      const r = computeChannelUI(ui)!
      expect(manningQ(r, r.y)).toBeCloseTo(r.Q, 9)
      const c = ratingCurve(r)
      expect(c[0]).toEqual([0, 0])
      if (r.yc !== null) {
        const Ec = energyAt(r, r.yc)
        expect(energyAt(r, r.yc * 0.97)).toBeGreaterThan(Ec)
        expect(energyAt(r, r.yc * 1.03)).toBeGreaterThan(Ec)
      }
      expect(sectionShape(r).water.length).toBeGreaterThan(3)
    }
  })
})

describe('saluran terbuka — laporan', () => {
  it.each([
    ['default', CHANNEL_DEFAULTS],
    ['lingkaran', fromGolden('lingkaran dari y')],
    ['dari Q', fromGolden('trapesium dari Q')],
    ['segitiga', fromGolden('segitiga')],
    ['persegi', fromGolden('persegi')],
  ])('%s: nilai laporan sama dengan hasil hitung, dua gambar', (_n, ui) => {
    const r = computeChannelUI(ui)!
    const rep = buildChannelReport(ui)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['A']).toBe(r.A.toFixed(4))
    expect(v['P']).toBe(r.P.toFixed(4))
    expect(v['R']).toBe(r.R.toFixed(4))
    expect(v['V']).toBe(r.V.toFixed(3))
    expect(v['Fr']).toBe(r.Fr.toFixed(3))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
    expect(rep.warnings).toEqual(r.warn)
  })
})
