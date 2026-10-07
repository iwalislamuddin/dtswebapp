import type { Head } from './seo'

// Pasang <head> rute aktif di browser (navigasi SPA). Isinya dari headFor() di seo.ts — sama dengan HTML pre-render.

function meta(attr: 'name' | 'property', key: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.append(el)
  }
  return el
}

export function applyHead(h: Head) {
  document.title = h.title
  meta('name', 'description').content = h.description
  meta('property', 'og:title').content = h.title
  meta('property', 'og:description').content = h.description
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (h.canonical) {
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.append(link)
    }
    link.href = h.canonical
    meta('property', 'og:url').content = h.canonical
    document.head.querySelector('meta[name="robots"]')?.remove()
  } else {
    link?.remove()
    document.head.querySelector('meta[property="og:url"]')?.remove()
    meta('name', 'robots').content = 'noindex'
  }
}
