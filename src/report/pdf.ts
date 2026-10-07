import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { parseMath, plainMath, type MathNode } from './math'
import { fx, okNg, type Block, type CalcStep, type FigColor, type FigOp, type Figure, type Report, type ReportMeta, type Row } from './model'

// Laporan → PDF A4 (pdf-lib, font Unicode DejaVu Sans tertanam & di-subset). Layout mengikuti tab Detail:
// kepala laporan, ringkasan, bagian bernomor, langkah rumus, tabel, gambar berwarna, footer bernomor halaman.

export interface PdfFonts {
  regular: Uint8Array | ArrayBuffer
  bold: Uint8Array | ArrayBuffer
}

const PAGE_W = 595.28, PAGE_H = 841.89
const ML = 48, MR = 48, MT = 54, MB = 58
const W = PAGE_W - ML - MR
const BODY = 9.5

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const C = {
  ink: hex('#1f1f1f'), muted: hex('#5f6359'), line: hex('#d9dbd2'), tint: hex('#f4f6f0'), accent: hex('#566246'),
  accentSoft: hex('#e6ebdf'), orange: hex('#f28f3b'), ok: hex('#0e7a0d'), okSoft: hex('#dff0dc'), bad: hex('#c42b1c'),
  badSoft: hex('#f8dedb'), white: rgb(1, 1, 1),
}
/** Palet cetak warna semantik gambar (padanan token --dg-* tema terang). */
const FIG: Record<FigColor, RGB> = {
  ink: C.ink, muted: C.muted, grid: hex('#d9dbd2'), accent: C.accent, load: hex('#c4661a'), support: hex('#4b5242'),
  v: hex('#566246'), m: hex('#1d6fa0'), y: hex('#b04a32'), ok: C.ok, bad: C.bad,
}

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  y: number // jarak dari tepi atas (pt)
  f: PDFFont
  fb: PDFFont
  title: string
}

const Y = (y: number) => PAGE_H - y

/* ---------------- rumus & teks kaya ---------------- */

interface Box {
  w: number
  asc: number
  desc: number
}

function measure(ns: MathNode[], size: number, font: PDFFont): Box {
  let w = 0, asc = size * 0.76, desc = size * 0.24
  for (const n of ns) {
    if (n.t === 'text') w += font.widthOfTextAtSize(n.s, size)
    else if (n.t === 'sub' || n.t === 'sup') {
      const b = measure(n.c, size * 0.72, font)
      w += b.w
      if (n.t === 'sup') asc = Math.max(asc, b.asc + size * 0.36)
      else desc = Math.max(desc, b.desc + size * 0.2)
    } else {
      const a = measure(n.num, size * 0.88, font), d = measure(n.den, size * 0.88, font)
      const axis = size * 0.28
      w += Math.max(a.w, d.w) + 4
      asc = Math.max(asc, axis + 2 + a.desc + a.asc)
      desc = Math.max(desc, -(axis - 2 - d.asc - d.desc))
    }
  }
  return { w, asc, desc }
}

/** Gambar node rumus mulai x pada garis dasar `base` (koordinat PDF, y ke atas). */
function drawMath(page: PDFPage, ns: MathNode[], x: number, base: number, size: number, font: PDFFont, color: RGB): number {
  for (const n of ns) {
    if (n.t === 'text') {
      page.drawText(n.s, { x, y: base, size, font, color })
      x += font.widthOfTextAtSize(n.s, size)
    } else if (n.t === 'sub' || n.t === 'sup') {
      x = drawMath(page, n.c, x, base + (n.t === 'sup' ? size * 0.36 : -size * 0.2), size * 0.72, font, color)
    } else {
      const s2 = size * 0.88
      const a = measure(n.num, s2, font), d = measure(n.den, s2, font)
      const w = Math.max(a.w, d.w) + 4
      const axis = base + size * 0.28
      page.drawLine({ start: { x, y: axis }, end: { x: x + w, y: axis }, thickness: 0.6, color })
      drawMath(page, n.num, x + (w - a.w) / 2, axis + 2 + a.desc, s2, font, color)
      drawMath(page, n.den, x + (w - d.w) / 2, axis - 2 - d.asc, s2, font, color)
      x += w
    }
  }
  return x
}

