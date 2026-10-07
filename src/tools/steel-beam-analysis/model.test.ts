import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/steel-beam-analysis.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildBeamReport } from './report'
import { BEAM_DEFAULTS, computeBeam, parseNum, toCalcInput, validate, type BeamInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

describe('analisis balok baja — input UI', () => {
  it('input bawaan UI = kasus default golden (WF 300×150, hasil identik build lama)', () => {
    expect(BEAM_DEFAULTS.psize).toBe('300×150×6.5×9')
    const o = computeBeam(BEAM_DEFAULTS)!
    expect(goldenDiff(o.r, byName('default').output)).toEqual([])
  })

  it('daftar beban → bentuk datar compute lama (3 patch + 4 titik)', () => {
    const c = byName('3 patch + 4 titik').args[0] as Record<string, number | string>
    const ui: BeamInput = {
      ...BEAM_DEFAULTS,
      dist: [1, 2, 3].map((k) => ({ w1: String(c[`d${k}_w1`]), w2: String(c[`d${k}_w2`]), a1: String(c[`d${k}_a1`]), a2: String(c[`d${k}_a2`]) })),
      point: [1, 2, 3, 4].map((k) => ({ P: String(c[`p${k}_P`]), a: String(c[`p${k}_a`]) })),
    }
    const o = computeBeam(ui)!
    expect(goldenDiff(o.r, byName('3 patch + 4 titik').output)).toEqual([])
    expect(toCalcInput(ui)).toMatchObject({ nd: 3, np: 4, d3_w2: 12, p3_P: -5 })
  })

  it('parseNum menerima koma desimal; kosong/teks → null', () => {
    expect(parseNum('1,5')).toBe(1.5)
    expect(parseNum(' -2.25 ')).toBe(-2.25)
    expect(parseNum('1e3')).toBe(1000)
    for (const s of ['', ' ', 'abc', '1.2.3', '1,2,3']) expect(parseNum(s)).toBeNull()
  })

  it('validasi per field; input tidak valid → tidak dihitung', () => {
    const bad: BeamInput = { ...BEAM_DEFAULTS, L: '0', cL: '-1', dist: [{ w1: '', w2: '5', a1: '0', a2: '6' }], point: [{ P: '10', a: '-1' }] }
    expect(validate(bad)).toEqual({ L: 'Harus > 0', cL: 'Tidak boleh negatif', 'dist.0.w1': 'Isi angka', 'point.0.a': 'Tidak boleh negatif' })
    expect(computeBeam(bad)).toBeNull()
    expect(validate({ ...BEAM_DEFAULTS, psize: 'xx' })).toEqual({ psize: 'Pilih ukuran profil' })
  })

  it('tanpa beban & tanpa berat sendiri → hasil tidak valid (noload), tanpa laporan', () => {
    const none: BeamInput = { ...BEAM_DEFAULTS, self: 'tidak', dist: [], point: [] }
    expect(computeBeam(none)!.r).toMatchObject({ valid: false, noload: true })
    expect(buildBeamReport(none)).toBeNull()
  })

  it('laporan: bagian, gambar diagram, nilai hasil', () => {
    const rep = buildBeamReport(BEAM_DEFAULTS)!
    expect(rep.sections.map((s) => s.title)).toEqual(['Data input', 'Beban', 'Reaksi', 'Hasil'])
    expect(rep.sections[1].blocks.some((b) => b.k === 'figure')).toBe(true)
    const r = computeBeam(BEAM_DEFAULTS)!.r
    const rows = rep.sections[3].blocks[0]
    expect(rows.k === 'rows' && rows.rows[0]).toMatchObject({ value: `${r.Mmax!.toFixed(2)} kN·m` })
  })
})
