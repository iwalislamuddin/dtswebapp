import { describe, expect, it } from 'vitest'
import golden from './__golden__/portal-frame.json'
import { goldenDiff, type GoldenCase } from './__golden__/golden'
import { computePortal, type PortalInput } from './portal-frame'

describe('portal-frame — sama dengan build lama', () => {
  it.each((golden as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(goldenDiff(computePortal(c.args[0] as PortalInput), c.output)).toEqual([])
  })
})

describe('portal-frame — kesetimbangan & simetri', () => {
  const base = (golden as GoldenCase[])[0].args[0] as PortalInput
  it('Σ reaksi vertikal = Σ beban gravitasi; beban simetris → reaksi kiri = kanan', () => {
    const r = computePortal(base)
    expect(r.sumRy).toBeCloseTo(r.Wgrav as number, 6)
    expect(r.RA?.Ry).toBeCloseTo(r.RB?.Ry as number, 6)
    expect(r.sumRx).toBeCloseTo(0, 6)
  })
})
