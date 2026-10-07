import { useSyncExternalStore, type MouseEvent } from 'react'
import { toolById } from '../tools'

// Router path /{id} tanpa library: satu tingkat, rute = halaman depan atau slug tool di katalog.

export type Route = { kind: 'home' } | { kind: 'tool'; id: string } | { kind: 'notfound'; path: string }

export function parsePath(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/' || p === '/index.html') return { kind: 'home' }
  const m = /^\/([a-z0-9][a-z0-9-]{0,63})$/.exec(p)
  if (m && toolById(m[1])) return { kind: 'tool', id: m[1] }
  return { kind: 'notfound', path: p }
}

export const toolPath = (id: string) => `/${id}`

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
