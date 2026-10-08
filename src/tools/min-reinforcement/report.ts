import type { MinRebarResult } from '../../calc/min-reinforcement'
import { check, fx, kv, type Block, type Report, type Row } from '../../report/model'
import { computeMin, ELEMENTS, MIN_DEFAULTS, type MinInput } from './model'

// Laporan Tulangan Minimum (SNI 2847:2019): balok (lentur 9.6.1.2 + geser 9.6.3), kolom persegi/lingkaran (10.6.1.1,
// 25.7.2 ikat, 25.7.3 spiral), pelat & pile cap (24.4.3.2) — dengan rumus dan substitusi.

export { MIN_DEFAULTS }

const area = (db: number) => `\\frac{π × ${fx(db, 0)}^{2}}{4}`

function beamBlocks(r: MinRebarResult): { blocks: Block[]; rows: Row[] } {
  const fc = fx(r.fc, 0), fy = fx(r.fy, 0)
  return {
    blocks: [
      {
        k: 'calc',
        steps: [
          { desc: 'Satu lapis tulangan', lhs: 'd', expr: 'h − selimut − Ø_{s} − d_{b}/2', subst: `${fx(r.h, 0)} − ${fx(r.cc, 0)} − ${fx(r.ds, 0)} − ${fx(r.db! / 2, 1)}`, value: fx(r.d, 1), unit: 'mm' },
          { lhs: 'ρ_{1}', expr: "\\frac{0.25√(f'_{c})}{f_{y}}", subst: `\\frac{0.25 × √(${fc})}{${fy}}`, value: fx(r.rho1, 5), ref: '9.6.1.2a' },
          { lhs: 'ρ_{2}', expr: '\\frac{1.4}{f_{y}}', subst: `\\frac{1.4}{${fy}}`, value: fx(r.rho2, 5), ref: '9.6.1.2b' },
          { lhs: 'A_{s,min}', expr: 'maks(ρ_{1}; ρ_{2}) b_{w} d', subst: `${fx(r.rhoMin, 5)} × ${fx(r.bw, 0)} × ${fx(r.d, 1)}`, value: fx(r.AsMin, 1), unit: 'mm^{2}' },
          { desc: `A_{b} = ${area(r.db!)} = ${fx(r.Ab, 1)} mm^{2}; minimal 2 batang (sudut sengkang)`, lhs: 'n', expr: 'maks(2; ⌈A_{s,min}/A_{b}⌉)', value: `${r.n} D${fx(r.db, 0)}` },
          { lhs: 'A_{s,pasang}', expr: 'n A_{b}', subst: `${r.n} × ${fx(r.Ab, 1)}`, value: fx(r.AsProv, 1), unit: 'mm^{2}' },
        ],
      },
      { k: 'h', text: 'Tulangan geser minimum (9.6.3.4)' },
      {
        k: 'calc',
        steps: [
          { lhs: '\\frac{A_{v}}{s}', expr: "maks(0.062√(f'_{c}); 0.35) \\frac{b_{w}}{f_{yt}}", subst: `maks(${fx(0.062 * Math.sqrt(r.fc!), 3)}; 0.35) × \\frac{${fx(r.bw, 0)}}{${fx(r.fyt, 0)}}`, value: fx(r.avPerS, 4), unit: 'mm^{2}/mm' },
          { desc: 'Sengkang 2 kaki', lhs: 'A_{v}', expr: `2 × ${area(r.ds!)}`, value: fx(r.Av, 1), unit: 'mm^{2}' },
          { lhs: 's_{A_{v}}', expr: '\\frac{A_{v}}{A_{v}/s}', subst: `\\frac{${fx(r.Av, 1)}}{${fx(r.avPerS, 4)}}`, value: fx(r.sAv, 0), unit: 'mm' },
          { desc: 'Batas spasi bila V_{s} kecil (9.7.6.2.2)', lhs: 's_{maks}', expr: 'min(d/2; 600)', value: fx(r.sMaxD, 0), unit: 'mm' },
          { desc: 'Dibulatkan ke bawah kelipatan 10 mm', lhs: 's_{pakai}', value: fx(r.sPakai, 0), unit: 'mm' },
        ],
      },
    ],
    rows: [
      kv('Tulangan lentur minimum', `${r.n} D${fx(r.db, 0)} (${fx(r.AsProv, 0)} mm^{2} ≥ ${fx(r.AsMin, 0)})`),
      kv('Sengkang minimum', `Ø${fx(r.ds, 0)} – ${fx(r.sPakai, 0)} mm (2 kaki)`),
      ...(r.n! > 1 ? [check(`Spasi bersih minimum ${fx(r.sClearMin, 0)} mm / ${fx(r.sClear, 0)} mm (25.2.1)`, r.sClearMin! / Math.max(r.sClear!, 1e-9))] : []),
    ],
  }
}

