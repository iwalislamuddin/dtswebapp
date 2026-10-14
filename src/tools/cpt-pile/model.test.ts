import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/cpt-pile.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { KGCM2 } from '../../calc/shared/cpt'
import { computeCptPileUI, CPT_PILE_DEFAULTS, shaftProfile, validate, type CptPileUIInput } from './model'
import { buildCptPileReport } from './report'

const cases = (golden as GoldenCase[]).filter((c) => c.fn === 'compute')
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka + titik terurai) → input UI (teks + data tempel z qc [fs]). */
function fromGolden(name: string): CptPileUIInput {
  const [g, pts] = byName(name).args as [Record<string, string | number>, { z: number; qc: number; fs: number | null }[]]
  const kg = g.unit !== 'mpa'
  const data = pts.map((p) => [p.z, p.qc / (kg ? KGCM2 : 1000), ...(p.fs == null ? [] : [p.fs / (kg ? KGCM2 : 1)])].join(' ')).join('\n')
  const out: Record<string, string> = { data }
  for (const [k, v] of Object.entries(g)) out[k] = String(v)
  return out as unknown as CptPileUIInput
}

describe('daya dukung tiang CPT — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeCptPileUI(CPT_PILE_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['persegi', 'selimut dari Rf', 'fs tidak ada', 'Rf 0', 'fs dibatasi', 'qp sangat tinggi', 'tiang pendek', 'ujung di bawah data', 'FS 0', 'beban kerja aman', 'beban kerja melampaui'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeCptPileUI(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('D 0'))).toEqual({ D: 'Harus > 0' })
    expect(validate(fromGolden('L 0'))).toEqual({ Lp: 'Harus > 0' })
    expect(validate({ ...CPT_PILE_DEFAULTS, data: '' }).data).toMatch(/Tempel data/)
    expect(computeCptPileUI({ ...CPT_PILE_DEFAULTS, data: '' })).toBeNull()
  })

  it('Rf hanya divalidasi bila dipakai (fsrc rf atau data tanpa fs)', () => {
    expect(validate({ ...CPT_PILE_DEFAULTS, Rf: 'x' })).toEqual({})
    expect(validate({ ...CPT_PILE_DEFAULTS, fsrc: 'rf', Rf: 'x' })).toEqual({ Rf: 'Isi angka' })
    expect(validate({ ...CPT_PILE_DEFAULTS, data: '0 5\n10 100', Rf: 'x' })).toEqual({ Rf: 'Isi angka' })
  })

  it('profil fs terpakai dibatasi 120 kPa dan menjumlah ke Qs', () => {
    const r = computeCptPileUI(fromGolden('fs dibatasi'))!
    const prof = shaftProfile(r, 200)
    expect(Math.max(...prof.map((p) => p.fs))).toBeLessThanOrEqual(120)
    const Qs = prof.reduce((s, p) => s + p.fs * r.K * (r.Lp / 200), 0)
    expect(Qs).toBeCloseTo(r.Qs, 6)
  })
})

describe('daya dukung tiang CPT — laporan', () => {
  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computeCptPileUI(CPT_PILE_DEFAULTS)!
    const rep = buildCptPileReport(CPT_PILE_DEFAULTS)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['Q_{u}']).toBe(r.Qu.toFixed(1))
    expect(v['Q_{izin}']).toBe(r.Qall.toFixed(1))
  })

  it('satu gambar; rasio D/C hanya bila beban kerja diisi', () => {
    const rep = buildCptPileReport(CPT_PILE_DEFAULTS)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.governing).toBeUndefined()
    expect(buildCptPileReport({ ...CPT_PILE_DEFAULTS, Pw: '200' })!.governing!.ratio).toBeGreaterThan(0)
  })
})
