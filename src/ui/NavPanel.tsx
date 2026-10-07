import { Search, X } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { linkClick, toolPath } from '../app/router'
import { NARROW, useUi } from '../app/ui-state'
import { toolGroups } from '../tools'

/** Huruf kecil tanpa diakritik, untuk pencarian. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')

export function NavPanel({ activeId }: { activeId: string | null }) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const k = norm(q.trim())
    const all = toolGroups()
    if (!k) return all
    return all
      .map((g) => ({ ...g, tools: g.tools.filter((t) => norm(`${t.name} ${t.seo.title} ${g.category}`).includes(k)) }))
      .filter((g) => g.tools.length > 0)
  }, [q])

  const onLink = (e: MouseEvent<HTMLAnchorElement>) => {
    linkClick(e)
    if (matchMedia(NARROW).matches) useUi.getState().toggleNav(false)
  }

  return (
    <aside className="nav" aria-label="Daftar tool">
      <div className="nav-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari tool…"
          aria-label="Cari tool"
          spellCheck={false}
        />
        {q && (
          <button type="button" className="nav-clear" onClick={() => setQ('')} aria-label="Hapus pencarian">
            <X size={13} />
          </button>
        )}
      </div>
      <div className="nav-list">
        {groups.map((g) => (
          <section key={g.category} className="nav-group">
            <h2 className="nav-cat">{g.category}</h2>
            {g.tools.map((t) => (
              <a
                key={t.id}
                href={toolPath(t.id)}
                onClick={onLink}
                className={`nav-item${t.id === activeId ? ' active' : ''}`}
                aria-current={t.id === activeId ? 'page' : undefined}
                title={t.seo.title}
              >
                {t.name}
              </a>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="nav-empty">Tidak ada tool yang cocok.</p>}
      </div>
    </aside>
  )
}
