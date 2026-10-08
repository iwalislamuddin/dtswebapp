import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/anchor-bolt-group.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildAnchorReport } from './report'
import { ANCHOR_DEFAULTS, aseEstimate, computeAnchor, validate, type AnchorInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): AnchorInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as AnchorInput
}

describe('anchor bolt group — input UI', () => {
  it('input bawaan UI = kasus default golden (hasil identik build lama)', () => {
    expect(goldenDiff(computeAnchor(ANCHOR_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each([
    'tak retak', 'kondisi A', 'grout', 'geser arah Y', 'tanpa tepi', 'tepi dekat', 'tebal beton tipis', 'tekan tanpa baut', 'My dengan satu kolom',
    'Mx dengan satu baris', 'baut tunggal', 'hef dangkal', 'spasi besar', 'tanpa geser', 'geser saja', 'tarik saja', 'interaksi > 1', 'baja tarik gagal',
    '3x3 biaksial', 'da kecil',
  ])('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeAnchor(ui)!, byName(name).output)).toEqual([])
  })

  it('validasi per field; spasi hanya bila > 1 baut; input tidak valid → tidak dihitung', () => {
    expect(validate({ ...ANCHOR_DEFAULTS, nx: '0', Ase: '0', Vu: '-1', ca: '' })).toEqual({
      nx: 'Bilangan bulat ≥ 1', Ase: 'Harus > 0', Vu: 'Tidak boleh negatif', ca: 'Isi angka',
    })
    expect(validate({ ...ANCHOR_DEFAULTS, nx: '1', sx: '' })).toEqual({})
    expect(validate({ ...ANCHOR_DEFAULTS, ny: '7' })).toEqual({ ny: 'Maksimum 6' })
    expect(validate({ ...ANCHOR_DEFAULTS, Nu: '-50' })).toEqual({})
    expect(computeAnchor({ ...ANCHOR_DEFAULTS, hef: '0' })).toBeNull()
  })

  it('Ase ≈ 0,58·da² (perilaku build lama)', () => {
    expect(aseEstimate(24)).toBe(334)
    expect(aseEstimate(12)).toBe(84)
  })
})

describe('anchor bolt group — laporan', () => {
  const steps = (rep: NonNullable<ReturnType<typeof buildAnchorReport>>) =>
    rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('bawaan: semua bagian, langkah konsisten dengan hasil hitung', () => {
    const rep = buildAnchorReport(ANCHOR_DEFAULTS)!
    const r = computeAnchor(ANCHOR_DEFAULTS)!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Data angkur & beton', 'Gaya tarik tiap baut (pelat dasar kaku)', 'Kuat baja angkur tarik (17.6.1)',
      'Jebol beton akibat tarik — grup (17.6.2)', 'Kuat baja angkur geser (17.7.1)', 'Jebol beton akibat geser — grup (17.7.2)',
      'Cungkil beton / pryout (17.7.3)', 'Rekapitulasi & interaksi tarik–geser (17.8)',
    ])
    const v = Object.fromEntries(steps(rep).map((s) => [s.lhs, s.value]))
    expect(v['N_{sa}']).toBe(r.Nsa.toFixed(2))
    expect(v['N_{b}']).toBe(r.Nb.toFixed(2))
    expect(v['N_{cbg}']).toBe(r.Ncbg.toFixed(2))
    expect(v['V_{cbg}']).toBe(r.Vcbg.toFixed(2))
    expect(v['V_{cpg}']).toBe(r.Vcpg.toFixed(2))
    // tabel gaya baut menjumlah ke Nu
    const tbl = rep.sections[1].blocks.find((b) => b.k === 'table')
    const T = tbl?.k === 'table' ? tbl.rows.slice(0, -1).map((x) => Number(x[3])) : []
    expect(T.reduce((a, b) => a + b, 0)).toBeCloseTo(r.Nu, 1)
    expect(rep.governing).toEqual({ label: `D/C menentukan (${r.gov})`, ratio: r.govDC })
  })

  it('tanpa geser: bagian geser tidak ada; interaksi 5/3 dilaporkan bila keduanya > 0,2', () => {
    expect(buildAnchorReport(fromGolden('tanpa geser'))!.sections.some((s) => s.title.includes('geser —'))).toBe(false)
    const rep = buildAnchorReport(fromGolden('interaksi > 1'))!
    const r = computeAnchor(fromGolden('interaksi > 1'))!
    expect(steps(rep).find((s) => s.lhs === 'Σ')!.value).toBe(r.combined!.toFixed(3))
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
  })
})
