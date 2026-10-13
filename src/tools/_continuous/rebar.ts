import type { CMItem, CMResult } from '../../calc/continuous-beam'
import { dimH, dimV, figRows } from '../../report/figure'
import { fx, type FigOp, type Figure } from '../../report/model'

// Gambar penulangan Balok Menerus & Pelat Satu Arah Menerus (skematik, tinggi tidak berskala pada elevasi):
//   balok → elevasi sengkang & tulangan memanjang + potongan lapangan & tumpuan;
//   pelat → potongan memanjang penulangan + potongan melintang lajur 1 m (lapangan & tumpuan).
// Spasi sengkang & tulangan pelat kelipatan 25 mm. Tulangan atas di tumpuan dipotong ≈ 0,3 ln (indikatif; panjang
// penyaluran tidak diperiksa).

const X0 = 30
const X1 = 498
const CUT = 0.3 // panjang tulangan atas dari sumbu tumpuan, × ln

const govern = (r: CMResult, kind: 'pos' | 'neg'): CMItem | undefined =>
  [...(r.des?.items ?? [])].filter((i) => i.kind === kind).sort((a, b) => b.Mu - a.Mu)[0]

const supportX = (r: CMResult) => {
  let a = 0
  return [0, ...r.spanLen!.map((L) => (a += L))]
}

/** Poligon penampang persegi/T/L (titik kiri-atas = (x, y)); T: badan di tengah sayap, L: badan di kiri. */
function teePts(kind: 'persegi' | 'T' | 'L', x: number, y: number, bf: number, bw: number, hf: number, h: number): { pts: [number, number][]; wx: number } {
  if (kind === 'persegi') return { pts: [[x, y], [x + bw, y], [x + bw, y + h], [x, y + h], [x, y]], wx: x }
  const wx = kind === 'T' ? x + (bf - bw) / 2 : x
  const pts: [number, number][] =
    kind === 'T'
      ? [[x, y], [x + bf, y], [x + bf, y + hf], [wx + bw, y + hf], [wx + bw, y + h], [wx, y + h], [wx, y + hf], [x, y + hf], [x, y]]
      : [[x, y], [x + bf, y], [x + bf, y + hf], [x + bw, y + hf], [x + bw, y + h], [x, y + h], [x, y]]
  return { pts, wx }
}

