import { FileText, FileDown } from 'lucide-react'
import { fx, okNg, type Block, type FigOp, type Figure, type Report, type Row } from '../report/model'
import { LEAD, FIG_W } from '../report/figure'
import { downloadReport, reportMeta, type ReportFormat } from '../report/download'
import { APP_VERSION } from '../app/version'

// Tab Detail: laporan perhitungan sebagai HTML (sumber sama dengan unduhan .txt/PDF — src/report).

/** Abu-abu laporan (0 tinta … 1 kertas) → warna tema. */
const ink = (g = 0) => `color-mix(in srgb, var(--text) ${Math.round((1 - Math.max(0, Math.min(1, g))) * 100)}%, var(--bg))`

function FigOpEl({ o }: { o: FigOp }) {
  const stroke = { stroke: ink(o.g), strokeWidth: 'lw' in o ? (o.lw ?? 0.8) : 0.8 }
  const dash = 'dash' in o && o.dash?.length ? { strokeDasharray: o.dash.join(' ') } : {}
  switch (o.t) {
    case 'line':
      return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...stroke} {...dash} />
    case 'rect':
      return o.fill ? (
        <rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={o.h} fill={ink(o.g)} />
      ) : (
        <rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={o.h} fill="none" {...stroke} {...dash} />
      )
    case 'poly': {
      const pts = o.pts.map((p) => p.join(',')).join(' ')
      if (o.fill) return <polygon points={pts} fill={ink(o.g)} />
      return o.close ? (
        <polygon points={pts} fill="none" {...stroke} {...dash} />
      ) : (
        <polyline points={pts} fill="none" {...stroke} {...dash} />
      )
    }
    case 'circle':
      return o.fill ? <circle cx={o.cx} cy={o.cy} r={o.r} fill={ink(o.g)} /> : <circle cx={o.cx} cy={o.cy} r={o.r} fill="none" {...stroke} />
    case 'text':
      return (
        <text
          x={o.x}
          y={o.y}
          fontSize={o.size ?? 8}
          fill={ink(o.g)}
          textAnchor={o.align === 'c' ? 'middle' : o.align === 'r' ? 'end' : 'start'}
        >
          {o.s}
        </text>
      )
  }
}

export function FigureSvg({ fig }: { fig: Figure }) {
  return (
    <svg className="rp-fig" viewBox={`0 0 ${FIG_W} ${fig.h * LEAD}`} role="img" aria-label={fig.alt}>
      {fig.ops.map((o, i) => (
        <FigOpEl key={i} o={o} />
      ))}
    </svg>
  )
}

function Ratio({ ratio, note }: { ratio: number; note?: string }) {
  const ok = okNg(ratio) === 'OK'
  return (
    <span className="rp-ratio">
      <span className="num">{fx(ratio, 2)}</span>
      <span className={`rp-badge ${ok ? 'ok' : 'ng'}`}>{ok ? 'OK' : 'NG'}</span>
      {note && <span className="muted">({note})</span>}
    </span>
  )
}

function RowEl({ r }: { r: Row }) {
  return (
    <div className={`rp-row${r.k === 'check' ? ' rp-check' : ''}`}>
      <dt>{r.label}</dt>
      <dd>{r.k === 'kv' ? <span className="num">{r.value}</span> : <Ratio ratio={r.ratio} note={r.note} />}</dd>
    </div>
  )
}

function BlockEl({ b }: { b: Block }) {
  if (b.k === 'rows')
    return (
      <dl className="rp-rows">
        {b.rows.map((r, i) => (
          <RowEl key={i} r={r} />
        ))}
      </dl>
    )
  if (b.k === 'figure') return <FigureSvg fig={b.fig} />
  if (b.k === 'text') return <>{b.lines.map((l, i) => <p key={i}>{l}</p>)}</>
  return (
    <ul className="rp-notes">
      {b.items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

export function ReportView({ report, toolId, note }: { report: Report; toolId: string; note?: string }) {
  const dl = (fmt: ReportFormat) => downloadReport(toolId, report, fmt, reportMeta(APP_VERSION))
  return (
    <article className="report">
      <header className="rp-head">
        <div>
          <h2>{report.title}</h2>
          <div className="muted">{report.method}</div>
        </div>
        <div className="rp-actions">
          <button type="button" className="btn" onClick={() => dl('pdf')}>
            <FileDown size={14} /> PDF
          </button>
          <button type="button" className="btn" onClick={() => dl('txt')}>
            <FileText size={14} /> .txt
          </button>
        </div>
      </header>
      {note && <p className="rp-note">{note}</p>}
      {report.sections.map((s) => (
        <section key={s.title} className={`rp-sec${s.strong ? ' strong' : ''}`}>
          <h3>{s.title}</h3>
          {s.blocks.map((b, i) => (
            <BlockEl key={i} b={b} />
          ))}
        </section>
      ))}
      {report.governing && (
        <div className="rp-gov">
          <span>{report.governing.label}</span>
          <Ratio ratio={report.governing.ratio} />
        </div>
      )}
      {report.warnings.length > 0 && (
        <section className="rp-sec">
          <h3>Catatan</h3>
          <ul className="rp-notes warn">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      <footer className="rp-scope muted">
        {report.scope.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </footer>
    </article>
  )
}
