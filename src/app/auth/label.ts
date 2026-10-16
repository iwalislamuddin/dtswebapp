// Label status Premium di menu akun (murni). Pola sama dengan EDFS Matrix (src/api/premium.ts): tanpa label "Free" —
// akun tanpa Premium menampilkan kapan Premium berakhir, atau bahwa belum punya.

/** Baris `platform.premium_status()`. */
export interface PremiumInfo {
  active: boolean
  expires_at: string | null
  is_trial: boolean
}

export interface PremiumLabel {
  text: string
  tone: 'ok' | 'warn' | 'off'
}

const DAY_MS = 86_400_000
/** Sisa hari saat label mulai memperingatkan. */
export const WARN_DAYS = 7

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

export function premiumLabel(p: PremiumInfo, now = Date.now()): PremiumLabel {
  if (p.active && p.expires_at) {
    const left = new Date(p.expires_at).getTime() - now
    return {
      text: `${p.is_trial ? 'Trial' : 'Premium'} s/d ${formatDate(p.expires_at)}`,
      tone: left <= WARN_DAYS * DAY_MS ? 'warn' : 'ok',
    }
  }
  if (p.expires_at) return { text: `Premium berakhir ${formatDate(p.expires_at)}`, tone: 'off' }
  return { text: 'Belum Premium', tone: 'off' }
}
