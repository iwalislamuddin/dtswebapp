import { describe, expect, it } from 'vitest'
import { EN } from '../../report/en'
import { makeTranslator, mapReportText } from '../../report/lang'
import { BASE_PLATE_DEFAULTS as D, computeBasePlateUI, validate, type BasePlateUIInput } from './model'
import { buildBasePlateReport } from './report'

const SCENARIOS: Partial<BasePlateUIInput>[] = [
  {},
  { loadMode: 'capacity' },
  { fixity: 'pinned' },
  { fixity: 'pinned', loadMode: 'capacity' },
  { shearMode: 'anchors', Pu: '-80', Vu: '60' },
  { support: 'slab', ha: '250', Mu: '120', Pu: '50' },
  { support: 'manual', caN: '120', caB: '100', head: 'hooked', Pu: '20', Mu: '90', shearMode: 'anchors' },
  { ptype: 'SHS', psize: '200×200×9', cracked: 'no', cond: 'A', grout: '0', nRow: '1' },
  { ptype: 'PIPE', psize: 'Ø216.3×8.2', fixity: 'pinned', Pu: '-150', Vu: '0' },
  { ptype: 'UNP', psize: 'UNP 200', N: '300', B: '200', tp: '10', aB: '40' },
]

describe('base plate — input UI', () => {
  it('input bawaan valid dan desain bawaan OK', () => {
    expect(validate(D)).toEqual({})
    const r = computeBasePlateUI(D)!
    expect(r.gov!.dc).toBeLessThanOrEqual(1)
  })

  it.each(SCENARIOS.map((s) => [JSON.stringify(s), s] as const))('skenario %s: valid & laporan lengkap', (_n, s) => {
    const i = { ...D, ...s }
    expect(validate(i)).toEqual({})
    const r = computeBasePlateUI(i)!
    expect(r.checks.length).toBeGreaterThan(0)
    for (const c of r.checks) expect(Number.isNaN(c.dc), c.key).toBe(false)
    expect(buildBasePlateReport(i)!.sections.length).toBeGreaterThan(4)
  })

  it('field bersyarat & validasi', () => {
    expect(validate({ ...D, aN: '200' })).toEqual({ aN: 'Harus < N/2' })
    expect(validate({ ...D, support: 'slab', Lp: '' })).toEqual({})
    expect(validate({ ...D, support: 'manual', caN: '' })).toEqual({ caN: 'Isi angka' })
    expect(validate({ ...D, loadMode: 'capacity', H: '0' })).toEqual({ H: 'Harus > 0' })
    expect(validate({ ...D, fixity: 'pinned', Mu: '' })).toEqual({})
    expect(computeBasePlateUI({ ...D, N: '0' })).toBeNull()
  })

  it('laporan Inggris semua skenario tanpa sisa teks Indonesia', () => {
    const tr = makeTranslator(EN)
    const INDO = /\b(dan|yang|untuk|dengan|tidak|pada|dari|pelat|angkur|kolom|beton|tumpu|tarik|geser|tekan|gaya|tebal|jarak|tepi|baris|sendi|jepit|kait|lubang|perlu|menentukan|ukuran|gambar|denah|elevasi|retak|kondisi)\b/i
    const left = new Set<string>()
    for (const s of SCENARIOS) {
      const rep = buildBasePlateReport({ ...D, ...s })!
      mapReportText(rep, (x) => {
        const out = tr(x)
        if (INDO.test(out.replace(/_\{[^{}]*\}/g, ''))) left.add(out)
        return out
      })
    }
    expect([...left]).toEqual([])
  })
})
