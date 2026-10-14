import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/portal-frame.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { sectionFromFields } from '../_frame/section'
import { forceCurves } from '../_frame/geom'
import { computePortalUI, PORTAL_DEFAULTS, portalView, toCalcInput, validate, type PortalUIInput } from './model'
import { buildPortalReport } from './report'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name === n) ?? cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (bentuk datar) → input UI. */
function fromGolden(name: string): PortalUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const np = Number(a.np)
  return {
    H: String(a.H), Lb: String(a.Lb), support: a.support as 'sendi' | 'jepit', self: a.self as 'ya' | 'tidak',
    col: sectionFromFields(a, 'c'), beam: sectionFromFields(a, 'b'),
    q: String(a.q), HL1: String(a.HL1), HL2: String(a.HL2),
    point: Array.from({ length: np }, (_, k) => ({ P: String(a[`p${k + 1}_P`]), a: String(a[`p${k + 1}_a`]) })),
  }
}

describe('analisis portal — input UI', () => {
  it('input bawaan UI = kasus golden default', () => {
    expect(PORTAL_DEFAULTS).toEqual(fromGolden('default baja jepit'))
    expect(goldenDiff(computePortalUI(PORTAL_DEFAULTS)!.r, byName('default baja jepit').output)).toEqual([])
  })

  it.each(['sendi', 'dengan beban terpusat & lateral', 'tanpa berat sendiri', 'beton', 'kolom beton balok baja, lateral', 'profil hollow'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computePortalUI(ui)!.r, byName(name).output)).toEqual([])
    },
  )

  it('kasus tidak sah ditolak validasi (build lama memotong/menebak diam-diam)', () => {
    expect(validate(fromGolden('H 0'))).toEqual({ H: 'Harus > 0' })
    expect(validate(fromGolden('kolom tidak ada'))).toEqual({ 'col.psize': 'Pilih ukuran profil' })
    expect(validate(fromGolden('balok beton b 0'))).toEqual({ 'beam.b': 'Harus > 0' })
    expect(validate(fromGolden('beton fc 0'))).toEqual({ 'col.fc': 'Harus > 0' })
    // posisi di luar bentang: dulu dipotong + peringatan, kini kesalahan field
    const cut = validate(fromGolden('4 beban terpusat, posisi dipotong'))
    expect(Object.keys(cut).length).toBeGreaterThan(0)
    expect(Object.values(cut).every((m) => m.startsWith('Maks.') || m.startsWith('Tidak boleh'))).toBe(true)
    expect(computePortalUI({ ...PORTAL_DEFAULTS, Lb: '' })).toBeNull()
  })

  it('adapter: penampang beton & mutu kustom ke field datar', () => {
    const v = toCalcInput({ ...PORTAL_DEFAULTS, col: { ...PORTAL_DEFAULTS.col, mat: 'beton', b: '350,5' }, beam: { ...PORTAL_DEFAULTS.beam, grade: 'custom', Fy: '300' } })
    expect(v).toMatchObject({ cmat: 'beton', cb: 350.5, bfy: 300, np: 0 })
  })

  it('gambar: momen di sisi tarik — balok jepit-jepit beban merata melendut ke bawah di tengah', () => {
    const r = computePortalUI(PORTAL_DEFAULTS)!.r
    const v = portalView(r)
    const beam = forceCurves(v, 'M', 1)[2]
    const mid = Math.floor(beam.base.length / 2)
    expect(beam.values[mid]).toBeGreaterThan(0) // sagging
    expect(beam.curve[mid][1]).toBeLessThan(beam.base[mid][1]) // digambar ke bawah (sisi tarik)
  })
})

describe('analisis portal — laporan', () => {
  it('bagian, kesetimbangan, gambar', () => {
    const rep = buildPortalReport(fromGolden('dengan beban terpusat & lateral'))!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Geometri & penampang', 'Beban', 'Metode analisis', 'Reaksi tumpuan & kesetimbangan', 'Gaya dalam', 'Deformasi',
    ])
    const r = computePortalUI(fromGolden('dengan beban terpusat & lateral'))!.r
    const steps = rep.sections[3].blocks.flatMap((b) => (b.k === 'calc' ? b.steps : []))
    // ΣW tertulis = Wgrav mesin hitung; ΣRy = ΣW; ΣH reaksi = H1 + H2
    expect(Number(steps[0].value)).toBeCloseTo(r.Wgrav!, 2)
    expect(Number(steps[1].value)).toBeCloseTo(r.Wgrav!, 1)
    expect(Number(steps[2].value)).toBeCloseTo(20, 2)
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(6)
    expect(rep.summary?.length).toBe(6)
  })

  it('beton: E = 4700√fc dan I bruto tertulis; sendi tanpa kolom M reaksi', () => {
    const rep = buildPortalReport(fromGolden('kolom beton balok baja, lateral'))!
    const steps = rep.sections[0].blocks.flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'E_{c}')?.value).toBe(String(Math.round(4700 * 5)))
    const tbl = rep.sections[3].blocks.find((b) => b.k === 'table')
    expect(tbl?.k === 'table' && tbl.head).toHaveLength(3)
  })
})
