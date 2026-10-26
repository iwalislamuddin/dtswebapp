import { CT_CLAY, CT_SAND, type ShaftSegment } from '../../calc/pile-capacity'
import { GAMMA_W } from '../../calc/shared/geotech'
import { dimV, figRows } from '../../report/figure'
import { fx, kv, type Block, type CalcStep, type FigOp, type Figure, type Report, type Section } from '../../report/model'
import { PILE_DEFAULTS, computePileUI, type PileOk, type PileUIInput } from './model'

// Laporan Daya Dukung Tiang (SPT): data SPT (korelasi ditandai *), selimut per lapis (α / β / SPT), ujung, gesekan
// negatif, Q izin tekan, kapasitas tarik, penulangan tiang beton dan pembanding Decourt–Quaresma — rumus → substitusi → hasil.

export { PILE_DEFAULTS }

export const soilName = (s: string): string => (s === 'clay' || s === 'L' ? 'Lempung' : 'Pasir')
export const methodName = (m: string): string => (m === 'spt' ? 'SPT' : 'Statik')

/** Gbr. 1 — profil tanah, tiang (cut-off → ujung), MAT, zona NSF (kiri) dan batang fs per segmen (kanan). */
function figProfile(r: PileOk): Figure {
  const ops: FigOp[] = []
  const total = Math.max(r.zTip + 1, r.rows[r.rows.length - 1].z + 1)
  const sc = Math.min(230 / total, 14)
  const x0 = 110, W = 110, yg = 20
  const Y = (z: number) => yg + z * sc
  r.layers.forEach((ly, k) => {
    const top = r.rows[k].z
    const hh = (Math.min(top + ly.H, total) - top) * sc
    ops.push({ t: 'rect', x: x0, y: Y(top), w: W, h: hh, fill: true, c: ly.soil === 'clay' ? 'accent' : 'muted', op: ly.soil === 'clay' ? 0.25 : 0.14 })
    ops.push({ t: 'rect', x: x0, y: Y(top), w: W, h: hh, lw: 0.5, c: 'muted' })
    if (hh >= 7) ops.push({ t: 'text', x: x0 - 5, y: Y(top) + hh / 2 + 2.5, s: `${fx(top, 1)} m · ${soilName(ly.soil)} · N ${fx(Number(ly.N), 0)}`, size: 6.5, align: 'r' })
  })
  if (r.nsf) {
    ops.push({ t: 'rect', x: x0, y: Y(r.zc), w: W, h: (r.zn - r.zc) * sc, lw: 0.8, c: 'load', dash: [3, 2] })
  }
  const pw = Math.max(6, Math.min(r.D * sc * 1.6, 22))
  const cx = x0 + W / 2
  ops.push({ t: 'rect', x: cx - pw / 2, y: Y(r.zc), w: pw, h: r.Leff * sc, fill: true, c: 'support', op: 0.3 })
  ops.push({ t: 'rect', x: cx - pw / 2, y: Y(r.zc), w: pw, h: r.Leff * sc, lw: 1, c: 'support' })
  if (r.Dw < total) {
    ops.push({ t: 'line', x1: x0, y1: Y(r.Dw), x2: x0 + W, y2: Y(r.Dw), lw: 0.8, c: 'load', dash: [5, 3] })
    ops.push({ t: 'text', x: x0 + W + 4, y: Y(r.Dw) + 2.5, s: `MAT ${fx(r.Dw, 1)} m`, size: 6.5, c: 'load' })
  }
  if (r.zc > 0) {
    dimV(ops, Y(0), Y(r.zc), x0 + W + 40, '')
    ops.push({ t: 'text', x: x0 + W + 46, y: Y(r.zc / 2) + 2.5, s: `cut-off ${fx(r.zc, 1)} m`, size: 6.5 })
  }
  dimV(ops, Y(r.zc), Y(r.zTip), x0 + W + 40, '')
  ops.push({ t: 'text', x: x0 + W + 46, y: Y((r.zc + r.zTip) / 2) + 2.5, s: `L = ${fx(r.Leff, 1)} m`, size: 7 })
  // batang fs
  const bx = 360, bw = 120
  const maxFs = Math.max(...r.segs.map((s) => s.fs), 1) * 1.1
  ops.push({ t: 'text', x: bx + bw / 2, y: 10, s: 'f_{s} per segmen (kPa)', size: 6.5, align: 'c', c: 'muted' })
  ops.push({ t: 'line', x1: bx, y1: Y(r.zc), x2: bx, y2: Y(r.zTip), lw: 0.5, c: 'muted' })
  for (const s of r.segs) {
    const y = Y(s.top)
    const h = Math.max(1.5, s.dL * sc - 1)
    const c = s.neg ? 'load' : 'v'
    ops.push({ t: 'rect', x: bx, y, w: (s.fs / maxFs) * bw, h, fill: true, c, op: 0.4 })
    ops.push({ t: 'rect', x: bx, y, w: (s.fs / maxFs) * bw, h, lw: 0.6, c })
    if (h >= 6) ops.push({ t: 'text', x: bx + (s.fs / maxFs) * bw + 4, y: y + h / 2 + 2.5, s: fx(s.fs, 1) + (s.neg ? ' (−)' : ''), size: 6.5 })
  }
  const yTip = Y(r.zTip)
  ops.push({ t: 'text', x: bx, y: yTip + 14, s: `q_{p} = ${fx(r.qp, 0)} kPa di ujung`, size: 7, c: 'm' })
  return {
    h: figRows(Math.max(yTip + 22, Y(total))),
    ops,
    alt: 'Profil tanah, tiang dan gesekan selimut per segmen',
    caption: `Gbr. 1 — Profil SPT dan tiang ${r.shape === 'square' ? 'persegi' : 'bulat'} D = ${fx(r.Dmm, 0)} mm, cut-off ${fx(r.zc, 2)} m, ujung ${fx(r.zTip, 2)} m; f_{s} tiap segmen${r.nsf ? ' ((−) = gesekan negatif)' : ''} dan q_{p} di ujung.`,
  }
}

