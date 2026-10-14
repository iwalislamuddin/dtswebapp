import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/cpt-bearing.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { KGCM2 } from '../../calc/shared/cpt'
import { computeCptBearingUI, CPT_BEARING_DEFAULTS, validate, type CptBearingUIInput } from './model'
import { buildCptBearingReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka + titik terurai) → input UI (teks + data tempel). */
function fromGolden(name: string): CptBearingUIInput {
  const [g, pts] = byName(name).args as [Record<string, string | number>, { z: number; qc: number }[]]
  const div = g.unit === 'mpa' ? 1000 : KGCM2
  const data = pts.map((p) => `${p.z} ${p.qc / div}`).join('\n')
  const out: Record<string, string> = { data }
  for (const [k, v] of Object.entries(g)) out[k] = String(v)
  return out as unknown as CptBearingUIInput
}

describe('daya dukung CPT — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeCptBearingUI(CPT_BEARING_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'pasir B > 1,2', 'pasir B tepat 1,2', 'pasir Kd dibatasi', 'qc dalam MPa', 'lempung','lempung Df/B dibatasi', 'lempung su negatif',
    'lempung Nk 0', 'lempung qc tinggi', 'pasir qc rendah', 'L < B', 'melampaui data terdalam', 'beban kerja aman', 'beban kerja melampaui',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeCptBearingUI(ui)!, byName(name).output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate({ ...CPT_BEARING_DEFAULTS, data: '' }).data).toMatch(/Tempel data/)
    expect(validate({ ...CPT_BEARING_DEFAULTS, data: 'abc\n# komentar' }).data).toMatch(/Tempel data/)
    expect(validate(fromGolden('B 0'))).toEqual({ B: 'Harus > 0' })
    expect(validate(fromGolden('Df negatif'))).toEqual({ Df: 'Tidak boleh negatif' })
    expect(computeCptBearingUI({ ...CPT_BEARING_DEFAULTS, data: '' })).toBeNull()
  })

  it('Nk & FS hanya divalidasi untuk lempung; L kosong = B', () => {
    expect(validate({ ...CPT_BEARING_DEFAULTS, Nk: 'x', FS: 'y' })).toEqual({})
    expect(validate({ ...CPT_BEARING_DEFAULTS, soil: 'clay', Nk: 'x' })).toEqual({ Nk: 'Isi angka' })
    expect(computeCptBearingUI({ ...CPT_BEARING_DEFAULTS, L: '' })!.L).toBe(1.5)
  })
})

describe('daya dukung CPT — laporan', () => {
  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computeCptBearingUI(CPT_BEARING_DEFAULTS)!
    const rep = buildCptBearingReport(CPT_BEARING_DEFAULTS)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['q_{a,net}']).toBe(r.qaNet.toFixed(1))
    expect(v['q_{a,bruto}']).toBe(r.qaGross.toFixed(1))
  })

  it('satu gambar; rasio D/C hanya bila q kerja diisi; lempung memakai su', () => {
    const rep = buildCptBearingReport(CPT_BEARING_DEFAULTS)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.governing).toBeUndefined()
    expect(buildCptBearingReport({ ...CPT_BEARING_DEFAULTS, qw: '50' })!.governing!.ratio).toBeGreaterThan(0)
    const clay = buildCptBearingReport({ ...CPT_BEARING_DEFAULTS, soil: 'clay' })!
    expect(clay.sections[1].title).toMatch(/Lempung/)
  })
})
