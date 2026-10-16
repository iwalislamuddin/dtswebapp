import { create } from 'zustand'
import type { Report } from '../report/model'

// Keadaan shell: tema & panel navigasi (disimpan di localStorage), tab aktif per tool, dialog terbuka, dan laporan
// tool yang sedang tampil (sumber File > Download Report).

export type Theme = 'light' | 'dark'
export type ToolTab = 'input' | 'detail'
export type DialogId = 'about' | 'release-notes' | 'pdf' | 'login'

/** Kunci yang sama dibaca skrip awal di web/index.html (tema dipasang sebelum render, tanpa kedip). */
export const PREFS_KEY = 'edfs-civil-tools:prefs'

/** Di bawah lebar ini panel navigasi menjadi laci di atas konten (sama dengan @media di App.css). */
export const NARROW = '(max-width: 760px)'
const isNarrow = () => matchMedia(NARROW).matches

interface Prefs {
  theme: Theme
  navOpen: boolean
  /** Kategori navigasi yang dilipat. */
  navCollapsed: string[]
}

interface UiState extends Prefs {
  tabs: Record<string, ToolTab>
  dialog: DialogId | null
  /** Laporan tool aktif — diisi UI tool / tab Detail, dikosongkan saat tool ditutup. */
  report: { toolId: string; report: Report } | null
  setReport: (r: { toolId: string; report: Report } | null) => void
  /** Status unduhan PDF laporan aktif. */
  pdfState: 'idle' | 'busy' | 'error'
  setTheme: (t: Theme) => void
  toggleNav: (open?: boolean) => void
  toggleCategory: (category: string) => void
  setTab: (toolId: string, tab: ToolTab) => void
  openDialog: (d: DialogId | null) => void
}

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
  } catch {
    return {}
  }
}

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const saved = loadPrefs()

export const useUi = create<UiState>()((set) => ({
  theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : systemTheme(),
  // Layar sempit: laci selalu mulai tertutup; preferensi buka/tutup hanya berlaku untuk layar lebar.
  navOpen: !isNarrow() && saved.navOpen !== false,
  navCollapsed: Array.isArray(saved.navCollapsed) ? saved.navCollapsed.filter((c) => typeof c === 'string') : [],
  tabs: {},
  dialog: null,
  report: null,
  pdfState: 'idle',
  setReport: (report) => set({ report }),
  setTheme: (theme) => set({ theme }),
  toggleNav: (open) => set((s) => ({ navOpen: open ?? !s.navOpen })),
  toggleCategory: (c) =>
    set((s) => ({ navCollapsed: s.navCollapsed.includes(c) ? s.navCollapsed.filter((x) => x !== c) : [...s.navCollapsed, c] })),
  setTab: (toolId, tab) => set((s) => ({ tabs: { ...s.tabs, [toolId]: tab } })),
  openDialog: (dialog) => set({ dialog }),
}))

// Tema di <html data-theme>, dipasang sinkron agar token CSS sudah benar saat React merender ulang.
const applyTheme = (t: Theme) => {
  document.documentElement.dataset.theme = t
}
applyTheme(useUi.getState().theme)

useUi.subscribe((s, prev) => {
  if (s.theme !== prev.theme) applyTheme(s.theme)
  if (s.theme === prev.theme && s.navOpen === prev.navOpen && s.navCollapsed === prev.navCollapsed) return
  const navOpen = isNarrow() ? (loadPrefs().navOpen ?? true) : s.navOpen
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: s.theme, navOpen, navCollapsed: s.navCollapsed } satisfies Prefs))
  } catch {
    // mode privat / penyimpanan diblokir: preferensi hanya berlaku di sesi ini
  }
})
