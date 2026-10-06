import { describe, expect, it } from 'vitest'
import golden from './__golden__/cpt-pile.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeCptPile, type CptPileInput } from './cpt-pile'
import { parseCpt, type CptPoint } from './shared/cpt'

function run(c: GoldenCase): unknown {
  if (c.fn === 'parseCPT') return parseCpt(c.args[0] as string, c.args[1] as string)
  return computeCptPile(c.args[0] as CptPileInput, c.args[1] as CptPoint[])
}

describe('cpt-pile — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(run(c), c.output)).toEqual([])
  })
})

describe('cpt-pile — hitung tangan', () => {
  it('qc & fs konstan', () => {
    // qc 5 MPa, fs 50 kPa konstan; tiang bulat D=0,5, L=10 → qp = 5000, Ap = 0,19635; Qs = 50·π·0,5·10 = 785,4.
    const pts = parseCpt('0 5 50\n20 5 50', 'mpa')
    const r = computeCptPile({ shape: 'circle', D: 0.5, Lp: 10, fsrc: 'data', Rf: 1, FSp: 3, FSs: 5, Pw: 0 }, pts)
    expect(r.qp).toBeCloseTo(5000, 9)
    expect(r.Qp).toBeCloseTo(5000 * Math.PI * 0.0625, 9)
    expect(r.Qs).toBeCloseTo(50 * Math.PI * 0.5 * 10, 9)
    expect(r.Qall).toBeCloseTo((5000 * Math.PI * 0.0625) / 3 + (50 * Math.PI * 5) / 5, 9)
  })

  it('parser: urut, buang duplikat & baris tak valid, konversi satuan', () => {
    const pts = parseCpt('# kepala\n2 20 0.2\n1 10\n1 99\nx 1\n3 -1', 'kgcm2')
    expect(pts.map((p) => p.z)).toEqual([1, 2])
    expect(pts[0].qc).toBeCloseTo(980.665, 9)
    expect(pts[0].fs).toBeNull()
    expect(pts[1].fs).toBeCloseTo(19.6133, 9)
  })
})
