import { toolById } from '../tools'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, SITE_URL } from './appInfo'
import type { Route } from './router'

// <head> per rute: dipakai shell saat navigasi, dan nanti oleh pre-render HTML per rute (SEO).

export interface Head {
  title: string
  description: string
  /** null = halaman tidak diindeks (404, tool tersembunyi/belum siap/pindah). */
  canonical: string | null
}

export function headFor(route: Route): Head {
  if (route.kind === 'home')
    return { title: `${APP_NAME} — ${APP_TAGLINE} (SNI)`, description: APP_DESCRIPTION, canonical: `${SITE_URL}/` }
  const t = route.kind === 'tool' ? toolById(route.id) : undefined
  if (!t) return { title: `Halaman tidak ditemukan · ${APP_NAME}`, description: APP_DESCRIPTION, canonical: null }
  return {
    title: `${t.seo.title} · ${APP_NAME}`,
    description: t.seo.desc,
    canonical: t.status === 'active' ? `${SITE_URL}/${t.id}` : null,
  }
}

function meta(name: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.append(el)
  }
  return el
}

export function applyHead(h: Head) {
  document.title = h.title
  meta('description').content = h.description
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (h.canonical) {
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.append(link)
    }
    link.href = h.canonical
    document.head.querySelector('meta[name="robots"]')?.remove()
  } else {
    link?.remove()
    meta('robots').content = 'noindex'
  }
}
