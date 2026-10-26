import { useState, type ReactNode } from 'react'
import { whP, type FreeRoofResult, type OpenFrameResult, type WarehouseResult } from '../../calc/wind-load'
import { fx } from '../../report/model'
import { FIG_W, LEAD } from '../../report/figure'
import { Panel, Sized, StatTiles, SubTabs } from '../../ui/kit'
import { FigureSvg } from '../../ui/ReportView'
import { figFreeRoof, figFreeRoof90, figOpenFrame, figWarehouse, mn, sg } from './figures'
import type { WindAny } from './model'

// Preview & hasil tipe struktur selain gedung: gambar dari figures.ts (sama dengan laporan) + ringkasan & tabel.

type Other = Exclude<WindAny, { type: 'building' }>

/** Pilihan gambar preview per tipe: id → label + pembuat gambar. */
function views(a: Other) {
  if (a.type === 'warehouse')
    return [
      { id: 'n1', label: '⊥ bubungan · kasus 1', fig: () => figWarehouse(a.r, 0, 0) },
      { id: 'n2', label: 'kasus 2', fig: () => figWarehouse(a.r, 0, 1) },
      { id: 'p1', label: '∥ bubungan · kasus 1', fig: () => figWarehouse(a.r, 1, 0) },
      { id: 'p2', label: 'kasus 2', fig: () => figWarehouse(a.r, 1, 1) },
    ]
  if (a.type === 'freeroof') {
    const v = a.r.cases.flatMap((c, ci) =>
      (['A', 'B'] as const).map((lc) => ({ id: `${c.key}${lc}`, label: `${a.r.cases.length > 1 ? (c.key === 'g0' ? 'γ 0° ' : 'γ 180° ') : '⊥ '}${lc}`, fig: () => figFreeRoof(a.r, ci, lc) })),
    )
    return [...v, { id: '90A', label: 'γ 90° A', fig: () => figFreeRoof90(a.r, 'A') }, { id: '90B', label: 'γ 90° B', fig: () => figFreeRoof90(a.r, 'B') }]
  }
  return [{ id: 'f', label: 'Tampak', fig: () => figOpenFrame(a.r) }]
}

export function TypePreview({ a, stale }: { a: Other; stale: boolean }) {
  const vs = views(a)
  const [id, setId] = useState(vs[0].id)
  const v = vs.find((x) => x.id === id) ?? vs[0]
  return (
    <Panel title="Preview" tools={vs.length > 1 ? <SubTabs ariaLabel="Gambar" value={v.id} tabs={vs.map((x) => ({ id: x.id, label: x.label }))} onChange={setId} /> : undefined}>
      <Sized>
        {(w, h) => {
          const fig = v.fig()
          // lebar dibatasi agar gambar (rasio FIG_W : tinggi) muat utuh di panel
          const fw = Math.min(w, (h * FIG_W) / (fig.h * LEAD))
          return (
            <div className={stale ? 'stale' : ''} style={{ width: fw, margin: '0 auto' }}>
              <FigureSvg fig={{ ...fig, caption: undefined }} />
            </div>
          )
        }}
      </Sized>
    </Panel>
  )
}

