import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { APP_NAME, APP_TAGLINE, CREDIT } from '../app/appInfo'
import { AUTH_ENV, forgotUrl, registerUrl } from '../app/auth/config'
import { signInWithGoogle, signInWithPassword, useAuth } from '../app/auth/store'
import { plainMath } from '../report/math'
import { RELEASE_NOTES } from '../app/releaseNotes'
import { downloadActivePdf, lastPdfDescription } from '../app/report-actions'
import { useUi } from '../app/ui-state'
import { APP_VERSION, BUILD_DATE } from '../app/version'
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

/** Cetak PDF: isian Deskripsi (opsional) yang tampil di bawah judul laporan; terisi deskripsi terakhir tool ini. */
function PdfDialog({ onClose }: { onClose: () => void }) {
  const report = useUi((s) => s.report)
  const [desc, setDesc] = useState(() => (report ? lastPdfDescription(report.toolId) : ''))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])
  return (
    <Dialog title="Cetak PDF" subtitle={report ? plainMath(report.report.title) : undefined} onClose={onClose}>
      <form
        className="pdf-form"
        onSubmit={(e) => {
          e.preventDefault()
          onClose()
          void downloadActivePdf(desc)
        }}
      >
        <label htmlFor="pdf-desc">Deskripsi</label>
        <input
          ref={ref}
          id="pdf-desc"
          className="ctl"
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder="mis. Balok lift lantai atap"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <p className="muted">Ditampilkan di bawah judul laporan cetak. Boleh dikosongkan.</p>
        <div className="pdf-form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn primary">
            Cetak PDF
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Login lokal (localhost / IP LAN / *.pages.dev — lihat authMode). Di *.edifisia.com tombol Masuk langsung ke pusat
 * akun, dialog ini tidak dipakai. Daftar & lupa sandi selalu di pusat akun yang memakai database yang sama.
 */
function LoginDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signedIn = useAuth((s) => s.status === 'user')
  useEffect(() => {
    if (signedIn) onClose()
  }, [signedIn, onClose])
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setError(null)
    const err = await fn()
    // Google: halaman berpindah ke Google; busy dibiarkan agar tombol tidak ditekan dua kali.
    if (err) {
      setError(err)
      setBusy(false)
    }
  }
  const acc = AUTH_ENV?.accountUrl
  return (
    <Dialog title="Masuk" subtitle={`Akun Edifisia${AUTH_ENV?.target === 'dev' ? ' · database development' : ''}`} onClose={onClose}>
      <form
        className="pdf-form login-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => signInWithPassword(email.trim(), password))
        }}
      >
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          className="ctl"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="login-pass">Kata sandi</label>
        <input
          id="login-pass"
          className="ctl"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
        <div className="login-or">
          <span>atau</span>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(signInWithGoogle)}>
          Masuk dengan Google
        </button>
        {acc && (
          <p className="muted login-links">
            <a href={registerUrl(acc)} target="_blank" rel="noreferrer">
              Daftar akun
            </a>
            <a href={forgotUrl(acc)} target="_blank" rel="noreferrer">
              Lupa kata sandi?
            </a>
          </p>
        )}
      </form>
    </Dialog>
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
  if (dialog === 'pdf') return <PdfDialog onClose={close} />
  if (dialog === 'login') return <LoginDialog onClose={close} />
  return null
}
