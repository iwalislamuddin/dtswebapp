import { isPlainObject } from './edft'
import { parsePath } from './routes'
import { queueToolInput } from './tool-state'
import { useUi } from './ui-state'

// Tautan berisi input tool: /{id}?in=<base64url(JSON {v, i})>
//   v = versi input tool (sama dengan argumen useToolInput), i = input UI (boleh parsial; disamakan dengan bawaan
//   lewat conform() seperti file pekerjaan). Dibuat oleh landing edifisia.com/coba ("Lihat detail di Civil Tools").
// Dipanggil sekali sebelum render pertama; parameter `in` langsung dibuang dari URL (tidak ikut terlacak/dibagikan).

const MAX_LEN = 8000

function decode(raw: string): unknown {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
}

export function applySharedInput(): void {
  const params = new URLSearchParams(location.search)
  const raw = params.get('in')
  if (raw === null) return
  params.delete('in')
  const rest = params.toString()
  history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)

  const route = parsePath(location.pathname)
  if (route.kind !== 'tool' || raw.length > MAX_LEN) return
  let env: unknown
  try {
    env = decode(raw)
  } catch {
    return
  }
  if (!isPlainObject(env) || typeof env.v !== 'number' || !isPlainObject(env.i)) return

  const toolId = route.id
  queueToolInput({
    toolId,
    version: env.v,
    input: env.i,
    done: (outcome) => {
      if (outcome === 'ok') return useUi.getState().setTab(toolId, 'input')
      useUi.getState().showNotice({
        title: 'Input dari tautan',
        text: 'Input dari tautan ini dibuat untuk versi tool yang berbeda, jadi input bawaan yang ditampilkan.',
      })
    },
  })
}
