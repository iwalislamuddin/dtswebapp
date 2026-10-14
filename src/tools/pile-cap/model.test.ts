import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/pile-cap.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { pileLayout } from '../../calc/pile-cap'
import { buildPileCapReport } from './report'
import { CAP_DEFAULTS, computePileCapUI, rejectReason, validate, type PileCapUIInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks); susunan n/s lama menjadi tabel koordinat. */
function fromGolden(name: string): PileCapUIInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  out.piles = pileLayout(Number(a.n), Number(a.s)).map((p) => ({ x: String(p.x), y: String(p.y) }))
  delete out.n
  return out as unknown as PileCapUIInput
}

describe('pile cap — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computePileCapUI(CAP_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['2 tiang', '5 tiang', '6 tiang', 'momen biaksial', 'tiang tertarik', 'mode kapasitas', 'spasi kecil', 'kolom persegi panjang', 'poer tipis', 'fy < 420', '2 batang cukup', 'lentur tak layak', 'tulangan minimum menentukan'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      // peringatan jarak kini dari koordinat nyata (mis. tiang tengah 5 tiang) — lebih ketat dari acuan; angka sama
      const { warn: _w, ...got } = computePileCapUI(ui)!
      const { warn: _r, ...ref } = byName(name).output as Record<string, unknown>
      expect(goldenDiff(got, ref)).toEqual([])
    },
  )

  it('3 tiang: reaksi, lentur, geser, pons kolom sama dengan acuan (tepi poer sebenarnya hanya memengaruhi pons tiang)', () => {
    for (const name of ['3 tiang', 'nilai select string']) {
      const got = computePileCapUI(fromGolden(name))!
      const ref = byName(name).output as Record<string, unknown>
      for (const k of ['R', 'flexX', 'flexY', 'vx', 'vy', 'punchCol'])
        expect(goldenDiff({ [k]: (got as unknown as Record<string, unknown>)[k] }, { [k]: ref[k] })).toEqual([])
    }
  })

  it('susunan tak simetris: ΣR = Pu, ΣRx = momen tampang terhadap pusat kolom (statika)', () => {
    const ui: PileCapUIInput = { ...CAP_DEFAULTS, Pu: '3000', Mux: '200', Muy: '-150', piles: [{ x: '-500', y: '0' }, { x: '700', y: '-300' }, { x: '300', y: '900' }, { x: '1500', y: '600' }, { x: '-800', y: '700' }] }
    const r = computePileCapUI(ui)!
    const R = r.R!, P = r.piles!
    const sum = (f: (i: number) => number) => R.reduce((a, _, i) => a + f(i), 0)
    expect(sum((i) => R[i])).toBeCloseTo(3000, 6)
    expect(sum((i) => R[i] * P[i].x) / 1000).toBeCloseTo(-150, 6) // Muy
    expect(sum((i) => R[i] * P[i].y) / 1000).toBeCloseTo(200, 6) // Mux
    expect(Math.abs(r.Sxy!)).toBeGreaterThan(1)
    expect(r.xlo).toBe(-800 - 400)
    expect(r.xhi).toBe(1500 + 400)
    expect(buildPileCapReport(ui)).not.toBeNull()
  })

  it('validasi bersyarat menurut mode; tebal terlalu kecil → alasan penolakan', () => {
    expect(validate({ ...CAP_DEFAULTS, Pu: '0', dp: '' })).toEqual({ Pu: 'Harus > 0', dp: 'Isi angka' })
    expect(validate({ ...CAP_DEFAULTS, piles: [{ x: '0', y: '' }] })).toEqual({ piles: 'Minimal 2 tiang', 'piles.0.y': 'Isi angka' })
    expect(validate({ ...CAP_DEFAULTS, mode: 'kapasitas', Pu: '', Q: '0' })).toEqual({ Q: 'Harus > 0' })
    expect(validate({ ...CAP_DEFAULTS, mode: 'kapasitas', Pu: '', Mux: '', Muy: '' })).toEqual({})
    const tipis = { ...CAP_DEFAULTS, h: '100' }
    expect(computePileCapUI(tipis)).toBeNull()
    expect(rejectReason(tipis)).toMatch(/Tebal poer/)
  })
})

describe('pile cap — laporan', () => {
  it('tabel reaksi memuat satu baris per tiang; satu gambar; rasio menentukan sama', () => {
    for (const name of ['default', '3 tiang', '6 tiang']) {
      const ui = fromGolden(name)
      const r = computePileCapUI(ui)!
      const rep = buildPileCapReport(ui)!
      const tbl = rep.sections.flatMap((s) => s.blocks).find((b) => b.k === 'table')
      expect(tbl && tbl.k === 'table' ? tbl.rows.length : 0).toBe(r.n)
      expect(rep.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure')).toHaveLength(1)
      expect(rep.governing!.ratio).toBeCloseTo(r.gov!.dc, 12)
    }
  })

  it('mode kapasitas: langkah reaksi memakai Q', () => {
    const rep = buildPileCapReport(fromGolden('mode kapasitas'))!
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'R_{i}')!.expr).toBe('Q')
  })
})
