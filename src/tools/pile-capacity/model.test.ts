import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/pile-capacity.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { computePileUI, newLayer, PILE_DEFAULTS, validate, type PileLayerUI, type PileUIInput } from './model'
import { buildPileReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): PileUIInput {
  const [g, layers] = byName(name).args as [Record<string, string | number>, Record<string, string | number>[]]
  const str = (o: Record<string, string | number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]))
  return { ...str(g), layers: layers.map((l) => str(l) as unknown as PileLayerUI) } as unknown as PileUIInput
}

describe('daya dukung tiang — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computePileUI(PILE_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'SPT di lapis 3', 'L 8', 'persegi', 'bor baja', 'kurangi berat sendiri', 'L melebihi profil', 'MAT di permukaan', 'MAT negatif', 'MAT di bawah profil',
    'ujung di lempung', 'ujung di lempung SPT', 'fs dibatasi', 'Decourt dilewati', 'lempung psi > 1', 'tiang pendek', 'satu lapis pasir', 'FS 0',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computePileUI(ui)!, byName(name).output)).toEqual([])
  })

  it('kasus tidak sah ditolak validasi', () => {
    expect(validate(fromGolden('D 0'))).toEqual({ D: 'Harus > 0' })
    expect(validate(fromGolden('L 0'))).toEqual({ L: 'Harus > 0' })
    expect(validate(fromGolden('tanpa lapis'))).toEqual({ layers: 'Tambahkan minimal satu lapis tanah' })
    expect(computePileUI(fromGolden('D 0'))).toBeNull()
  })

  it('field lapis bersyarat: cu hanya lempung statik, φ hanya pasir statik, N wajib bila SPT', () => {
    const ui = { ...PILE_DEFAULTS, layers: [{ ...newLayer(), soil: 'sand' as const, cu: '' }, { ...newLayer(), soil: 'clay' as const, phi: '', cu: '30' }] }
    expect(validate(ui)).toEqual({})
    const spt = { ...PILE_DEFAULTS, layers: [{ ...newLayer(), method: 'spt' as const, N: '' }] }
    expect(validate(spt)).toEqual({ 'layers.0.N': 'Isi angka' })
  })
})

describe('daya dukung tiang — laporan', () => {
  it('nilai laporan sama dengan hasil hitung', () => {
    const r = computePileUI(PILE_DEFAULTS)!
    const rep = buildPileReport(PILE_DEFAULTS)!
    const v = Object.fromEntries(rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : [])).map((s) => [s.lhs, s.value]))
    expect(v['Q_{u}']).toBe(r.Qu.toFixed(1))
    expect(v['Q_{izin}']).toBe(r.Qallow.toFixed(1))
  })

  it('satu gambar; Decourt hanya bila N terisi di semua lapis', () => {
    const rep = buildPileReport(PILE_DEFAULTS)!
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
    expect(rep.sections.some((s) => s.title.includes('Decourt'))).toBe(true)
    const tanpaN = { ...PILE_DEFAULTS, layers: PILE_DEFAULTS.layers.map((l) => ({ ...l, N: '' })) }
    expect(buildPileReport(tanpaN)!.sections.some((s) => s.title.includes('Decourt'))).toBe(false)
  })
})
