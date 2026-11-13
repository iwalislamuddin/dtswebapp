import { Check, Cloud, FolderOpen, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { login, useAuth } from '../app/auth/store'
import {
  cleanWorkName,
  CloudWorkError,
  deleteCloudWork,
  findSameName,
  listCloudWorks,
  MAX_WORKS,
  type CloudWork,
} from '../app/cloud-works'
import { usePremium } from '../app/premium'
import { activeToolInput } from '../app/tool-state'
import { useUi } from '../app/ui-state'
import {
  lastSaveDest,
  lastWorkName,
  openCloudWork,
  pickWorkFile,
  saveActiveWork,
  saveActiveWorkCloud,
  type SaveDest,
} from '../app/work-file'
import { toolById } from '../tools'
import { Dialog } from './Dialog'
import { Segmented } from './kit'

// Dialog File › Simpan Pekerjaan / Buka Pekerjaan (cloud tools.saved_works + file .edft), pemberitahuan, dan toast.

const errText = (e: unknown) => (e instanceof CloudWorkError ? e.message : 'Terjadi galat. Coba lagi.')

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

const DESTS: { value: SaveDest; label: string }[] = [
  { value: 'cloud', label: 'Cloud (akun)' },
  { value: 'file', label: 'File .edft' },
]

/** Daftar pekerjaan cloud dimuat sekali per dialog; null = sedang dimuat. */
function useCloudWorks(enabled: boolean) {
  const [works, setWorks] = useState<CloudWork[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    listCloudWorks().then(
      (w) => live && setWorks(w),
      (e: unknown) => live && setError(errText(e)),
    )
    return () => {
      live = false
    }
  }, [enabled])
  return { works, setWorks, error }
}

/**
 * Simpan Pekerjaan: nama + tujuan (cloud / file). Cloud: nama yang sama untuk tool yang sama menimpa pekerjaan itu
 * (tombol berubah jadi "Timpa"); nama kosong → "<tool> <tanggal jam>". File: nama juga nama file.
 */