/** Gbr. — elevasi balok: sengkang per zona (spasi kelipatan 25 mm), tulangan bawah, tulangan atas di tumpuan. */
export function beamElevationFig(r: CMResult, n: number): Figure | null {
  const stir = r.stir
  if (!stir || !r.des?.valid) return null
  const ops: FigOp[] = []
  const xs = supportX(r)
  const total = xs[xs.length - 1]
  const X = (m: number) => X0 + (m / total) * (X1 - X0)
  const yT = 32, yB = 66 // muka atas & bawah balok (tidak berskala)
  const items = r.des.items!
  const posTxt = (i: number) => items.find((it) => it.kind === 'pos' && it.idx === i)?.txt
  const negTxt = (k: number) => items.find((it) => it.kind === 'neg' && it.idx === k)?.txt

  ops.push({ t: 'rect', x: X(0), y: yT, w: X(total) - X(0), h: yB - yT, fill: true, c: 'muted', op: 0.08 })
  ops.push({ t: 'rect', x: X(0), y: yT, w: X(total) - X(0), h: yB - yT, lw: 1.2, c: 'ink' })
  xs.forEach((x) => ops.push({ t: 'poly', pts: [[X(x), yB + 1], [X(x) - 5, yB + 10], [X(x) + 5, yB + 10]], fill: true, c: 'support', op: 0.4 }))

  // sengkang
  stir.spans.forEach((zones, i) => {
    zones.forEach((z, zi) => {
      const pxStep = ((z.s / 1000) / total) * (X1 - X0)
      const skip = Math.max(1, Math.ceil(1.8 / pxStep))
      for (let m = z.x0 + z.s / 2000, k = 0; m < z.x1; m += z.s / 1000, k++) {
        if (k % skip) continue
        const x = X(xs[i] + m)
        ops.push({ t: 'line', x1: x, y1: yT + 2.5, x2: x, y2: yB - 2.5, lw: 0.6, c: 'v' })
      }
      // batas zona & label
      const xa = X(xs[i] + z.x0), xb = X(xs[i] + z.x1)
      if (zi > 0) ops.push({ t: 'line', x1: xa, y1: yB + 12, x2: xa, y2: yB + 36, lw: 0.4, c: 'grid', dash: [2, 2] })
      ops.push({ t: 'text', x: (xa + xb) / 2, y: yB + 21 + ((zi + (i % 2)) % 2) * 9, s: `Ø${stir.ds}-${z.s}`, size: 6.2, align: 'c', c: 'v' })
    })
  })

  // tulangan memanjang
  const lnOf = (i: number) => r.lnSpan![i]
  const yBar = yB - 4, yTop = yT + 4
  r.spanLen!.forEach((_, i) => {
    ops.push({ t: 'line', x1: X(xs[i]) + 2, y1: yBar, x2: X(xs[i + 1]) - 2, y2: yBar, lw: 1.6, c: 'accent' })
    const t = posTxt(i)
    if (t) ops.push({ t: 'text', x: X((xs[i] + xs[i + 1]) / 2), y: yB + 52, s: `bawah ${t}`, size: 6.5, align: 'c', c: 'accent' })
  })
  ops.push({ t: 'line', x1: X(0) + 2, y1: yTop, x2: X(total) - 2, y2: yTop, lw: 0.8, c: 'accent', dash: [3, 2] })
  xs.forEach((x, k) => {
    const t = negTxt(k)
    if (!t) return
    const ln = k === 0 ? lnOf(0) : k === xs.length - 1 ? lnOf(r.n - 1) : Math.max(lnOf(k - 1), lnOf(k))
    const a = k === 0 ? x : x - CUT * ln, b = k === xs.length - 1 ? x : x + CUT * ln
    ops.push({ t: 'line', x1: X(a), y1: yTop, x2: X(b), y2: yTop, lw: 1.8, c: 'accent' })
    ops.push({ t: 'text', x: X(x), y: yT - 5, s: `atas ${t}`, size: 6.5, align: 'c', c: 'accent' })
  })
  return {
    h: figRows(yB + 62),
    ops,
    alt: 'Elevasi balok menerus dengan sengkang',
    caption: `Gbr. ${n} — Elevasi: sengkang Ø${stir.ds} per zona dari V_{u}(x) (kritis di muka tumpuan; spasi kelipatan 25 mm, minimum praktis b_{w}/f_{yt}), tulangan bawah tiap bentang, tulangan atas di tumpuan dipotong ≈ ${CUT} l_{n} dari sumbu tumpuan (indikatif; panjang penyaluran belum diperiksa). Tinggi tidak berskala.`,
  }
}

interface SecSpec {
  title: string
  kind: 'persegi' | 'T' | 'L'
  bf: number
  /** Bentang tempat zona sengkang diambil & pilihan zona. */
  span: number
  zone: 'mid' | 'first' | 'last'
  topN: number
  botN: number
  perTop: number
  perBot: number
  mainBottom: boolean
  /** Label ringkas tulangan utama. */
  txt: string
}