function columnBlocks(r: MinRebarResult, round: boolean): { blocks: Block[]; rows: Row[] } {
  const steps = [
    round
      ? { lhs: 'A_{g}', expr: '\\frac{π D^{2}}{4}', subst: `\\frac{π × ${fx(r.D, 0)}^{2}}{4}`, value: fx(r.Ag, 0), unit: 'mm^{2}' }
      : { lhs: 'A_{g}', expr: 'b h', subst: `${fx(r.b, 0)} × ${fx(r.h, 0)}`, value: fx(r.Ag, 0), unit: 'mm^{2}' },
    { lhs: 'A_{st,min}', expr: '0.01 A_{g}', value: fx(r.AstMin, 0), unit: 'mm^{2}', ref: '10.6.1.1' },
    { lhs: 'A_{st,maks}', expr: '0.08 A_{g}', value: fx(r.AstMax, 0), unit: 'mm^{2}', ref: '10.6.1.1' },
    {
      desc: `A_{b} = ${fx(r.Ab, 1)} mm^{2}; minimal ${round ? `${r.nMin} batang (${r.spiral ? 'spiral' : 'ikat'})` : '4 batang, dibulatkan genap'} (10.7.3.1)`,
      lhs: 'n',
      expr: '⌈A_{st,min}/A_{b}⌉',
      value: `${r.n} D${fx(r.db, 0)}`,
    },
    { lhs: 'ρ_{g}', expr: '\\frac{n A_{b}}{A_{g}}', subst: `\\frac{${r.n} × ${fx(r.Ab, 1)}}{${fx(r.Ag, 0)}}`, value: fx(r.rhoProv! * 100, 2), unit: '%' },
  ]
  const blocks: Block[] = [{ k: 'calc', steps }]
  if (!round && r.layout) blocks.push({ k: 'p', text: `Susunan: ${r.layout.nx} batang per sisi b × ${r.layout.ny} batang per sisi h (4 sudut + sisanya ke sisi berjarak terbesar).` })
  if (round) blocks.push({ k: 'p', text: `Batang tersebar merata pada lingkaran berjari-jari ${fx(r.ringR, 1)} mm.` })
  const rows: Row[] = [
    kv('Tulangan longitudinal minimum', `${r.n} D${fx(r.db, 0)} (ρ_{g} = ${fx(r.rhoProv! * 100, 2)}%)`),
    check(`Spasi bersih minimum maks(1,5d_{b}; 40) = ${fx(r.sClearMin, 0)} mm / ${fx(r.sClear, 0)} mm (25.2.3)`, r.sClearMin! / Math.max(r.sClear!, 1e-9)),
  ]
  if (r.spiral) {
    blocks.push(
      { k: 'h', text: 'Spiral (25.7.3)' },
      {
        k: 'calc',
        steps: [
          { desc: 'Diameter inti (luar-luar spiral)', lhs: 'D_{c}', expr: 'D − 2 selimut', value: fx(r.Dc, 0), unit: 'mm' },
          { lhs: 'A_{ch}', expr: '\\frac{π D_{c}^{2}}{4}', value: fx(r.Ach, 0), unit: 'mm^{2}' },
          { lhs: 'ρ_{s}', expr: "0.45(\\frac{A_{g}}{A_{ch}} − 1)\\frac{f'_{c}}{f_{yt}}", subst: `0.45 × (\\frac{${fx(r.Ag, 0)}}{${fx(r.Ach, 0)}} − 1) × \\frac{${fx(r.fc, 0)}}{${fx(r.fyt, 0)}}`, value: fx(r.rhoS, 5), ref: '25.7.3.3' },
          { desc: 'ρ_{s} = 4A_{sp}/(D_{c} s)', lhs: 's', expr: '\\frac{4 A_{sp}}{D_{c} ρ_{s}}', subst: `\\frac{4 × ${fx((Math.PI / 4) * r.dsp! * r.dsp!, 1)}}{${fx(r.Dc, 0)} × ${fx(r.rhoS, 5)}}`, value: fx(r.sPitch, 1), unit: 'mm' },
          { desc: 'Dibulatkan ke bawah kelipatan 5 mm; pitch bersih 25–75 mm (25.7.3.1)', lhs: 's_{pakai}', value: fx(r.sPitchPakai, 0), unit: 'mm' },
        ],
      },
    )
    rows.push(kv('Spiral', `Ø${fx(r.dsp, 0)} pitch ${fx(r.sPitchPakai, 0)} mm (bersih ${fx(r.sPitchClear, 0)} mm)`))
  } else {
    blocks.push(
      { k: 'h', text: 'Sengkang ikat (25.7.2)' },
      {
        k: 'calc',
        steps: [
          { desc: `Diameter minimum Ø${r.tieDia} untuk d_{b} ${r.db! <= 32 ? '≤ 32' : '> 32'} mm (25.7.2.2)`, lhs: 'Ø_{s}', value: `Ø${fx(r.ds, 0)}` },
          { lhs: 's_{maks}', expr: `min(16d_{b}; 48Ø_{s}; ${round ? 'D' : 'min(b; h)'})`, subst: `min(${fx(16 * r.db!, 0)}; ${fx(48 * r.ds!, 0)}; ${fx(round ? r.D : Math.min(r.b!, r.h!), 0)})`, value: fx(r.sTie, 0), unit: 'mm', ref: '25.7.2.1' },
          { desc: 'Dibulatkan ke bawah kelipatan 10 mm', lhs: 's_{pakai}', value: fx(r.sTiePakai, 0), unit: 'mm' },
        ],
      },
    )
    rows.push(kv('Sengkang ikat', `Ø${fx(r.ds, 0)} – ${fx(r.sTiePakai, 0)} mm`), check(`Ø sengkang minimum Ø${r.tieDia} / Ø${fx(r.ds, 0)}`, r.tieDia! / r.ds!))
  }
  return { blocks, rows }
}

