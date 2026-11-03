import { downloadReportPdf, reportMeta } from '../report/download'
import type { ReportLang } from '../report/lang'
import { premiumStatus } from './premium'
import { useUi } from './ui-state'
import { APP_VERSION } from './version'

// Cetak PDF laporan tool yang sedang tampil (tombol PDF di baris tab & File > Download Report): dialog Deskripsi
// lebih dulu, lalu PDF dibuat. Deskripsi terakhir per tool & bahasa laporan terakhir diingat (localStorage) untuk
// cetak ulang. Bahasa hanya berlaku untuk isi PDF; UI tetap Bahasa Indonesia.

const DESC_KEY = (toolId: string) => `edfs-civil-tools:pdf-desc:${toolId}`
const LANG_KEY = 'edfs-civil-tools:pdf-lang'

export function lastPdfLang(): ReportLang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'id'
  } catch {
    return 'id'
  }
}

function rememberPdfLang(lang: ReportLang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // penyimpanan diblokir: bahasa tidak diingat
  }
}

export function lastPdfDescription(toolId: string): string {
  try {
    return localStorage.getItem(DESC_KEY(toolId)) ?? ''
  } catch {
    return ''
  }
}

function rememberPdfDescription(toolId: string, description: string) {
  try {
    localStorage.setItem(DESC_KEY(toolId), description)
  } catch {
    // penyimpanan diblokir: deskripsi tidak diingat
  }
}

const canPrint = () => {
  const { report, pdfState } = useUi.getState()
  return !!report && pdfState !== 'busy' && premiumStatus().premium
}

/** Buka dialog Deskripsi (langkah pertama Cetak PDF). */
export function openPdfDialog(): void {
  if (canPrint()) useUi.getState().openDialog('pdf')
}

/** Buat & unduh PDF laporan aktif dalam bahasa `lang`, dengan deskripsi di bawah judul (boleh kosong). */
export async function downloadActivePdf(description: string, lang: ReportLang = 'id'): Promise<void> {
  const { report } = useUi.getState()
  if (!report || !canPrint()) return
  const desc = description.trim()
  rememberPdfDescription(report.toolId, desc)
  rememberPdfLang(lang)
  useUi.setState({ pdfState: 'busy' })
  try {
    await downloadReportPdf(report.toolId, report.report, { ...reportMeta(APP_VERSION), description: desc || undefined, lang })
    useUi.setState({ pdfState: 'idle' })
  } catch (e) {
    console.error('PDF gagal dibuat:', e)
    useUi.setState({ pdfState: 'error' })
  }
}
