import { describe, expect, it } from 'vitest'
import golden from '../../calc/__golden__/min-reinforcement.json'
import { goldenDiff, type GoldenCase } from '../../calc/__golden__/golden'
import { buildMinReport } from './report'
import { computeMin, MIN_DEFAULTS, rejectReason, validate, type MinInput } from './model'

const cases = golden as GoldenCase[]
const byName = (n: string) => cases.find((c) => c.name.startsWith(n))!

/** Kasus golden (angka) → input UI (teks). */
function fromGolden(name: string): MinInput {
  const a = byName(name).args[0] as Record<string, string | number>
  const out = {} as Record<string, string>
  for (const [k, v] of Object.entries(a)) out[k] = String(v)
  return out as unknown as MinInput
}

const UI_CASES = [
  'balok fc 40', 'balok sempit', 'balok tinggi', 'kolom persegi', 'kolom persegi pipih', 'kolom persegi tulangan besar', 'kolom lingkaran ikat',
  'kolom lingkaran spiral', 'spiral pitch > 75', 'spiral pitch < 25', 'spiral fyt > 700', 'spiral pitch bersih', 'kolom lingkaran tulangan besar',
  'pelat satu arah', 'pelat dua arah', 'pelat rapat', 'pile cap', 'pile cap tebal',
]

describe('tulangan minimum — input UI', () => {
  it('input bawaan UI = kasus golden "balok default"', () => {
    expect(goldenDiff(computeMin(MIN_DEFAULTS)!, byName('balok default').output)).toEqual([])
  })

  it.each(UI_CASES)('kasus golden "%s" lewat input UI identik', (name) => {
    const ui = fromGolden(name)
    expect(validate(ui)).toEqual({})
    expect(goldenDiff(computeMin(ui)!, byName(name).output)).toEqual([])
  })

  it('validasi hanya field yang berlaku per elemen', () => {
    expect(validate({ ...MIN_DEFAULTS, elem: 'pelat', b: '', D: '', cc: '' })).toEqual({})
    expect(validate({ ...MIN_DEFAULTS, elem: 'pilecap', B: '0' })).toEqual({ B: 'Harus > 0' })
    expect(validate({ ...MIN_DEFAULTS, elem: 'kolom-l', D: '' })).toEqual({ D: 'Isi angka' })
    expect(validate({ ...MIN_DEFAULTS, elem: 'kolom-l', fyt: '' })).toEqual({})
    expect(validate({ ...MIN_DEFAULTS, elem: 'kolom-l', tieType: 'spiral', fyt: '' })).toEqual({ fyt: 'Isi angka' })
  })

  it('geometri mustahil → alasan penolakan', () => {
    const kecil = fromGolden('kolom lingkaran kecil')
    expect(computeMin(kecil)).toBeNull()
    expect(rejectReason(kecil)).toMatch(/Diameter kolom/)
    expect(rejectReason(fromGolden('balok d <= 0'))).toMatch(/Tinggi efektif/)
  })
})

describe('tulangan minimum — laporan', () => {
  const steps = (i: MinInput) => buildMinReport(i)!.sections.flatMap((s) => s.blocks).flatMap((b) => (b.k === 'calc' ? b.steps : []))
  const val = (i: MinInput, lhs: string) => steps(i).find((s) => s.lhs === lhs)?.value

  it('setiap elemen punya langkah inti yang konsisten dengan hasil hitung', () => {
    const b = computeMin(MIN_DEFAULTS)!
    expect(val(MIN_DEFAULTS, 'A_{s,min}')).toBe(b.AsMin!.toFixed(1))
    expect(val(MIN_DEFAULTS, 's_{pakai}')).toBe(b.sPakai!.toFixed(0))
    const kp = fromGolden('kolom persegi')
    expect(val(kp, 'A_{st,min}')).toBe(computeMin(kp)!.AstMin!.toFixed(0))
    const sp = fromGolden('kolom lingkaran spiral')
    expect(val(sp, 'ρ_{s}')).toBe(computeMin(sp)!.rhoS!.toFixed(5))
    const pl = fromGolden('pelat dua arah')
    expect(val(pl, 'ρ_{min}')).toBe('0.0020')
    const pc = buildMinReport(fromGolden('pile cap'))!
    expect(pc.sections[1].blocks.some((x) => x.k === 'table')).toBe(true)
  })
})
