import { describe, expect, it } from 'vitest'
import { TOOLS } from '../tools'
import { conform, decodeEdft, EdftError, edftFileName, encodeEdft, FORMAT_VERSION, MAX_FILE_BYTES, type EdftEnvelope } from './edft'

const ENV: EdftEnvelope = {
  t: 'beam-check',
  v: 1,
  a: '0.7.4',
  d: '2026-11-05T09:12:00.000Z',
  n: 'Balok lift atap',
  i: { b: '300', h: '600', loads: [{ kind: 'D', w: '12,5' }], note: 'β₁ — kN·m' },
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof EdftError ? e.code : `other:${String(e)}`
  }
}

describe('encodeEdft / decodeEdft', () => {
  it('bolak-balik identik, termasuk Unicode', async () => {
    const bytes = await encodeEdft(ENV)
    expect(await decodeEdft(bytes)).toEqual(ENV)
  })

  it('diawali penanda EDFT + versi format', async () => {
    const bytes = await encodeEdft(ENV)
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('EDFT')
    expect(bytes[4]).toBe(FORMAT_VERSION)
  })

  it('terkompresi: input berulang jauh lebih kecil dari JSON-nya', async () => {
    const rows = Array.from({ length: 200 }, (_, k) => ({ kind: 'L', x: String(k), w: '10', label: 'Beban hidup' }))
    const env = { ...ENV, i: { rows } }
    const bytes = await encodeEdft(env)
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(env).length / 5)
  })

  it('menolak file lain, versi format lebih baru, isi rusak, dan file terlalu besar', async () => {
    const good = await encodeEdft(ENV)
    expect(await code(decodeEdft(new TextEncoder().encode('%PDF-1.7 ...')))).toBe('not-edft')
    expect(await code(decodeEdft(new Uint8Array()))).toBe('not-edft')
    const newer = good.slice()
    newer[4] = FORMAT_VERSION + 1
    expect(await code(decodeEdft(newer))).toBe('newer-format')
    const broken = good.slice(0, 5 + 3)
    expect(await code(decodeEdft(broken))).toBe('corrupt')
    const flipped = good.slice()
    flipped[8] ^= 0xff
    expect(await code(decodeEdft(flipped))).not.toBe('ok')
    expect(await code(decodeEdft(new Uint8Array(MAX_FILE_BYTES + 1)))).toBe('too-large')
  })

  it('menolak amplop yang tidak lengkap', async () => {
    const bad = [
      { ...ENV, t: '../etc' },
      { ...ENV, v: 0 },
      { ...ENV, v: 1.5 },
      { ...ENV, i: [] },
      { ...ENV, n: 3 },
    ]
    for (const env of bad) expect(await code(decodeEdft(await encodeEdft(env as EdftEnvelope)))).toBe('corrupt')
  })

  it('menolak isi yang membengkak di atas batas setelah dekompresi', async () => {
    const env = { ...ENV, i: { s: '0'.repeat(9 << 20) } }
    expect(await code(decodeEdft(await encodeEdft(env)))).toBe('too-large')
  })
})

describe('conform', () => {
  const D = { b: '300', mode: 'a', on: true, rows: [{ x: '0', w: '1' }], opt: null as string | null }

  it('mengisi kunci hilang & mengganti tipe yang salah dengan bawaan', () => {
    expect(conform(D, { b: 400, on: 'ya', rows: 'x', extra: '1' })).toEqual({ ...D, extra: '1' })
  })

  it('baris larik dicocokkan dengan baris pertama bawaan', () => {
    expect(conform(D, { ...D, rows: [{ x: '2' }, 5, { x: '3', w: 7 }] }).rows).toEqual([
      { x: '2', w: '1' },
      { x: '0', w: '1' },
      { x: '3', w: '1' },
    ])
  })

  it('bawaan null menerima nilai apa adanya; bukan objek → bawaan', () => {
    expect(conform(D, { ...D, opt: 'S' }).opt).toBe('S')
    expect(conform(D, [1, 2])).toBe(D)
  })

  // Input bawaan setiap tool harus tetap utuh setelah disimpan & dibuka (larik di input bawaan seragam bentuknya).
  const reports = Object.fromEntries(
    Object.entries(import.meta.glob<{ default: { defaults: unknown } }>('../tools/*/report.ts', { eager: true })).filter(
      ([p]) => !p.split('/')[2].startsWith('_'),
    ),
  )
  it.each(Object.entries(reports).map(([p, m]) => [p.split('/')[2], m.default.defaults] as const))(
    'input bawaan %s utuh setelah bolak-balik file',
    async (id, defaults) => {
      const env = { ...ENV, t: id, i: defaults as Record<string, unknown> }
      const back = await decodeEdft(await encodeEdft(env))
      expect(conform(defaults, back.i)).toEqual(defaults)
    },
  )

  it('folder tool yang diuji ada di katalog', () => {
    for (const p of Object.keys(reports)) expect(TOOLS.some((t) => t.id === p.split('/')[2])).toBe(true)
  })
})

describe('edftFileName', () => {
  const now = new Date(2026, 10, 5, 9, 7)
  it('memakai nama pekerjaan tanpa karakter terlarang', () => {
    expect(edftFileName('beam-check', '  Balok: lift/atap?  ', now)).toBe('Balok lift atap.edft')
  })
  it('tanpa nama → <tool>-YYYYMMDD-HHMM', () => {
    expect(edftFileName('beam-check', '', now)).toBe('beam-check-20261105-0907.edft')
    expect(edftFileName('beam-check', '...', now)).toBe('beam-check-20261105-0907.edft')
  })
})
