import { toolById } from '../tools'
import { toolUI } from '../tools/registry'
import { useAuth } from './auth/store'
import { CloudWorkError, readCloudWork, saveCloudWork, type CloudWork } from './cloud-works'
import { decodeEdft, EDFT_EXT, EDFT_MIME, EdftError, edftFileName, encodeEdft, MAX_FILE_BYTES, MAX_NAME, type EdftEnvelope } from './edft'
import { premiumStatus } from './premium'
import { navigate, toolPath } from './router'
import { activeToolInput, queueToolInput } from './tool-state'
import { useUi } from './ui-state'
import { APP_VERSION } from './version'

// File > Simpan Pekerjaan / Buka Pekerjaan — ke cloud (tools.saved_works, src/app/cloud-works.ts) atau file lokal
// .edft (src/app/edft.ts); keduanya memakai amplop yang sama. Simpan (cloud & file) dan buka file = Premium; daftar
// cloud bisa dibuka & dihapus semua pengguna yang login (pekerjaan tidak disandera saat Premium berakhir).
// Nama pekerjaan terakhir per tool diingat agar simpan ulang tidak perlu mengetik lagi.

const NAME_KEY = (toolId: string) => `edfs-civil-tools:work-name:${toolId}`
const DEST_KEY = 'edfs-civil-tools:work-dest'

export type SaveDest = 'cloud' | 'file'

export function lastWorkName(toolId: string): string {
  try {
    return sessionStorage.getItem(NAME_KEY(toolId)) ?? ''
  } catch {
    return ''
  }
}

function rememberWorkName(toolId: string, name: string) {
  try {
    if (name) sessionStorage.setItem(NAME_KEY(toolId), name)
    else sessionStorage.removeItem(NAME_KEY(toolId))
  } catch {
    // penyimpanan diblokir: nama tidak diingat
  }
}

export function lastSaveDest(): SaveDest {
  try {
    return localStorage.getItem(DEST_KEY) === 'file' ? 'file' : 'cloud'
  } catch {
    return 'cloud'
  }
}

function rememberSaveDest(d: SaveDest) {
  try {
    localStorage.setItem(DEST_KEY, d)
  } catch {
    // penyimpanan diblokir
  }
}

const premium = () => premiumStatus().premium
/** Cloud butuh sesi akun (status Premium "dev" tanpa login hanya bisa ke file). */
export const signedIn = () => useAuth.getState().status === 'user'

/** Simpan tersedia: Premium dan tool yang tampil punya input. */
export const canSaveWork = () => premium() && activeToolInput() !== null

/** File > Simpan Pekerjaan…: dialog nama & tujuan simpan. */
export function openSaveWorkDialog(): void {
  if (canSaveWork()) useUi.getState().openDialog('save-work')
}

/** File > Buka Pekerjaan…: daftar cloud (login) + tombol buka file .edft (Premium). */
export function openOpenWorkDialog(): void {
  useUi.getState().openDialog('open-work')
}

/** Amplop dari input tool aktif. */
function activeEnvelope(name: string): EdftEnvelope | null {
  const cur = activeToolInput()
  if (!cur) return null
  return { t: cur.toolId, v: cur.version, a: APP_VERSION, d: new Date().toISOString(), ...(name ? { n: name } : {}), i: cur.input }
}

function download(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: EDFT_MIME }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

/** Tulis input tool aktif ke file .edft dan unduh. */
export async function saveActiveWork(name: string): Promise<void> {
  const n = name.trim().slice(0, MAX_NAME)
  const env = premium() ? activeEnvelope(n) : null
  if (!env) return
  rememberWorkName(env.t, n)
  rememberSaveDest('file')
  try {
    const bytes = await encodeEdft(env)
    download(bytes, edftFileName(env.t, n, new Date(env.d)))
  } catch (e) {
    console.error('File pekerjaan gagal dibuat:', e)
    useUi.getState().showNotice({ title: 'Simpan Pekerjaan', text: 'File pekerjaan gagal dibuat. Coba lagi.' })
  }
}

/**
 * Simpan input tool aktif ke cloud (baru, atau menimpa `overwriteId`). `name` sudah dirapikan (cleanWorkName).
 * Melempar CloudWorkError berisi pesan untuk ditampilkan di dialog.
 */
export async function saveActiveWorkCloud(name: string, overwriteId?: string): Promise<CloudWork> {
  const env = premium() && signedIn() ? activeEnvelope(name) : null
  if (!env) throw new CloudWorkError('Masuk dengan akun Premium untuk menyimpan ke cloud.')
  const saved = await saveCloudWork(env, name, overwriteId)
  rememberWorkName(env.t, name)
  rememberSaveDest('cloud')
  useUi.getState().showToast(`Tersimpan di cloud: ${name}`)
  return saved
}

const fail = (text: string) => useUi.getState().showNotice({ title: 'Buka Pekerjaan', text })

/** Buka tool tujuan amplop lalu terapkan inputnya (dari file maupun cloud). */
function openEnvelope(env: EdftEnvelope): void {
  const tool = toolById(env.t)
  if (!tool) return fail(`Pekerjaan ini untuk tool "${env.t}" yang tidak dikenal di versi aplikasi ini.`)
  if (tool.status === 'moved') return fail(`Tool "${tool.name}" sudah pindah ke ${tool.movedTo ?? 'aplikasi lain'}.`)
  if (!toolUI(tool.id)) return fail(`Tool "${tool.name}" belum tersedia di tampilan baru.`)

  const name = env.n ?? ''
  queueToolInput({
    toolId: tool.id,
    version: env.v,
    input: env.i,
    done: (outcome, toolVersion) => {
      if (outcome === 'ok') {
        rememberWorkName(tool.id, name)
        useUi.getState().setTab(tool.id, 'input')
        return
      }
      fail(
        env.v < toolVersion
          ? `Pekerjaan ini dibuat untuk bentuk input lama tool "${tool.name}" (versi ${env.v}; sekarang versi ${toolVersion}). Inputnya tidak dapat dibuka.`
          : `Pekerjaan ini dibuat dengan versi aplikasi yang lebih baru${env.a ? ` (${env.a})` : ''}. Muat ulang halaman untuk memperbarui aplikasi.`,
      )
    },
  })
  navigate(toolPath(tool.id))
}

/** Baca file .edft, buka tool tujuannya, lalu terapkan inputnya. */
export async function openWorkFile(file: File): Promise<void> {
  if (!premium()) return
  let env
  try {
    if (file.size > MAX_FILE_BYTES) throw new EdftError('too-large', 'File terlalu besar untuk file pekerjaan.')
    env = await decodeEdft(new Uint8Array(await file.arrayBuffer()))
  } catch (e) {
    if (!(e instanceof EdftError)) console.error('File pekerjaan gagal dibaca:', e)
    return fail(e instanceof EdftError && e.message ? e.message : 'File pekerjaan tidak dapat dibaca.')
  }
  openEnvelope(env)
}

/** Buka pekerjaan dari cloud (semua pengguna yang login). Melempar CloudWorkError bila gagal dimuat. */
export async function openCloudWork(id: string): Promise<void> {
  openEnvelope(await readCloudWork(id))
}

/** Pemilih file .edft. */
export function pickWorkFile(): void {
  if (!premium()) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = EDFT_EXT
  input.addEventListener('change', () => {
    const f = input.files?.[0]
    if (f) void openWorkFile(f)
  })
  input.click()
}