/** Gbr. 2 — penampang tiang beton dan tulangan. */
function figSection(r: PileOk): Figure {
  const b = r.rebar!
  const ops: FigOp[] = []
  const size = 130
  const s = size / r.Dmm
  const cx = 264, cy = 20 + size / 2
  const R = (r.Dmm / 2) * s
  const rs = b.rc * s
  const hs = ((b.db + b.ds) / 2) * s
  if (r.shape === 'square') {
    ops.push({ t: 'rect', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: true, c: 'muted', op: 0.14 })
    ops.push({ t: 'rect', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, lw: 1, c: 'ink' })
    ops.push({ t: 'rect', x: cx - rs - hs, y: cy - rs - hs, w: 2 * (rs + hs), h: 2 * (rs + hs), lw: 0.8, c: 'v' })
    const per = b.n / 4
    for (let k = 0; k < b.n; k++) {
      const side = Math.floor(k / per), t = (k % per) / per
      const p: [number, number][] = [[-rs + 2 * rs * t, -rs], [rs, -rs + 2 * rs * t], [rs - 2 * rs * t, rs], [-rs, rs - 2 * rs * t]]
      ops.push({ t: 'circle', cx: cx + p[side][0], cy: cy + p[side][1], r: Math.max(1.5, (b.db / 2) * s), fill: true, c: 'm' })
    }
  } else {
    ops.push({ t: 'circle', cx, cy, r: R, fill: true, c: 'muted', op: 0.14 })
    ops.push({ t: 'circle', cx, cy, r: R, lw: 1, c: 'ink' })
    ops.push({ t: 'circle', cx, cy, r: rs + hs, lw: 0.8, c: 'v' })
    for (let k = 0; k < b.n; k++) {
      const a = (2 * Math.PI * k) / b.n
      ops.push({ t: 'circle', cx: cx + rs * Math.cos(a), cy: cy + rs * Math.sin(a), r: Math.max(1.5, (b.db / 2) * s), fill: true, c: 'm' })
    }
  }
  ops.push({ t: 'text', x: cx + R + 14, y: cy - 6, s: `${b.n} D${fx(b.db, 0)}`, size: 7.5, bold: true })
  ops.push({ t: 'text', x: cx + R + 14, y: cy + 6, s: `Sengkang Ø${fx(b.ds, 0)} – ${fx(b.sMax, 0)}`, size: 7 })
  ops.push({ t: 'text', x: cx + R + 14, y: cy + 17, s: `Selimut ${fx(b.cover, 0)} mm`, size: 7, c: 'muted' })
  return {
    h: figRows(size + 30),
    ops,
    alt: 'Penampang tiang beton dan susunan tulangan',
    caption: `Gbr. 2 — Penampang tiang ${r.shape === 'square' ? 'persegi' : 'bulat'} D = ${fx(r.Dmm, 0)} mm: ${b.n} D${fx(b.db, 0)} (ρ = ${fx(b.rho * 100, 2)}%), sengkang Ø${fx(b.ds, 0)} jarak maks. ${fx(b.sMax, 0)} mm.`,
  }
}

