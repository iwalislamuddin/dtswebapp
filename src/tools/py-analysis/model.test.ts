import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/py-analysis.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { computePyUI, PY_DEFAULTS, pyProfile, validate, type PyUIInput } from './model'
import { buildPyReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): PyUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as unknown as PyUIInput
}

describe('analisis p-y — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computePyUI(PY_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['lempung jepit', 'lempung dengan M & e', 'lempung beban besar', 'lempung tiang pendek', 'pasir bebas', 'pasir jepit', 'pasir phi 40', 'pasir tiang kecil'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computePyUI(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('H 0'))).toEqual({ H: 'Harus > 0' })
    expect(validate(fromGolden('lempung eps50 0'))).toEqual({ eps50: 'Harus > 0' })
    expect(validate(fromGolden('pasir kpy 0'))).toEqual({ kpy: 'Harus > 0' })
    expect(validate(fromGolden('D 0'))).toEqual({ D: 'Harus > 0' })
    expect(computePyUI(fromGolden('H 0'))).toBeNull()
  })

  it('field tanah & momen yang tidak dipakai tidak divalidasi', () => {
    expect(validate({ ...PY_DEFAULTS, phi: '', kpy: '' })).toEqual({})
    expect(validate({ ...PY_DEFAULTS, soil: 'sand', cu: '', eps50: '' })).toEqual({})
    expect(validate({ ...PY_DEFAULTS, head: 'fixed', M: '' })).toEqual({})
    expect(validate({ ...PY_DEFAULTS, M: '' })).toEqual({ M: 'Isi angka' })
  })
})

describe('analisis p-y — profil & laporan', () => {
  it('profil: 61 node, ujung momen 0, kepala = hasil', () => {
    const r = computePyUI(PY_DEFAULTS)!
    const pr = pyProfile(r)
    expect(pr.z).toHaveLength(61)
    expect(pr.z[60]).toBeCloseTo(r.L, 9)
    expect(pr.M[60]).toBe(0)
    expect(pr.y[0]).toBeCloseTo(r.y0, 9)
  })

  it.each([
    ['lempung bebas', PY_DEFAULTS],
    ['pasir jepit', { ...PY_DEFAULTS, soil: 'sand' as const, head: 'fixed' as const }],
  ])('%s: nilai laporan sama dengan hasil hitung, dua gambar', (_n, ui) => {
    const r = computePyUI(ui)!
    const rep = buildPyReport(ui)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['y_{0}']).toBe(r.y0.toFixed(2))
    expect(v['M_{maks}']).toBe(r.Mmax.toFixed(1))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })
})