export function SaveWorkDialog({ onClose }: { onClose: () => void }) {
  const toolId = activeToolInput()?.toolId ?? ''
  const toolName = toolById(toolId)?.name ?? toolId
  const cloudOk = useAuth((s) => s.status === 'user')
  const [dest, setDest] = useState<SaveDest>(() => (cloudOk ? lastSaveDest() : 'file'))
  const [name, setName] = useState(() => lastWorkName(toolId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloud = dest === 'cloud' && cloudOk
  const list = useCloudWorks(cloud)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])

  const same = cloud && list.works ? findSameName(list.works, toolId, name) : undefined
  const full = cloud && !same && (list.works?.length ?? 0) >= MAX_WORKS

  return (
    <Dialog title="Simpan Pekerjaan" subtitle={toolName} onClose={onClose}>
      <form
        className="pdf-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (busy) return
          if (!cloud) {
            onClose()
            void saveActiveWork(name)
            return
          }
          setBusy(true)
          setError(null)
          saveActiveWorkCloud(cleanWorkName(name, toolName), same?.id).then(onClose, (err: unknown) => {
            setError(errText(err))
            setBusy(false)
          })
        }}
      >
        <label htmlFor="work-name">Nama pekerjaan</label>
        <input
          ref={ref}
          id="work-name"
          className="ctl"
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder="mis. Balok lift lantai atap"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        <span className="pdf-form-label">Simpan ke</span>
        {cloudOk ? (
          <Segmented value={dest} options={DESTS} onChange={(d) => (setDest(d), setError(null))} ariaLabel="Tujuan simpan" />
        ) : (
          <p className="muted">File .edft — masuk dengan akun Edifisia untuk menyimpan ke cloud.</p>
        )}
        {cloud ? (
          <p className="muted">
            {same
              ? `Pekerjaan "${same.name}" (disimpan ${fmtDate(same.updatedAt)}) akan ditimpa.`
              : `Tersimpan di akun Edifisia Anda dan bisa dibuka dari perangkat lain${
                  list.works ? ` · ${list.works.length}/${MAX_WORKS} terpakai` : ''
                }. Nama kosong → "${toolName} <tanggal>".`}
          </p>
        ) : (
          cloudOk && <p className="muted">Nama juga dipakai sebagai nama file. Buka lagi lewat File › Buka Pekerjaan.</p>
        )}
        {full && <p className="login-error">Batas {MAX_WORKS} pekerjaan tercapai — hapus yang lama di File › Buka Pekerjaan, atau pakai nama pekerjaan yang ada untuk menimpanya.</p>}
        {(error ?? (cloud && list.error)) && <p className="login-error">{error ?? list.error}</p>}
        <div className="pdf-form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn primary" disabled={busy || full}>
            {busy ? 'Menyimpan…' : same ? 'Timpa' : 'Simpan'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Buka Pekerjaan: daftar pekerjaan cloud milik pengguna (buka / hapus — juga untuk akun gratis, pekerjaan tidak
 * disandera), saring "Tool ini" / "Semua", dan tombol buka file .edft (Premium).
 */
export function OpenWorkDialog({ onClose }: { onClose: () => void }) {
  const status = useAuth((s) => s.status)
  const premium = usePremium().premium
  const signedIn = status === 'user'
  const activeId = activeToolInput()?.toolId ?? null
  const [scope, setScope] = useState<'tool' | 'all'>(activeId ? 'tool' : 'all')
  const list = useCloudWorks(signedIn)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const works = list.works ?? []
  const shown = scope === 'tool' && activeId ? works.filter((w) => w.toolId === activeId) : works

  const open = (w: CloudWork) => {
    setBusyId(w.id)
    setError(null)
    openCloudWork(w.id).then(onClose, (e: unknown) => {
      setError(errText(e))
      setBusyId(null)
    })
  }
  const remove = (w: CloudWork) => {
    setBusyId(w.id)
    setError(null)
    deleteCloudWork(w.id).then(
      () => {
        list.setWorks((ws) => (ws ?? []).filter((x) => x.id !== w.id))
        setConfirmId(null)
        setBusyId(null)
        useUi.getState().showToast(`Dihapus: ${w.name}`)
      },
      (e: unknown) => {
        setError(errText(e))
        setBusyId(null)
      },
    )
  }

  return (
    <Dialog title="Buka Pekerjaan" subtitle="Tersimpan di akun Edifisia Anda" onClose={onClose}>
      <div className="pdf-form">
        {!signedIn ? (
          <div className="works-empty">
            <p>{status === 'loading' ? 'Memeriksa sesi akun…' : 'Masuk untuk melihat pekerjaan yang tersimpan di cloud.'}</p>
            {status === 'guest' && (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  onClose()
                  login()
                }}
              >
                Masuk
              </button>
            )}
          </div>
        ) : (
          <>
            {activeId && (
              <Segmented
                value={scope}
                options={[
                  { value: 'tool', label: toolById(activeId)?.name ?? 'Tool ini' },
                  { value: 'all', label: 'Semua tool' },
                ]}
                onChange={setScope}
                ariaLabel="Saring pekerjaan"
              />
            )}
            {list.error ? (
              <p className="login-error">{list.error}</p>
            ) : !list.works ? (
              <p className="muted works-empty">Memuat daftar pekerjaan…</p>
            ) : shown.length === 0 ? (
              <p className="muted works-empty">
                {works.length === 0 ? 'Belum ada pekerjaan tersimpan di cloud.' : 'Belum ada pekerjaan tersimpan untuk tool ini.'}
              </p>
            ) : (
              <ul className="works-list" aria-label="Pekerjaan tersimpan">
                {shown.map((w) => (
                  <li key={w.id} className={busyId === w.id ? 'busy' : undefined}>
                    {confirmId === w.id ? (
                      <>
                        <span className="works-main">
                          Hapus <b>{w.name}</b>? Tidak dapat dibatalkan.
                        </span>
                        <button type="button" className="btn danger" disabled={busyId !== null} onClick={() => remove(w)}>
                          Hapus
                        </button>
                        <button type="button" className="btn" disabled={busyId !== null} onClick={() => setConfirmId(null)}>
                          Batal
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="works-main works-open" disabled={busyId !== null} onClick={() => open(w)} title="Buka pekerjaan ini">
                          <Cloud size={15} aria-hidden />
                          <span>
                            <b>{w.name}</b>
                            <span className="muted">
                              {scope === 'all' || !activeId ? `${toolById(w.toolId)?.name ?? w.toolId} · ` : ''}
                              {fmtDate(w.updatedAt)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="mb-icon"
                          disabled={busyId !== null}
                          onClick={() => setConfirmId(w.id)}
                          aria-label={`Hapus ${w.name}`}
                          title="Hapus"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!premium && <p className="muted">Akun gratis: pekerjaan tersimpan tetap bisa dibuka & dihapus; menyimpan butuh Premium.</p>}
          </>
        )}
        {error && <p className="login-error">{error}</p>}
        <div className="pdf-form-actions works-actions">
          {signedIn && list.works && (
            <span className="muted">
              {works.length}/{MAX_WORKS} pekerjaan
            </span>
          )}
          <button
            type="button"
            className="btn"
            disabled={!premium}
            title={premium ? 'Buka file pekerjaan .edft dari perangkat' : 'Fitur Premium'}
            onClick={() => {
              onClose()
              pickWorkFile()
            }}
          >
            <FolderOpen size={14} aria-hidden /> Buka file .edft…
          </button>
        </div>
      </div>
    </Dialog>
  )
}

export function NoticeDialog({ onClose }: { onClose: () => void }) {
  const notice = useUi((s) => s.notice)
  if (!notice) return null
  return (
    <Dialog title={notice.title} onClose={onClose}>
      <div className="pdf-form">
        <p>{notice.text}</p>
        <div className="pdf-form-actions">
          <button type="button" className="btn primary" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/** Pesan singkat di bawah layar, hilang sendiri setelah 3 detik. */
export function Toast() {
  const toast = useUi((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useUi.getState().showToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className="toast" role="status" key={toast.id}>
      <Check size={14} aria-hidden /> {toast.text}
    </div>
  )
}
