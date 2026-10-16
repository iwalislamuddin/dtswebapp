import { useEffect, useMemo } from 'react'
import { trackPageView } from './app/analytics'
import { initAuth } from './app/auth/store'
import { applyHead } from './app/head'
import { headFor } from './app/seo'
import { linkClick, parsePath, usePath } from './app/router'
import { useUi } from './app/ui-state'
import { toolById } from './tools'
import { DialogHost } from './ui/Dialogs'
import { HomePage } from './ui/HomePage'
import { MenuBar } from './ui/MenuBar'
import { NavPanel } from './ui/NavPanel'
import { Notice, ToolPage } from './ui/ToolPage'
import './App.css'

export default function App() {
  const path = usePath()
  const route = useMemo(() => parsePath(path), [path])
  const navOpen = useUi((s) => s.navOpen)
  const tool = route.kind === 'tool' ? toolById(route.id) : undefined

  useEffect(initAuth, [])

  useEffect(() => {
    const h = headFor(route)
    applyHead(h)
    trackPageView(h.title)
  }, [route])

  return (
    <div className="app">
      <MenuBar />
      <div className={`body${navOpen ? ' nav-open' : ''}`}>
        {navOpen && (
          <>
            <NavPanel activeId={tool?.id ?? null} />
            <div className="nav-scrim" onClick={() => useUi.getState().toggleNav(false)} aria-hidden="true" />
          </>
        )}
        <main className="main">
          {route.kind === 'home' && <HomePage />}
          {tool && <ToolPage key={tool.id} tool={tool} />}
          {route.kind === 'notfound' && (
            <div className="tool-body">
              <Notice title="Halaman tidak ditemukan">
                Alamat <code>{route.path}</code> tidak ada.{' '}
                <a href="/" onClick={linkClick}>
                  Ke halaman depan
                </a>
                .
              </Notice>
            </div>
          )}
        </main>
      </div>
      <DialogHost />
    </div>
  )
}
