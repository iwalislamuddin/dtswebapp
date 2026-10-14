import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/gable-frame.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { sectionFromFields } from '../_frame/section'
import { computeGableUI, GABLE_DEFAULTS, gableView, toCalcInput, validate, type GableUIInput } from './model'
import { buildGableReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name === n) ?? cases.find((c) => c.name.startsWith(n))!

function fromGolden(name: string): GableUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const np = Number(a.np)
  return {
    H: String(a.H), Lb: String(a.Lb), alpha: String(a.alpha), support: a.support as 'sendi' | 'jepit', self: a.self as 'ya' | 'tidak',
    col: sectionFromFields(a, 'c'), raf: sectionFromFields(a, 'r'),
    q: String(a.q), HL1: String(a.HL1), HL2: String(a.HL2),
    point: Array.from({ length: np }, (_, k) => ({ P: String(a[`p${k + 1}_P`]), a: String(a[`p${k + 1}_a`]) })),
  }
}

describe('portal gable — input UI', () => {
  it('input bawaan UI = kasus golden default', () => {
    expect(GABLE_DEFAULTS).toEqual(fromGolden('default jepit alfa 20'))
    expect(goldenDiff(computeGableUI(GABLE_DEFAULTS)!.r, byName('default jepit alfa 20').output)).toEqual([])
  })

  it.each(['sendi', 'alfa 0 (portal biasa)', 'terpusat kiri, kanan, puncak + lateral', 'tanpa berat sendiri', 'profil hollow'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeGableUI(ui)!.r, byName(name).output)).toEqual([])
    },
  )

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('alfa dipotong 75'))).toEqual({ alpha: '0 … 75°' })
    expect(validate(fromGolden('posisi dipotong'))).toEqual({ 'point.0.a': 'Maks. L = 8 m' })
    expect(validate(fromGolden('rafter tidak ada'))).toEqual({ 'raf.psize': 'Pilih ukuran profil' })
    expect(validate(fromGolden('Lb 0'))).toEqual({ Lb: 'Harus > 0' })
    expect(computeGableUI({ ...GABLE_DEFAULTS, alpha: 'x' })).toBeNull()
  })

  it('material selalu baja (field beton diabaikan)', () => {
    expect(toCalcInput({ ...GABLE_DEFAULTS, col: { ...GABLE_DEFAULTS.col, mat: 'beton' } })).toMatchObject({ cmat: 'baja', rmat: 'baja' })
  })

  it('beban terpusat digambar di atap pada posisi horizontalnya', () => {
    const r = computeGableUI(fromGolden('terpusat kiri, kanan, puncak + lateral'))!.r
    const v = gableView(r)
    for (const p of v.loads.points) {
      const a = p.at[0], half = r.Lb! / 2
      const y = r.H! + (a <= half ? a / half : (r.Lb! - a) / half) * r.rise!
      expect(p.at[1]).toBeCloseTo(y, 9)
    }
    expect(v.loads.lateral).toHaveLength(2)
  })
})

describe('portal gable — laporan', () => {
  it('bagian, geometri atap, kesetimbangan', () => {
    const ui = fromGolden('terpusat kiri, kanan, puncak + lateral')
    const rep = buildGableReport(ui)!
    const r = computeGableUI(ui)!.r
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Geometri & penampang', 'Beban', 'Metode analisis', 'Reaksi tumpuan & kesetimbangan', 'Gaya dalam', 'Deformasi',
    ])
    const geo = rep.sections[0].blocks.flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(Number(geo.find((s) => s.lhs === 'L_{r}')!.value)).toBeCloseTo(r.Lraf!, 3)
    const eq = rep.sections[3].blocks.flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(Number(eq[0].value)).toBeCloseTo(r.Wgrav!, 2)
    expect(Number(eq[1].value)).toBeCloseTo(r.Wgrav!, 1)
    expect(Number(eq[2].value)).toBeCloseTo(5, 2)
    // komponen beban rafter: w⊥² + w∥² = wv²
    const ld = rep.sections[1].blocks.flatMap((b) => (b.k === 'calc' ? b.steps : []))
    const wv = Number(ld.find((s) => s.lhs === 'w_{v}')!.value)
    const wp = Number(ld.find((s) => s.lhs === 'w_{⊥}')!.value), wa = Number(ld.find((s) => s.lhs === 'w_{∥}')!.value)
    expect(Math.hypot(wp, wa)).toBeCloseTo(wv, 2)
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(6)
  })
})
