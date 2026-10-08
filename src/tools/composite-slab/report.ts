import type { CompositeSlabResult } from '../../calc/composite-slab'
import { dimV, figRows } from '../../report/figure'
import { check, fx, kv, sci, type FigOp, type Figure, type Report, type Row, type Section } from '../../report/model'
import { COMP_DEFAULTS, computeComp, type CompInput } from './model'

// Laporan Slab Komposit + Metal Deck (SNI 2847:2019, SNI 1729:2020 Ps. I8, SDI C): berat sendiri, tahap konstruksi
// (dek sendiri), tahap komposit (lentur positif/negatif, susut-suhu, lendutan Branson), konektor geser.

export { COMP_DEFAULTS }

const KP: Record<number, string> = { 1: '1/8', 2: '9/128', 3: '1/11' }
const KN: Record<number, string> = { 1: '0', 2: '1/8', 3: '1/9' }
const KD: Record<number, string> = { 1: '5/384', 2: '1/185', 3: '1/145' }

/** Gbr. 1 — potongan pelat: rusuk dek (trapesium), beton, tulangan atas. */
function figSection(r: CompositeSlabResult): Figure {
  const ops: FigOp[] = []
  const pitch = r.pitch!, hr = r.hr!, D = r.D!
  const n = 2.5, W = n * pitch
  const sc = Math.min(400 / W, 110 / D)
  const x0 = 70, yTop = 16, yBot = yTop + D * sc
  const yc = yBot - hr * sc
  // pelat di atas rusuk
  ops.push({ t: 'rect', x: x0, y: yTop, w: W * sc, h: yc - yTop, fill: true, c: 'support', op: 0.14 })
  // rusuk beton (trapesium) mengisi lembah dek; garis dek mengikuti puncak & lembah
  const wt = 0.6 * pitch * sc, wb = 0.45 * pitch * sc
  const deck: [number, number][] = [[x0, yc]]
  for (let k = 0; k * pitch <= W; k++) {
    const cx = x0 + (k + 0.5) * pitch * sc
    if (cx + wt / 2 > x0 + W * sc) break
    const rib: [number, number][] = [[cx - wt / 2, yc], [cx + wt / 2, yc], [cx + wb / 2, yBot], [cx - wb / 2, yBot]]
    ops.push({ t: 'poly', pts: rib, fill: true, c: 'support', op: 0.14 })
    deck.push([cx - wt / 2, yc], [cx - wb / 2, yBot], [cx + wb / 2, yBot], [cx + wt / 2, yc])
  }
  deck.push([x0 + W * sc, yc])
  ops.push({ t: 'line', x1: x0, y1: yTop, x2: x0 + W * sc, y2: yTop, lw: 0.8, c: 'support' })
  ops.push({ t: 'poly', pts: deck, lw: 1.6, c: 'm' })
  const yr = yTop + (r.cover! + r.db! / 2) * sc
  for (let x = x0 + 20; x < x0 + W * sc - 10; x += 34) ops.push({ t: 'circle', cx: x, cy: yr, r: 1.8, fill: true, c: 'ink' })
  dimV(ops, yTop, yBot, x0 + W * sc + 14, '')
  ops.push({ t: 'text', x: x0 + W * sc + 20, y: (yTop + yBot) / 2 + 3, s: `D = ${fx(D, 0)}`, size: 7 })
  ops.push({ t: 'text', x: x0 - 6, y: yBot - (hr * sc) / 2 + 3, s: `h_{r} = ${fx(hr, 0)}`, size: 7, align: 'r', c: 'm' })
  ops.push({ t: 'text', x: x0 - 6, y: yTop + 8, s: `t_{c} = ${fx(r.tc, 0)}`, size: 7, align: 'r' })
  return {
    h: figRows(yBot + 12),
    ops,
    alt: 'Potongan pelat komposit dek baja',
    caption: `Gbr. 1 — Potongan ${r.deckName} (pitch rusuk ${fx(pitch, 0)} mm, skematik): dek baja (biru), beton di atas rusuk t_{c}, tulangan atas.`,
  }
}

