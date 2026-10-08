import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/development-length.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildDevReport } from './report'
import { computeDev, DEV_DEFAULTS, ldPerDiameter, validate, type DevInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): DevInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as DevInput
}

describe('panjang penyaluran — input UI', () => {
  it('input bawaan UI = kasus default golden (ld 560 mm)', () => {
    const r = computeDev(DEV_DEFAULTS)!
    expect(goldenDiff(r, byName('default').output)).toEqual([])
    expect(r.ldRound).toBe(560)
  })

  it.each(['polos 19', 'polos 8', 'D25', 'fy 550', 'fy 600', 'psi t x psi e', 'beton ringan', 'fc 80', 'Ktr dihitung', 'rasio dibatasi', 'ld minimum', 'ld tepat'])(
    'kasus golden "%s" lewat input UI identik',
    (name) => {
      const ui = fromGolden(name)
      expect(validate(ui)).toEqual({})
      expect(goldenDiff(computeDev(ui)!, byName(name).output)).toEqual([])
    },
  )

  it('validasi; Atr/s/n hanya bila Ktr dihitung', () => {
    expect(validate({ ...DEV_DEFAULTS, fc: '0', cb: '', db: '20' })).toEqual({ fc: 'Harus > 0', cb: 'Isi angka', db: 'Pilih diameter' })
    expect(validate({ ...DEV_DEFAULTS, s: '' })).toEqual({})
    expect(validate({ ...DEV_DEFAULTS, ktrMode: 'calc', s: '0', n: '1.5' })).toEqual({ s: 'Harus > 0', n: 'Bilangan bulat ≥ 1' })
    expect(computeDev({ ...DEV_DEFAULTS, fy: 'x' })).toBeNull()
  })

  it('ld per diameter: diameter terpilih sama dengan hasil utama', () => {
    const t = ldPerDiameter(DEV_DEFAULTS)
    expect(t.find((x) => x.db === 19)!.ld).toBeCloseTo(computeDev(DEV_DEFAULTS)!.ld!, 9)
    expect(t).toHaveLength(9)
  })
})

describe('panjang penyaluran — laporan', () => {
  it('langkah rumus konsisten dengan hasil hitung; polos menambah langkah 2,0×', () => {
    const steps = (i: DevInput) => buildDevReport(i)!.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
    const r = computeDev(DEV_DEFAULTS)!
    const s = steps(DEV_DEFAULTS)
    expect(s.find((x) => x.ref === '25.4.2.4a')!.value).toBe(r.ldBase!.toFixed(1))
    expect(s.at(-1)!.value).toBe('560')
    expect(steps(fromGolden('polos 19')).some((x) => x.expr === '2.0 × l_{d,ulir}')).toBe(true)
    expect(steps(fromGolden('Ktr dihitung'))[0].lhs).toBe('K_{tr}')
    expect(buildDevReport({ ...DEV_DEFAULTS, cb: '0' })).toBeNull()
  })
})
