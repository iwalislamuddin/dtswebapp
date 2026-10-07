import { GA4_ID } from './appInfo'

// GA4 page_view per rute SPA. Hanya di domain produksi agar *.pages.dev / localhost tidak mencemari data.

type Gtag = (...args: unknown[]) => void
let gtag: Gtag | null | undefined

function init(): Gtag | null {
  if (!import.meta.env.PROD || location.hostname !== 'tools.edifisia.com') return null
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag }
  w.dataLayer = w.dataLayer || []
  w.gtag = function () {
    // gtag.js membaca objek `arguments`, bukan array biasa.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments)
  }
  w.gtag('js', new Date())
  w.gtag('config', GA4_ID, { send_page_view: false })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`
  document.head.append(s)
  return w.gtag
}

export function trackPageView(title: string) {
  if (gtag === undefined) gtag = init()
  gtag?.('event', 'page_view', { page_title: title, page_location: location.href, page_path: location.pathname })
}