export function compReport(r: CompositeSlabResult): Report {
  const s = r.spans! >= 3 ? 3 : r.spans!
  const L = fx(r.L, 2)
  const sections: Section[] = [
    {
      title: 'Data',
      blocks: [
        {
          k: 'rows',
          rows: [
            kv('Bentang L / jumlah bentang', `${L} m / ${r.coefLbl}`),
            kv('Tebal total D / topangan', `${fx(r.D, 0)} mm / ${r.prop === 'mid' ? 'topangan tengah saat cor' : 'tanpa topangan'}`),
            kv('Dek', `${r.deckName}: h_{r} ${fx(r.hr, 0)} mm, A_{se} ${fx(r.Ase, 0)} mm^{2}/m, y_{c} ${fx(r.ye, 1)} mm, I_{x} ${sci(r.Ideck!)} mm^{4}/m, f_{yd} ${fx(r.fyd, 0)} MPa`),
            kv('Aksi', r.comp ? 'komposit (dek = tulangan positif)' : 'non-komposit (dek bekisting, tulangan bawah RC)'),
            kv("f'_{c} / f_{y} / selimut atas", `${fx(r.fc, 0)} / ${fx(r.fy, 0)} MPa / ${fx(r.cover, 0)} mm`),
            kv('SDL / LL / beban konstruksi', `${fx(r.SDL, 2)} / ${fx(r.LL, 2)} / ${fx(r.cLL, 2)} kN/m^{2}`),
          ],
        },
        { k: 'figure', fig: figSection(r) },
      ],
    },
    {
      title: 'Berat sendiri',
      blocks: [
        {
          k: 'calc',
          steps: [
            { desc: 'Beton di atas rusuk', lhs: 't_{c}', expr: 'D − h_{r}', value: fx(r.tc, 0), unit: 'mm' },
            { desc: 'Tebal beton rata-rata', lhs: 'D_{c}', expr: 'D − 0.5h_{r}', value: fx(r.DcAvg, 1), unit: 'mm' },
            { lhs: 'q_{beton}', expr: '24 D_{c}', value: fx(r.concSW, 3), unit: 'kN/m^{2}' },
            { lhs: 'q_{dek}', expr: 'A_{se} × 7.7×10^{-5}', value: fx(r.deckSW, 3), unit: 'kN/m^{2}' },
          ],
        },
      ],
    },
    {
      title: 'Tahap konstruksi — dek sebagai bekisting',
      blocks: [
        { k: 'p', text: r.prop === 'mid' ? `Topangan tengah: bentang konstruksi L_{c} = L/2 = ${fx(r.Lc, 2)} m, dua bentang menerus.` : `Tanpa topangan: L_{c} = L = ${fx(r.Lc, 2)} m.` },
        {
          k: 'calc',
          steps: [
            { lhs: 'w_{cu}', expr: '1.2(q_{beton} + q_{dek}) + 1.6q_{konstruksi}', value: fx(r.wcU, 3), unit: 'kN/m^{2}' },
            { lhs: 'M_{cu}', expr: 'k · w_{cu} L_{c}^{2}', value: fx(r.McU, 2), unit: 'kN·m/m' },
            { desc: 'Kapasitas dek (0,9 f_{y} Z_{x}, tabel)', lhs: 'φM_{n,dek}', value: fx(r.McCap, 2), unit: 'kN·m/m' },
            { desc: 'Lendutan akibat beton basah + dek', lhs: 'δ_{c}', expr: '\\frac{k_{δ} w L_{c}^{4}}{E_{s} I_{x,dek}}', value: fx(r.dc, 2), unit: 'mm' },
            { lhs: 'δ_{c,izin}', expr: 'min(L_{c}/180; 20)', value: fx(r.dcLim, 2), unit: 'mm' },
          ],
        },
        { k: 'rows', rows: [...(r.McCap! > 0 ? [check('M_{cu} / φM_{n,dek}', r.McU! / r.McCap!)] : [kv('Kapasitas dek', 'tidak diisi — cek momen konstruksi dilewati')]), check('δ_{c} / δ_{c,izin}', r.dc! / r.dcLim!)] },
      ],
    },
    {
      title: 'Tahap komposit — beban & momen',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'w_{D}', expr: 'q_{beton} + q_{dek} + SDL', value: fx(r.wD, 3), unit: 'kN/m^{2}' },
            { lhs: 'w_{u}', expr: 'maks(1.4w_{D}; 1.2w_{D} + 1.6w_{L})', value: fx(r.wu, 3), unit: 'kN/m^{2}' },
            { lhs: 'M_{u}^{+}', expr: `${KP[s]} w_{u} L^{2}`, subst: `${KP[s]} × ${fx(r.wu, 3)} × ${L}^{2}`, value: fx(r.Mpos, 2), unit: 'kN·m/m' },
            ...(r.Mneg! > 0 ? [{ lhs: 'M_{u}^{−}', expr: `${KN[s]} w_{u} L^{2}`, subst: `${KN[s]} × ${fx(r.wu, 3)} × ${L}^{2}`, value: fx(r.Mneg, 2), unit: 'kN·m/m' }] : []),
          ],
        },
      ],
    },
    r.comp
      ? {
          title: 'Momen positif — dek sebagai tulangan',
          strong: true,
          blocks: [
            {
              k: 'calc',
              steps: [
                { lhs: 'd_{p}', expr: 'D − y_{c}', value: fx(r.dp, 1), unit: 'mm' },
                { lhs: 'T', expr: 'A_{se} f_{yd}', value: fx(r.Tpos, 1), unit: 'kN/m' },
                { lhs: 'a', expr: "\\frac{T}{0.85 f'_{c} · 1000}", value: fx(r.aPos, 1), unit: 'mm' },
                { lhs: 'φM_{n}^{+}', expr: '0.9 T (d_{p} − a/2)', value: fx(r.phiMnPos, 2), unit: 'kN·m/m' },
              ],
            },
            { k: 'rows', rows: [check('M_{u}^{+} / φM_{n}^{+}', r.Mpos! / r.phiMnPos!), ...(r.aInRib ? [kv('Catatan', 'a > t_{c}: blok tekan masuk ke rusuk — periksa terpisah')] : [])] },
          ],
        }
      : {
          title: 'Momen positif — tulangan bawah (non-komposit)',
          strong: true,
          blocks: [
            {
              k: 'calc',
              steps: [
                { lhs: 'd', expr: 'D − selimut − d_{b}/2', value: fx(r.dBot, 1), unit: 'mm' },
                { lhs: 'A_{s} perlu', value: fx(r.asBot!.AsReq, 0), unit: 'mm^{2}/m' },
                { lhs: 'Tulangan', value: `D${r.dbBot}-${r.asBot!.s}`, unit: `(${fx(r.asBot!.AsProv, 0)} mm^{2}/m)` },
                { lhs: 'φM_{n}^{+}', value: fx(r.phiMnPos, 2), unit: 'kN·m/m' },
              ],
            },
            { k: 'rows', rows: [check('M_{u}^{+} / φM_{n}^{+}', r.Mpos! / r.phiMnPos!)] },
          ],
        },
  ]

  if (r.asNeg)
    sections.push({
      title: 'Momen negatif — tulangan atas di tumpuan',
      blocks: [
        { k: 'p', text: `Tekan di bawah rusuk: lebar efektif Σ lebar bawah rusuk b_{c} = ${fx(r.bc, 0)} mm/m; ρ_{min} = 0,0018.` },
        {
          k: 'calc',
          steps: [
            { lhs: 'd', expr: 'D − selimut − d_{b}/2', value: fx(r.dn, 1), unit: 'mm' },
            { lhs: 'A_{s} perlu', value: fx(r.asNeg.AsReq, 0), unit: 'mm^{2}' },
            { lhs: 'Tulangan', value: `D${r.db}-${r.asNeg.s}`, unit: `(${fx(r.asNeg.AsProv, 0)} mm^{2})` },
          ],
        },
        ...(r.asNeg.infeasible ? [{ k: 'p' as const, text: 'M_{u}^{−} melebihi kapasitas penampang — pertebal pelat.' }] : []),
      ],
    })

  const defRows: Row[] = [check(`δ_{total} = ${fx(r.dTot, 2)} mm / (L/250 = ${fx(r.lim250, 1)} mm)`, r.dTot! / r.lim250!), check(`δ_{LL} = ${fx(r.dLL, 2)} mm / (L/360 = ${fx(r.lim360, 1)} mm)`, r.dLL! / r.lim360!)]
  sections.push(
    {
      title: 'Tulangan susut-suhu di atas dek',
      blocks: [
        {
          k: 'calc',
          steps: [
            { lhs: 'A_{s,st}', expr: 'maks(0.0018; 0.00075) · 1000 · t_{c}', value: fx(r.AsSt, 0), unit: 'mm^{2}/m' },
            { desc: 'Spasi kelipatan 25 mm, ≤ min(5t_{c}; 450)', lhs: 'Tulangan', value: `D${r.dbSt}-${r.sSt}`, unit: `(${fx(r.AsStProv, 0)} mm^{2}/m)` },
          ],
        },
      ],
    },
    {
      title: 'Lendutan tahap komposit (24.2)',
      blocks: [
        { k: 'p', text: r.prop === 'mid' ? 'Dipropi: seluruh beban layan D + L dipikul penampang komposit.' : 'Tanpa topangan: berat sendiri sudah dipikul dek; komposit memikul SDL + LL.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'I_{g}', expr: '1000 D_{c}^{3}/12', value: sci(r.Ig!), unit: 'mm^{4}/m' },
            { lhs: 'I_{cr}', value: sci(r.Icr!), unit: 'mm^{4}/m' },
            { lhs: 'M_{cr} / M_{a}', value: `${fx(r.Mcr, 2)} / ${fx(r.MaDef, 2)}`, unit: 'kN·m/m' },
            { lhs: 'I_{e}', expr: r.cracked ? '(M_{cr}/M_{a})^{3}I_{g} + [1 − (M_{cr}/M_{a})^{3}]I_{cr}' : 'I_{g} (tidak retak)', value: sci(r.Ie!), unit: 'mm^{4}/m' },
            { lhs: 'δ', expr: `${KD[s]} \\frac{w L^{4}}{E_{c} I_{e}}`, value: `${fx(r.dTot, 2)} (total) / ${fx(r.dLL, 2)} (LL)`, unit: 'mm' },
          ],
        },
        { k: 'rows', rows: defRows },
      ],
    },
    {
      title: 'Konektor geser ke balok baja (SNI 1729 Ps. I8)',
      blocks: [
        { k: 'p', text: 'Dek tegak lurus balok: R_{g} = 1,0, R_{p} = 0,6. Gaya geser horizontal per meter lebar pelat yang ditransfer.' },
        {
          k: 'calc',
          steps: [
            { lhs: 'C_{c}', expr: "0.85 f'_{c} · 1000 t_{c}", value: fx(r.Cc, 1), unit: 'kN/m' },
            { lhs: 'T_{s}', expr: r.comp ? 'A_{se} f_{yd}' : 'A_{s} f_{y}', value: fx(r.Tsteel, 1), unit: 'kN/m' },
            { lhs: "V'", expr: 'min(C_{c}; T_{s})', value: fx(r.Vh, 1), unit: 'kN/m' },
            { lhs: 'Q_{n}', expr: r.conType === 'stud' ? "min(0.5A_{sc}√(f'_{c}E_{c}); R_{g}R_{p}A_{sc}F_{u})" : "min(0.5A_{sc}√(f'_{c}E_{c}); 0.6A_{sc}f_{u})", value: fx(r.Qn, 2), unit: 'kN', ref: r.conType === 'stud' ? 'I8-1' : undefined },
            { lhs: 'N', expr: "⌈V'/Q_{n}⌉", value: `${r.Nstud} per meter (spasi ≈ ${r.studSpace} mm)` },
          ],
        },
      ],
    },
  )

  const gov = Math.max(r.McCap! > 0 ? r.McU! / r.McCap! : 0, r.dc! / r.dcLim!, r.Mpos! / r.phiMnPos!, r.dTot! / r.lim250!, r.dLL! / r.lim360!)
  return {
    title: 'Slab Komposit Metal Deck',
    summary: [
      ...(r.McCap! > 0 ? [check('Konstruksi: M_{cu} / φM_{n,dek}', r.McU! / r.McCap!)] : []),
      check('Konstruksi: δ_{c} / δ_{izin}', r.dc! / r.dcLim!),
      check('Komposit: M_{u}^{+} / φM_{n}^{+}', r.Mpos! / r.phiMnPos!),
      check('Lendutan total / L/250', r.dTot! / r.lim250!),
      kv('Tulangan atas tumpuan / susut', `${r.asNeg ? `D${r.db}-${r.asNeg.s}` : '-'} / D${r.dbSt}-${r.sSt}`),
      kv('Konektor', `${r.Nstud} per meter (Ø${r.ds} ${r.conType === 'stud' ? 'stud' : 'tulangan ulir'})`),
    ],
    sections,
    governing: { label: 'Rasio terbesar', ratio: gov },
    warnings: r.warn,
    scope: [
      'Properti dek INDIKATIF dari tabel katalog — verifikasi dengan tabel kapasitas resmi pabrikan (semua dapat ditimpa). Koefisien momen/lendutan pendekatan (1, 2, ≥3 bentang).',
      'Belum termasuk: geser-lekat dek (m-k), kebakaran, getaran, beban terpusat. Verifikasi oleh insinyur penanggung jawab.',
    ],
  }
}

/** Laporan dari input (null bila input tidak valid). */
export function buildCompReport(i: CompInput): Report | null {
  const r = computeComp(i)
  return r ? compReport(r) : null
}

export default {
  defaults: COMP_DEFAULTS,
  build: (i: CompInput) => buildCompReport(i) ?? { title: 'Slab Komposit', sections: [], warnings: ['Input belum lengkap.'], scope: [] },
}
