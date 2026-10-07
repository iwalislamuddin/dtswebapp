import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { linkClick } from '../app/router'
import { useUi, type ToolTab } from '../app/ui-state'
import { toolReportLoader, toolUI } from '../tools/registry'
import type { ToolEntry } from '../tools'
import type { Report } from '../report/model'
import { DetailTab } from './ReportView'
import { FileDown, Loader2, Lock } from 'lucide-react'
import { usePremium } from '../app/premium'
import { downloadActivePdf } from '../app/report-actions'

const TABS: { id: ToolTab; label: string }[] = [
  { id: 'input', label: 'Input' },
  { id: 'detail', label: 'Detail' },
]

/** Jendela utama satu tool: header (judul + deskripsi) dan content bertab Input / Detail (docs/UI.md). */
export function ToolPage({ tool }: { tool: ToolEntry }) {
  const tab = useUi((s) => s.tabs[tool.id] ?? 'input')
  const header = (
    <header className="tool-head">
      <div className="tool-crumb">{tool.category}</div>
      <h1>{tool.name}</h1>
      <p className="tool-desc" title={tool.seo.desc}>
        {tool.seo.desc}
      </p>
    </header>
  )

  if (tool.status !== 'active') {
    return (
      <div className="tool">
        {header}
        <div className="tool-body">
          <Notice title={inactiveTitle(tool)}>{inactiveText(tool)}</Notice>
        </div>
      </div>
    )
  }

  return <ActiveTool tool={tool} tab={tab} UI={toolUI(tool.id)} header={header} />
}

/**
 * Tool yang belum punya UI baru tetapi sudah punya modul laporan: laporan dengan input bawaan dipakai untuk tab
 * Detail dan File > Download Report.
 */
function useDefaultReport(toolId: string, enabled: boolean): Report | null {
  const [report, setReport] = useState<Report | null>(null)
  useEffect(() => {
    const load = enabled ? toolReportLoader(toolId) : null
    if (!load) return
    let live = true
    void load().then((m) => {
      if (!live) return
      const r = m.default.build(m.default.defaults)
      setReport(r)
      useUi.getState().setReport({ toolId, report: r })
    })
    return () => {
      live = false
      useUi.getState().setReport(null)
    }
  }, [toolId, enabled])
  return report
}

function ActiveTool({
  tool,
  tab,
  UI,
  header,
}: {
  tool: ToolEntry
  tab: ToolTab
  UI: ReturnType<typeof toolUI>
  header: ReactNode
}) {
  const defaultReport = useDefaultReport(tool.id, !UI)
  const { premium } = usePremium()
  const hasReport = useUi((s) => s.report?.toolId === tool.id)
  const pdfState = useUi((s) => s.pdfState)
  return (
    <div className="tool">
      {header}
      <div className="tool-tabs">
        <div role="tablist" aria-label="Tampilan tool" className="tool-tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="tool-panel"
              className={`tool-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => useUi.getState().setTab(tool.id, t.id)}
            >
              {t.label}
              {t.id === 'detail' && !premium && <Lock size={12} className="tab-lock" aria-label="Premium" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn pdf-btn"
          disabled={!hasReport || !premium || pdfState === 'busy'}
          onClick={() => void downloadActivePdf()}
          title={!premium ? 'Download PDF — fitur Premium' : !hasReport ? 'Lengkapi input untuk membuat laporan' : 'Unduh laporan perhitungan (PDF)'}
        >
          {pdfState === 'busy' ? <Loader2 size={14} className="spin" /> : premium ? <FileDown size={14} /> : <Lock size={13} />}
          PDF
        </button>
        {pdfState === 'error' && <span className="pdf-err">PDF gagal dibuat — coba lagi</span>}
      </div>
      <div className="tool-body" role="tabpanel" id="tool-panel" aria-labelledby={`tab-${tab}`}>
        {UI ? (
          <Suspense fallback={<div className="tool-loading muted">Memuat…</div>}>
            <UI key={tool.id} tab={tab} />
          </Suspense>
        ) : tab === 'detail' && defaultReport ? (
          <DetailTab
            report={defaultReport}
            note="Contoh perhitungan dengan input bawaan — tampilan input baru tool ini menyusul di versi 0.8."
          />
        ) : (
          <Notice title={tab === 'input' ? 'Antarmuka baru sedang disiapkan' : 'Detail perhitungan sedang disiapkan'}>
            Perhitungan tool ini sudah dipindahkan ke mesin hitung baru; tampilan input, diagram, dan detail
            perhitungannya menyusul di versi 0.8.
          </Notice>
        )}
      </div>
    </div>
  )
}

function inactiveTitle(t: ToolEntry): string {
  if (t.status === 'moved') return `Pindah ke ${t.movedTo}`
  if (t.status === 'pending') return 'Segera tersedia'
  return 'Tidak tersedia'
}

function inactiveText(t: ToolEntry): ReactNode {
  if (t.status === 'moved')
    return `${t.name} kini menjadi bagian dari ${t.movedTo}, aplikasi Edifisia khusus sambungan baja. Tautan menyusul saat aplikasinya dirilis.`
  if (t.status === 'pending') return `${t.name} sedang dipindahkan ke versi baru Civil Tools.`
  return (
    <>
      Tool ini tidak lagi tersedia di versi ini.{' '}
      <a href="/" onClick={linkClick}>
        Kembali ke halaman depan
      </a>
      .
    </>
  )
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}
