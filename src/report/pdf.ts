import type { FigOp, Figure } from './model'
import { toAscii, type Line } from './text'

// PDF 1.4 buatan tangan, tanpa library (port core/report.js): halaman Letter 612×792 pt, font bawaan /Courier 9 pt,
// gambar vektor abu-abu native di content stream. Seluruh isi ASCII sehingga panjang string = jumlah byte dan
// offset xref tepat.

export const PAGE_W = 612, PAGE_H = 792
const FS = 9, LEAD = 11.5, X = 42, YTOP = 744, YBOT = 46
export const PER_PAGE = Math.max(1, Math.floor((YTOP - YBOT) / LEAD))

const isFig = (l: Line): l is { fig: Figure } => typeof l === 'object'

/** Bagi baris ke halaman: teks = 1 slot, gambar = fig.h slot (maks satu halaman). */
export function paginate(lines: Line[]): { item: Line; slots: number }[][] {
  const pages: { item: Line; slots: number }[][] = []
  let cur: { item: Line; slots: number }[] = [], used = 0
  for (const it of lines) {
    const slots = isFig(it) ? Math.min(PER_PAGE, Math.max(1, Math.ceil(it.fig.h || 6))) : 1
    if (used + slots > PER_PAGE && cur.length) {
      pages.push(cur)
      cur = []
      used = 0
    }
    cur.push({ item: it, slots })
    used += slots
  }
  if (cur.length || !pages.length) pages.push(cur)
  return pages
}

function fnum(n: number): string {
  const r = Math.round(n * 100) / 100
  return (Number.isFinite(r) ? r : 0).toString()
}

const escPdf = (s: string) => toAscii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const textOp = (x: number, y: number, s: string, size = FS) =>
  `BT /F1 ${size} Tf 1 0 0 1 ${fnum(x)} ${fnum(y)} Tm (${escPdf(s)}) Tj ET\n`

/** Satu gambar: koordinat lokal (y ke bawah) → PDF (y ke atas), puncak di yTop. */
function figStream(fig: Figure, x0: number, yTop: number): string {
  const K = 0.5523 // konstanta Bezier lingkaran
  const PX = (x: number) => x0 + x
  const PY = (y: number) => yTop - y
  let s = 'q\n'
  for (const o of fig.ops as (FigOp | null | undefined)[]) {
    if (!o) continue
    const g = o.g ?? 0
    if (o.t === 'text') {
      const size = o.size || 8
      const tw = 0.6 * size * toAscii(o.s).length // Courier: lebar 0,6 em
      let tx = PX(o.x)
      if (o.align === 'c') tx -= tw / 2
      else if (o.align === 'r') tx -= tw
      s += `${fnum(g)} g\n` + textOp(tx, PY(o.y), o.s, size)
      continue
    }
    const lw = o.lw ?? 0.8
    const dash = 'dash' in o && o.dash && o.dash.length ? `[${o.dash.join(' ')}] 0 d\n` : '[] 0 d\n'
    s += `${fnum(g)} G ${fnum(g)} g ${fnum(lw)} w ` + dash
    if (o.t === 'line') {
      s += `${fnum(PX(o.x1))} ${fnum(PY(o.y1))} m ${fnum(PX(o.x2))} ${fnum(PY(o.y2))} l S\n`
    } else if (o.t === 'rect') {
      s += `${fnum(PX(o.x))} ${fnum(PY(o.y) - o.h)} ${fnum(o.w)} ${fnum(o.h)} re ${o.fill ? 'f' : 'S'}\n`
    } else if (o.t === 'poly' && o.pts.length > 1) {
      s += `${fnum(PX(o.pts[0][0]))} ${fnum(PY(o.pts[0][1]))} m `
      for (let j = 1; j < o.pts.length; j++) s += `${fnum(PX(o.pts[j][0]))} ${fnum(PY(o.pts[j][1]))} l `
      if (o.close) s += 'h '
      s += (o.fill ? 'f' : 'S') + '\n'
    } else if (o.t === 'circle') {
      const cx = PX(o.cx), cy = PY(o.cy), r = o.r, k = K * r
      const c = (...p: number[]) => p.map(fnum).join(' ') + ' c '
      s +=
        `${fnum(cx + r)} ${fnum(cy)} m ` +
        c(cx + r, cy + k, cx + k, cy + r, cx, cy + r) +
        c(cx - k, cy + r, cx - r, cy + k, cx - r, cy) +
        c(cx - r, cy - k, cx - k, cy - r, cx, cy - r) +
        c(cx + k, cy - r, cx + r, cy - k, cx + r, cy) +
        (o.fill ? 'f' : 'S') +
        '\n'
    }
  }
  return s + '[] 0 d Q\n0 g 0 G\n'
}

function pageContent(items: { item: Line; slots: number }[]): string {
  let s = '', y = YTOP
  for (const e of items) {
    if (isFig(e.item)) {
      s += figStream(e.item.fig, X, y + FS) // puncak gambar ≈ puncak slot baris
      y -= e.slots * LEAD
    } else {
      s += textOp(X, y, e.item)
      y -= LEAD
    }
  }
  return s
}

/** Dokumen PDF lengkap sebagai string ASCII (tulis sebagai byte apa adanya). */
export function buildPdf(lines: Line[], title = 'EDFS Civil Tools'): string {
  const pages = paginate(lines)
  // Nomor objek: 1 katalog, 2 pages, 3 font, 4 info, lalu (page, content) per halaman.
  const pageNums: number[] = [], contentNums: number[] = []
  let n = 5
  for (let p = 0; p < pages.length; p++) {
    pageNums.push(n++)
    contentNums.push(n++)
  }
  const total = n - 1
  const objects: { num: number; body: string }[] = [
    { num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { num: 2, body: `<< /Type /Pages /Kids [${pageNums.map((x) => `${x} 0 R`).join(' ')}] /Count ${pages.length} >>` },
    { num: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>' },
    { num: 4, body: `<< /Title (${escPdf(title)}) /Producer (EDFS Civil Tools) >>` },
  ]
  pages.forEach((pg, q) => {
    objects.push({
      num: pageNums[q],
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNums[q]} 0 R >>`,
    })
    const cs = pageContent(pg)
    objects.push({ num: contentNums[q], body: `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream` })
  })
  objects.sort((a, b) => a.num - b.num)

  const header = '%PDF-1.4\n'
  const offsets: number[] = []
  let body = '', pos = header.length
  for (const o of objects) {
    offsets[o.num] = pos
    const chunk = `${o.num} 0 obj\n${o.body}\nendobj\n`
    body += chunk
    pos += chunk.length
  }
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`
  for (let k = 1; k <= total; k++) xref += String(offsets[k]).padStart(10, '0') + ' 00000 n \n'
  const trailer = `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${pos}\n%%EOF`
  return header + body + xref + trailer
}
