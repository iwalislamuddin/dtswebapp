import { useSyncExternalStore, type MouseEvent } from 'react'

// Router path /{id} tanpa library di atas history API. Penguraian path: routes.ts.

export { parsePath, toolPath, type Route } from './routes'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) addEventListener('popstate', notify)
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) removeEventListener('popstate', notify)
  }
}

const getPath = () => location.pathname

/** Path aktif (berubah lewat navigate() atau tombol Back/Forward). */
export const usePath = () => useSyncExternalStore(subscribe, getPath)

export function navigate(path: string) {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  notify()
}

/** onClick untuk <a href> internal: navigasi SPA, kecuali klik dengan modifier / tombol tengah (tab baru). */
export function linkClick(e: MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  navigate(e.currentTarget.pathname)
}