function slabBlocks(r: MinRebarResult, cap: boolean): { blocks: Block[]; rows: Row[] } {
  const fy = r.fy!
  const blocks: Block[] = [
    {
      k: 'calc',
      steps: [
        fy < 420
          ? { desc: 'f_{y} < 420 MPa', lhs: 'ρ_{min}', value: '0.0020', ref: '24.4.3.2' }
          : { lhs: 'ρ_{min}', expr: 'maks(\\frac{0.0018 × 420}{f_{y}}; 0.0014)', subst: `maks(\\frac{0.0018 × 420}{${fx(fy, 0)}}; 0.0014)`, value: fx(r.rhoMin, 5), ref: '24.4.3.2' },
        { desc: `Per meter lebar${cap ? ', tiap arah' : ''}, terhadap penampang bruto`, lhs: 'A_{s,min}', expr: 'ρ_{min} · 1000 · h', subst: `${fx(r.rhoMin, 5)} × 1000 × ${fx(r.h, 0)}`, value: fx(r.AsMin, 1), unit: 'mm^{2}/m' },
        { lhs: 's_{teori}', expr: '\\frac{1000 A_{b}}{A_{s,min}}', subst: `\\frac{1000 × ${fx(r.Ab, 1)}}{${fx(r.AsMin, 1)}}`, value: fx(r.sTheo, 0), unit: 'mm' },
        { lhs: 's_{maks}', expr: 'min(3h; 450)', value: fx(r.sMax, 0), unit: 'mm', ref: '24.4.3.3' },
        { desc: 'Dibulatkan ke bawah kelipatan 5 mm', lhs: 's_{pakai}', value: fx(r.sPakai, 0), unit: 'mm' },
        { lhs: 'A_{s,pasang}', expr: '\\frac{1000 A_{b}}{s_{pakai}}', value: fx(r.AsProv, 1), unit: 'mm^{2}/m' },
      ],
    },
  ]
  if (cap)
    blocks.push({
      k: 'table',
      head: ['Arah batang', 'Jumlah', 'A_{s} total (mm^{2})'],
      align: ['l', 'r', 'r'],
      rows: [
        [`Arah B (tersebar sepanjang L = ${fx(r.L, 0)} mm)`, String(r.nDirB), fx(r.AsTotB, 0)],
        [`Arah L (tersebar sepanjang B = ${fx(r.B, 0)} mm)`, String(r.nDirL), fx(r.AsTotL, 0)],
      ],
    })
  if (r.dua) blocks.push({ k: 'p', text: `Pelat dua arah: pada penampang kritis spasi maksimum min(2h; 450) = ${fx(r.sMax2, 0)} mm (8.7.2.2).` })
  return { blocks, rows: [kv(cap ? 'Tulangan minimum tiap arah' : 'Tulangan minimum', `D${fx(r.db, 0)} – ${fx(r.sPakai, 0)} mm (${fx(r.AsProv, 0)} mm^{2}/m)`)] }
}

