import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_MS = 60 * 60 * 1000

/** Tombol di menu bar saat service worker punya versi baru yang menunggu (pola EDFS Matrix). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Tab yang terbuka berhari-hari tetap tahu ada rilis baru.
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update(), CHECK_MS)
    },
  })
  if (!needRefresh) return null
  return (
    <button
      type="button"
      className="mb-update"
      onClick={() => void updateServiceWorker(true)}
      title="Versi baru EDFS Civil Tools tersedia — halaman dimuat ulang"
    >
      Perbarui aplikasi
    </button>
  )
}
