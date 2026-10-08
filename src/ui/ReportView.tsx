import { Fragment, type ReactNode } from 'react'
import { parseMath, plainMath, type MathNode } from '../report/math'
import { fx, okNg, type Block, type CalcStep, type FigColor, type FigOp, type Figure, type Report, type Row } from '../report/model'
import { LEAD, FIG_W } from '../report/figure'
import { usePremium } from '../app/premium'

// Tab Detail: laporan perhitungan sebagai HTML (sumber sama dengan PDF — src/report). Gaya: .rp-* di App.css.

/** Teks bermarkup rumus → elemen (subskrip, superskrip, pecahan). */
export function MathText({ s }: { s: string }) {
  return <>{renderNodes(parseMath(s))}</>
}

function renderNodes(ns: MathNode[]): ReactNode {
  return ns.map((n, i) =>
    n.t === 'text' ? (
      <Fragment key={i}>{n.s}</Fragment>
    ) : n.t === 'sub' ? (
      <sub key={i}>{renderNodes(n.c)}</sub>
    ) : n.t === 'sup' ? (
      <sup key={i}>{renderNodes(n.c)}</sup>
    ) : (
      <span key={i} className="frac">
        <span>{renderNodes(n.num)}</span>
        <span>{renderNodes(n.den)}</span>
      </span>
    ),
  )
}

/* ---------------- gambar ---------------- */

const SEM: Record<FigColor, string> = {
  ink: 'var(--dg-ink)', muted: 'var(--text-muted)', grid: 'var(--dg-grid)', accent: 'var(--accent)', load: 'var(--dg-load)',
  support: 'var(--dg-support)', v: 'var(--dg-v)', m: 'var(--dg-m)', y: 'var(--dg-y)', ok: 'var(--ok)', bad: 'var(--danger)',
}

/** Warna op: semantik (c) atau abu-abu laporan lama (g: 0 tinta … 1 kertas). */
const ink = (o: FigOp) =>
  o.c ? SEM[o.c] : `color-mix(in srgb, var(--text) ${Math.round((1 - Math.max(0, Math.min(1, o.g ?? 0))) * 100)}%, var(--bg))`

function FigOpEl({ o }: { o: FigOp }) {
  const col = ink(o)
  const stroke = { stroke: col, strokeWidth: 'lw' in o ? (o.lw ?? 0.8) : 0.8 }
  const dash = 'dash' in o && o.dash?.length ? { strokeDasharray: o.dash.join(' ') } : {}
  const fill = { fill: col, fillOpacity: o.op ?? 1 }
  switch (o.t) {
    case 'line':
      return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...stroke} {...dash} />
    case 'rect':
      return <rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={o.h} {...(o.fill ? fill : { fill: 'none', ...stroke, ...dash })} />
    case 'poly': {
      const pts = o.pts.map((p) => p.join(',')).join(' ')
      if (o.fill) return <polygon points={pts} {...fill} />
      return o.close ? <polygon points={pts} fill="none" {...stroke} {...dash} /> : <polyline points={pts} fill="none" {...stroke} {...dash} />
    }
    case 'circle':
      return <circle cx={o.cx} cy={o.cy} r={o.r} {...(o.fill ? fill : { fill: 'none', ...stroke })} />
    case 'text':
      return (
        <text
          x={o.x}
          y={o.y}
          fontSize={o.size ?? 8}
          fontWeight={o.bold ? 700 : undefined}
          fill={col}
          textAnchor={o.align === 'c' ? 'middle' : o.align === 'r' ? 'end' : 'start'}
        >
          <MathSvg s={o.s} />
        </text>
      )
  }
}

/** Markup rumus di dalam <text> SVG (subskrip/superskrip via tspan; pecahan ditulis a/b). */
function MathSvg({ s }: { s: string }) {
  const walk = (ns: MathNode[]): ReactNode =>
    ns.map((n, i) =>
      n.t === 'text' ? (
        <Fragment key={i}>{n.s}</Fragment>
      ) : n.t === 'frac' ? (
        <Fragment key={i}>
          ({walk(n.num)})/({walk(n.den)})
        </Fragment>
      ) : (
        <tspan key={i} fontSize="72%" baselineShift={n.t === 'sup' ? 'super' : 'sub'}>
          {walk(n.c)}
        </tspan>
      ),
    )
  return <>{walk(parseMath(s))}</>
}

export function FigureSvg({ fig }: { fig: Figure }) {
  return (
    <figure className="rp-figure">
      <svg className="rp-fig" viewBox={`0 0 ${FIG_W} ${fig.h * LEAD}`} role="img" aria-label={fig.alt}>
        {fig.ops.map((o, i) => (
          <FigOpEl key={i} o={o} />
        ))}
      </svg>
      {fig.caption && (
        <figcaption>
          <MathText s={fig.caption} />
        </figcaption>
      )}
    </figure>
  )
}