export function minReport(i: MinInput, r: MinRebarResult): Report {
  const name = ELEMENTS.find((e) => e.value === r.elem)!.label
  const part =
    r.elem === 'balok' ? beamBlocks(r) : r.elem === 'kolom-p' ? columnBlocks(r, false) : r.elem === 'kolom-l' ? columnBlocks(r, true) : slabBlocks(r, r.elem === 'pilecap')
  const dims =
    r.elem === 'balok' ? `b_{w} × h = ${fx(r.bw, 0)} × ${fx(r.h, 0)} mm` :
    r.elem === 'kolom-p' ? `b × h = ${fx(r.b, 0)} × ${fx(r.h, 0)} mm` :
    r.elem === 'kolom-l' ? `D = ${fx(r.D, 0)} mm` :
    r.elem === 'pelat' ? `h = ${fx(r.h, 0)} mm (${r.dua ? 'dua arah' : 'satu arah'})` :
    `B × L × h = ${fx(r.B, 0)} × ${fx(r.L, 0)} × ${fx(r.h, 0)} mm`
  return {
    title: `Tulangan Minimum — ${name} (SNI 2847:2019)`,
    summary: part.rows,
    sections: [
      {
        title: 'Data',
        blocks: [
          {
            k: 'rows',
            rows: [
              kv('Elemen', name),
              kv('Dimensi', dims),
              kv("f'_{c} / f_{y}", `${fx(r.fc, 0)} / ${fx(r.fy, 0)} MPa${r.fyt ? ` · f_{yt} = ${fx(r.fyt, 0)} MPa` : ''}`),
              ...(r.elem !== 'pelat' ? [kv('Selimut bersih', `${fx(Number(i.cc), 0)} mm`)] : []),
              kv('Tulangan utama', `D${fx(r.db, 0)} (A_{b} = ${fx(r.Ab, 1)} mm^{2})`),
            ],
          },
        ],
      },
      { title: 'Perhitungan tulangan minimum', strong: true, blocks: [...part.blocks, { k: 'rows', rows: part.rows }] },
    ],
    warnings: r.warn,
    scope: ['Hanya persyaratan tulangan minimum & detail dasar — bukan desain kekuatan. Verifikasi oleh insinyur penanggung jawab.'],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildMinReport(i: MinInput): Report | null {
  const r = computeMin(i)
  return r ? minReport(i, r) : null
}

export default {
  defaults: MIN_DEFAULTS,
  build: (i: MinInput) => buildMinReport(i) ?? { title: 'Tulangan Minimum', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
