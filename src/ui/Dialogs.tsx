import { useEffect, useRef, useState } from 'react'
import { APP_NAME, APP_TAGLINE, BRAND_OWNER } from '../app/appInfo'
import { AUTH_ENV, forgotUrl, registerUrl } from '../app/auth/config'
import { signInWithGoogle, signInWithPassword, useAuth } from '../app/auth/store'
import { REPORT_LANGS } from '../report/lang'
import { plainMath } from '../report/math'
import { downloadActivePdf, lastPdfDescription, lastPdfLang } from '../app/report-actions'
import { useUi } from '../app/ui-state'
import { APP_VERSION, BUILD_DATE } from '../app/version'
import { Logo } from './Brand'
import { Dialog } from './Dialog'
import { Segmented } from './kit'
import { PrivacyContent, TermsContent } from './Legal'
import { NoticeDialog, OpenWorkDialog, SaveWorkDialog } from './WorkDialogs'

/**
 * Cetak PDF: isian Deskripsi (opsional) yang tampil di bawah judul laporan (terisi deskripsi terakhir tool ini) dan
 * bahasa laporan (terakhir dipakai). Bahasa hanya untuk isi PDF; deskripsi dicetak apa adanya.
 */
function PdfDialog({ onClose }: { onClose: () => void }) {
  const report = useUi((s) => s.report)
  const [desc, setDesc] = useState(() => (report ? lastPdfDescription(report.toolId) : ''))
  const [lang, setLang] = useState(lastPdfLang)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])
  return (
    <Dialog title="Cetak PDF" subtitle={report ? plainMath(report.report.title) : undefined} onClose={onClose}>
      <form
        className="pdf-form"
        onSubmit={(e) => {
          e.preventDefault()
          onClose()
          void downloadActivePdf(desc, lang)
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
        <span className="pdf-form-label">Bahasa laporan</span>
        <Segmented value={lang} options={REPORT_LANGS} onChange={setLang} ariaLabel="Bahasa laporan" />
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
  if (dialog === 'about') {
    // Pola dialog About EDFS Matrix: logo penuh + identitas, disclaimer, hak cipta. Catatan rilis: docs/CHANGELOG.md.
    return (
      <Dialog title={`Tentang ${APP_NAME}`} onClose={close}>
        <div className="about-hero">
          <Logo width={116} />
          <div className="about-meta">
            <div className="about-name">{APP_NAME}</div>
            <div className="about-tagline">{APP_TAGLINE}</div>
            <div className="about-owner">
              Produk dari <b>{BRAND_OWNER}</b>
            </div>
            <dl className="about-dl">
              <dt>Versi</dt>
              <dd>{APP_VERSION}</dd>
              <dt>Build</dt>
              <dd>{BUILD_DATE}</dd>
            </dl>
          </div>
        </div>
        <p className="muted small-note">
          Hasil perhitungan adalah alat bantu dan tidak menggantikan penilaian teknis. Verifikasi seluruh keluaran oleh
          insinyur profesional yang bertanggung jawab sebelum digunakan untuk desain, gambar kerja, atau konstruksi.
        </p>
        <p className="muted small-note">
          © {new Date().getFullYear()} {BRAND_OWNER}. Hak cipta dilindungi.
        </p>
        <p className="small-note about-legal">
          <button type="button" className="link-btn" onClick={() => useUi.getState().openDialog('terms')}>
            Syarat Layanan
          </button>
          <span className="muted">·</span>
          <button type="button" className="link-btn" onClick={() => useUi.getState().openDialog('privacy')}>
            Kebijakan Privasi
          </button>
        </p>
      </Dialog>
    )
  }
  if (dialog === 'terms')
    return (
      <Dialog title="Syarat Layanan" subtitle={APP_NAME} onClose={close}>
        <TermsContent />
      </Dialog>
    )
  if (dialog === 'privacy')
    return (
      <Dialog title="Kebijakan Privasi" subtitle={APP_NAME} onClose={close}>
        <PrivacyContent />
      </Dialog>
    )
  if (dialog === 'pdf') return <PdfDialog onClose={close} />
  if (dialog === 'login') return <LoginDialog onClose={close} />
  if (dialog === 'save-work') return <SaveWorkDialog onClose={close} />
  if (dialog === 'open-work') return <OpenWorkDialog onClose={close} />
  if (dialog === 'notice') return <NoticeDialog onClose={close} />
  return null
}
