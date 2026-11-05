import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import type { Report } from '../report/model'
import { conform } from './edft'
import { useUi } from './ui-state'

// Kontrak UI tool (src/tools/README.md): input satu tool = objek JSON murni yang dikelola di sini.
//   - bertahan saat pindah tab Input/Detail dan pindah tool (store bersama);
//   - disimpan di sessionStorage per tool (pulih saat halaman dimuat ulang, seperti build lama v0.5.2);
//   - objek yang sama disimpan/dibuka sebagai file pekerjaan .edft (src/app/edft.ts, work-file.ts) dan kelak
//     state_json Simpan Pekerjaan ke cloud (Tahap 4).

const KEY = (toolId: string) => `edfs-civil-tools:input:${toolId}`

/** Input dari file pekerjaan yang menunggu diterapkan oleh tool tujuan (setelah rutenya terbuka). */
export interface PendingInput {
  toolId: string
  version: number
  input: Record<string, unknown>
  /** Dipanggil tool tujuan: 'ok' bila diterapkan, 'version' bila versi input file berbeda dari tool. */
  done: (outcome: 'ok' | 'version', toolVersion: number) => void
}

interface ToolInputs {
  inputs: Record<string, unknown>
  set: (toolId: string, input: unknown) => void
  /** Tool yang UI-nya sedang ter-mount (sumber Simpan Pekerjaan). */
  active: string | null
  pending: PendingInput | null
}

const useInputs = create<ToolInputs>()((set) => ({
  inputs: {},
  set: (toolId, input) => set((s) => ({ inputs: { ...s.inputs, [toolId]: input } })),
  active: null,
  pending: null,
}))

/** Versi & input bawaan per tool, dicatat useToolInput (tidak reaktif). */
const schemas = new Map<string, { version: number; defaults: object }>()

function restore<I>(toolId: string, defaults: I, version: number): I {
  try {
    const raw = sessionStorage.getItem(KEY(toolId))
    if (!raw) return defaults
    const saved = JSON.parse(raw) as { v: number; input: I }
    return saved.v === version ? { ...defaults, ...saved.input } : defaults
  } catch {
    return defaults
  }
}

/**
 * Input tool + setter parsial. `version` dinaikkan bila bentuk input berubah (simpanan lama diabaikan).
 * `reset()` kembali ke input bawaan.
 */
export function useToolInput<I extends object>(toolId: string, defaults: I, version = 1) {
  schemas.set(toolId, { version, defaults })
  const stored = useInputs((s) => s.inputs[toolId]) as I | undefined
  const input = useMemo(() => stored ?? restore(toolId, defaults, version), [stored, toolId, defaults, version])

  const setInput = useCallback(
    (patch: Partial<I> | ((prev: I) => I)) => {
      const prev = (useInputs.getState().inputs[toolId] as I | undefined) ?? restore(toolId, defaults, version)
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      useInputs.getState().set(toolId, next)
      try {
        sessionStorage.setItem(KEY(toolId), JSON.stringify({ v: version, input: next }))
      } catch {
        // penyimpanan diblokir: input hanya bertahan selama halaman terbuka
      }
    },
    [toolId, defaults, version],
  )
  const reset = useCallback(() => setInput(() => defaults), [setInput, defaults])

  useEffect(() => {
    useInputs.setState({ active: toolId })
    return () => {
      if (useInputs.getState().active === toolId) useInputs.setState({ active: null })
    }
  }, [toolId])

  // File pekerjaan untuk tool ini: terapkan bila versinya sama (bentuk disamakan dengan bawaan), tolak bila beda.
  const pending = useInputs((s) => (s.pending?.toolId === toolId ? s.pending : null))
  useEffect(() => {
    if (!pending) return
    useInputs.setState({ pending: null })
    if (pending.version !== version) return pending.done('version', version)
    setInput(() => conform(defaults, pending.input))
    pending.done('ok', version)
  }, [pending, version, defaults, setInput])

  return [input, setInput, reset] as const
}

/** Id tool yang sedang tampil dan bisa disimpan (null di halaman depan / tool tanpa UI baru). */
export const useActiveTool = () => useInputs((s) => s.active)

/** Input tool aktif + versinya, untuk ditulis ke file pekerjaan. */
export function activeToolInput(): { toolId: string; version: number; input: Record<string, unknown> } | null {
  const toolId = useInputs.getState().active
  const schema = toolId ? schemas.get(toolId) : undefined
  if (!toolId || !schema) return null
  const input = (useInputs.getState().inputs[toolId] ?? restore(toolId, schema.defaults, schema.version)) as Record<string, unknown>
  return { toolId, version: schema.version, input }
}

/** Antre input dari file pekerjaan; diterapkan oleh useToolInput tool tujuan saat ter-mount (atau segera bila aktif). */
export function queueToolInput(p: PendingInput) {
  useInputs.setState({ pending: p })
}

/**
 * Hitung otomatis: hasil dari input terbaru (ditunda React bila input berubah cepat). Bila `compute` mengembalikan
 * null (input tidak valid), hasil sah terakhir dipertahankan dengan `stale = true` agar UI meredupkannya.
 */
export function useAutoCompute<I, R>(input: I, compute: (input: I) => R | null): { result: R | null; stale: boolean } {
  // useDeferredValue: ketikan cepat tetap responsif; hitung ulang mengikuti saat browser senggang.
  const deferred = useDeferredValue(input)
  const fresh = useMemo(() => compute(deferred), [compute, deferred])
  const last = useRef<R | null>(null)
  if (fresh !== null) last.current = fresh
  return { result: fresh ?? last.current, stale: fresh === null }
}

/** Daftarkan laporan tool aktif untuk File > Download Report (dikosongkan saat tool ditutup). */
export function useToolReport(toolId: string, report: Report | null) {
  useEffect(() => {
    useUi.getState().setReport(report ? { toolId, report } : null)
  }, [toolId, report])
  useEffect(() => () => useUi.getState().setReport(null), [])
}
