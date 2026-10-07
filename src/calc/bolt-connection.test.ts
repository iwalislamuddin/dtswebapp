import { describe, expect, it } from 'vitest'
import golden from './__golden__/bolt-connection.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeBoltConnection, type BoltConnectionInput } from './bolt-connection'

describe('bolt-connection — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeBoltConnection(c.args[0] as BoltConnectionInput), c.output)).toEqual([])
  })
})

describe('bolt-connection — hitung tangan', () => {
  it('A325 M20 2×2, le 40, s 70, t 10, Fu 370: geser baut menentukan tiap baut', () => {
    const c = (golden as GoldenCase[])[0].args[0] as BoltConnectionInput
    const r = computeBoltConnection(c)
    const Ab = (Math.PI * 20 * 20) / 4
    const rnv = (372 * Ab) / 1000 // 116,87 kN < tumpu tepi 1,2·29·10·370 = 128,76 kN
    expect(r.rnBrgEdge).toBeCloseTo(128.76, 2)
    expect(r.rnBrgInner).toBeCloseTo(177.6, 6) // dibatasi 2,4·d·t·Fu
    expect(r.phiRge).toBeCloseTo(0.75 * 4 * rnv, 9)
    expect(r.dcShear).toBeCloseTo(150 / (0.75 * 4 * rnv), 9)
    expect(r.gov).toBe('geser')
  })
})
