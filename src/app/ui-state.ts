import { create } from 'zustand'

// Keadaan shell: tema & panel navigasi (disimpan di localStorage), tab aktif per tool, dialog terbuka.

export type Theme = 'light' | 'dark'
export type ToolTab = 'input' | 'detail'
export type DialogId = 'about' | 'release-notes'

/** Kunci yang sama dibaca skrip awal di web/index.html (tema dipasang sebelum render, tanpa kedip). */
export const PREFS_KEY = 'edfs-civil-tools:prefs'

/** Di bawah lebar ini panel navigasi menjadi laci di atas konten (sama dengan @media di App.css). */
export const NARROW = '(max-width: 760px)'
const isNarrow = () => matchMedia(NARROW).matches

interface Prefs {
  theme: Theme
  navOpen: boolean
}

interface UiState extends Prefs {
  tabs: Record<string, ToolTab>
  dialog: DialogId | null
  setTheme: (t: Theme) => void
  toggleNav: (open?: boolean) => void
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
  tabs: {},
  dialog: null,
  setTheme: (theme) => set({ theme }),
  toggleNav: (open) => set((s) => ({ navOpen: open ?? !s.navOpen })),
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
  if (s.theme === prev.theme && s.navOpen === prev.navOpen) return
  const navOpen = isNarrow() ? (loadPrefs().navOpen ?? true) : s.navOpen
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: s.theme, navOpen } satisfies Prefs))
  } catch {
    // mode privat / penyimpanan diblokir: preferensi hanya berlaku di sesi ini
  }
})
