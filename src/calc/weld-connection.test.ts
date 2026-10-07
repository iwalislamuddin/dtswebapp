import { describe, expect, it } from 'vitest'
import golden from './__golden__/weld-connection.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computeWeldConnection, type WeldConnectionInput } from './weld-connection'

describe('weld-connection — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computeWeldConnection(c.args[0] as WeldConnectionInput), c.output)).toEqual([])
  })
})

describe('weld-connection — hitung tangan', () => {
  it('E70 w 6 Lw 200 longitudinal: φRn = 0,75·0,6·482·0,707·6·200 = 184,0 kN (las menentukan)', () => {
    const r = computeWeldConnection((golden as GoldenCase[])[0].args[0] as WeldConnectionInput)
    expect(r.phiRnw).toBeCloseTo((0.75 * 0.6 * 482 * 0.707 * 6 * 200) / 1000, 9)
    expect(r.phiBase).toBeCloseTo(288, 9) // leleh geser 0,6·240·10·200 < fraktur 0,45·370·10·200
    expect(r.weldGoverns).toBe(true)
  })
})
