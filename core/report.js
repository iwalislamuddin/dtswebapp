/* ============================================================
   Civil Tools — core/report.js
   Report monospace gaya DOS: unduh sebagai TEKS (.txt) atau PDF.
   PDF dibuat manual (tanpa library) memakai font bawaan PDF /Courier —
   ASCII-only agar offset xref akurat. Non-ASCII di-sanitasi jadi '?'.

   GAMBAR VEKTOR (opsional): entri `lines` boleh berupa objek figure
   { fig: { h, ops, alt? } } yang digambar native di content stream PDF
   (grayscale, tanpa library). Di .txt figure diganti baris alt.
     fig.h   : tinggi dalam satuan baris teks (1 baris = LEAD pt)
     fig.alt : teks pengganti untuk versi .txt (opsional)
     fig.ops : array primitif, koordinat lokal pt, origin KIRI-ATAS, y KE BAWAH,
               lebar tersedia = 528 pt (612 − 2×42):
       { t:'line',   x1,y1,x2,y2, lw?, g?, dash? }
       { t:'rect',   x,y,w,h, fill?, lw?, g?, dash? }      (x,y = pojok kiri-atas)
       { t:'poly',   pts:[[x,y],..], close?, fill?, lw?, g?, dash? }
       { t:'circle', cx,cy,r, fill?, lw?, g? }
       { t:'text',   x,y,s, size?, align?('l'|'c'|'r'), g? }   (y = baseline)
     g = grayscale 0(hitam)..1(putih), lw = tebal garis pt, dash = mis. [3,2].
   API:
     CivilReport.downloadText(filename, lines)   // lines = array string|{fig}
     CivilReport.downloadPDF(filename, lines)     // fallback ke .txt bila gagal
   ============================================================ */