function Shell({ stale, warn, children }: { stale: boolean; warn: string[]; children: ReactNode }) {
  return (
    <Panel title="Hasil" className="results-panel">
      <div style={{ height: '100%', overflow: 'auto', padding: '8px 10px 10px' }}>
        {stale && <p className="msg bad">Input belum lengkap/valid — hasil di bawah dari input sah terakhir.</p>}
        <div className={stale ? 'stale' : ''}>
          {children}
          {warn.length > 0 && (
            <ul className="results-warn">
              {warn.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}

function WarehouseResults({ r }: { r: WarehouseResult }) {
  const [d, setD] = useState<0 | 1>(0)
  const dir = r.dirs[d], s = r.inp.s
  const [n, p] = r.dirs
  return (
    <>
      <h4 className="results-h">Ringkasan</h4>
      <StatTiles
        items={[
          { label: 'Gaya horizontal ⊥ bubungan', value: fx(Math.max(...n.F, n.Fmin), 1), unit: 'kN', sub: n.Fmin > Math.max(...n.F) ? 'minimum Ps. 27.1.5 menentukan' : `kasus 1 / 2: ${fx(n.F[0], 1)} / ${fx(n.F[1], 1)}`, tone: n.Fmin > Math.max(...n.F) ? 'bad' : undefined },
          { label: 'Gaya horizontal ∥ bubungan', value: fx(Math.max(p.F[0], p.Fmin), 1), unit: 'kN', sub: p.Fmin > p.F[0] ? 'minimum Ps. 27.1.5 menentukan' : `minimum ${fx(p.Fmin, 1)} kN`, tone: p.Fmin > p.F[0] ? 'bad' : undefined },
          { label: 'Angkat atap maks (+GCpi)', value: fx(Math.max(...n.U, ...p.U), 1), unit: 'kN', sub: `qh ${fx(r.qh, 3)} kPa · h ${fx(r.h, 2)} m` },
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <SubTabs ariaLabel="Arah angin" value={String(d)} tabs={[{ id: '0', label: 'Tegak lurus bubungan' }, { id: '1', label: 'Sejajar bubungan' }]} onChange={(v) => setD(v === '1' ? 1 : 0)} />
      </div>
      <table className="fr-table">
        <thead>
          <tr>
            <th>Permukaan</th>
            <th>Kasus</th>
            <th>Cp</th>
            <th>p +GCpi</th>
            <th>p −GCpi</th>
            <th>w + / − kN/m</th>
          </tr>
        </thead>
        <tbody>
          {dir.surfaces.flatMap((sf) =>
            (sf.Cp[0] === sf.Cp[1] ? [0] : [0, 1]).map((k) => {
              const kk = k as 0 | 1
              const pp = whP(r, sf, kk, 1), pm = whP(r, sf, kk, -1)
              return (
                <tr key={sf.name + k}>
                  <td>{sf.name}</td>
                  <td>{sf.Cp[0] === sf.Cp[1] ? '1, 2' : k + 1}</td>
                  <td>{sg(sf.Cp[kk], 2)}</td>
                  <td>{sg(pp)}</td>
                  <td>{sg(pm)}</td>
                  <td>
                    {sg(pp * s, 2)} / {sg(pm * s, 2)}
                  </td>
                </tr>
              )
            }),
          )}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 6 }}>
        p dalam kPa (+ menekan permukaan), GCpi ±{fx(r.GCpi, 2)}; w = p × jarak portal {fx(s, 2)} m. Gaya angkat kasus 1 / 2: {fx(dir.U[0], 1)} / {fx(dir.U[1], 1)} kN.
      </p>
    </>
  )
}

function FreeRoofResults({ r }: { r: FreeRoofResult }) {
  const s = r.inp.s
  const all = r.cases.flatMap((c) => [c.A, c.B])
  const up = Math.min(...all.map((l) => l.Fv), ...r.Fv90), dn = Math.max(...all.map((l) => l.Fv), ...r.Fv90)
  const pMin = Math.min(...all.flatMap((l) => [l.pW, l.pL]), ...r.zones.flatMap((z) => [z.pA, z.pB]))
  return (
    <>
      <h4 className="results-h">Ringkasan</h4>
      <StatTiles
        items={[
          { label: 'Isap neto maks', value: sg(pMin), unit: 'kPa', sub: `w = ${sg(pMin * s, 2)} kN/m` },
          { label: 'Gaya angkat total maks', value: fx(Math.max(0, -up), 1), unit: 'kN', sub: `tekan maks ${fx(Math.max(0, dn), 1)} kN` },
          { label: 'qh (z = h)', value: fx(r.qh, 3), unit: 'kPa', sub: `Kh ${fx(r.Kh, 3)} · h/L ${fx(r.hL, 2)}` },
        ]}
      />
      <table className="fr-table">
        <thead>
          <tr>
            <th>Arah · kasus</th>
            <th>CNW</th>
            <th>CNL</th>
            <th>pW kPa</th>
            <th>pL kPa</th>
            <th>wW / wL kN/m</th>
          </tr>
        </thead>
        <tbody>
          {r.cases.flatMap((c) =>
            (['A', 'B'] as const).map((lc) => (
              <tr key={c.key + lc}>
                <td>
                  {r.cases.length > 1 ? (c.key === 'g0' ? 'γ 0°' : 'γ 180°') : 'γ 0°/180°'} · {lc}
                </td>
                <td>{mn(c[lc].CNW)}</td>
                <td>{mn(c[lc].CNL)}</td>
                <td>{sg(c[lc].pW)}</td>
                <td>{sg(c[lc].pL)}</td>
                <td>
                  {sg(c[lc].pW * s, 2)} / {sg(c[lc].pL * s, 2)}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <table className="fr-table">
        <thead>
          <tr>
            <th>γ 90° zona (m)</th>
            <th>CN A</th>
            <th>CN B</th>
            <th>p A kPa</th>
            <th>p B kPa</th>
          </tr>
        </thead>
        <tbody>
          {r.zones.map((z) => (
            <tr key={z.x0}>
              <td>
                {fx(z.x0, 1)}–{fx(z.x1, 1)}
              </td>
              <td>{mn(z.CNA)}</td>
              <td>{mn(z.CNB)}</td>
              <td>{sg(z.pA)}</td>
              <td>{sg(z.pB)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 6 }}>
        CN = tekanan neto sisi atas + bawah; + menekan sisi atas atap. w = p × jarak rangka {fx(s, 2)} m (tegak lurus atap).
      </p>
    </>
  )
}

function OpenFrameResults({ r }: { r: OpenFrameResult }) {
  return (
    <>
      <h4 className="results-h">Ringkasan</h4>
      <StatTiles
        items={[
          { label: 'Gaya angin desain F', value: fx(r.Fdesign, 2), unit: 'kN', sub: r.minGoverns ? 'minimum 0,77 kPa × Af menentukan' : r.Fdiag !== undefined ? `diagonal · tegak lurus muka ${fx(r.Fn, 2)}` : `segmen ${fx(r.F, 2)} / titik berat ${fx(r.Fc, 2)}`, tone: r.minGoverns ? 'bad' : undefined },
          { label: 'Momen guling dasar', value: fx(r.Mdiag ?? r.Mn, 1), unit: 'kN·m', sub: r.Mdiag !== undefined ? 'arah diagonal' : undefined },
          { label: 'Cf', value: fx(r.Cf, 3), sub: r.CfDiag ? `diagonal ${fx(r.CfDiag, 3)}` : r.epsRow },
        ]}
      />
      <p className="muted" style={{ marginTop: 8 }}>
        Af = ε·b·(z₂ − z₁) = {fx(r.Af, 3)} m² · qz̄ {fx(r.qzc, 3)} kPa di z̄ = {fx(r.zc, 2)} m
        {r.DsqrtQ !== undefined ? ` · D√qz = ${fx(r.DsqrtQ, 2)}` : ''} · beban garis puncak w = {fx(r.seg[r.seg.length - 1].w, 3)} kN/m.
      </p>
    </>
  )
}

export function TypeResults({ a, stale }: { a: Other; stale: boolean }) {
  return (
    <Shell stale={stale} warn={a.r.warn}>
      {a.type === 'warehouse' ? <WarehouseResults r={a.r} /> : a.type === 'freeroof' ? <FreeRoofResults r={a.r} /> : <OpenFrameResults r={a.r} />}
    </Shell>
  )
}
