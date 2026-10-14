import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/rational-method.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { computeRationalUI, idfCurve, mononobe, qByLand, RATIONAL_DEFAULTS, validate, type RationalUIInput } from './model'
import { buildRationalReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name === n)!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): RationalUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as unknown as RationalUIInput
}

describe('debit rasional — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeRationalUI(RATIONAL_DEFAULTS)!, byName('default Kirpich').output)).toEqual([])
  })

  it.each(['tc manual', 'C kustom', 'A > 80', 'A > 300', 'A tepat di atas 300', 'tc < 5 menit, lereng curam'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeRationalUI(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('Kirpich tanpa L'))).toEqual({ Lf: 'Harus > 0' })
    expect(validate(fromGolden('tc manual 0'))).toEqual({ tcMan: 'Harus > 0' })
    expect(validate(fromGolden('R24 0'))).toEqual({ R24: 'Harus > 0' })
    expect(validate({ ...RATIONAL_DEFAULTS, land: 'custom', C: '1.2' })).toEqual({ C: 'Antara 0 dan 1' })
    expect(computeRationalUI(fromGolden('R24 0'))).toBeNull()
  })

  it('field tersembunyi tidak divalidasi (C bila bukan Kustom, L/ΔH bila tc manual)', () => {
    expect(validate({ ...RATIONAL_DEFAULTS, C: '' })).toEqual({})
    expect(validate({ ...RATIONAL_DEFAULTS, tcMode: 'manual', Lf: '', dH: 'x' })).toEqual({})
    expect(validate({ ...RATIONAL_DEFAULTS, tcMan: '' })).toEqual({})
  })

  it('angka validasi HANDOFF: A 10, C 0,7, R24 120, L 800, ΔH 8 → tc 19,7 mnt, i 87,3, Q 1,699', () => {
    const r = computeRationalUI(RATIONAL_DEFAULTS)!
    expect(r.tcMin).toBeCloseTo(19.7, 1)
    expect(r.i).toBeCloseTo(87.3, 1)
    expect(r.Q).toBeCloseTo(1.699, 3)
  })

  it('kurva IDF memuat i(tc) dan debit per tutupan konsisten', () => {
    const r = computeRationalUI(RATIONAL_DEFAULTS)!
    expect(mononobe(r.R24, r.tcMin)).toBeCloseTo(r.i, 12)
    const c = idfCurve(r)
    expect(c[0][0]).toBe(5)
    expect(c[c.length - 1][0]).toBe(180)
    const lands = qByLand(r)
    expect(lands.filter((l) => l.used)).toHaveLength(1)
    expect(lands.find((l) => l.used)!.Q).toBeCloseTo(r.Q, 12)
    const custom = qByLand(computeRationalUI(fromGolden('C kustom'))!)
    expect(custom.find((l) => l.used)!.key).toBe('custom')
  })
})

describe('debit rasional — laporan', () => {
  it.each([
    ['default', RATIONAL_DEFAULTS],
    ['tc manual', fromGolden('tc manual')],
    ['C kustom', fromGolden('C kustom')],
  ])('%s: nilai laporan sama dengan hasil hitung', (_n, ui) => {
    const r = computeRationalUI(ui)!
    const rep = buildRationalReport(ui)!
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    const v = Object.fromEntries(steps.map((s) => [s.lhs, s.value]))
    expect(v['Q']).toBe(r.Q.toFixed(3))
    expect(v['i']).toBe(r.i.toFixed(2))
    expect(steps.find((s) => s.lhs === 't_{c}' && s.unit === 'menit')!.value).toBe(r.tcMin.toFixed(2))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.warnings).toEqual(r.warn)
  })
})
