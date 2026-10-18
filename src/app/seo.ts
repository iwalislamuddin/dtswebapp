import { TOOLS, toolById, toolGroups, type ToolEntry } from '../tools'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, SITE_URL } from './appInfo'
import { toolPath, type Route } from './routes'

// SEO per rute (murni, tanpa DOM): <head> dipasang shell saat navigasi (head.ts) dan ditulis ke HTML statis per
// rute saat build (prerenderPages, dipanggil plugin di vite.config.ts) — crawler & pratinjau tautan media sosial
// tidak perlu menjalankan JavaScript untuk membaca judul/deskripsi tiap tool.

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
    canonical: t.status === 'active' ? `${SITE_URL}${toolPath(t.id)}` : null,
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Tag <head> tambahan: canonical/robots + Open Graph (pratinjau saat tautan dibagikan). */
function headTags(h: Head): string {
  const tags = [
    h.canonical ? `<link rel="canonical" href="${esc(h.canonical)}" />` : '<meta name="robots" content="noindex" />',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${APP_NAME}" />`,
    `<meta property="og:title" content="${esc(h.title)}" />`,
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta property="og:locale" content="id_ID" />`,
    `<meta property="og:image" content="${SITE_URL}/pwa-512.png" />`,
    `<meta name="twitter:card" content="summary" />`,
  ]
  if (h.canonical) tags.push(`<meta property="og:url" content="${esc(h.canonical)}" />`)
  return tags.map((t) => `    ${t}\n`).join('')
}

const toolLink = (t: ToolEntry) => `<li><a href="${toolPath(t.id)}">${esc(t.name)}</a></li>`

/** Isi statis #root (diganti React saat aplikasi berjalan): teks yang sama dengan header halaman. */
function staticBody(route: Route): string {
  if (route.kind === 'home') {
    const groups = toolGroups()
      .map((g) => `<h2>${esc(g.category)}</h2><ul>${g.tools.map(toolLink).join('')}</ul>`)
      .join('')
    return `<main class="pre"><h1>${APP_NAME}</h1><p>${esc(APP_DESCRIPTION)}</p>${groups}</main>`
  }
  const t = route.kind === 'tool' ? toolById(route.id) : undefined
  if (!t) return `<main class="pre"><h1>Halaman tidak ditemukan</h1><p><a href="/">${APP_NAME}</a></p></main>`
  return (
    `<main class="pre"><p>${esc(t.category)}</p><h1>${esc(t.seo.title)}</h1><p>${esc(t.seo.desc)}</p>` +
    `<p><a href="/">Semua tool ${APP_NAME}</a></p></main>`
  )
}

/** HTML satu rute dari index.html hasil build Vite. */
export function renderPage(template: string, route: Route): string {
  const h = headFor(route)
  const out = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(h.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(h.description)}$2`)
    .replace('</head>', `${headTags(h)}  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${staticBody(route)}</div>`)
  if (!out.includes('<div id="root"><main')) throw new Error('prerender: <div id="root"></div> tidak ditemukan')
  return out
}

/**
 * Semua halaman statis: index.html, `<id>.html` untuk setiap tool di katalog (Cloudflare Pages menyajikannya di
 * `/<id>` tanpa .html), dan 404.html (rute tak dikenal → status 404, bukan fallback SPA 200).
 */
export function prerenderPages(template: string): { fileName: string; html: string }[] {
  return [
    { fileName: 'index.html', html: renderPage(template, { kind: 'home' }) },
    ...TOOLS.map((t) => ({ fileName: `${t.id}.html`, html: renderPage(template, { kind: 'tool', id: t.id }) })),
    { fileName: '404.html', html: renderPage(template, { kind: 'notfound', path: '/404' }) },
  ]
}

/** sitemap.xml: halaman depan + tool aktif (yang punya canonical). */
export function sitemapXml(lastmod: string): string {
  const urls = [headFor({ kind: 'home' }), ...TOOLS.map((t) => headFor({ kind: 'tool', id: t.id }))]
    .map((h) => h.canonical)
    .filter((u): u is string => !!u)
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>\n`).join('') +
    '</urlset>\n'
  )
}
