import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/bolt-connection.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildBoltReport } from './report'
import { BOLT_DEFAULTS, computeBolt, toCalcInput, validate, type BoltInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): BoltInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const t = (k: string) => String(a[k])
  return {
    grade: a.grade as BoltInput['grade'], thread: a.thread as BoltInput['thread'], Fnt: t('Fnt'), Fnv: t('Fnv'), d: t('d'),
    planes: t('planes') as BoltInput['planes'], nr: t('nr'), nc: t('nc'), s: t('s'), sg: t('sg'), le: t('le'), t: t('t'), Fu: t('Fu'),
    Vu: t('Vu'), Tu: t('Tu'),
  }
}

describe('sambungan baut — input UI', () => {
  it('input bawaan UI = kasus default golden (hasil identik build lama)', () => {
    expect(goldenDiff(computeBolt(BOLT_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['A490', 'geser ganda', '3 baris', 'kombinasi wajib', 'kombinasi tidak wajib', 'tarik murni', 'data pelat kosong', 'kustom'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeBolt(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi per field; input tidak valid → tidak dihitung', () => {
    const bad: BoltInput = { ...BOLT_DEFAULTS, d: '0', nr: '1.5', nc: '', le: '-5', Vu: 'abc' }
    expect(validate(bad)).toEqual({ d: 'Harus > 0', nr: 'Bilangan bulat ≥ 1', nc: 'Isi angka', le: 'Tidak boleh negatif', Vu: 'Isi angka' })
    expect(computeBolt(bad)).toBeNull()
    // Fnt/Fnv hanya diperiksa untuk mutu kustom (kasus golden Fnt = 0 → D/C tak hingga)
    expect(validate({ ...BOLT_DEFAULTS, Fnt: '0' })).toEqual({})
    expect(validate({ ...BOLT_DEFAULTS, grade: 'custom', Fnt: '0', Fnv: '' })).toEqual({ Fnt: 'Harus > 0', Fnv: 'Isi angka' })
    // s / g hanya diperiksa bila lebih dari satu baris / kolom
    expect(validate({ ...BOLT_DEFAULTS, nr: '1', s: '' })).toEqual({})
    expect(validate({ ...BOLT_DEFAULTS, nc: '3', sg: '0' })).toEqual({ sg: 'Harus > 0' })
    expect(validate({ ...BOLT_DEFAULTS, nr: '13' })).toEqual({ nr: 'Maksimum 12' })
  })

  it('koma desimal diterima', () => {
    expect(toCalcInput({ ...BOLT_DEFAULTS, Vu: '150,5', planes: '2' })).toMatchObject({ Vu: 150.5, planes: 2 })
  })
})

describe('sambungan baut — laporan', () => {
  const steps = (rep: NonNullable<ReturnType<typeof buildBoltReport>>) =>
    rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))

  it('geser murni: bagian, langkah rumus konsisten dengan hasil hitung, dua gambar', () => {
    const rep = buildBoltReport(BOLT_DEFAULTS)!
    const r = computeBolt(BOLT_DEFAULTS)!
    expect(rep.sections.map((s) => s.title)).toEqual([
      'Data baut & pelat tumpu', 'Geometri pola baut', 'Beban per baut', 'Kuat geser baut (J3.6)',
      'Tumpu & sobek lubang, kapasitas geser grup (J3.10)',
    ])
    const v = Object.fromEntries(steps(rep).map((s) => [s.lhs, s.value]))
    expect(v['A_{b}']).toBe(r.Ab.toFixed(1))
    expect(v['φr_{nv}']).toBe(r.phiRnv.toFixed(2))
    expect(v['r_{n,tepi}']).toBe(r.rnBrgEdge.toFixed(2))
    expect(v['φR_{n}']).toBe(r.phiRge.toFixed(2))
    expect(v['D/C_{geser}']).toBe(r.dcShear.toFixed(3))
    // tabel kapasitas grup: subtotal menjumlah ke Rn grup
    const tbl = rep.sections[4].blocks.find((b) => b.k === 'table')
    const sub = tbl?.k === 'table' ? tbl.rows.slice(0, -1).map((x) => Number(x[5])) : []
    expect(sub.reduce((a, b) => a + b, 0)).toBeCloseTo(r.Rge, 1)
    expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(2)
    expect(rep.governing).toEqual({ label: 'D/C menentukan (geser)', ratio: r.govDC })
  })

  it('tarik + geser: bagian tarik & kombinasi J3.7 dengan F′nt', () => {
    const ui = fromGolden('kombinasi wajib')
    const rep = buildBoltReport(ui)!
    const r = computeBolt(ui)!
    expect(rep.sections.map((s) => s.title).slice(-2)).toEqual(['Kuat tarik baut (J3.6)', 'Kombinasi tarik dan geser (J3.7)'])
    const v = Object.fromEntries(steps(rep).map((s) => [s.lhs, s.value]))
    expect(v["F'_{nt}"]).toBe(r.FntMod!.toFixed(1))
    expect(v['D/C_{kombinasi}']).toBe(r.dcComboInfo.toFixed(3))
    expect(rep.governing?.label).toBe(`D/C menentukan (${r.gov})`)
  })

  it('data pelat kosong: tumpu dilewati, kapasitas = n·φrnv', () => {
    const rep = buildBoltReport(fromGolden('data pelat kosong'))!
    const v = Object.fromEntries(steps(rep).map((s) => [s.lhs, s.value]))
    expect(v['r_{n,tepi}']).toBeUndefined()
    expect(v['φR_{n}']).toBe(computeBolt(fromGolden('data pelat kosong'))!.phiRge.toFixed(2))
  })

  it('input tidak valid → tanpa laporan', () => {
    expect(buildBoltReport({ ...BOLT_DEFAULTS, d: '' })).toBeNull()
  })
})