function segRow(s: ShaftSegment): string[] {
  return [String(s.idx), `${fx(s.top, 2)}–${fx(s.bot, 2)}${s.neg ? ' (−)' : ''}`, `${soilName(s.soil)} / ${methodName(s.method)}`, fx(s.sv, 1), fx(s.fs, 1), s.how, fx(s.Qs, 1)]
}

export function pileReport(r: PileOk): Report {
  const statik = r.method === 'static'
  const corr = (v: number, c: boolean, d: number) => fx(v, d) + (c ? '*' : '')
  const data: Section = {
    title: 'Data',
    blocks: [
      {
        k: 'rows',
        rows: [
          kv('Tiang', `${r.shape === 'square' ? 'persegi' : 'bulat'}, ${r.ptype === 'driven' ? 'pancang' : 'bor'}, ${r.material === 'steel' ? 'baja' : 'beton'}`),
          kv(r.shape === 'square' ? 'Sisi D' : 'Diameter D', `${fx(r.Dmm, 0)} mm`),
          kv('Pile cut-off z_{c}', `${fx(r.zc, 2)} m dari permukaan`),
          kv('Panjang tiang L', `${fx(r.Leff, 2)} m (ujung di ${fx(r.zTip, 2)} m)`),
          kv('Keliling / luas ujung', `${fx(r.perim, 3)} m / ${fx(r.Ap, 4)} m²`),
          kv('D_{w} (muka air)', `${fx(r.Dw, 2)} m`),
          kv('FS tekan / tarik', `${fx(r.FS, 2)} / ${fx(r.FSt, 2)}`),
          kv('Metode', statik ? 'Statik (lempung α/9c_{u}, pasir β/N_{q})' : 'SPT (Meyerhof)'),
          kv('Beban layan P / T', `${fx(r.P, 1)} / ${fx(r.T, 1)} kN`),
        ],
      },
      {
        k: 'table',
        head: ['Z (m)', 'N-SPT', 'Jenis', 'γ (kN/m³)', ...(statik ? ['c_{u} (kPa)', 'φ (°)'] : [])],
        align: ['r', 'r', 'l', 'r', ...(statik ? (['r', 'r'] as const) : [])],
        rows: r.rows.map((x) => [
          x.bot !== null ? `${fx(x.z, 2)}–${fx(x.bot, 2)}` : `≥ ${fx(x.z, 2)}`,
          fx(x.N, 0),
          soilName(x.soil),
          corr(x.gamma, x.gammaCorr, 1),
          ...(statik ? [x.soil === 'L' ? corr(x.cu, x.cuCorr, 1) : '–', x.soil === 'P' ? fx(x.phi, 1) + '*' : '–'] : []),
        ]),
        caption: `* korelasi N-SPT: γ dari tabel konsistensi/kepadatan (Terzaghi–Peck, Bowles)${statik ? '; c_{u} = 6,25 N kPa (Terzaghi–Peck); φ = 27,1 + 0,3 N − 0,00054 N² (Peck–Hanson–Thornburn)' : ''}. Lapis terakhir dianggap menerus ke bawah.`,
      },
    ],
  }

  const shaft: Section = {
    title: 'Tahanan selimut',
    blocks: [
      {
        k: 'p',
        text: statik
          ? `Lempung (API): f_{s} = α c_{u}, ψ = c_{u}/σ′_{v}, α = 0,5 ψ^{−0,5} (ψ ≤ 1) atau 0,5 ψ^{−0,25} (ψ > 1), α ≤ 1. Pasir: f_{s} = K σ′_{v} tanδ, K = ${fx(r.cK, 1)}(1 − sinφ), δ = ${fx(r.cDelta, 1)} φ. f_{s} dibatasi 120 kPa. σ′_{v} di tengah segmen, γ′ = γ − ${fx(GAMMA_W, 2)} di bawah MAT. Selimut dihitung dari cut-off ${fx(r.zc, 2)} m.`
          : `SPT (Meyerhof): f_{s} = ${fx(r.nfSPT, 0)} N kPa (${r.ptype === 'driven' ? 'tiang pancang' : 'tiang bor'}), dibatasi 120 kPa. Selimut dihitung dari cut-off ${fx(r.zc, 2)} m.`,
      },
      {
        k: 'table',
        head: ['Lapis', 'Zona (m)', 'Tanah / metode', 'σ′_{v} (kPa)', 'f_{s} (kPa)', 'Faktor', 'Q_{s,i} (kN)'],
        align: ['c', 'c', 'l', 'r', 'r', 'l', 'r'],
        rows: r.segs.map(segRow),
        caption: r.nsf ? '(−) = segmen di zona gesekan negatif — tidak masuk Q_{s}, menjadi beban Q_{n}.' : undefined,
      },
      { k: 'calc', steps: [{ lhs: 'Q_{s}', expr: 'Σ (keliling × ΔL × f_{s})', subst: `Σ ${fx(r.perim, 3)} × ΔL × f_{s}${r.nsf ? ' (di bawah z_{n})' : ''}`, value: fx(r.Qs, 1), unit: 'kN' }] },
      { k: 'figure', fig: figProfile(r) },
    ],
  }

  const tipSteps: CalcStep[] = []
  const t = r.tipLayer
  if (t.method === 'spt') {
    const sand = t.soil === 'sand'
    const N = Number(t.N)
    const bor = r.ptype === 'bored'
    tipSteps.push({
      desc: `Ujung di lapis ${soilName(t.soil).toLowerCase()} (SPT Meyerhof${bor ? '; tiang bor = 1/3 tiang pancang' : ''})`,
      lhs: 'q_{p}',
      expr: `${bor ? '\\frac{1}{3} ' : ''}min(40 N L/D; ${sand ? 400 : 300} N)`,
      subst: `${bor ? '\\frac{1}{3} ' : ''}min(40 × ${fx(N, 0)} × ${fx(r.Leff / r.D, 2)}; ${sand ? 400 : 300} × ${fx(N, 0)})`,
      value: fx(r.qp, 1),
      unit: 'kPa',
    })
  } else if (t.soil === 'clay') {
    tipSteps.push({ desc: 'Ujung di lempung', lhs: 'q_{p}', expr: '9 c_{u}', subst: `9 × ${fx(Number(t.cu), 1)}`, value: fx(r.qp, 1), unit: 'kPa' })
  } else {
    tipSteps.push(
      { desc: 'Ujung di pasir (Meyerhof)', lhs: "σ'_{v,ujung}", value: fx(r.svTip, 1), unit: 'kPa' },
      { lhs: 'N_{q}', expr: 'e^{π tanφ} tan^{2}(45° + φ/2)', subst: `φ = ${fx(Number(t.phi), 1)}°`, value: fx(r.Nq, 2) },
      { lhs: 'q_{l}', expr: '0.5 p_{a} N_{q} tanφ', subst: `0.5 × 100 × ${fx(r.Nq, 2)} × tan(${fx(Number(t.phi), 1)}°)`, value: fx(r.ql, 1), unit: 'kPa' },
      { lhs: 'q_{p}', expr: 'min(σ′_{v} N_{q}; q_{l})', subst: `min(${fx(r.svTip, 1)} × ${fx(r.Nq, 2)}; ${fx(r.ql, 1)})`, value: fx(r.qp, 1), unit: 'kPa' },
    )
  }
  tipSteps.push({ lhs: 'Q_{p}', expr: 'A_{p} q_{p}', subst: `${fx(r.Ap, 4)} × ${fx(r.qp, 1)}`, value: fx(r.Qp, 1), unit: 'kN' })
  const tip: Section = { title: 'Tahanan ujung', blocks: [{ k: 'calc', steps: tipSteps }] }

  const sections: Section[] = [data, shaft, tip]

  if (r.nsf) {
    sections.push({
      title: 'Gesekan negatif',
      blocks: [
        { k: 'p', text: `Lapisan di atas z_{n} = ${fx(r.zn, 2)} m dianggap turun relatif terhadap tiang (timbunan / konsolidasi lempung). Gesekan pada zona z_{c}…z_{n} bekerja ke bawah dengan besar f_{s} yang sama, menjadi beban tambahan Q_{n} (tanpa faktor keamanan) dan tidak dihitung sebagai tahanan.` },
        { k: 'calc', steps: [{ lhs: 'Q_{n}', expr: 'Σ (keliling × ΔL × f_{s}), z_{c} ≤ z ≤ z_{n}', value: fx(r.Qn, 1), unit: 'kN' }] },
      ],
    })
  }

  const qSubst = `\\frac{${fx(r.Qu, 1)}}{${fx(r.FS, 2)}}${r.nsf ? ` − ${fx(r.Qn, 1)}` : ''}${r.inclW ? ` − ${fx(r.Wp, 1)}` : ''}`
  sections.push({
    title: 'Daya dukung tekan',
    strong: true,
    blocks: [
      {
        k: 'calc',
        steps: [
          { lhs: 'Q_{u}', expr: 'Q_{p} + Q_{s}', subst: `${fx(r.Qp, 1)} + ${fx(r.Qs, 1)}`, value: fx(r.Qu, 1), unit: 'kN' },
          { desc: `Berat sendiri tiang ${r.inclW ? 'dikurangkan' : 'diabaikan'}`, lhs: 'W_{p}', expr: 'A_{p} L γ_{beton}', subst: `${fx(r.Ap, 4)} × ${fx(r.Leff, 2)} × 24`, value: fx(r.Wp, 1), unit: 'kN' },
          { lhs: 'Q_{izin}', expr: `\\frac{Q_{u}}{FS}${r.nsf ? ' − Q_{n}' : ''}${r.inclW ? ' − W_{p}' : ''}`, subst: qSubst, value: fx(r.Qallow, 1), unit: 'kN' },
        ],
      },
      { k: 'rows', rows: [{ k: 'check', label: `P / Q_{izin} = ${fx(r.P, 1)} / ${fx(r.Qallow, 1)}`, ratio: r.Qallow > 0 ? r.P / r.Qallow : Infinity }] },
    ],
  })

  sections.push({
    title: 'Kapasitas tarik',
    strong: true,
    blocks: [
      { k: 'p', text: `Tahanan cabut dari gesekan selimut seluruh panjang tiang (termasuk zona gesekan negatif) dengan faktor reduksi c_{t} = ${fx(CT_CLAY, 2)} (lempung) dan ${fx(CT_SAND, 2)} (pasir); tahanan ujung diabaikan. Berat efektif tiang W′_{p} ${r.material === 'concrete' ? `memakai γ_{beton} = 24 kN/m³ (γ − γ_{w} di bawah MAT)` : 'diabaikan (tiang baja)'}.` },
      {
        k: 'calc',
        steps: [
          { lhs: 'T_{su}', expr: 'Σ c_{t} Q_{s,i}', value: fx(r.Tsu, 1), unit: 'kN' },
          { lhs: 'W′_{p}', expr: 'A_{p} Σ γ′_{beton} ΔL', value: fx(r.Wpe, 1), unit: 'kN' },
          { lhs: 'T_{izin}', expr: '\\frac{T_{su}}{FS_{t}} + W′_{p}', subst: `\\frac{${fx(r.Tsu, 1)}}{${fx(r.FSt, 2)}} + ${fx(r.Wpe, 1)}`, value: fx(r.Tallow, 1), unit: 'kN' },
        ],
      },
      { k: 'rows', rows: [{ k: 'check', label: `T / T_{izin} = ${fx(r.T, 1)} / ${fx(r.Tallow, 1)}`, ratio: r.Tallow > 0 ? r.T / r.Tallow : Infinity }] },
    ],
  })

  const b = r.rebar
  if (b) {
    sections.push({
      title: 'Penulangan tiang (SNI 2847:2019)',
      strong: true,
      blocks: [
        { k: 'rows', rows: [kv('Mutu', `f′c = ${fx(b.fc, 1)} MPa, f_{y} = ${fx(b.fy, 0)} MPa`), kv('Beban terfaktor', `P_{u} = ${fx(b.Pu, 1)} kN, T_{u} = ${fx(b.Tu, 1)} kN`), kv('Selimut / sengkang', `${fx(b.cover, 0)} mm / Ø${fx(b.ds, 0)}`)] },
        {
          k: 'calc',
          steps: [
            { lhs: 'A_{g}', expr: r.shape === 'square' ? 'D^{2}' : 'π D^{2}/4', value: fx(b.Ag, 0), unit: 'mm²' },
            { desc: 'Kebutuhan tarik', lhs: 'A_{s,t}', expr: '\\frac{T_{u}}{0,90 f_{y}}', subst: `\\frac{${fx(b.Tu, 1)} × 10^{3}}{0,90 × ${fx(b.fy, 0)}}`, value: fx(b.AsT, 0), unit: 'mm²', ref: '22.4.3' },
            { desc: 'Kebutuhan tekan (sengkang)', lhs: 'A_{s,c}', expr: '\\frac{P_{u}/(0,65 × 0,80) − 0,85 f′c A_{g}}{f_{y} − 0,85 f′c} ≥ 0', value: fx(b.AsP, 0), unit: 'mm²', ref: '22.4.2' },
            { desc: 'Minimum', lhs: 'A_{s,min}', expr: 'ρ_{min} A_{g}', subst: `${fx(b.rhoMin / 100, 4)} × ${fx(b.Ag, 0)}`, value: fx(b.AsMin, 0), unit: 'mm²', ref: '18.13.5' },
            { lhs: 'A_{s,perlu}', expr: 'maks(A_{s,t}; A_{s,c}; A_{s,min})', value: fx(b.AsReq, 0), unit: 'mm²' },
            { desc: `Pasang ${b.n} D${fx(b.db, 0)} (min. ${b.nMin} batang)`, lhs: 'A_{st}', expr: 'n A_{b}', subst: `${b.n} × ${fx(b.Ab, 1)}`, value: fx(b.As, 0), unit: 'mm²' },
            { lhs: 'ρ', expr: 'A_{st}/A_{g}', value: fx(b.rho * 100, 2), unit: '%' },
            { lhs: 'φP_{n,maks}', expr: '0,65 × 0,80 [0,85 f′c (A_{g} − A_{st}) + f_{y} A_{st}]', value: fx(b.phiPn, 1), unit: 'kN', ref: '22.4.2.1' },
            { lhs: 'φT_{n}', expr: '0,90 f_{y} A_{st}', value: fx(b.phiTn, 1), unit: 'kN' },
            { desc: 'Jarak bersih antar tulangan', lhs: 's_{bersih}', value: fx(b.clear, 0), unit: `mm (min. ${fx(b.clearMin, 0)})`, ref: '25.2.3' },
            { desc: 'Spasi sengkang maksimum', lhs: 's_{maks}', expr: 'min(16 d_{b}; 48 d_{s}; D)', value: fx(b.sMax, 0), unit: 'mm', ref: '25.7.2.1' },
          ],
        },
        {
          k: 'rows',
          rows: [
            { k: 'check', label: `P_{u} / φP_{n}`, ratio: b.Pu / b.phiPn },
            { k: 'check', label: `T_{u} / φT_{n}`, ratio: b.phiTn > 0 ? b.Tu / b.phiTn : 0 },
            { k: 'check', label: `Jarak bersih min / ada`, ratio: b.clear > 0 ? b.clearMin / b.clear : Infinity },
          ],
        },
        { k: 'figure', fig: figSection(r) },
      ],
    })
  }

  if (r.dq.active) {
    const d = r.dq
    const blocks: Block[] = [
      {
        k: 'calc',
        steps: [
          { lhs: 'N̄_{s}', desc: 'Rata-rata N sepanjang selimut (berbobot tebal)', value: fx(d.NsAvg, 2) },
          { lhs: 'f_{s}', expr: '10 (\\frac{N̄_{s}}{3} + 1)', value: fx(d.fsDq, 1), unit: 'kPa' },
          { lhs: 'Q_{s}', expr: 'keliling × L × f_{s}', value: fx(d.QsDq, 1), unit: 'kN' },
          { lhs: 'q_{p}', expr: `${d.C} N_{p}`, subst: `${d.C} × ${fx(d.Np, 0)}`, value: fx(d.qpDq, 1), unit: 'kPa' },
          { lhs: 'Q_{p}', expr: 'A_{p} q_{p}', value: fx(d.QpDq, 1), unit: 'kN' },
          { lhs: 'Q_{u,DQ}', expr: 'Q_{p} + Q_{s}', value: fx(d.QuDq, 1), unit: 'kN' },
          { lhs: 'Q_{izin,DQ}', expr: `\\frac{Q_{u,DQ}}{FS}${r.nsf ? ' − Q_{n}' : ''}`, value: fx(d.Qallow, 1), unit: 'kN' },
        ],
      },
    ]
    sections.push({ title: 'Pembanding empiris — Decourt–Quaresma', blocks })
  }

  return {
    title: 'Daya Dukung Tiang Tunggal (SPT) — Tekan & Tarik',
    summary: [
      kv('Q_{s} / Q_{p}', `${fx(r.Qs, 1)} / ${fx(r.Qp, 1)} kN`),
      ...(r.nsf ? [kv('Q_{n} gesekan negatif', `${fx(r.Qn, 1)} kN`)] : []),
      kv(`Q_{izin} tekan (FS ${fx(r.FS, 1)})`, `${fx(r.Qallow, 1)} kN`),
      kv(`T_{izin} tarik (FS ${fx(r.FSt, 1)})`, `${fx(r.Tallow, 1)} kN`),
      ...(b ? [kv('Tulangan', `${b.n} D${fx(b.db, 0)} (ρ ${fx(b.rho * 100, 2)}%), sengkang Ø${fx(b.ds, 0)}–${fx(b.sMax, 0)}`)] : []),
      ...(r.dq.active ? [kv('Q_{u} Decourt–Quaresma', `${fx(r.dq.QuDq, 1)} kN`)] : []),
    ],
    sections,
    warnings: r.warn,
    scope: [
      statik
        ? 'Selimut: lempung α (API RP2A), pasir β (Meyerhof/Das); ujung: lempung 9 c_{u}, pasir Meyerhof. Parameter tanah dari korelasi N-SPT bila tidak diisi.'
        : 'Selimut & ujung: SPT Meyerhof (f_{s} = n N, q_{p} = 40 N L/D ≤ 400 N / 300 N; tiang bor 1/3-nya).',
      'Tarik: gesekan selimut tereduksi + berat efektif tiang. Penulangan: aksial tekan/tarik murni SNI 2847:2019 (tanpa momen/lateral).',
      'Belum termasuk: efisiensi kelompok, beban lateral & momen, penurunan tiang, beban gempa. Verifikasi dengan uji beban/PDA oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildPileReport(i: PileUIInput): Report | null {
  const r = computePileUI(i)
  return r ? pileReport(r) : null
}

export default {
  defaults: PILE_DEFAULTS,
  build: (i: PileUIInput) => buildPileReport(i) ?? { title: 'Daya Dukung Tiang (SPT)', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
