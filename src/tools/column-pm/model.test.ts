import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/column-pm.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildColumnReport } from './report'
import { COLUMN_DEFAULTS, computeColumn, rejectReason, uniaxialCurve, validate, type ColumnInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): ColumnInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) if (k !== 'Pu' && k !== 'Mux' && k !== 'Muy') out[k] = String(v)
  return { ...(out as unknown as ColumnInput), loads: [{ Pu: String(a.Pu), Mux: String(a.Mux), Muy: String(a.Muy) }] }
}

describe('diagram P–M kolom — input UI', () => {
  it('input bawaan UI = kasus default golden', () => {
    expect(goldenDiff(computeColumn(COLUMN_DEFAULTS)!, byName('default').output)).toEqual([])
  })

  it.each(['persegi biaksial', 'persegi persegi panjang', 'persegi spiral', 'persegi Pu melebihi', 'persegi tarik', 'persegi tanpa momen', 'persegi D/C > 1', 'persegi rho < 1%', 'persegi rho > 4%', 'lingkaran', 'lingkaran spiral', 'L', 'T', 'fc 40'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeColumn(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi per bentuk; geometri tak konsisten → alasan', () => {
    expect(validate({ ...COLUMN_DEFAULTS, shape: 'circle', b: '', nx: '' })).toEqual({})
    expect(validate({ ...COLUMN_DEFAULTS, nx: '1' })).toEqual({ nx: 'Bilangan bulat ≥ 2' })
    expect(validate({ ...COLUMN_DEFAULTS, shape: 'T', bw: '0' })).toEqual({ bw: 'Harus > 0' })
    expect(rejectReason(fromGolden('dp terlalu besar'))).toMatch(/d'/)
    expect(computeColumn(fromGolden('L tx >= B'))).toBeNull()
  })

  it('kurva uniaksial tertutup: plafon φPn,maks dan tarik φPnt tercakup', () => {
    const r = computeColumn(COLUMN_DEFAULTS)!
    const c = uniaxialCurve(r, 'x')
    const P = c.map((p) => p[1])
    expect(Math.max(...P)).toBeCloseTo(r.phiPnMax!, 6)
    expect(Math.min(...P)).toBeCloseTo(r.phiPnt!, 6)
    expect(Math.max(...c.map((p) => p[0]))).toBeGreaterThan(0)
    expect(Math.min(...c.map((p) => p[0]))).toBeLessThan(0)
  })
})

describe('diagram P–M kolom — banyak beban', () => {
  const multi: ColumnInput = {
    ...COLUMN_DEFAULTS,
    loads: [
      { Pu: '1200', Mux: '150', Muy: '0' },
      { Pu: '800', Mux: '60', Muy: '40' },
      { Pu: '1500', Mux: '250', Muy: '0' },
    ],
  }

  it('tiap beban dicek terhadap permukaan yang sama; penentu = D/C terbesar', () => {
    const r = computeColumn(multi)!
    expect(r.loads).toHaveLength(3)
    // beban 1 identik dengan hitungan beban tunggal
    expect(r.loads[0].dc).toBeCloseTo(computeColumn(COLUMN_DEFAULTS)!.dc!, 12)
    const dcs = r.loads.map((l) => l.dc!)
    expect(r.gov).toBe(dcs.indexOf(Math.max(...dcs)))
    expect(r.dc).toBe(dcs[r.gov])
    expect(r.Pu).toBe(r.loads[r.gov].Pu)
    expect(r.loads[2].dc! > r.loads[1].dc!).toBe(true)
  })

  it('validasi per baris & minimal satu beban', () => {
    expect(validate({ ...multi, loads: [{ Pu: '1', Mux: 'x', Muy: '0' }] })).toEqual({ 'loads.0.Mux': 'Isi angka' })
    expect(validate({ ...multi, loads: [] })).toEqual({ loads: 'Minimal 1 beban' })
  })

  it('peringatan beban bernomor; laporan memuat tabel semua beban', () => {
    const r = computeColumn({ ...multi, loads: [...multi.loads, { Pu: '99999', Mux: '0', Muy: '0' }] })!
    expect(r.gov).toBe(3)
    expect(r.warn.some((w) => w.startsWith('Beban 4: Pu = '))).toBe(true)
    expect(r.warn.some((w) => w.startsWith('Pu = '))).toBe(false)
    const tbl = buildColumnReport(multi)!.sections.flatMap((s) => s.blocks).find((b) => b.k === 'table' && b.head[0] === '#')
    expect(tbl && tbl.k === 'table' && tbl.rows.length).toBe(3)
  })
})

describe('diagram P–M kolom — laporan', () => {
  it('titik acuan & D/C konsisten; biaksial menambah kontur', () => {
    const r = computeColumn(COLUMN_DEFAULTS)!
    const rep = buildColumnReport(COLUMN_DEFAULTS)!
    const steps = rep.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    expect(steps.find((s) => s.lhs === 'P_{o}')!.value).toBe(r.Po!.toFixed(0))
    expect(steps.find((s) => s.lhs === 'D/C')!.value).toBe(r.dc!.toFixed(3))
    const fig = (i: ColumnInput) => buildColumnReport(i)!.sections.flatMap((s) => s.blocks).filter((b) => b.k === 'figure').length
    expect(fig(fromGolden('persegi biaksial'))).toBe(fig(COLUMN_DEFAULTS) + 2) // + P–My + kontur
  })
})
