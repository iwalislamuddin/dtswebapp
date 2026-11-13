import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EdftEnvelope } from './edft'

// Klien Supabase palsu: mencatat rantai panggilan query builder dan mengembalikan hasil yang disiapkan tiap test.
// Seperti supabase-js, from() belum "thenable"; select/insert/update/delete mengembalikan builder yang bisa di-await.
const calls: { schema?: string; table?: string; ops: [string, ...unknown[]][] } = { ops: [] }
let result: { data: unknown; error: unknown } = { data: null, error: null }

function filterBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'single'])
    b[m] = (...args: unknown[]) => {
      calls.ops.push([m, ...args])
      return b
    }
  // eslint-disable-next-line unicorn/no-thenable -- meniru PostgrestFilterBuilder yang memang thenable
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad)
  return b
}

function builder() {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'delete'])
    q[m] = (...args: unknown[]) => {
      calls.ops.push([m, ...args])
      return filterBuilder()
    }
  return q
}

vi.mock('./auth/store', () => ({
  getClient: () =>
    Promise.resolve({
      schema: (s: string) => {
        calls.schema = s
        return {
          from: (t: string) => {
            calls.table = t
            return builder()
          },
        }
      },
    }),
}))

const {
  cleanWorkName,
  cloudErrorMessage,
  CloudWorkError,
  cloudState,
  defaultWorkName,
  deleteCloudWork,
  findSameName,
  listCloudWorks,
  MAX_STATE_BYTES,
  readCloudWork,
  saveCloudWork,
} = await import('./cloud-works')

const ENV: EdftEnvelope = { t: 'beam-check', v: 2, a: '0.8.0', d: '2026-11-13T02:00:00.000Z', n: 'Balok B1', i: { b: '300', loads: [{ w: '12' }] } }
const ROW = { id: 'u1', tool_id: 'beam-check', name: 'Balok B1', updated_at: '2026-11-13T02:00:00Z' }

beforeEach(() => {
  calls.ops = []
  calls.schema = calls.table = undefined
  result = { data: null, error: null }
})

describe('cloudErrorMessage', () => {
  it('batas 50 dikenali lewat hint, bukan teks', () => {
    expect(cloudErrorMessage({ code: 'P0001', hint: 'saved_works_limit', message: 'apa saja' }, 'save')).toMatch(/Batas 50/)
  })
  it('RLS menolak simpan → butuh Premium; PGRST116 saat timpa → tidak ditemukan/Premium', () => {
    expect(cloudErrorMessage({ code: '42501', message: 'new row violates row-level security policy' }, 'save')).toMatch(/Premium/)
    expect(cloudErrorMessage({ code: 'PGRST116' }, 'update')).toMatch(/Premium tidak aktif/)
    expect(cloudErrorMessage({ code: 'PGRST116' }, 'read')).toMatch(/sudah dihapus/)
  })
  it('sesi berakhir, jaringan, ukuran, dan galat lain', () => {
    expect(cloudErrorMessage({ code: 'PGRST301', message: 'JWT expired' }, 'list')).toMatch(/Sesi login/)
    expect(cloudErrorMessage({ message: 'TypeError: Failed to fetch' }, 'list')).toMatch(/koneksi internet/)
    expect(cloudErrorMessage({ code: '23514' }, 'save')).toMatch(/terlalu besar/)
    expect(cloudErrorMessage({ code: 'XX000' }, 'delete')).toBe('Pekerjaan gagal dihapus. Coba lagi.')
  })
})

describe('nama pekerjaan', () => {
  const now = new Date(2026, 10, 13, 9, 5)
  it('kosong → "<tool> YYYY-MM-DD HH:MM"; spasi dirapikan; ≤ 120', () => {
    expect(cleanWorkName('   ', 'Cek Desain Balok Beton', now)).toBe('Cek Desain Balok Beton 2026-11-13 09:05')
    expect(cleanWorkName('  Balok   B1 ', 'x', now)).toBe('Balok B1')
    expect(cleanWorkName('a'.repeat(200), 'x', now)).toHaveLength(120)
    expect(defaultWorkName('t'.repeat(200), now)).toHaveLength(120)
  })
  it('nama sama (tanpa beda huruf/spasi) di tool yang sama → ditimpa; tool lain tidak', () => {
    const works = [
      { id: 'a', toolId: 'beam-check', name: 'Balok B1', updatedAt: '' },
      { id: 'b', toolId: 'column-pm', name: 'Balok B1', updatedAt: '' },
    ]
    expect(findSameName(works, 'beam-check', ' balok  b1 ')?.id).toBe('a')
    expect(findSameName(works, 'column-pm', 'BALOK B1')?.id).toBe('b')
    expect(findSameName(works, 'pile-cap', 'Balok B1')).toBeUndefined()
    expect(findSameName(works, 'beam-check', '')).toBeUndefined()
  })
})

describe('akses tabel tools.saved_works', () => {
  it('state_json = amplop tanpa nama', () => {
    expect(cloudState(ENV)).toEqual({ t: 'beam-check', v: 2, a: '0.8.0', d: ENV.d, i: ENV.i })
  })

  it('daftar: kolom ringkas, terbaru di atas', async () => {
    result = { data: [ROW], error: null }
    expect(await listCloudWorks()).toEqual([{ id: 'u1', toolId: 'beam-check', name: 'Balok B1', updatedAt: ROW.updated_at }])
    expect(calls.schema).toBe('tools')
    expect(calls.table).toBe('saved_works')
    expect(calls.ops).toContainEqual(['order', 'updated_at', { ascending: false }])
  })

  it('simpan baru = insert tool_id/name/state_json; timpa = update by id', async () => {
    result = { data: ROW, error: null }
    await saveCloudWork(ENV, 'Balok B1')
    expect(calls.ops[0]).toEqual(['insert', { tool_id: 'beam-check', name: 'Balok B1', state_json: cloudState(ENV) }])
    calls.ops = []
    await saveCloudWork(ENV, 'Balok B1 rev', 'u1')
    expect(calls.ops[0]).toEqual(['update', { name: 'Balok B1 rev', state_json: cloudState(ENV) }])
    expect(calls.ops).toContainEqual(['eq', 'id', 'u1'])
  })

  it('galat database jadi CloudWorkError berpesan Indonesia', async () => {
    result = { data: null, error: { code: 'P0001', hint: 'saved_works_limit', message: 'x' } }
    await expect(saveCloudWork(ENV, 'x')).rejects.toThrow(/Batas 50/)
    await expect(saveCloudWork(ENV, 'x')).rejects.toBeInstanceOf(CloudWorkError)
  })

  it('isi > 256 KB ditolak sebelum dikirim', async () => {
    const big = { ...ENV, i: { s: 'x'.repeat(MAX_STATE_BYTES) } }
    await expect(saveCloudWork(big, 'x')).rejects.toThrow(/terlalu besar/)
    expect(calls.ops).toEqual([])
  })

  it('buka: tool & nama dari kolom, isi divalidasi', async () => {
    result = { data: { ...ROW, state_json: cloudState(ENV) }, error: null }
    expect(await readCloudWork('u1')).toEqual(ENV)
    result = { data: { ...ROW, state_json: { v: 'x' } }, error: null }
    await expect(readCloudWork('u1')).rejects.toThrow(/rusak/)
  })

  it('hapus by id', async () => {
    await deleteCloudWork('u1')
    expect(calls.ops).toEqual([['delete'], ['eq', 'id', 'u1']])
  })
})