/** Gbr. — potongan lapangan & tumpuan balok: tulangan utama, tulangan praktis 2 batang, sengkang. */
export function beamSectionsFig(r: CMResult, n: number): Figure | null {
  const pos = govern(r, 'pos'), neg = govern(r, 'neg')
  const des = r.des
  if (!des?.valid || !r.stir || !pos) return null
  const ops: FigOp[] = []
  const bw = r.b!, h = r.h!, hf = r.hf!, db = des.db, ds = des.ds!, cc = des.cc
  const kind = r.kind!
  const bfMax = Math.max(...r.bfSpan!)
  const sc = Math.min(125 / h, 190 / bfMax)
  const gap = Math.max(25, db)
  const specs: SecSpec[] = [
    {
      title: `Potongan lapangan (bentang ${pos.idx + 1})`,
      kind, bf: r.bfSpan![pos.idx], span: pos.idx, zone: 'mid', topN: 2, botN: pos.n ?? 2,
      perTop: 99, perBot: pos.perLayer ?? 99, mainBottom: true, txt: `${pos.txt} (bawah) · 2 D${db} (atas, praktis)`,
    },
  ]
  if (neg) {
    const k = neg.idx
    specs.push({
      title: `Potongan tumpuan (tumpuan ${k + 1})`,
      kind, bf: r.bfSpan![Math.min(k, r.n - 1)], span: Math.min(k, r.n - 1), zone: k >= r.n ? 'last' : 'first', topN: neg.n ?? 2, botN: 2,
      perTop: neg.perLayer ?? 99, perBot: 99, mainBottom: false, txt: `${neg.txt} (atas) · 2 D${db} (bawah, praktis)`,
    })
  }
  const colW = 264
  let bottom = 0
  specs.forEach((sp, ci) => {
    const x0 = ci * colW + 62, y0 = 26
    const { pts, wx } = teePts(sp.kind, x0, y0, sp.bf * sc, bw * sc, hf * sc, h * sc)
    ops.push({ t: 'text', x: ci * colW + 10, y: 12, s: sp.title, size: 7.5, bold: true })
    ops.push({ t: 'poly', pts, fill: true, c: 'muted', op: 0.1 })
    ops.push({ t: 'poly', pts, lw: 1.3, c: 'ink' })
    // sengkang (persegi dalam badan)
    const inset = cc * sc, sx0 = wx + inset, sx1 = wx + bw * sc - inset, sy0 = y0 + inset, sy1 = y0 + h * sc - inset
    ops.push({ t: 'rect', x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0, lw: Math.max(0.9, ds * sc), c: 'v' })
    // tulangan
    const rBar = Math.max(1.9, (db * sc) / 2)
    const edge = (cc + ds + db / 2) * sc
    const layerBars = (count: number, per: number, fromTop: boolean) => {
      let left = count, layer = 0
      while (left > 0) {
        const m = Math.min(left, per)
        const y = fromTop ? y0 + edge + layer * (db + gap) * sc : y0 + h * sc - edge - layer * (db + gap) * sc
        const xa = wx + edge, xb = wx + bw * sc - edge
        for (let k = 0; k < m; k++) {
          const x = m === 1 ? (xa + xb) / 2 : xa + ((xb - xa) * k) / (m - 1)
          ops.push({ t: 'circle', cx: x, cy: y, r: rBar, fill: true, c: 'accent' })
        }
        left -= m
        layer++
      }
    }
    layerBars(sp.topN, sp.perTop, true)
    layerBars(sp.botN, sp.perBot, false)
    dimH(ops, wx, wx + bw * sc, y0 + h * sc + 16, `b_{w} = ${fx(bw, 0)}`)
    dimV(ops, y0, y0 + h * sc, x0 - 14, `h = ${fx(h, 0)}`)
    if (sp.kind !== 'persegi') ops.push({ t: 'text', x: x0 + (sp.bf * sc) / 2, y: y0 - 4, s: `b_{f} = ${fx(sp.bf, 0)}`, size: 6.5, align: 'c', c: 'muted' })
    const z = r.stir!.spans[sp.span]
    const zone = sp.zone === 'mid' ? z[Math.floor(z.length / 2)] : sp.zone === 'last' ? z[z.length - 1] : z[0]
    ops.push({ t: 'text', x: ci * colW + 10, y: y0 + h * sc + 32, s: sp.txt, size: 6.5, c: 'accent' })
    ops.push({ t: 'text', x: ci * colW + 10, y: y0 + h * sc + 42, s: `sengkang Ø${ds}-${zone.s} · selimut ${fx(cc, 0)} mm`, size: 6.5, c: 'v' })
    bottom = Math.max(bottom, y0 + h * sc + 50)
  })
  return {
    h: figRows(bottom),
    ops,
    alt: 'Potongan lapangan dan tumpuan balok',
    caption: `Gbr. ${n} — Potongan: lapangan (momen positif terbesar) dan tumpuan (momen negatif terbesar). Tulangan 2 batang pada sisi berlawanan bersifat praktis (penggantung / lanjutan). Bila batang tidak muat satu lapis (spasi bersih ≥ maks(25; d_{b})) digambar dua lapis.`,
  }
}