/** Pisah kata di spasi tingkat teratas (spasi di dalam {…} tidak memecah). */
function words(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (ch === ' ' && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

interface RichLine {
  nodes: MathNode[]
  box: Box
}

/** Bungkus teks bermarkup ke lebar maxW. */
function wrapRich(text: string, size: number, font: PDFFont, maxW: number): RichLine[] {
  const space = font.widthOfTextAtSize(' ', size)
  const lines: RichLine[] = []
  let cur: MathNode[] = [], box: Box = { w: 0, asc: size * 0.76, desc: size * 0.24 }
  for (const w of words(text)) {
    const ns = parseMath(w)
    const b = measure(ns, size, font)
    const add = cur.length ? space + b.w : b.w
    if (cur.length && box.w + add > maxW) {
      lines.push({ nodes: cur, box })
      cur = []
      box = { w: 0, asc: size * 0.76, desc: size * 0.24 }
    }
    if (cur.length) cur.push({ t: 'text', s: ' ' })
    cur.push(...ns)
    box = { w: box.w + (cur.length > ns.length ? space : 0) + b.w, asc: Math.max(box.asc, b.asc), desc: Math.max(box.desc, b.desc) }
  }
  if (cur.length || !lines.length) lines.push({ nodes: cur, box })
  return lines
}

const lineH = (b: Box, size: number) => Math.max(size * 1.38, b.asc + b.desc + size * 0.38)

/* ---------------- halaman ---------------- */

function newPage(c: Ctx) {
  c.page = c.doc.addPage([PAGE_W, PAGE_H])
  c.y = MT
  // kepala halaman lanjutan
  c.page.drawText(c.title, { x: ML, y: Y(32), size: 8, font: c.f, color: C.muted })
  c.page.drawLine({ start: { x: ML, y: Y(38) }, end: { x: PAGE_W - MR, y: Y(38) }, thickness: 0.5, color: C.line })
}

function ensure(c: Ctx, h: number) {
  if (c.y + h > PAGE_H - MB) newPage(c)
}

function paragraph(c: Ctx, text: string, opt: { size?: number; font?: PDFFont; color?: RGB; indent?: number; gap?: number } = {}) {
  const size = opt.size ?? BODY, font = opt.font ?? c.f, indent = opt.indent ?? 0
  for (const ln of wrapRich(text, size, font, W - indent)) {
    const h = lineH(ln.box, size)
    ensure(c, h)
    drawMath(c.page, ln.nodes, ML + indent, Y(c.y + ln.box.asc + (h - ln.box.asc - ln.box.desc) / 2), size, font, opt.color ?? C.ink)
    c.y += h
  }
  c.y += opt.gap ?? 4
}

function sectionHead(c: Ctx, n: number, title: string, strong?: boolean) {
  ensure(c, 60)
  c.y += 8
  const h = 22
  c.page.drawRectangle({ x: ML, y: Y(c.y + h), width: W, height: h, color: strong ? C.accent : C.accentSoft })
  c.page.drawRectangle({ x: ML, y: Y(c.y + h), width: 3.5, height: h, color: C.orange })
  c.page.drawText(`${n}.  ${title}`, { x: ML + 11, y: Y(c.y + 15), size: 11.5, font: c.fb, color: strong ? C.white : C.accent })
  c.y += h + 8
}

function pill(c: Ctx, xRight: number, yBase: number, ratio: number) {
  const ok = okNg(ratio) === 'OK'
  const t = ok ? 'OK' : 'NG', w = c.fb.widthOfTextAtSize(t, 7.5) + 8
  c.page.drawRectangle({ x: xRight - w, y: yBase - 2.5, width: w, height: 11, color: ok ? C.okSoft : C.badSoft })
  c.page.drawText(t, { x: xRight - w + 4, y: yBase, size: 7.5, font: c.fb, color: ok ? C.ok : C.bad })
  return w
}

function rows(c: Ctx, rs: Row[], tint = false) {
  const labelW = W * 0.6 - 8, valueW = W * 0.4 - 8
  for (const r of rs) {
    const check = r.k === 'check'
    const font = check ? c.fb : c.f
    const lab = wrapRich(r.label, BODY, font, labelW)
    const valText = r.k === 'kv' ? r.value : fx(r.ratio, 2) + (r.note ? `  (${r.note})` : '')
    const val = wrapRich(valText, BODY, check ? c.fb : c.f, valueW - (check ? 26 : 0))
    const h = Math.max(lab.length, val.length) * BODY * 1.4 + 6
    ensure(c, h)
    if (tint) c.page.drawRectangle({ x: ML, y: Y(c.y + h), width: W, height: h, color: C.tint })
    lab.forEach((l, i) => drawMath(c.page, l.nodes, ML + 6, Y(c.y + 3 + BODY + i * BODY * 1.4), BODY, font, C.ink))
    const xr = PAGE_W - MR - 6
    let off = 0
    if (r.k === 'check') off = pill(c, xr, Y(c.y + 3 + BODY), r.ratio) + 5
    val.forEach((l, i) => drawMath(c.page, l.nodes, xr - off - l.box.w, Y(c.y + 3 + BODY + i * BODY * 1.4), BODY, check ? c.fb : c.f, C.ink))
    c.page.drawLine({ start: { x: ML, y: Y(c.y + h) }, end: { x: PAGE_W - MR, y: Y(c.y + h) }, thickness: 0.4, color: C.line })
    c.y += h
  }
  c.y += 6
}

/** Langkah hitung: [desc] lhs = expr = subst = value; dipecah per "=" bila terlalu lebar. */
function calc(c: Ctx, steps: CalcStep[]) {
  for (const s of steps) {
    const size = 10
    const parts = [s.expr, s.subst].filter((x): x is string => !!x)
    const val: MathNode[] = parseMath(`${s.value}${s.unit ? ' ' + s.unit : ''}`)
    const lhs = parseMath(s.lhs)
    const eq: MathNode[] = [{ t: 'text', s: ' = ' }]
    const ref = s.ref ? s.ref : ''
    const refW = ref ? c.f.widthOfTextAtSize(ref, 7.5) + 8 : 0
    const avail = W - 16 - refW
    const full = [...lhs, ...parts.flatMap((p) => [...eq, ...parseMath(p)]), ...eq]
    const fullW = measure(full, size, c.f).w + measure(val, size, c.fb).w
    // baris: [nodes, nodes bold]
    const lines: { lead: MathNode[]; body: MathNode[]; bold?: MathNode[] }[] = []
    if (fullW <= avail) lines.push({ lead: [], body: full, bold: val })
    else {
      lines.push({ lead: [], body: [...lhs, ...eq, ...(parts[0] ? parseMath(parts[0]) : [])], bold: parts.length ? undefined : val })
      parts.slice(1).forEach((p) => lines.push({ lead: eq, body: parseMath(p) }))
      if (parts.length) lines.push({ lead: eq, body: [], bold: val })
    }
    const indentW = measure(lhs, size, c.f).w
    const boxes = lines.map((l) => {
      const b1 = measure([...l.lead, ...l.body], size, c.f), b2 = l.bold ? measure(l.bold, size, c.fb) : { w: 0, asc: 0, desc: 0 }
      return { asc: Math.max(b1.asc, b2.asc), desc: Math.max(b1.desc, b2.desc) }
    })
    const descH = s.desc ? wrapRich(s.desc, 8.5, c.f, W - 16).length * 8.5 * 1.35 + 2 : 0
    const h = descH + boxes.reduce((t, b) => t + lineH({ w: 0, ...b }, size), 0) + 8
    ensure(c, h)
    c.page.drawRectangle({ x: ML, y: Y(c.y + h), width: W, height: h, color: C.tint })
    c.page.drawRectangle({ x: ML, y: Y(c.y + h), width: 2, height: h, color: C.accent })
    let y = c.y + 4
    if (s.desc) {
      for (const ln of wrapRich(s.desc, 8.5, c.f, W - 16)) {
        drawMath(c.page, ln.nodes, ML + 10, Y(y + 8.5), 8.5, c.f, C.muted)
        y += 8.5 * 1.35
      }
      y += 2
    }
    lines.forEach((l, i) => {
      const b = boxes[i], lh = lineH({ w: 0, ...b }, size)
      const base = Y(y + b.asc + (lh - b.asc - b.desc) / 2)
      let x = ML + 10 + (l.lead.length ? indentW : 0)
      x = drawMath(c.page, [...l.lead, ...l.body], x, base, size, c.f, C.ink)
      if (l.bold) drawMath(c.page, l.bold, x, base, size, c.fb, C.accent)
      if (i === 0 && ref) c.page.drawText(ref, { x: PAGE_W - MR - refW + 2, y: base, size: 7.5, font: c.f, color: C.muted })
      y += lh
    })
    c.y += h + 4
  }
  c.y += 4
}

function table(c: Ctx, b: Extract<Block, { k: 'table' }>) {
  const size = 8.5, pad = 5
  const n = b.head.length
  const natural = b.head.map((h, j) =>
    Math.max(measure(parseMath(h), size, c.fb).w, ...b.rows.map((r) => measure(parseMath(r[j] ?? ''), size, c.f).w)) + 2 * pad,
  )
  const sum = natural.reduce((a, x) => a + x, 0)
  const widths = natural.map((x) => (sum > W ? (x / sum) * W : x + (W - sum) / n))
  const align = b.align ?? b.head.map((_, j) => (j === 0 ? 'l' : 'r'))
  const rowH = size * 1.5 + 6
  const cell = (s: string, j: number, x: number, y: number, font: PDFFont, color: RGB) => {
    const ns = parseMath(s), m = measure(ns, size, font)
    const xx = align[j] === 'r' ? x + widths[j] - pad - m.w : align[j] === 'c' ? x + (widths[j] - m.w) / 2 : x + pad
    drawMath(c.page, ns, xx, Y(y + rowH / 2 + size * 0.35), size, font, color)
  }
  const header = () => {
    c.page.drawRectangle({ x: ML, y: Y(c.y + rowH), width: W, height: rowH, color: C.accent })
    let x = ML
    b.head.forEach((h, j) => {
      cell(h, j, x, c.y, c.fb, C.white)
      x += widths[j]
    })
    c.y += rowH
  }
  ensure(c, rowH * 2)
  header()
  b.rows.forEach((r, i) => {
    if (c.y + rowH > PAGE_H - MB) {
      newPage(c)
      header()
    }
    if (i % 2) c.page.drawRectangle({ x: ML, y: Y(c.y + rowH), width: W, height: rowH, color: C.tint })
    let x = ML
    r.forEach((s, j) => {
      cell(s, j, x, c.y, c.f, C.ink)
      x += widths[j]
    })
    c.y += rowH
  })
  c.page.drawLine({ start: { x: ML, y: Y(c.y) }, end: { x: PAGE_W - MR, y: Y(c.y) }, thickness: 0.6, color: C.accent })
  c.y += 4
  if (b.caption) paragraph(c, b.caption, { size: 8, color: C.muted })
  c.y += 4
}

function paint(o: FigOp): RGB {
  if (o.c) return FIG[o.c]
  const g = Math.max(0, Math.min(1, o.g ?? 0))
  return rgb(0.12 + 0.88 * g, 0.12 + 0.88 * g, 0.12 + 0.88 * g)
}

function figure(c: Ctx, fig: Figure) {
  const sc = Math.min(1, W / 528)
  const h = fig.h * 11.5 * sc
  ensure(c, h + (fig.caption ? 18 : 6))
  const x0 = ML + (W - 528 * sc) / 2, y0 = c.y
  const PX = (x: number) => x0 + x * sc
  const PY = (y: number) => Y(y0 + y * sc)
  for (const o of fig.ops) {
    const col = paint(o)
    const lw = ('lw' in o ? (o.lw ?? 0.8) : 0.8) * sc
    const dash = 'dash' in o && o.dash?.length ? o.dash.map((d) => d * sc) : undefined
    const fillOp = o.op ?? 1
    if (o.t === 'line') c.page.drawLine({ start: { x: PX(o.x1), y: PY(o.y1) }, end: { x: PX(o.x2), y: PY(o.y2) }, thickness: lw, color: col, dashArray: dash })
    else if (o.t === 'rect')
      c.page.drawRectangle({
        x: PX(o.x), y: PY(o.y + o.h), width: Math.max(0, o.w) * sc, height: o.h * sc,
        ...(o.fill ? { color: col, opacity: fillOp } : { borderColor: col, borderWidth: lw, borderDashArray: dash }),
      })
    else if (o.t === 'circle')
      c.page.drawCircle({ x: PX(o.cx), y: PY(o.cy), size: o.r * sc, ...(o.fill ? { color: col, opacity: fillOp } : { borderColor: col, borderWidth: lw }) })
    else if (o.t === 'poly' && o.pts.length > 1) {
      // drawSvgPath: koordinat SVG (y ke bawah) relatif titik asal (x0, puncak gambar)
      const d = o.pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * sc).toFixed(2)},${(p[1] * sc).toFixed(2)}`).join(' ') + (o.close || o.fill ? ' Z' : '')
      c.page.drawSvgPath(d, {
        x: x0, y: Y(y0),
        ...(o.fill ? { color: col, opacity: fillOp, borderColor: col, borderWidth: 0 } : { borderColor: col, borderWidth: lw, borderDashArray: dash }),
      })
    } else if (o.t === 'text') {
      const size = (o.size ?? 8) * sc * 1.05
      const font = o.bold ? c.fb : c.f
      const ns = parseMath(o.s), m = measure(ns, size, font)
      const x = PX(o.x) - (o.align === 'c' ? m.w / 2 : o.align === 'r' ? m.w : 0)
      drawMath(c.page, ns, x, PY(o.y), size, font, col)
    }
  }
  c.y += h + 4
  if (fig.caption) paragraph(c, fig.caption, { size: 8.5, color: C.muted, indent: 0 })
  c.y += 4
}

function block(c: Ctx, b: Block) {
  if (b.k === 'h') {
    ensure(c, 40)
    c.y += 4
    paragraph(c, b.text, { size: 10.5, font: c.fb, color: C.accent, gap: 3 })
  } else if (b.k === 'p') paragraph(c, b.text)
  else if (b.k === 'text') b.lines.forEach((t) => paragraph(c, t))
  else if (b.k === 'rows') rows(c, b.rows)
  else if (b.k === 'calc') calc(c, b.steps)
  else if (b.k === 'table') table(c, b)
  else if (b.k === 'figure') figure(c, b.fig)
  else b.items.forEach((it) => paragraph(c, '•  ' + it, { indent: 6, gap: 2 }))
}

/** PDF lengkap (byte). */
export async function buildPdf(report: Report, meta: ReportMeta, fonts: PdfFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const f = await doc.embedFont(fonts.regular, { subset: true })
  const fb = await doc.embedFont(fonts.bold, { subset: true })
  doc.setTitle(plainMath(report.title))
  doc.setProducer('EDFS Civil Tools')
  doc.setCreator(`EDFS Civil Tools v${meta.appVersion}`)
  const c: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: 0, f, fb, title: plainMath(report.title) }

  // kepala laporan (halaman pertama)
  c.page.drawRectangle({ x: 0, y: Y(10), width: PAGE_W, height: 10, color: C.accent })
  c.page.drawRectangle({ x: 0, y: Y(10), width: 120, height: 10, color: C.orange })
  c.page.drawText('EDFS CIVIL TOOLS  ·  LAPORAN PERHITUNGAN', { x: ML, y: Y(34), size: 8, font: fb, color: C.accent })
  c.page.drawText(meta.date, { x: PAGE_W - MR - f.widthOfTextAtSize(meta.date, 8), y: Y(34), size: 8, font: f, color: C.muted })
  c.y = 42
  paragraph(c, report.title, { size: 16, font: fb, gap: 0 })
  paragraph(c, report.method, { size: 9.5, color: C.muted, gap: 6 })
  c.page.drawLine({ start: { x: ML, y: Y(c.y) }, end: { x: PAGE_W - MR, y: Y(c.y) }, thickness: 1.2, color: C.accent })
  c.y += 10

  if (report.summary?.length) {
    paragraph(c, 'Ringkasan hasil', { size: 10.5, font: fb, color: C.accent, gap: 3 })
    rows(c, report.summary, true)
  }
  report.sections.forEach((s, i) => {
    sectionHead(c, i + 1, s.title, s.strong)
    for (const b of s.blocks) block(c, b)
  })
  if (report.governing) {
    ensure(c, 34)
    c.y += 4
    c.page.drawRectangle({ x: ML, y: Y(c.y + 26), width: W, height: 26, color: C.accentSoft, borderColor: C.accent, borderWidth: 1 })
    c.page.drawText(plainMath(report.governing.label), { x: ML + 10, y: Y(c.y + 17), size: 10.5, font: fb, color: C.ink })
    const off = pill(c, PAGE_W - MR - 10, Y(c.y + 17), report.governing.ratio)
    const v = fx(report.governing.ratio, 2)
    c.page.drawText(v, { x: PAGE_W - MR - 16 - off - fb.widthOfTextAtSize(v, 11), y: Y(c.y + 17), size: 11, font: fb, color: C.ink })
    c.y += 36
  }
  if (report.warnings.length) {
    sectionHead(c, report.sections.length + 1, 'Catatan')
    report.warnings.forEach((w) => paragraph(c, '•  ' + w, { indent: 6, gap: 2 }))
  }
  c.y += 8
  report.scope.forEach((s) => paragraph(c, s, { size: 8, color: C.muted, gap: 2 }))

  // footer semua halaman
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: ML, y: 40 }, end: { x: PAGE_W - MR, y: 40 }, thickness: 0.5, color: C.line })
    p.drawText(`EDFS Civil Tools v${meta.appVersion}  ·  tools.edifisia.com  ·  ${meta.date}`, { x: ML, y: 28, size: 7.5, font: f, color: C.muted })
    const pg = `Halaman ${i + 1} / ${pages.length}`
    p.drawText(pg, { x: PAGE_W - MR - f.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font: f, color: C.muted })
    p.drawText('Alat bantu perhitungan — verifikasi oleh insinyur penanggung jawab.', { x: ML, y: 18, size: 6.5, font: f, color: C.muted })
  })
  return doc.save()
}
