import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '../app/appInfo'
import { linkClick, toolPath } from '../app/router'
import { toolGroups, visibleTools } from '../tools'
import { BrandMark } from './Brand'

/** Halaman depan: semua tool dikelompokkan per kategori. */
export function HomePage() {
  return (
    <div className="home">
      <header className="home-hero">
        <BrandMark size={44} />
        <div>
          <h1>{APP_NAME}</h1>
          <p className="home-tag">
            {APP_TAGLINE} · {visibleTools().length} tool
          </p>
          <p className="muted">{APP_DESCRIPTION}</p>
        </div>
      </header>
      {toolGroups().map((g) => (
        <section key={g.category} className="home-group">
          <h2>{g.category}</h2>
          <div className="home-grid">
            {g.tools.map((t) => (
              <a key={t.id} href={toolPath(t.id)} onClick={linkClick} className="home-card">
                <b>{t.name}</b>
                <span>{t.seo.title}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