/** Gbr. — potongan memanjang pelat: tulangan bawah tiap bentang, tulangan atas di tumpuan, tulangan bagi. */
export function slabLongFig(r: CMResult, n: number): Figure | null {
  const des = r.des
  if (!des?.valid || !des.items) return null
  const ops: FigOp[] = []
  const xs = supportX(r)
  const total = xs[xs.length - 1]
  const X = (m: number) => X0 + (m / total) * (X1 - X0)
  const yT = 42, yB = 72
  const items = des.items
  const posTxt = (i: number) => items.find((it) => it.kind === 'pos' && it.idx === i)?.txt
  const negTxt = (k: number) => items.find((it) => it.kind === 'neg' && it.idx === k)?.txt
  ops.push({ t: 'rect', x: X(0), y: yT, w: X(total) - X(0), h: yB - yT, fill: true, c: 'muted', op: 0.08 })
  ops.push({ t: 'rect', x: X(0), y: yT, w: X(total) - X(0), h: yB - yT, lw: 1.2, c: 'ink' })
  xs.forEach((x) => ops.push({ t: 'poly', pts: [[X(x), yB + 1], [X(x) - 5, yB + 10], [X(x) + 5, yB + 10]], fill: true, c: 'support', op: 0.4 }))
  const yBar = yB - 5, yTop = yT + 5
  r.spanLen!.forEach((_, i) => {
    ops.push({ t: 'line', x1: X(xs[i]) + 2, y1: yBar, x2: X(xs[i + 1]) - 2, y2: yBar, lw: 1.7, c: 'accent' })
    const t = posTxt(i)
    if (t) ops.push({ t: 'text', x: X((xs[i] + xs[i + 1]) / 2), y: yB + 24, s: `bawah ${t}`, size: 6.8, align: 'c', c: 'accent' })
    ops.push({ t: 'text', x: X((xs[i] + xs[i + 1]) / 2), y: yB + 35, s: `${fx(r.spanLen![i], 2)} m`, size: 6.2, align: 'c', c: 'muted' })
    // tulangan bagi (titik = batang terpotong)
    const step = Math.max(9, ((des.dist?.s ?? 250) / 1000 / total) * (X1 - X0))
    for (let x = X(xs[i]) + step; x < X(xs[i + 1]) - 3; x += step) ops.push({ t: 'circle', cx: x, cy: yBar - 5, r: 1.1, fill: true, c: 'v' })
  })
  xs.forEach((x, k) => {
    const t = negTxt(k)
    if (!t) return
    const ln = k === 0 ? r.lnSpan![0] : k === xs.length - 1 ? r.lnSpan![r.n - 1] : Math.max(r.lnSpan![k - 1], r.lnSpan![k])
    const a = k === 0 ? x : x - CUT * ln, b = k === xs.length - 1 ? x : x + CUT * ln
    ops.push({ t: 'line', x1: X(a), y1: yTop, x2: X(b), y2: yTop, lw: 1.9, c: 'accent' })
    ops.push({ t: 'text', x: X(x), y: yT - 6, s: `atas ${t}`, size: 6.8, align: 'c', c: 'accent' })
  })
  ops.push({ t: 'text', x: X0, y: 12, s: `Tulangan bagi / susut tegak lurus bentang: ${des.dist?.txt ?? '—'} (titik = batang terpotong)`, size: 6.8, c: 'v' })
  return {
    h: figRows(yB + 44),
    ops,
    alt: 'Potongan memanjang penulangan pelat',
    caption: `Gbr. ${n} — Potongan memanjang lajur 1 m: tulangan bawah di tiap bentang, tulangan atas di tumpuan dipotong ≈ ${CUT} l_{n} dari sumbu tumpuan (indikatif; panjang penyaluran belum diperiksa). Spasi tulangan kelipatan 25 mm; tebal pelat tidak berskala.`,
  }
}

