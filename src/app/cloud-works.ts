import { getClient } from './auth/store'
import { MAX_NAME, parseEnvelope, type EdftEnvelope } from './edft'

// Simpan Pekerjaan ke cloud: tabel `tools.saved_works` (supabase/migrations/20261006000000_tools_saved_works.sql).
//   - state_json = amplop .edft tanpa nama ({t, v, a, d, i}); nama di kolom `name`, tool di kolom `tool_id`.
//   - Aturan ditegakkan database (RLS): baca & hapus = pemilik (Free User tetap bisa); simpan baru & timpa = pemilik
//     + Premium aktif; maksimal 50 per user (galat hint 'saved_works_limit'). UI hanya menyesuaikan tampilan.
// Bagian murni (pesan galat, nama bawaan, batas ukuran) diuji di cloud-works.test.ts.

export const MAX_WORKS = 50
/** Batas CHECK state_json di database (octet_length(state_json::text) ≤ 256 KB). */
export const MAX_STATE_BYTES = 262144

export interface CloudWork {
  id: string
  toolId: string
  name: string
  updatedAt: string
}

interface Row {
  id: string
  tool_id: string
  name: string
  updated_at: string
}

const toWork = (r: Row): CloudWork => ({ id: r.id, toolId: r.tool_id, name: r.name, updatedAt: r.updated_at })

export class CloudWorkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CloudWorkError'
  }
}

interface DbError {
  code?: string
  hint?: string | null
  message?: string
}

/** Galat PostgREST/Supabase → pesan untuk pengguna (dikenali lewat hint/code, bukan teks pesan). */
export function cloudErrorMessage(e: DbError | null | undefined, op: 'list' | 'read' | 'save' | 'update' | 'delete'): string {
  const code = e?.code ?? ''
  const msg = e?.message ?? ''
  if (e?.hint === 'saved_works_limit')
    return `Batas ${MAX_WORKS} pekerjaan tersimpan tercapai. Hapus pekerjaan lama (File › Buka Pekerjaan) atau timpa pekerjaan yang sudah ada.`
  if (code === '42501') return op === 'save' || op === 'update' ? 'Menyimpan ke cloud butuh Edifisia Premium yang aktif.' : 'Akses ditolak. Masuk lagi lalu coba ulang.'
  // .single() tanpa baris: pekerjaan sudah dihapus, atau (timpa) Premium tidak aktif sehingga RLS menyaring barisnya.
  if (code === 'PGRST116')
    return op === 'update' ? 'Pekerjaan yang akan ditimpa tidak ditemukan, atau Premium tidak aktif.' : 'Pekerjaan tidak ditemukan — mungkin sudah dihapus.'
  if (code === '23514') return 'Isi pekerjaan terlalu besar untuk disimpan ke cloud.'
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(msg)) return 'Sesi login berakhir. Masuk lagi lalu coba ulang.'
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.'
  const what = { list: 'Daftar pekerjaan gagal dimuat', read: 'Pekerjaan gagal dibuka', save: 'Pekerjaan gagal disimpan', update: 'Pekerjaan gagal ditimpa', delete: 'Pekerjaan gagal dihapus' }[op]
  return `${what}. Coba lagi.`
}

const fail = (e: unknown, op: Parameters<typeof cloudErrorMessage>[1]): never => {
  console.warn(`saved_works ${op}:`, e)
  throw new CloudWorkError(cloudErrorMessage(e as DbError, op))
}

/** Isi kolom state_json: amplop tanpa nama (nama di kolom `name`). */
export function cloudState(env: EdftEnvelope): Record<string, unknown> {
  return { t: env.t, v: env.v, a: env.a, d: env.d, i: env.i }
}

/** Ukuran state_json seperti dihitung CHECK database (teks JSON, byte UTF-8). */
export const stateBytes = (state: unknown) => new TextEncoder().encode(JSON.stringify(state)).byteLength

const p2 = (x: number) => String(x).padStart(2, '0')

/** Nama bawaan bila dikosongkan (kolom `name` wajib 1–120 karakter): "<nama tool> YYYY-MM-DD HH:MM". */
export function defaultWorkName(toolName: string, now = new Date()): string {
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`
  return `${toolName.slice(0, MAX_NAME - stamp.length - 1)} ${stamp}`
}

/** Nama siap simpan: spasi dirapikan, dipotong 120, atau nama bawaan bila kosong. */
export function cleanWorkName(name: string, toolName: string, now = new Date()): string {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim()
  return n || defaultWorkName(toolName, now)
}

/** Pekerjaan tool yang sama dengan nama sama (tanpa beda huruf besar/kecil) — disimpan dengan menimpanya. */
export function findSameName(works: CloudWork[], toolId: string, name: string): CloudWork | undefined {
  const key = name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('id')
  return key ? works.find((w) => w.toolId === toolId && w.name.toLocaleLowerCase('id') === key) : undefined
}

async function table() {
  const sb = await getClient()
  return sb.schema('tools').from('saved_works')
}

const COLS = 'id, tool_id, name, updated_at'

/** Pekerjaan milik pengguna, terbaru di atas (RLS: hanya milik sendiri). */
export async function listCloudWorks(): Promise<CloudWork[]> {
  try {
    const { data, error } = await (await table()).select(COLS).order('updated_at', { ascending: false }).limit(MAX_WORKS + 10)
    if (error) return fail(error, 'list')
    return (data as Row[]).map(toWork)
  } catch (e) {
    if (e instanceof CloudWorkError) throw e
    return fail(e, 'list')
  }
}

/** Amplop satu pekerjaan (nama dari kolom `name`, tool dari kolom `tool_id`). */
export async function readCloudWork(id: string): Promise<EdftEnvelope> {
  let row: Row & { state_json: unknown }
  try {
    const { data, error } = await (await table()).select(`${COLS}, state_json`).eq('id', id).single()
    if (error) return fail(error, 'read')
    row = data as Row & { state_json: unknown }
  } catch (e) {
    if (e instanceof CloudWorkError) throw e
    return fail(e, 'read')
  }
  const state = row.state_json && typeof row.state_json === 'object' ? row.state_json : {}
  try {
    return parseEnvelope({ ...state, t: row.tool_id, n: row.name })
  } catch {
    throw new CloudWorkError('Isi pekerjaan ini rusak dan tidak dapat dibuka.')
  }
}

/** Simpan baru, atau timpa `overwriteId` (nama & isi). `name` sudah dirapikan (cleanWorkName). */
export async function saveCloudWork(env: EdftEnvelope, name: string, overwriteId?: string): Promise<CloudWork> {
  const state = cloudState(env)
  if (stateBytes(state) > MAX_STATE_BYTES) throw new CloudWorkError('Isi pekerjaan terlalu besar untuk disimpan ke cloud (maks. 256 KB).')
  const op = overwriteId ? 'update' : 'save'
  try {
    const t = await table()
    const { data, error } = overwriteId
      ? await t.update({ name, state_json: state }).eq('id', overwriteId).select(COLS).single()
      : await t.insert({ tool_id: env.t, name, state_json: state }).select(COLS).single()
    if (error) return fail(error, op)
    return toWork(data as Row)
  } catch (e) {
    if (e instanceof CloudWorkError) throw e
    return fail(e, op)
  }
}

export async function deleteCloudWork(id: string): Promise<void> {
  try {
    const { error } = await (await table()).delete().eq('id', id)
    if (error) fail(error, 'delete')
  } catch (e) {
    if (e instanceof CloudWorkError) throw e
    fail(e, 'delete')
  }
}
