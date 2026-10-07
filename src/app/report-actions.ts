import { downloadReportPdf, reportMeta } from '../report/download'
import { premiumStatus } from './premium'
import { useUi } from './ui-state'
import { APP_VERSION } from './version'

/** Unduh PDF laporan tool yang sedang tampil (tombol PDF di baris tab & File > Download Report). */
export async function downloadActivePdf(): Promise<void> {
  const { report, pdfState } = useUi.getState()
  if (!report || pdfState === 'busy' || !premiumStatus().premium) return
  useUi.setState({ pdfState: 'busy' })
  try {
    await downloadReportPdf(report.toolId, report.report, reportMeta(APP_VERSION))
    useUi.setState({ pdfState: 'idle' })
  } catch (e) {
    console.error('PDF gagal dibuat:', e)
    useUi.setState({ pdfState: 'error' })
  }
}
