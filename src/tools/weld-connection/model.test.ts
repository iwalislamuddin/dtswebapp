import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/weld-connection.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildWeldReport } from './report'
import { computeWeld, kdOf, toCalcInput, validate, WELD_DEFAULTS, type WeldInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): WeldInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const t = (k: string) => String(a[k])
  return {
    electrode: a.electrode as WeldInput['electrode'], Fexx: t('Fexx'), w: t('w'), Lw: t('Lw'), theta: t('theta'),
    useDir: a.useDir as WeldInput['useDir'], endLoaded: a.endLoaded as WeldInput['endLoaded'], t: t('t'), Fy: t('Fy'), Fu: t('Fu'), Ru: t('Ru'),
  }
}

describe('sambungan las — input UI', () => {
  it('input bawaan UI = kasus default golden (hasil identik build lama)', () => {
    expect(goldenDiff(computeWeld(WELD_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['E60', 'E80', 'kustom', 'transversal 90', '45 tanpa faktor arah', 'end-loaded Lw/w 150', 'end-loaded Lw/w > 300', 'logam dasar kosong', 'logam dasar menentukan', 'fraktur logam dasar', 'tanpa beban'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeWeld(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi per field; input tidak valid → tidak dihitung', () => {
    const bad: WeldInput = { ...WELD_DEFAULTS, w: '0', Lw: '', theta: '135', t: '-1' }
    expect(validate(bad)).toEqual({ w: 'Harus > 0', Lw: 'Isi angka', theta: 'Antara 0 dan 90°', t: 'Tidak boleh negatif' })
    expect(computeWeld(bad)).toBeNull()
    // FEXX hanya diperiksa untuk elektroda kustom (build lama: 0 → 482 diam-diam)
    expect(validate({ ...WELD_DEFAULTS, Fexx: '0' })).toEqual({})
    expect(validate({ ...WELD_DEFAULTS, electrode: 'custom', Fexx: '0' })).toEqual({ Fexx: 'Harus > 0' })
  })

  it('koma desimal; kd(θ) sama dengan mesin hitung', () => {
    expect(toCalcInput({ ...WELD_DEFAULTS, theta: '22,5' })).toMatchObject({ theta: 22.5 })
    expect(kdOf(90)).toBe(1.5)
    expect(kdOf(45)).toBeCloseTo(computeWeld({ ...WELD_DEFAULTS, theta: '45' })!.kd, 12)
  })
})

describe('sambungan las — laporan', () => {
  const steps = (rep: NonNullable<ReturnType<typeof buildWeldReport>>) =>
    rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('bawaan: bagian, langkah rumus konsisten dengan hasil hitung, dua gambar', () => {
    const rep = buildWeldReport(WELD_DEFAULTS)!
    const r = computeWeld(WELD_DEFAULTS)!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Data las & logam dasar', 'Geometri & batas ukuran las', 'Faktor arah & reduksi panjang', 'Kuat las (J2.4)',
      'Logam dasar (J4.2)', 'Kapasitas desain',
    ])
    const v = Object.fromEntries(steps(rep).map((s) => [s.lhs, s.value]))
    expect(v['t_{e}']).toBe(r.te.toFixed(2))
    expect(v['A_{we}']).toBe(r.Awe.toFixed(1))
    expect(v['k_{d}']).toBe(r.kd.toFixed(3))
    expect(v['R_{nw}']).toBe(r.Rnw.toFixed(2))
    expect(v['φR_{n,leleh}']).toBe(r.phiRyBase.toFixed(2))
    expect(v['φR_{n}']).toBe(r.phiRn.toFixed(2))
    expect(v['D/C']).toBe(r.dc.toFixed(3))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
    expect(rep.governing).toEqual({ label: 'D/C (las menentukan)', ratio: r.dc })
  })

  it('end-loaded Lw/w 150: langkah β (J2-1)', () => {
    const ui = fromGolden('end-loaded Lw/w 150')
    const v = Object.fromEntries(steps(buildWeldReport(ui)!).map((s) => [s.lhs, s.value]))
    expect(v['β']).toBe(computeWeld(ui)!.beta.toFixed(3))
  })

  it('logam dasar kosong & tanpa beban: bagian dilewati, tanpa D/C menentukan', () => {
    const rep = buildWeldReport(fromGolden('logam dasar kosong'))!
    expect(steps(rep).some((s) => s.lhs === 'A_{gv}')).toBe(false)
    expect(buildWeldReport(fromGolden('tanpa beban'))!.governing).toBeUndefined()
    expect(buildWeldReport({ ...WELD_DEFAULTS, w: '' })).toBeNull()
  })
})
