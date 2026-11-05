import { toolById } from '../tools'
import { toolUI } from '../tools/registry'
import { decodeEdft, EDFT_EXT, EDFT_MIME, EdftError, edftFileName, encodeEdft, MAX_FILE_BYTES, MAX_NAME } from './edft'
import { premiumStatus } from './premium'
import { navigate, toolPath } from './router'
import { activeToolInput, queueToolInput } from './tool-state'
import { useUi } from './ui-state'
import { APP_VERSION } from './version'

// File > Simpan Pekerjaan / Buka Pekerjaan sebagai file lokal .edft (format: src/app/edft.ts). Fitur Premium —
// gating di sini (pemanggil menu juga menonaktifkan itemnya). Nama pekerjaan terakhir per tool diingat agar simpan
// ulang tidak perlu mengetik lagi; nama dari file yang dibuka ikut diingat.

const NAME_KEY = (toolId: string) => `edfs-civil-tools:work-name:${toolId}`

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

const premium = () => premiumStatus().premium

/** Simpan tersedia: Premium dan tool yang tampil punya input. */
export const canSaveWork = () => premium() && activeToolInput() !== null

/** File > Simpan Pekerjaan…: dialog nama pekerjaan lebih dulu. */
export function openSaveWorkDialog(): void {
  if (canSaveWork()) useUi.getState().openDialog('save-work')
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
  const cur = activeToolInput()
  if (!cur || !premium()) return
  const n = name.trim().slice(0, MAX_NAME)
  rememberWorkName(cur.toolId, n)
  try {
    const now = new Date()
    const bytes = await encodeEdft({
      t: cur.toolId,
      v: cur.version,
      a: APP_VERSION,
      d: now.toISOString(),
      ...(n ? { n } : {}),
      i: cur.input,
    })
    download(bytes, edftFileName(cur.toolId, n, now))
  } catch (e) {
    console.error('File pekerjaan gagal dibuat:', e)
    useUi.getState().showNotice({ title: 'Simpan Pekerjaan', text: 'File pekerjaan gagal dibuat. Coba lagi.' })
  }
}

const fail = (text: string) => useUi.getState().showNotice({ title: 'Buka Pekerjaan', text })

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
  const tool = toolById(env.t)
  if (!tool) return fail(`File ini untuk tool "${env.t}" yang tidak dikenal di versi aplikasi ini.`)
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
          ? `File dibuat untuk bentuk input lama tool "${tool.name}" (versi ${env.v}; sekarang versi ${toolVersion}). Input di file ini tidak dapat dibuka.`
          : `File dibuat dengan versi aplikasi yang lebih baru${env.a ? ` (${env.a})` : ''}. Muat ulang halaman untuk memperbarui aplikasi.`,
      )
    },
  })
  navigate(toolPath(tool.id))
}

/** File > Buka Pekerjaan…: pemilih file .edft. */
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
