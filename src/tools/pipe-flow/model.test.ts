import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/pipe-flow.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { computePipeUI, moodyCurve, PIPE_DEFAULTS, systemCurve, validate, type PipeUIInput } from './model'
import { buildPipeReport, gradeLines } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name === n)!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): PipeUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) as unknown as PipeUIInput
}

describe('aliran pipa — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computePipeUI(PIPE_DEFAULTS)!, byName('default PVC').output)).toEqual([])
  })

  it.each([
    'laminar', 'transisi', 'laminar dekat batas (Re 2000-2300)', 'baja lama, cepat', 'beton besar', 'material kustom',
    'kustom eps besar (di luar Swamee-Jain)', 'lambat',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computePipeUI(ui)!, byName(name).output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('D 0'))).toEqual({ D: 'Harus > 0' })
    expect(validate(fromGolden('kustom C 0'))).toEqual({ C: 'Harus > 0' })
    expect(validate(fromGolden('nu kosong -> 1,004'))).toEqual({ nu: 'Harus > 0' })
    expect(validate({ ...PIPE_DEFAULTS, sumK: '-1' })).toEqual({ sumK: 'Tidak boleh negatif' })
    expect(computePipeUI(fromGolden('D 0'))).toBeNull()
  })

  it('field tersembunyi tidak divalidasi (ε, C bila bukan Kustom)', () => {
    expect(validate({ ...PIPE_DEFAULTS, eps: '', C: 'x' })).toEqual({})
  })

  it('angka validasi HANDOFF: Ø100, L 200, Q 10 L/s PVC → V 1,273, f 0,01711, hf 2,83, HW 2,92 (+3,2%)', () => {
    const r = computePipeUI(PIPE_DEFAULTS)!
    expect(r.V).toBeCloseTo(1.273, 3)
    expect(r.Re).toBeCloseTo(1.27e5, -3)
    expect(r.f).toBeCloseTo(0.01711, 5)
    expect(r.hf).toBeCloseTo(2.83, 2)
    expect(r.hfHW).toBeCloseTo(2.92, 2)
    expect(r.diffHW).toBeCloseTo(3.2, 1)
  })

  it('kurva sistem & Moody melewati titik hasil; garis energi turun sebesar h total', () => {
    const r = computePipeUI(PIPE_DEFAULTS)!
    const s = systemCurve(r)
    expect(s.Q[20]).toBeCloseTo(10, 9)
    expect(s.hTot[20]).toBeCloseTo(r.hTot, 9)
    expect(s.hw[20]).toBeCloseTo(r.hfHW, 9)
    const m = moodyCurve(r)
    expect(m.Re[0]).toBeCloseTo(1000, 6)
    expect(m.f[0]).toBeCloseTo(0.064, 9) // laminar 64/Re
    expect(m.smooth.every((f, k) => f <= m.f[k] + 1e-12)).toBe(true)
    const gl = gradeLines(r)
    expect(gl.egl[0][1] - gl.egl[2][1]).toBeCloseTo(r.hTot, 12)
    expect(gl.hgl[2][1]).toBe(0)
  })
})

describe('aliran pipa — laporan', () => {
  it.each([
    ['default', PIPE_DEFAULTS],
    ['laminar', fromGolden('laminar')],
    ['kustom', fromGolden('material kustom')],
  ])('%s: nilai laporan sama dengan hasil hitung, satu gambar', (_n, ui) => {
    const r = computePipeUI(ui)!
    const rep = buildPipeReport(ui)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['V']).toBe(r.V.toFixed(3))
    expect(v['f']).toBe(r.f.toFixed(5))
    expect(v['h_{f}']).toBe(r.hf.toFixed(3))
    expect(v['h']).toBe(r.hTot.toFixed(3))
    expect(v['h_{f,HW}']).toBe(r.hfHW.toFixed(3))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.warnings).toEqual(r.warn)
  })
})
