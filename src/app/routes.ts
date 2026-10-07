import { toolById } from '../tools'

// Rute aplikasi (murni, tanpa DOM/React): dipakai router di browser dan pre-render saat build.
// Satu tingkat: halaman depan atau slug tool di katalog.

export type Route = { kind: 'home' } | { kind: 'tool'; id: string } | { kind: 'notfound'; path: string }

export function parsePath(pathname: string): Route {
  // `/x.html` = `/x` (berkas pre-render; Cloudflare Pages biasanya sudah mengalihkannya).
  const p = pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/'
  if (p === '/' || p === '/index') return { kind: 'home' }
  const m = /^\/([a-z0-9][a-z0-9-]{0,63})$/.exec(p)
  if (m && toolById(m[1])) return { kind: 'tool', id: m[1] }
  return { kind: 'notfound', path: p }
}

export const toolPath = (id: string) => `/${id}`
