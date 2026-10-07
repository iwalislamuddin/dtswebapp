import { describe, expect, it } from 'vitest'
import { TOOLS, visibleTools } from '../tools'
import { headFor, prerenderPages, renderPage, sitemapXml } from './seo'

const TEMPLATE = `<!doctype html>
<html lang="id">
  <head>
    <title>EDFS Civil Tools — default</title>
    <meta
      name="description"
      content="default"
    />
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

describe('headFor', () => {
  it('tool aktif: judul & deskripsi SEO katalog, kanonik di domain baru', () => {
    const h = headFor({ kind: 'tool', id: 'beam-flexure' })
    expect(h.title).toMatch(/^Kapasitas Lentur Balok Beton φMn .* · EDFS Civil Tools$/)
    expect(h.canonical).toBe('https://tools.edifisia.com/beam-flexure')
  })
  it('tool tidak aktif & 404 tidak diindeks', () => {
    for (const id of ['base-plate', 'load-combo'])
      expect(headFor({ kind: 'tool', id }).canonical).toBeNull()
    expect(headFor({ kind: 'notfound', path: '/x' }).canonical).toBeNull()
  })
  it('halaman depan', () => {
    expect(headFor({ kind: 'home' }).canonical).toBe('https://tools.edifisia.com/')
  })
})

describe('pre-render', () => {
  it('halaman tool: title, description, canonical, OG, isi statis; skrip tetap', () => {
    const html = renderPage(TEMPLATE, { kind: 'tool', id: 'pipe-flow' })
    const h = headFor({ kind: 'tool', id: 'pipe-flow' })
    expect(html).toContain(`<title>${h.title.replace('&', '&amp;')}</title>`)
    expect(html).toContain(`content="${h.description}"`)
    expect(html).toContain('<link rel="canonical" href="https://tools.edifisia.com/pipe-flow" />')
    expect(html).toContain('<meta property="og:url" content="https://tools.edifisia.com/pipe-flow" />')
    expect(html).toContain('<h1>Kehilangan Energi Pipa — Darcy-Weisbach &amp; Hazen-Williams</h1>')
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>')
    expect(html).not.toContain('noindex')
  })
  it('karakter HTML di-escape', () => {
    const html = renderPage(TEMPLATE, { kind: 'tool', id: 'base-plate' })
    expect(html).toContain('Base Plate &amp; Anchor Rod')
    expect(html).not.toMatch(/<h1>[^<]*&(?!amp;|quot;|lt;|gt;)/)
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).not.toContain('rel="canonical"')
  })
  it('halaman depan memuat tautan ke setiap tool yang tampil', () => {
    const html = renderPage(TEMPLATE, { kind: 'home' })
    for (const t of visibleTools()) expect(html).toContain(`<a href="/${t.id}">`)
  })
  it('satu file per tool katalog + index + 404', () => {
    const pages = prerenderPages(TEMPLATE)
    expect(pages.map((p) => p.fileName).sort()).toEqual(
      ['index.html', '404.html', ...TOOLS.map((t) => `${t.id}.html`)].sort(),
    )
    expect(pages.find((p) => p.fileName === '404.html')?.html).toContain('noindex')
  })
  it('template tanpa #root kosong → gagal keras', () => {
    expect(() => renderPage('<html><head></head><body></body></html>', { kind: 'home' })).toThrow()
  })
})

describe('sitemap', () => {
  it('halaman depan + semua tool aktif, tanpa yang noindex', () => {
    const xml = sitemapXml('2026-10-07')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(['https://tools.edifisia.com/', ...visibleTools().map((t) => `https://tools.edifisia.com/${t.id}`)])
    expect(xml).not.toContain('base-plate')
  })
})
