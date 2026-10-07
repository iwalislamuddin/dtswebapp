import { Moon, PanelLeft, Sun, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { APP_NAME } from '../app/appInfo'
import { linkClick, navigate } from '../app/router'
import { useUi } from '../app/ui-state'
import { APP_VERSION } from '../app/version'
import { downloadReport, reportMeta, type ReportFormat } from '../report/download'
import { BrandMark } from './Brand'
import { UpdatePrompt } from './UpdatePrompt'

interface MenuItem {
  label: string
  onSelect?: () => void
  /** Tooltip, mis. alasan item belum aktif. */
  hint?: string
}
type MenuEntry = MenuItem | 'sep'
interface MenuDef {
  id: string
  label: string
  items: MenuEntry[]
}

// Simpan/Buka menunggu akun Supabase (Tahap 4); item tampil nonaktif agar susunan menu final terlihat. Download
// Report aktif bila tool yang tampil punya laporan (gating Premium menyusul di Tahap 4, satu titik di sini).
const SOON = 'Segera — membutuhkan akun Edifisia'

function menus(): MenuDef[] {
  const ui = useUi.getState()
  // Laporan tool yang sedang tampil (null di halaman depan / tool tanpa laporan).
  const rep = ui.report
  const dl = (fmt: ReportFormat) =>
    rep ? () => downloadReport(rep.toolId, rep.report, fmt, reportMeta(APP_VERSION)) : undefined
  const noReport = 'Buka tool yang sudah punya laporan'
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Halaman Depan', onSelect: () => navigate('/') },
        'sep',
        { label: 'Simpan Pekerjaan…', hint: SOON },
        { label: 'Buka Pekerjaan…', hint: SOON },
        'sep',
        { label: 'Download Report (PDF)', onSelect: dl('pdf'), hint: rep ? undefined : noReport },
        { label: 'Download Report (.txt)', onSelect: dl('txt'), hint: rep ? undefined : noReport },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'Catatan Rilis', onSelect: () => ui.openDialog('release-notes') },
        'sep',
        { label: `Tentang ${APP_NAME}`, onSelect: () => ui.openDialog('about') },
      ],
    },
  ]
}

export function MenuBar() {
  const theme = useUi((s) => s.theme)
  const navOpen = useUi((s) => s.navOpen)
  useUi((s) => s.report) // menu Download Report ikut aktif/nonaktif
  const [open, setOpen] = useState<string | null>(null)
  // Dinaikkan saat menu dibuka/dituju dengan keyboard: popup lalu memfokuskan item pertamanya.
  const [focusTick, setFocusTick] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)

  // Tutup saat klik di luar menu bar atau Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      barRef.current?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`)?.focus()
      setOpen(null)
    }
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [open])

  const defs = menus()

  return (
    <header className="menubar">
      <button
        type="button"
        className="mb-icon"
        onClick={() => useUi.getState().toggleNav()}
        title={navOpen ? 'Sembunyikan navigasi' : 'Tampilkan navigasi'}
        aria-label="Navigasi"
        aria-pressed={navOpen}
      >
        <PanelLeft size={16} />
      </button>
      <a className="mb-app" href="/" onClick={linkClick} title="Halaman depan">
        <BrandMark size={16} />
        <span>
          <b>EDFS</b> Civil Tools
        </span>
      </a>
      <nav className="mb-menus" ref={barRef} aria-label="Menu utama">
        {defs.map((m) => (
          <div key={m.id} className="mb-menu">
            <button
              type="button"
              className={`mb-menu-btn${open === m.id ? ' open' : ''}`}
              data-menu={m.id}
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              onClick={(e) => {
                const next = open === m.id ? null : m.id
                setOpen(next)
                // Dibuka dengan keyboard (Enter/Spasi → detail 0): fokus ke item pertama.
                setFocusTick((n) => (next && e.detail === 0 ? n + 1 : 0))
              }}
              onPointerEnter={() => {
                if (!open || open === m.id) return
                setFocusTick(0)
                setOpen(m.id)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown') return
                e.preventDefault()
                setOpen(m.id)
                setFocusTick((n) => n + 1)
              }}
            >
              {m.label}
            </button>
            {open === m.id && <MenuPopup items={m.items} focusTick={focusTick} close={() => setOpen(null)} />}
          </div>
        ))}
      </nav>
      <div className="mb-right">
        <UpdatePrompt />
        <button
          type="button"
          className="mb-icon"
          onClick={() => useUi.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
          aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" className="mb-account" disabled title={SOON}>
          <UserRound size={14} />
          <span>Masuk</span>
        </button>
      </div>
    </header>
  )
}

const ENABLED = '[role="menuitem"]:not([aria-disabled="true"])'

function MenuPopup({ items, focusTick, close }: { items: MenuEntry[]; focusTick: number; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusTick > 0) ref.current?.querySelector<HTMLButtonElement>(ENABLED)?.focus()
  }, [focusTick])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(ENABLED)]
    const i = all.indexOf(document.activeElement as HTMLButtonElement)
    const n = e.key === 'ArrowDown' ? i + 1 : i < 0 ? -1 : i - 1
    all[(n + all.length) % all.length]?.focus()
  }
  return (
    <div className="mb-popup" role="menu" ref={ref} onKeyDown={onKeyDown}>
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="mb-sep" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className="mb-item"
            // aria-disabled (bukan disabled) agar tooltip alasan tetap muncul saat hover.
            aria-disabled={!it.onSelect}
            title={it.hint}
            onClick={() => {
              if (!it.onSelect) return
              close()
              it.onSelect()
            }}
          >
            <span>{it.label}</span>
            {!it.onSelect && it.hint === SOON && <span className="mb-item-note">segera</span>}
          </button>
        ),
      )}
    </div>
  )
}
