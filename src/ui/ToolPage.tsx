import { Suspense, type ReactNode } from 'react'
import { linkClick } from '../app/router'
import { useUi, type ToolTab } from '../app/ui-state'
import { toolUI } from '../tools/registry'
import type { ToolEntry } from '../tools'

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

  const UI = toolUI(tool.id)
  return (
    <div className="tool">
      {header}
      <div className="tool-tabs" role="tablist" aria-label="Tampilan tool">
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
          </button>
        ))}
      </div>
      <div className="tool-body" role="tabpanel" id="tool-panel" aria-labelledby={`tab-${tab}`}>
        {UI ? (
          <Suspense fallback={<div className="tool-loading muted">Memuat…</div>}>
            <UI key={tool.id} tab={tab} />
          </Suspense>
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