/* ---------------- blok ---------------- */

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

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="rp-rows">
      {rows.map((r, i) => (
        <div key={i} className={`rp-row${r.k === 'check' ? ' rp-check' : ''}`}>
          <dt>
            <MathText s={r.label} />
          </dt>
          <dd>
            {r.k === 'kv' ? (
              <span className="num">
                <MathText s={r.value} />
              </span>
            ) : (
              <Ratio ratio={r.ratio} note={r.note} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Step({ s }: { s: CalcStep }) {
  const parts = [s.expr, s.subst].filter((x): x is string => !!x)
  return (
    <div className="rp-step">
      {s.desc && (
        <div className="rp-step-desc">
          <MathText s={s.desc} />
        </div>
      )}
      <div className="rp-eq">
        <span className="rp-lhs">
          <MathText s={s.lhs} />
        </span>
        {parts.map((p, i) => (
          <span key={i} className="rp-part">
            <span className="rp-eqs">=</span>
            <MathText s={p} />
          </span>
        ))}
        <span className="rp-part rp-res">
          <span className="rp-eqs">=</span>
          <b>
            <MathText s={s.value} />
          </b>
          {s.unit && (
            <span className="rp-unit">
              <MathText s={s.unit} />
            </span>
          )}
        </span>
        {s.ref && <span className="rp-ref">{s.ref}</span>}
      </div>
    </div>
  )
}

function BlockEl({ b }: { b: Block }) {
  switch (b.k) {
    case 'h':
      return (
        <h4 className="rp-h">
          <MathText s={b.text} />
        </h4>
      )
    case 'p':
      return (
        <p className="rp-p">
          <MathText s={b.text} />
        </p>
      )
    case 'text':
      return (
        <>
          {b.lines.map((l, i) => (
            <p key={i} className="rp-p">
              <MathText s={l} />
            </p>
          ))}
        </>
      )
    case 'rows':
      return <Rows rows={b.rows} />
    case 'calc':
      return (
        <div className="rp-calc">
          {b.steps.map((s, i) => (
            <Step key={i} s={s} />
          ))}
        </div>
      )
    case 'table': {
      const align = b.align ?? b.head.map((_, j) => (j === 0 ? 'l' : 'r'))
      const cls = (j: number) => (align[j] === 'r' ? 'r' : align[j] === 'c' ? 'c' : undefined)
      return (
        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead>
              <tr>
                {b.head.map((h, j) => (
                  <th key={j} className={cls(j)}>
                    <MathText s={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={cls(j)}>
                      <MathText s={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {b.caption && (
            <p className="rp-caption">
              <MathText s={b.caption} />
            </p>
          )}
        </div>
      )
    }
    case 'figure':
      return <FigureSvg fig={b.fig} />
    case 'notes':
      return (
        <ul className="rp-notes">
          {b.items.map((it, i) => (
            <li key={i}>
              <MathText s={it} />
            </li>
          ))}
        </ul>
      )
  }
}

export function ReportView({ report, note }: { report: Report; note?: string }) {
  return (
    <article className="report">
      <header className="rp-head">
        <div className="rp-kicker">Laporan perhitungan</div>
        <h2>
          <MathText s={report.title} />
        </h2>
      </header>
      {note && <p className="rp-note">{note}</p>}
      {report.summary && report.summary.length > 0 && (
        <section className="rp-summary">
          <h3>Ringkasan hasil</h3>
          <Rows rows={report.summary} />
        </section>
      )}
      {report.sections.map((s, i) => (
        <section key={s.title} className={`rp-sec${s.strong ? ' strong' : ''}`}>
          <h3>
            <span className="rp-n">{i + 1}</span> <MathText s={s.title} />
          </h3>
          {s.blocks.map((b, j) => (
            <BlockEl key={j} b={b} />
          ))}
        </section>
      ))}
      {report.governing && (
        <div className="rp-gov">
          <span>
            <MathText s={report.governing.label} />
          </span>
          <Ratio ratio={report.governing.ratio} />
        </div>
      )}
      {report.warnings.length > 0 && (
        <section className="rp-sec">
          <h3>
            <span className="rp-n">{report.sections.length + 1}</span> Catatan
          </h3>
          <ul className="rp-notes warn">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      <footer className="rp-scope muted">
        {report.scope.map((s, i) => (
          <p key={i}>
            <MathText s={s} />
          </p>
        ))}
      </footer>
    </article>
  )
}

/** Isi tab Detail untuk non-Premium: daftar isi laporan saja (tanpa angka) + ajakan Premium. */
export function ReportLocked({ report }: { report: Report | null }) {
  return (
    <div className="rp-locked">
      <div className="rp-lock-card">
        <h2>Detail perhitungan — fitur Premium</h2>
        <p>
          Laporan lengkap langkah demi langkah (rumus, substitusi angka, gambar diagram) dan unduhan PDF tersedia untuk
          pengguna <b>Edifisia Premium</b>. Semua perhitungan dan ringkasan hasil di tab Input tetap gratis.
        </p>
        {report && (
          <>
            <div className="rp-lock-toc-h">Isi laporan</div>
            <ol className="rp-lock-toc">
              {report.sections.map((s) => (
                <li key={s.title}>{plainMath(s.title)}</li>
              ))}
            </ol>
          </>
        )}
        <button type="button" className="btn primary" disabled title="Segera — membutuhkan akun Edifisia">
          Masuk / Berlangganan
        </button>
        <p className="muted rp-lock-soon">Masuk dengan akun Edifisia segera tersedia.</p>
      </div>
    </div>
  )
}

/**
 * Isi tab Detail semua tool: laporan untuk Premium, panel terkunci untuk lainnya (src/app/premium.ts).
 * `report` null = input belum lengkap.
 */
export function DetailTab({ report, note, empty }: { report: Report | null; note?: string; empty?: string }) {
  const { premium } = usePremium()
  if (!premium) return <ReportLocked report={report} />
  if (!report) return <p className="msg warn">{empty ?? 'Lengkapi input untuk melihat detail perhitungan.'}</p>
  return <ReportView report={report} note={note} />
}
