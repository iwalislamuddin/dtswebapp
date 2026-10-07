import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ToolTab } from '../app/ui-state'
import type { Report } from '../report/model'

// UI tiap tool (Tahap 5) ditulis di src/tools/<id>/index.tsx dengan default export komponen ToolUI. Shell
// memuatnya malas (satu chunk per tool) saat rutenya dibuka. Tool yang belum punya UI → placeholder di shell.
// Laporan tool: src/tools/<id>/report.ts, default export ToolReportModule (dipakai UI tool & tab Detail).

export interface ToolUIProps {
  /** Tab aktif. Komponen tetap ter-mount saat tab berganti, jadi keadaan input bertahan di antara tab. */
  tab: ToolTab
}

export type ToolUI = ComponentType<ToolUIProps>

const modules = import.meta.glob<{ default: ToolUI }>('./*/index.tsx')

const cache = new Map<string, LazyExoticComponent<ToolUI>>()

/** Komponen UI tool (lazy), atau null bila tool belum ditulis ulang di UI baru. */
export function toolUI(id: string): LazyExoticComponent<ToolUI> | null {
  const load = modules[`./${id}/index.tsx`]
  if (!load) return null
  let c = cache.get(id)
  if (!c) cache.set(id, (c = lazy(load)))
  return c
}

/** Laporan satu tool: input bawaan + pembangun laporan dari input (hitung + susun). */
export interface ToolReportModule<I = never> {
  defaults: I
  build: (input: I) => Report
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tiap tool punya tipe input sendiri
const reportModules = import.meta.glob<{ default: ToolReportModule<any> }>('./*/report.ts')

/** Pemuat modul laporan tool, atau null bila belum ada. */
export function toolReportLoader(id: string): (() => Promise<{ default: ToolReportModule<unknown> }>) | null {
  return (reportModules[`./${id}/report.ts`] as (() => Promise<{ default: ToolReportModule<unknown> }>) | undefined) ?? null
}
