/* ============================================================
   Civil Tools — core/report.js
   Report monospace gaya DOS: unduh sebagai TEKS (.txt) atau PDF.
   PDF dibuat manual (tanpa library) memakai font bawaan PDF /Courier —
   ASCII-only agar offset xref akurat. Non-ASCII di-sanitasi jadi '?'.
   API:
     CivilReport.downloadText(filename, lines)   // lines = array string
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

  function downloadText(filename, lines) {
    var text = lines.join('\r\n');            // CRLF — autentik DOS
    saveBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
  }

  function buildPDF(lines) {
    var FS = 9, LEAD = 11.5, X = 42, YTOP = 744, YBOT = 46;   // top margin ~= side margin (42)
    var perPage = Math.max(1, Math.floor((YTOP - YBOT) / LEAD));

    var pages = [];
    for (var i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
    if (!pages.length) pages.push(['']);
    var numPages = pages.length;

    function content(pageLines) {
      var s = 'BT\n/F1 ' + FS + ' Tf\n' + LEAD + ' TL\n' + X + ' ' + YTOP + ' Td\n';
      for (var j = 0; j < pageLines.length; j++) {
        if (j > 0) s += 'T* ';
        s += '(' + escPdf(pageLines[j]) + ') Tj\n';
      }
      return s + 'ET';
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

  function downloadPDF(filename, lines) {
    try {
      var pdf = buildPDF(lines);
      saveBlob(filename, new Blob([pdf], { type: 'application/pdf' }));
      return true;
    } catch (e) {
      console.error('PDF gagal, fallback ke teks:', e);
      downloadText(filename.replace(/\.pdf$/i, '.txt'), lines);
      return false;
    }
  }

  window.CivilReport = { downloadText: downloadText, downloadPDF: downloadPDF };
})();
