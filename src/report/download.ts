import type { Report, ReportMeta } from './model'
import { buildPdf } from './pdf'
import { reportLines, reportText } from './text'

// Unduhan laporan di browser. Gating Premium (Tahap 4) dipasang di satu titik pemanggil (menu File / tab Detail).

export type ReportFormat = 'pdf' | 'txt'

const p2 = (x: number) => String(x).padStart(2, '0')

export function reportMeta(appVersion: string, now = new Date()): ReportMeta {
  return {
    appVersion,
    date: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`,
  }
}

/** Nama berkas: <tool>-YYYYMMDD-HHMM.<ext>. */
export function reportFileName(toolId: string, fmt: ReportFormat, meta: ReportMeta): string {
  return `${toolId}-${meta.date.replace(/[-:]/g, '').replace(' ', '-')}.${fmt}`
}

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

export function downloadReport(toolId: string, report: Report, fmt: ReportFormat, meta: ReportMeta) {
  const name = reportFileName(toolId, fmt, meta)
  if (fmt === 'txt') {
    saveBlob(name, new Blob([reportText(report, meta)], { type: 'text/plain;charset=utf-8' }))
    return
  }
  // PDF berisi ASCII murni: ubah per karakter ke byte agar tidak ada encoding ulang UTF-8.
  const pdf = buildPdf(reportLines(report, meta), report.title)
  const bytes = Uint8Array.from(pdf, (c) => c.charCodeAt(0))
  saveBlob(name, new Blob([bytes], { type: 'application/pdf' }))
}
