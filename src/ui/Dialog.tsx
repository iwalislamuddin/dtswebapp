import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { AppIcon } from './Brand'

/** Dialog modal di atas <dialog> bawaan (fokus terkunci, Escape menutup). */
export function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
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
        <AppIcon size={22} />
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
