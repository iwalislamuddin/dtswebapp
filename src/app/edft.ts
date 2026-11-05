// Format file pekerjaan Civil Tools (*.edft) — satu format untuk semua tool.
//
//   byte 0–3  'E' 'D' 'F' 'T'   penanda file (file lain langsung ditolak tanpa didekompresi)
//   byte 4    versi format      (FORMAT_VERSION; dinaikkan hanya bila susunan byte/kompresi berubah)
//   byte 5…   amplop JSON UTF-8, dikompres deflate-raw (CompressionStream bawaan browser, tanpa library)
//
// Amplop (kunci pendek; isi `i` apa adanya = objek input useToolInput, kunci tidak disingkat):
//   { "t": id tool (src/tools.ts), "v": versi input tool, "a": versi aplikasi, "d": waktu simpan ISO,
//     "n": nama pekerjaan (opsional), "i": { ...input tool } }
//
// Modul murni (tanpa DOM/React) agar diuji Vitest. Penerapan ke tool: src/app/work-file.ts + tool-state.ts.

export const EDFT_EXT = '.edft'
export const EDFT_MIME = 'application/vnd.edifisia.civil-tools+edft'
export const FORMAT_VERSION = 1
const MAGIC = [0x45, 0x44, 0x46, 0x54] // "EDFT"
const HEADER = MAGIC.length + 1

/** Batas ukuran file & isi setelah dekompresi (pelindung file rusak / "zip bomb"). */
export const MAX_FILE_BYTES = 1 << 20
export const MAX_JSON_BYTES = 8 << 20
export const MAX_NAME = 120

export interface EdftEnvelope {
  /** Id tool (= tools.saved_works.tool_id). */
  t: string
  /** Versi bentuk input tool (argumen `version` useToolInput). */
  v: number
  /** Versi aplikasi saat disimpan. */
  a: string
  /** Waktu simpan (ISO 8601). */
  d: string
  /** Nama pekerjaan. */
  n?: string
  /** Input tool. */
  i: Record<string, unknown>
}

export type EdftErrorCode = 'too-large' | 'not-edft' | 'newer-format' | 'corrupt'

export class EdftError extends Error {
  readonly code: EdftErrorCode
  constructor(code: EdftErrorCode, message: string) {
    super(message)
    this.name = 'EdftError'
    this.code = code
  }
}

const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/ // sama dengan CHECK tools.saved_works.tool_id

export const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new EdftError('too-large', 'Isi file terlalu besar.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.byteLength
  }
  return out
}

/** Amplop → byte file .edft. */
export async function encodeEdft(env: EdftEnvelope): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(env))
  const body = await pipe(json, new CompressionStream('deflate-raw'))
  const out = new Uint8Array(HEADER + body.byteLength)
  out.set(MAGIC, 0)
  out[MAGIC.length] = FORMAT_VERSION
  out.set(body, HEADER)
  return out
}

/** Byte file .edft → amplop tervalidasi (bentuknya saja; kecocokan tool & versi diperiksa pemanggil). */
export async function decodeEdft(bytes: Uint8Array): Promise<EdftEnvelope> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new EdftError('too-large', 'File terlalu besar untuk file pekerjaan.')
  if (bytes.byteLength < HEADER || MAGIC.some((b, k) => bytes[k] !== b))
    throw new EdftError('not-edft', 'Bukan file pekerjaan EDFS Civil Tools (.edft).')
  const fmt = bytes[MAGIC.length]
  if (fmt !== FORMAT_VERSION) {
    if (fmt > FORMAT_VERSION)
      throw new EdftError('newer-format', 'File dibuat dengan versi aplikasi yang lebih baru. Muat ulang halaman untuk memperbarui aplikasi.')
    throw new EdftError('corrupt', 'Versi format file tidak dikenal.')
  }
  let env: unknown
  try {
    const json = await pipe(bytes.subarray(HEADER), new DecompressionStream('deflate-raw'), MAX_JSON_BYTES)
    env = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json))
  } catch (e) {
    if (e instanceof EdftError) throw e
    throw new EdftError('corrupt', 'File pekerjaan rusak dan tidak dapat dibaca.')
  }
  if (
    !isPlainObject(env) ||
    typeof env.t !== 'string' ||
    !TOOL_ID.test(env.t) ||
    typeof env.v !== 'number' ||
    !Number.isInteger(env.v) ||
    env.v < 1 ||
    !isPlainObject(env.i) ||
    (env.n !== undefined && typeof env.n !== 'string')
  )
    throw new EdftError('corrupt', 'Isi file pekerjaan tidak lengkap atau rusak.')
  return {
    t: env.t,
    v: env.v,
    a: typeof env.a === 'string' ? env.a : '',
    d: typeof env.d === 'string' ? env.d : '',
    ...(typeof env.n === 'string' && env.n.trim() ? { n: env.n.trim().slice(0, MAX_NAME) } : {}),
    i: env.i,
  }
}

/**
 * Samakan bentuk input dari file dengan input bawaan tool: nilai yang tipenya berbeda dari bawaan (mis. angka di
 * tempat teks form, objek di tempat larik) diganti bawaan, kunci yang hilang diisi bawaan. Elemen larik (baris
 * beban/lapisan) dicocokkan dengan elemen pertama larik bawaan. Kunci di luar bawaan (field opsional) dibiarkan.
 * Isi yang tipenya benar tapi tidak sah (teks "abc" di field angka) ditangani validate() tiap tool.
 */
export function conform<T>(defaults: T, value: unknown): T {
  if (defaults === null || defaults === undefined) return value as T
  if (Array.isArray(defaults)) {
    if (!Array.isArray(value)) return defaults
    const tpl: unknown = defaults[0]
    return (tpl === undefined ? value : value.map((x) => conform(tpl, x))) as T
  }
  if (typeof defaults === 'object') {
    if (!isPlainObject(value)) return defaults
    const d = defaults as Record<string, unknown>
    const out: Record<string, unknown> = { ...value }
    for (const k of Object.keys(d)) out[k] = Object.hasOwn(value, k) ? conform(d[k], value[k]) : d[k]
    return out as T
  }
  return (typeof value === typeof defaults ? value : defaults) as T
}

const p2 = (x: number) => String(x).padStart(2, '0')

/** Nama file: nama pekerjaan (karakter terlarang dibuang) atau <tool>-YYYYMMDD-HHMM, ditambah .edft. */
export function edftFileName(toolId: string, name: string | undefined, now = new Date()): string {
  const clean = (name ?? '')
    // eslint-disable-next-line no-control-regex -- karakter kendali memang dibuang dari nama file
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim()
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`
  return `${clean || `${toolId}-${stamp}`}${EDFT_EXT}`
}
