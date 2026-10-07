import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import type { Report } from '../report/model'
import { useUi } from './ui-state'

// Kontrak UI tool (src/tools/README.md): input satu tool = objek JSON murni yang dikelola di sini.
//   - bertahan saat pindah tab Input/Detail dan pindah tool (store bersama);
//   - disimpan di sessionStorage per tool (pulih saat halaman dimuat ulang, seperti build lama v0.5.2);
//   - objek yang sama kelak menjadi state_json Simpan Pekerjaan (Tahap 4).

const KEY = (toolId: string) => `edfs-civil-tools:input:${toolId}`

interface ToolInputs {
  inputs: Record<string, unknown>
  set: (toolId: string, input: unknown) => void
}

const useInputs = create<ToolInputs>()((set) => ({
  inputs: {},
  set: (toolId, input) => set((s) => ({ inputs: { ...s.inputs, [toolId]: input } })),
}))

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
  return [input, setInput, reset] as const
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