(function () {
  'use strict';

  function saveBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function pad10(n) { n = String(n); while (n.length < 10) n = '0' + n; return n; }
  function ascii(s) { return String(s).replace(/[^\x20-\x7E]/g, '?'); }
  function escPdf(s) { return ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
  function isFig(x) { return x && typeof x === 'object' && x.fig; }

  function downloadTextRaw(filename, lines) {
    var out = [];
    lines.forEach(function (ln) {
      if (isFig(ln)) { if (ln.fig.alt) out.push(' [' + ascii(ln.fig.alt) + ']'); }
      else out.push(ln);
    });
    var text = out.join('\r\n');              // CRLF — autentik DOS
    saveBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
    return true;
  }

  /* --- Geometri halaman: dipakai bersama oleh PDF (vektor) & pratinjau (kanvas) --- */
  var PAGE_W = 612, PAGE_H = 792;
  var FS = 9, LEAD = 11.5, X = 42, YTOP = 744, YBOT = 46;   // top margin ~= side margin (42)
  var PER_PAGE = Math.max(1, Math.floor((YTOP - YBOT) / LEAD));

  /* --- paginasi berbasis slot: string = 1 slot, figure = fig.h slot --- */
  function paginate(lines) {
    var pages = [], cur = [], used = 0;
    for (var i = 0; i < lines.length; i++) {
      var it = lines[i];
      var slots = isFig(it) ? Math.min(PER_PAGE, Math.max(1, Math.ceil(it.fig.h || 6))) : 1;
      if (used + slots > PER_PAGE && cur.length) { pages.push(cur); cur = []; used = 0; }
      cur.push({ item: it, slots: slots });
      used += slots;
    }
    if (cur.length || !pages.length) pages.push(cur);
    return pages;
  }

  function buildPDF(lines) {
    var pages = paginate(lines);
    var numPages = pages.length;

    function fnum(n) { n = Math.round(n * 100) / 100; return (isFinite(n) ? n : 0).toString(); }

    function textOp(x, y, s, size) {
      return 'BT /F1 ' + (size || FS) + ' Tf 1 0 0 1 ' + fnum(x) + ' ' + fnum(y) +
        ' Tm (' + escPdf(s) + ') Tj ET\n';
    }

    /* --- render satu figure: koordinat lokal (y ke bawah) → PDF (y ke atas) --- */
    function figStream(fig, x0, yTop) {
      var K = 0.5523;                          // konstanta Bezier lingkaran
      var s = 'q\n';
      (fig.ops || []).forEach(function (o) {
        if (!o) return;
        var g = (o.g !== undefined) ? o.g : 0;
        var lw = (o.lw !== undefined) ? o.lw : 0.8;
        function PX(x) { return x0 + x; }
        function PY(y) { return yTop - y; }

        if (o.t === 'text') {
          var size = o.size || 8;
          var tw = 0.6 * size * ascii(o.s).length;       // Courier: lebar 0,6 em
          var tx = PX(o.x);
          if (o.align === 'c') tx -= tw / 2; else if (o.align === 'r') tx -= tw;
          s += fnum(g) + ' g\n' + textOp(tx, PY(o.y), o.s, size);
          return;
        }
        s += fnum(g) + ' G ' + fnum(g) + ' g ' + fnum(lw) + ' w ' +
          (o.dash && o.dash.length ? '[' + o.dash.join(' ') + '] 0 d\n' : '[] 0 d\n');

        if (o.t === 'line') {
          s += fnum(PX(o.x1)) + ' ' + fnum(PY(o.y1)) + ' m ' +
               fnum(PX(o.x2)) + ' ' + fnum(PY(o.y2)) + ' l S\n';
        } else if (o.t === 'rect') {
          s += fnum(PX(o.x)) + ' ' + fnum(PY(o.y) - o.h) + ' ' + fnum(o.w) + ' ' + fnum(o.h) +
            ' re ' + (o.fill ? 'f' : 'S') + '\n';
        } else if (o.t === 'poly' && o.pts && o.pts.length > 1) {
          s += fnum(PX(o.pts[0][0])) + ' ' + fnum(PY(o.pts[0][1])) + ' m ';
          for (var j = 1; j < o.pts.length; j++)
            s += fnum(PX(o.pts[j][0])) + ' ' + fnum(PY(o.pts[j][1])) + ' l ';
          if (o.close) s += 'h ';
          s += (o.fill ? 'f' : 'S') + '\n';
        } else if (o.t === 'circle') {
          var cx = PX(o.cx), cy = PY(o.cy), r = o.r, k = K * r;
          s += fnum(cx + r) + ' ' + fnum(cy) + ' m ' +
            fnum(cx + r) + ' ' + fnum(cy + k) + ' ' + fnum(cx + k) + ' ' + fnum(cy + r) + ' ' + fnum(cx) + ' ' + fnum(cy + r) + ' c ' +
            fnum(cx - k) + ' ' + fnum(cy + r) + ' ' + fnum(cx - r) + ' ' + fnum(cy + k) + ' ' + fnum(cx - r) + ' ' + fnum(cy) + ' c ' +
            fnum(cx - r) + ' ' + fnum(cy - k) + ' ' + fnum(cx - k) + ' ' + fnum(cy - r) + ' ' + fnum(cx) + ' ' + fnum(cy - r) + ' c ' +
            fnum(cx + k) + ' ' + fnum(cy - r) + ' ' + fnum(cx + r) + ' ' + fnum(cy - k) + ' ' + fnum(cx + r) + ' ' + fnum(cy) + ' c ' +
            (o.fill ? 'f' : 'S') + '\n';
        }
      });
      return s + '[] 0 d Q\n0 g 0 G\n';
    }

    function content(pageItems) {
      var s = '', y = YTOP;
      pageItems.forEach(function (e) {
        if (isFig(e.item)) {
          s += figStream(e.item.fig, X, y + FS);   // top figure ≈ puncak slot baris
          y -= e.slots * LEAD;
        } else {
          s += textOp(X, y, String(e.item));
          y -= LEAD;
        }
      });
      return s;
    }

    // Nomor objek: 1 katalog, 2 pages, 3 font, lalu (page,content) per halaman
    var pageNums = [], contentNums = [], n = 4;
    for (var p = 0; p < numPages; p++) { pageNums.push(n++); contentNums.push(n++); }
    var total = n - 1;

    var objects = [];
    objects.push({ num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
    objects.push({ num: 2, body: '<< /Type /Pages /Kids [' + pageNums.map(function (x) { return x + ' 0 R'; }).join(' ') + '] /Count ' + numPages + ' >>' });
    objects.push({ num: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>' });
    for (var q = 0; q < numPages; q++) {
      objects.push({ num: pageNums[q], body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contentNums[q] + ' 0 R >>' });
      var cs = content(pages[q]);
      objects.push({ num: contentNums[q], body: '<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream' });
    }
    objects.sort(function (a, b) { return a.num - b.num; });

    var header = '%PDF-1.4\n';
    var body = '';
    var offsets = [];
    var pos = header.length;
    for (var k = 0; k < objects.length; k++) {
      var o = objects[k];
      offsets[o.num] = pos;
      var chunk = o.num + ' 0 obj\n' + o.body + '\nendobj\n';
      body += chunk;
      pos += chunk.length;
    }
    var xrefStart = pos;
    var xref = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (var num = 1; num <= total; num++) xref += pad10(offsets[num]) + ' 00000 n \n';
    var trailer = 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

    return header + body + xref + trailer;
  }

  function downloadPDFRaw(filename, lines) {
    try {
      var pdf = buildPDF(lines);
      saveBlob(filename, new Blob([pdf], { type: 'application/pdf' }));
      return true;
    } catch (e) {
      console.error('PDF gagal, fallback ke teks:', e);
      downloadTextRaw(filename.replace(/\.pdf$/i, '.txt'), lines);
      return false;
    }
  }

  /* ============================================================
     GATING PREMIUM — satu-satunya titik pagar unduhan laporan.
     35 module memanggil downloadPDF/downloadText dari sini, jadi aturan
     unduh cukup ditentukan di file ini (tak ada module yang tahu soal
     premium). Non-premium: laporan tetap dihitung penuh, tapi disajikan
     sebagai PRATINJAU GAMBAR resolusi rendah (teks tak bisa disalin) dan
     tombol unduh di dalamnya membuka paket berlangganan.

     Nilai kembali (true = berkas benar-benar terunduh) dipakai module
     untuk memutuskan menampilkan toast "diunduh" atau tidak.
     ============================================================ */
  function isPremium() {
    var A = window.CivilAuth;
    return !!(A && A.isPremium && A.isPremium());
  }

  // Pagar hanya berlaku bila berlangganan memang BISA dibeli: akun aktif
  // (config Firebase terisi) DAN pembayaran terkonfigurasi (config Midtrans
  // terisi). Selama salah satunya masih placeholder, unduhan tetap gratis
  // untuk semua — supaya situs aman di-deploy di keadaan setengah jadi dan
  // tidak pernah mengunci fitur yang belum ada cara membukanya.
  function paywallActive() {
    var A = window.CivilAuth, B = window.CivilBilling;
    return !!(A && A.enabled && A.enabled() && B && B.enabled && B.enabled());
  }

  function gated(lines) {
    if (!paywallActive() || isPremium()) return false;
    openPreview(lines);
    return true;
  }

  function downloadPDF(filename, lines) {
    if (gated(lines)) return false;
    return downloadPDFRaw(filename, lines);
  }

  function downloadText(filename, lines) {
    if (gated(lines)) return false;
    return downloadTextRaw(filename, lines);
  }

  /* ============================================================
     HELPER FIGURE BERSAMA — dipakai module saat menyusun fig.ops
     (koordinat lokal figure: pt, origin kiri-atas, y ke bawah)
     ============================================================ */
  // langkah tick "cantik" 1/2/5×10^n untuk sumbu grafik
  function niceStep(range, n) {
    var raw = Math.abs(range) / Math.max(1, n);
    if (raw <= 0 || !isFinite(raw)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  // dimensi horizontal: garis + tick 45° + label di tengah
  function dimH(ops, xa, xb, y, label) {
    ops.push({ t: 'line', x1: xa, y1: y, x2: xb, y2: y, lw: 0.6 });
    [xa, xb].forEach(function (x) {
      ops.push({ t: 'line', x1: x, y1: y - 4, x2: x, y2: y + 4, lw: 0.6 });
      ops.push({ t: 'line', x1: x - 2.5, y1: y + 2.5, x2: x + 2.5, y2: y - 2.5, lw: 0.6 });
    });
    ops.push({ t: 'text', x: (xa + xb) / 2, y: y - 3, s: label, size: 7, align: 'c' });
  }
  // dimensi vertikal: garis + tick 45° + label di samping kanan
  function dimV(ops, ya, yb, x, label) {
    ops.push({ t: 'line', x1: x, y1: ya, x2: x, y2: yb, lw: 0.6 });
    [ya, yb].forEach(function (y) {
      ops.push({ t: 'line', x1: x - 4, y1: y, x2: x + 4, y2: y, lw: 0.6 });
      ops.push({ t: 'line', x1: x - 2.5, y1: y + 2.5, x2: x + 2.5, y2: y - 2.5, lw: 0.6 });
    });
    ops.push({ t: 'text', x: x + 6, y: (ya + yb) / 2 + 2.5, s: label, size: 7 });
  }
  // panah sederhana dari (x1,y1) ke (x2,y2) dengan kepala di ujung
  function arrow(ops, x1, y1, x2, y2, opt) {
    opt = opt || {};
    var lw = opt.lw !== undefined ? opt.lw : 0.9, g = opt.g || 0;
    ops.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, lw: lw, g: g });
    var ang = Math.atan2(y2 - y1, x2 - x1), L = 4.5;
    [ang + 2.65, ang - 2.65].forEach(function (a) {
      ops.push({ t: 'line', x1: x2, y1: y2, x2: x2 + L * Math.cos(a), y2: y2 + L * Math.sin(a), lw: lw, g: g });
    });
  }
  // marker silang (titik demand) + label opsional
  function cross(ops, x, y, lab, g) {
    ops.push({ t: 'line', x1: x - 3.5, y1: y - 3.5, x2: x + 3.5, y2: y + 3.5, lw: 1.2, g: g || 0 });
    ops.push({ t: 'line', x1: x - 3.5, y1: y + 3.5, x2: x + 3.5, y2: y - 3.5, lw: 1.2, g: g || 0 });
    if (lab) ops.push({ t: 'text', x: x + 6, y: y - 3, s: lab, size: 6, g: g || 0 });
  }

  /* ============================================================
     PRATINJAU LAPORAN (kanvas → gambar resolusi rendah)
     Dipakai untuk pengguna non-premium: laporan dirender ulang di kanvas
     memakai geometri halaman yang sama persis dengan PDF (612×792 pt,
     Courier 9pt, lead 11,5pt) lalu disajikan sebagai <img>. Karena berupa
     gambar, teksnya tidak bisa diseleksi/disalin, dan resolusinya (±100 DPI)
     sengaja jauh di bawah PDF vektor — cukup untuk memastikan hasil
     hitungan, tidak cukup untuk dokumentasi.
     ============================================================ */
  var PREVIEW_SCALE = 1.35;          // px per pt (≈ 97 DPI)
  var PREVIEW_MAX_PAGES = 12;

  function grayCss(g) {
    var v = Math.round(Math.max(0, Math.min(1, (g === undefined ? 0 : g))) * 255);
    return 'rgb(' + v + ',' + v + ',' + v + ')';
  }

  function figCanvas(ctx, fig, x0, yTop, sc) {
    function PX(x) { return (x0 + x) * sc; }
    function PY(y) { return (yTop + y) * sc; }
    (fig.ops || []).forEach(function (o) {
      if (!o) return;
      var col = grayCss(o.g);
      var lw = ((o.lw !== undefined) ? o.lw : 0.8) * sc;

      if (o.t === 'text') {
        var size = (o.size || 8) * sc;
        ctx.font = size + 'px "Courier New", Courier, monospace';
        ctx.fillStyle = col;
        var txt = ascii(o.s);
        var tx = PX(o.x);
        if (o.align === 'c') tx -= ctx.measureText(txt).width / 2;
        else if (o.align === 'r') tx -= ctx.measureText(txt).width;
        ctx.fillText(txt, tx, PY(o.y));
        return;
      }

      ctx.save();
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
      ctx.setLineDash((o.dash && o.dash.length) ? o.dash.map(function (d) { return d * sc; }) : []);
      ctx.beginPath();
      if (o.t === 'line') {
        ctx.moveTo(PX(o.x1), PY(o.y1)); ctx.lineTo(PX(o.x2), PY(o.y2)); ctx.stroke();
      } else if (o.t === 'rect') {
        ctx.rect(PX(o.x), PY(o.y), o.w * sc, o.h * sc);
        if (o.fill) ctx.fill(); else ctx.stroke();
      } else if (o.t === 'poly' && o.pts && o.pts.length > 1) {
        ctx.moveTo(PX(o.pts[0][0]), PY(o.pts[0][1]));
        for (var j = 1; j < o.pts.length; j++) ctx.lineTo(PX(o.pts[j][0]), PY(o.pts[j][1]));
        if (o.close) ctx.closePath();
        if (o.fill) ctx.fill(); else ctx.stroke();
      } else if (o.t === 'circle') {
        ctx.arc(PX(o.cx), PY(o.cy), o.r * sc, 0, Math.PI * 2);
        if (o.fill) ctx.fill(); else ctx.stroke();
      }
      ctx.restore();
    });
  }

  function pageCanvas(pageItems, sc) {
    var cv = document.createElement('canvas');
    cv.width = Math.round(PAGE_W * sc);
    cv.height = Math.round(PAGE_H * sc);
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.textBaseline = 'alphabetic';

    var y = YTOP;
    pageItems.forEach(function (e) {
      if (isFig(e.item)) {
        figCanvas(ctx, e.item.fig, X, PAGE_H - (y + FS), sc);
        y -= e.slots * LEAD;
      } else {
        ctx.font = (FS * sc) + 'px "Courier New", Courier, monospace';
        ctx.fillStyle = '#000';
        ctx.fillText(ascii(String(e.item)), X * sc, (PAGE_H - y) * sc);
        y -= LEAD;
      }
    });

    // Penanda pratinjau di margin bawah — jelas ini bukan laporan final.
    ctx.font = (7 * sc) + 'px "Courier New", Courier, monospace';
    ctx.fillStyle = '#999';
    ctx.fillText('PRATINJAU - EDFS Civil Tools - unduh PDF untuk versi penuh',
      X * sc, (PAGE_H - 28) * sc);
    return cv;
  }

  /* ---------- Modal pratinjau (#preview-ov, markup di index.html) ---------- */
  function openPreview(lines) {
    var ov = document.getElementById('preview-ov');
    if (!ov) {                                  // markup tak ada → jangan diam-diam gagal
      if (window.CivilAuth) window.CivilAuth.openPaywall({ intent: 'pdf' });
      return;
    }
    var host = document.getElementById('preview-pages');
    var info = document.getElementById('preview-info');
    var pages = paginate(lines);
    var shown = Math.min(pages.length, PREVIEW_MAX_PAGES);

    host.innerHTML = '';
    for (var i = 0; i < shown; i++) {
      var img = new Image();
      img.src = pageCanvas(pages[i], PREVIEW_SCALE).toDataURL('image/png');
      img.alt = 'Pratinjau laporan halaman ' + (i + 1);
      img.draggable = false;
      host.appendChild(img);
    }
    if (info) {
      info.textContent = pages.length + ' halaman' +
        (shown < pages.length ? ' (' + shown + ' halaman pertama ditampilkan)' : '') +
        ' · pratinjau resolusi rendah, teks tidak dapat disalin';
    }
    ov.classList.add('show');
  }

  function closePreview() {
    var ov = document.getElementById('preview-ov');
    if (ov) ov.classList.remove('show');
    var host = document.getElementById('preview-pages');
    if (host) host.innerHTML = '';             // lepas gambar besar dari memori
  }

  function wirePreview() {
    var ov = document.getElementById('preview-ov');
    if (!ov) return;
    var closeBtn = document.getElementById('preview-close');
    var cta = document.getElementById('preview-cta');
    if (closeBtn) closeBtn.addEventListener('click', closePreview);
    ov.addEventListener('click', function (e) { if (e.target === ov) closePreview(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('show')) closePreview();
    });
    if (cta) cta.addEventListener('click', function () {
      closePreview();
      if (window.CivilBilling) window.CivilBilling.openPlans('pdf');
      else if (window.CivilAuth) window.CivilAuth.openPaywall({ intent: 'pdf' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wirePreview);
  else wirePreview();

  window.CivilReport = {
    downloadText: downloadText, downloadPDF: downloadPDF,
    // Dipakai fitur premium/pratinjau; module tak perlu menyentuh ini.
    preview: openPreview, closePreview: closePreview,
    fig: { niceStep: niceStep, dimH: dimH, dimV: dimV, arrow: arrow, cross: cross }
  };
})();
