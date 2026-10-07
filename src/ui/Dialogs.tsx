import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { APP_NAME, APP_TAGLINE, APP_VERSION, BUILD_DATE, CREDIT } from '../app/appInfo'
import { RELEASE_NOTES } from '../app/releaseNotes'
import { useUi } from '../app/ui-state'
import { BrandMark } from './Brand'

/** Dialog modal di atas <dialog> bawaan (fokus terkunci, Escape menutup). */
function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="dlg"
      aria-labelledby="dlg-title"
      onClose={onClose}
      // Klik di backdrop (target = <dialog> itu sendiri) menutup.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dlg-head">
        <BrandMark size={26} />
        <div className="dlg-titles">
          <h2 id="dlg-title">{title}</h2>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
        <button type="button" className="mb-icon" onClick={onClose} aria-label="Tutup">
          <X size={16} />
        </button>
      </div>
      <div className="dlg-body">{children}</div>
    </dialog>
  )
}

export function DialogHost() {
  const dialog = useUi((s) => s.dialog)
  const close = () => useUi.getState().openDialog(null)
  const version = `v${APP_VERSION} · ${BUILD_DATE}`
  if (dialog === 'about')
    return (
      <Dialog title={APP_NAME} subtitle={`${version} · ${APP_TAGLINE}`} onClose={close}>
        <p>
          Kumpulan alat bantu perhitungan rekayasa sipil dalam satu aplikasi yang bisa dipasang (PWA). Setiap tool
          mengikuti standar SNI, dengan diagram dan laporan yang siap dokumentasi.
        </p>
        <div className="dlg-disc">
          <b>Disclaimer.</b> Hasil perhitungan adalah alat bantu dan tidak menggantikan penilaian teknis. Verifikasi
          seluruh keluaran oleh insinyur profesional yang bertanggung jawab sebelum digunakan untuk desain, gambar
          kerja, atau konstruksi.
        </div>
        <p className="dlg-credit">{CREDIT.join('  |  ')}</p>
      </Dialog>
    )
  if (dialog === 'release-notes')
    return (
      <Dialog title="Catatan Rilis" subtitle={APP_NAME} onClose={close}>
        <div className="relnotes">
          {RELEASE_NOTES.map((r) => (
            <section key={r.version}>
              <h3>
                v{r.version} <span className="muted">— {r.date ?? 'dalam pengembangan'}</span>
              </h3>
              <ul>
                {r.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    )
  return null
}
