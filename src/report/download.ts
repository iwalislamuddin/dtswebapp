import type { Report, ReportMeta } from './model'

// Unduh laporan PDF di browser. Pembangun PDF (pdf-lib) & font DejaVu dimuat hanya saat diperlukan (chunk
// terpisah). Gating Premium dipasang di pemanggil (src/app/premium.ts).

const p2 = (x: number) => String(x).padStart(2, '0')

export function reportMeta(appVersion: string, now = new Date()): ReportMeta {
  return {
    appVersion,
    date: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`,
  }
}

/** Nama berkas: <tool>-YYYYMMDD-HHMM.pdf. */
export function reportFileName(toolId: string, meta: ReportMeta): string {
  return `${toolId}-${meta.date.replace(/[-:]/g, '').replace(' ', '-')}.pdf`
}

let fontsP: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null = null

async function loadFonts() {
  const [{ default: regUrl }, { default: boldUrl }] = await Promise.all([
    import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'),
    import('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url'),
  ])
  const get = (u: string) => fetch(u).then((r) => {
    if (!r.ok) throw new Error(`Font gagal dimuat (${r.status})`)
    return r.arrayBuffer()
  })
  const [regular, bold] = await Promise.all([get(regUrl), get(boldUrl)])
  return { regular, bold }
}

export async function downloadReportPdf(toolId: string, report: Report, meta: ReportMeta): Promise<void> {
  fontsP ??= loadFonts().catch((e) => {
    fontsP = null
    throw e
  })
  const [{ buildPdf }, fonts] = await Promise.all([import('./pdf'), fontsP])
  const bytes = await buildPdf(report, meta, fonts)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = reportFileName(toolId, meta)
  document.body.append(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 0)
}