/** Gbr. — potongan melintang lajur 1 m di lapangan dan di tumpuan (batang utama = titik, tulangan bagi = garis). */
export function slabCrossFig(r: CMResult, n: number): Figure | null {
  const des = r.des
  const pos = govern(r, 'pos'), neg = govern(r, 'neg')
  if (!des?.valid || !pos || !des.dist) return null
  const ops: FigOp[] = []
  const h = r.h!, db = des.db, cc = des.cc
  const sc = Math.min(0.2, 70 / h)
  const W = 1000 * sc, H = h * sc
  const secs = [
    { title: `Potongan melintang di lapangan (bentang ${pos.idx + 1})`, main: pos, mainBottom: true },
    ...(neg ? [{ title: `Potongan melintang di tumpuan (tumpuan ${neg.idx + 1})`, main: neg, mainBottom: false }] : []),
  ]
  let bottom = 0
  secs.forEach((sec, ci) => {
    const x0 = ci * 264 + 36, y0 = 26
    ops.push({ t: 'text', x: ci * 264 + 10, y: 12, s: sec.title, size: 7.2, bold: true })
    ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, fill: true, c: 'muted', op: 0.1 })
    ops.push({ t: 'rect', x: x0, y: y0, w: W, h: H, lw: 1.3, c: 'ink' })
    const sMain = sec.main.s ?? 100
    const r0 = Math.max(1.4, (db * sc) / 2)
    const yMain = sec.mainBottom ? y0 + H - (cc + db / 2) * sc : y0 + (cc + db / 2) * sc
    const yDist = sec.mainBottom ? yMain - db * sc - 1 : yMain + db * sc + 1
    for (let x = sMain / 2; x < 1000; x += sMain) ops.push({ t: 'circle', cx: x0 + x * sc, cy: yMain, r: r0, fill: true, c: 'accent' })
    ops.push({ t: 'line', x1: x0 + cc * sc, y1: yDist, x2: x0 + W - cc * sc, y2: yDist, lw: Math.max(0.9, db * sc), c: 'v' })
    // tulangan praktis sisi berlawanan: titik sesuai spasi bagi
    const yOpp = sec.mainBottom ? y0 + (cc + db / 2) * sc : y0 + H - (cc + db / 2) * sc
    const sD = des.dist!.s
    for (let x = sD / 2; x < 1000; x += sD) ops.push({ t: 'circle', cx: x0 + x * sc, cy: yOpp, r: Math.max(1.1, r0 * 0.8), fill: true, c: 'v' })
    dimH(ops, x0, x0 + W, y0 + H + 16, '1000')
    dimV(ops, y0, y0 + H, x0 - 12, `${fx(h, 0)}`)
    ops.push({ t: 'text', x: ci * 264 + 10, y: y0 + H + 32, s: `utama ${sec.main.txt} (${sec.mainBottom ? 'bawah' : 'atas'})`, size: 6.6, c: 'accent' })
    ops.push({ t: 'text', x: ci * 264 + 10, y: y0 + H + 42, s: `bagi ${des.dist!.txt} · selimut ${fx(cc, 0)} mm`, size: 6.6, c: 'v' })
    bottom = Math.max(bottom, y0 + H + 50)
  })
  return {
    h: figRows(bottom),
    ops,
    alt: 'Potongan melintang pelat',
    caption: `Gbr. ${n} — Potongan melintang lajur 1 m (batang utama tegak lurus bidang gambar = titik; tulangan bagi D${db} arah melintang = garis & titik sisi lawan).`,
  }
}

/** Gambar penulangan sesuai jenis elemen (urut tampil). Penomoran mulai `first`. */
export function rebarFigures(r: CMResult, first: number): Figure[] {
  const figs =
    r.elem === 'pelat'
      ? [slabLongFig(r, first), slabCrossFig(r, first + 1)]
      : [beamElevationFig(r, first), beamSectionsFig(r, first + 1)]
  return figs.filter((f): f is Figure => !!f)
}
