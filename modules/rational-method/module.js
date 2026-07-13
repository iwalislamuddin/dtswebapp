/* ============================================================
   Civil Tools — modules/rational-method/module.js  (Tier 2, kanvas 2D)
   Debit Banjir Rencana — Metode Rasional (drainase kawasan kecil).

   Rumus:
   - Q = 0,00278 · C · i · A     (Q m³/s ; i mm/jam ; A ha)
   - Waktu konsentrasi Kirpich (1940):
       tc = 0,0195 · L^0,77 · S^(−0,385)   (menit; L m; S m/m)
     atau tc input manual.
   - Intensitas Mononobe (dari hujan harian R24):
       i = (R24/24) · (24/tc)^(2/3)        (mm/jam; tc jam)
   - Koefisien limpasan C komposit: pilih tutupan lahan atau isi manual.

   Batas metode rasional: luas DAS kecil (lazim ≤ ±80–300 ha; makin kecil
   makin baik), hujan merata, durasi ≥ tc. TIDAK termasuk: hidrograf
   (HSS Nakayasu/SCS), routing, infiltrasi detail, periode ulang IDF lokal
   (Mononobe adalah pendekatan bila data IDF tak tersedia).
   Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'rational-method';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  var CVAL = {
    roof:    { label: 'Atap/perkerasan (0,85)', C: 0.85 },
    urban:   { label: 'Permukiman padat (0,70)', C: 0.70 },
    suburb:  { label: 'Permukiman renggang (0,50)', C: 0.50 },
    garden:  { label: 'Taman/halaman (0,25)', C: 0.25 },
    farm:    { label: 'Sawah/ladang (0,45)', C: 0.45 },
    forest:  { label: 'Hutan/vegetasi rapat (0,15)', C: 0.15 }
  };

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var A = num(v.A);                          // ha
    var C = v.land === 'custom' ? num(v.C) : (CVAL[v.land] ? CVAL[v.land].C : 0.5);
    var R24 = num(v.R24);                      // mm
    var tcMode = v.tcMode || 'kirpich';
    var Lf = num(v.Lf), dH = num(v.dH);        // m
    var tcMan = num(v.tcMan);                  // menit

    r.A = A; r.C = C; r.R24 = R24; r.tcMode = tcMode; r.Lf = Lf; r.dH = dH;
    r.landLabel = v.land === 'custom' ? 'Kustom' : (CVAL[v.land] ? CVAL[v.land].label : '-');

    if (A <= 0 || C <= 0 || R24 <= 0) { r.warn.push('Isi A, C, dan R24 (> 0).'); return r; }

    var tcMin, S = null;
    if (tcMode === 'kirpich') {
      if (Lf <= 0 || dH <= 0) { r.warn.push('Isi panjang lintasan L dan beda tinggi ΔH (> 0) untuk Kirpich.'); return r; }
      S = dH / Lf;
      tcMin = 0.0195 * Math.pow(Lf, 0.77) * Math.pow(S, -0.385);
    } else {
      if (tcMan <= 0) { r.warn.push('Isi tc manual (> 0 menit).'); return r; }
      tcMin = tcMan;
    }
    var tcHr = tcMin / 60;
    r.S = S; r.tcMin = tcMin; r.tcHr = tcHr;

    var i = (R24 / 24) * Math.pow(24 / tcHr, 2 / 3);     // mm/jam
    var Q = 0.00278 * C * i * A;                          // m³/s
    r.i = i; r.Q = Q;
    r.valid = true;

    if (A > 300) r.warn.push('A = ' + A.toFixed(0) + ' ha — melampaui batas lazim metode rasional (±80–300 ha); gunakan hidrograf satuan (HSS).');
    else if (A > 80) r.warn.push('A = ' + A.toFixed(0) + ' ha — di ambang atas metode rasional; hasil makin kasar.');
    if (tcMin < 5) { r.warn.push('tc = ' + tcMin.toFixed(1) + ' menit < 5 menit — dipakai minimum praktis 5 menit? Nilai i sangat sensitif; di sini tc TIDAK diklamp (hasil konservatif).'); }
    if (S != null && S > 0.1) r.warn.push('Kemiringan S = ' + (S * 100).toFixed(1) + '% curam — Kirpich dikembangkan untuk lereng pertanian; hasil indikatif.');
    r.warn.push('Mononobe adalah PENDEKATAN intensitas dari hujan harian — bila tersedia kurva IDF lokal (analisis frekuensi), gunakan itu.');
    r.warn.push('R24 harus hujan rencana sesuai periode ulang (mis. R24 kala ulang 5–10 th untuk drainase kota).');

    return r;
  }

  /* ============================================================
     KANVAS — kurva intensitas Mononobe + titik operasi tc
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat kurva intensitas.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sky = css('--sky') || '#30bced', line = css('--line'), bad = css('--bad') || '#e5694f';

    var padT = 46, padB = 40, padL = 62, padR = 26;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    if (plotW < 80 || plotH < 60) return;

    var tMaxMin = Math.max(120, r.tcMin * 2.2);
    var iMax = (r.R24 / 24) * Math.pow(24 / (5 / 60), 2 / 3) * 1.05;   // i pada t=5 menit
    var iOf = function (tMin) { return (r.R24 / 24) * Math.pow(24 / (tMin / 60), 2 / 3); };
    var xOf = function (tMin) { return padL + tMin / tMaxMin * plotW; };
    var yOf = function (ii) { return padT + (1 - ii / iMax) * plotH; };

    // sumbu & grid
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH); ctx.lineTo(w - padR, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.stroke();
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = dim;
    ctx.textAlign = 'center';
    for (var t = 0; t <= tMaxMin; t += 30) {
      ctx.fillText(t.toFixed(0), xOf(t), padT + plotH + 12);
    }
    ctx.fillText('t (menit)', padL + plotW / 2, h - 8);
    ctx.textAlign = 'right';
    for (var ii = 0; ii <= iMax; ii += Math.max(20, Math.round(iMax / 5 / 10) * 10)) {
      ctx.fillText(ii.toFixed(0), padL - 4, yOf(ii) + 3);
    }
    ctx.save(); ctx.translate(padL + 12, padT + 6); ctx.textAlign = 'left';
    ctx.fillText('i (mm/jam)', 0, 0); ctx.restore();

    // kurva Mononobe
    ctx.strokeStyle = amber; ctx.lineWidth = 1.8;
    ctx.beginPath();
    var first = true;
    for (var tm = 5; tm <= tMaxMin; tm += tMaxMin / 120) {
      var x = xOf(tm), y = yOf(Math.min(iOf(tm), iMax));
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // titik operasi tc
    ctx.strokeStyle = sky; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(xOf(r.tcMin), padT + plotH); ctx.lineTo(xOf(r.tcMin), yOf(r.i)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, yOf(r.i)); ctx.lineTo(xOf(r.tcMin), yOf(r.i)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = bad;
    ctx.beginPath(); ctx.arc(xOf(r.tcMin), yOf(r.i), 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sky; ctx.textAlign = 'left';
    ctx.fillText('tc ' + r.tcMin.toFixed(0) + ' mnt · i ' + r.i.toFixed(1) + ' mm/jam',
      Math.min(xOf(r.tcMin) + 8, w - padR - 150), yOf(r.i) - 8);

    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Q = 0,00278·' + r.C.toFixed(2) + '·' + r.i.toFixed(1) + '·' + r.A.toFixed(1) +
      ' = ' + r.Q.toFixed(3) + ' m³/s', padL + plotW / 2, padT - 8);

    if (state.mouse) {
      var mx = state.mouse.x;
      if (mx >= padL && mx <= w - padR) {
        var tH = (mx - padL) / plotW * tMaxMin;
        if (tH >= 5) {
          state.UI.canvasTip(ctx, {
            mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: 40,
            text: 't=' + tH.toFixed(0) + ' mnt → i ' + iOf(tH).toFixed(1) + ' mm/jam'
          });
        }
      }
    }
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('rm-style')) return;
    var s = document.createElement('style');
    s.id = 'rm-style';
    s.textContent =
      '.rm-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.rm-canvas{position:relative;flex:1 1 46%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.rm-res{flex:1 1 54%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Debit Banjir Rasional'));
    panel.appendChild(UI.el('div', 'sub', 'Debit puncak drainase kawasan kecil: Q = 0,00278·C·i·A dengan ' +
      'waktu konsentrasi Kirpich dan intensitas Mononobe dari hujan harian rencana R24. ' +
      'Hasil Q menjadi input tool Saluran Terbuka.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'DAS / Kawasan' },
      { type: 'number', id: 'A', label: 'Luas A', unit: 'ha', value: 10, min: 0.01, step: 1 },
      { type: 'select', id: 'land', label: 'Tutupan lahan dominan (C)', value: 'urban', options: [
        { value: 'roof', label: CVAL.roof.label },
        { value: 'urban', label: CVAL.urban.label },
        { value: 'suburb', label: CVAL.suburb.label },
        { value: 'garden', label: CVAL.garden.label },
        { value: 'farm', label: CVAL.farm.label },
        { value: 'forest', label: CVAL.forest.label },
        { value: 'custom', label: 'Kustom (isi C)' } ] },
      { type: 'number', id: 'C', label: 'C kustom / komposit', value: 0.60, min: 0.05, max: 1, step: 0.05, hint: 'C komposit = Σ(Ci·Ai)/ΣAi bila tutupan campuran.' },

      { type: 'group', label: 'Hujan Rencana' },
      { type: 'number', id: 'R24', label: 'Hujan harian R24 (kala ulang)', unit: 'mm', value: 120, min: 10, step: 5, hint: 'Dari analisis frekuensi (Gumbel/Log-Pearson III) sesuai periode ulang.' },

      { type: 'group', label: 'Waktu Konsentrasi' },
      { type: 'segment', id: 'tcMode', label: 'Sumber tc', value: 'kirpich', options: [
        { value: 'kirpich', label: 'Kirpich (L, ΔH)' }, { value: 'manual', label: 'Manual' } ] },
      { type: 'number', id: 'Lf', label: 'Panjang lintasan terjauh L', unit: 'm', value: 800, min: 10, step: 50 },
      { type: 'number', id: 'dH', label: 'Beda tinggi ΔH', unit: 'm', value: 8, min: 0.1, step: 0.5 },
      { type: 'number', id: 'tcMan', label: 'tc manual', unit: 'menit', value: 30, min: 5, step: 5 }
    ];

    var results = UI.el('div', 'rm-res');
    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); }, ID);
    state.form = form;

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    var work = UI.el('div', 'rm-work');
    var canvasHost = UI.el('div', 'rm-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Debit rasional');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    if (state.canvas2d) {
      state.cv = state.canvas2d.create(canvasHost, drawScene);
      state.onMove = function (e) {
        var rect = state.cv.canvas.getBoundingClientRect();
        state.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        state.cv.redraw();
      };
      state.onLeave = function () { state.mouse = null; state.cv.redraw(); };
      state.cv.canvas.addEventListener('mousemove', state.onMove);
      state.cv.canvas.addEventListener('mouseleave', state.onLeave);
    }

    update(form.getValues(), results);
  }

  /* ---------- panel hasil ---------- */
  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Debit rasional');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set('A ' + r.A + ' ha · C ' + r.C.toFixed(2) + ' · Q ' + r.Q.toFixed(3) + ' m³/s');

    results.appendChild(UI.hero('Debit puncak Q = 0,00278·C·i·A', r.Q.toFixed(3), 'm³/s'));

    results.appendChild(UI.rhead('Parameter'));
    results.appendChild(UI.kv('Luas A', r.A + ' ha (' + (r.A / 100).toFixed(2) + ' km²)'));
    results.appendChild(UI.kv('Koefisien C (' + r.landLabel + ')', r.C.toFixed(2)));
    results.appendChild(UI.kv('Hujan harian R24', r.R24 + ' mm'));

    results.appendChild(UI.rhead('Waktu konsentrasi'));
    if (r.tcMode === 'kirpich') {
      results.appendChild(UI.kv('L / ΔH / S', r.Lf + ' m / ' + r.dH + ' m / ' + (r.S * 100).toFixed(2) + ' %'));
      results.appendChild(UI.kv('tc Kirpich = 0,0195·L^0,77·S^−0,385', r.tcMin.toFixed(1) + ' menit (' + r.tcHr.toFixed(2) + ' jam)'));
    } else {
      results.appendChild(UI.kv('tc manual', r.tcMin.toFixed(1) + ' menit (' + r.tcHr.toFixed(2) + ' jam)'));
    }

    results.appendChild(UI.rhead('Intensitas & debit'));
    results.appendChild(UI.kv('i Mononobe = (R24/24)·(24/tc)^⅔', r.i.toFixed(1) + ' mm/jam'));
    results.appendChild(UI.kv('Q puncak', r.Q.toFixed(3) + ' m³/s = ' + (r.Q * 1000).toFixed(0) + ' L/s', 'ok'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'Metode <b>Rasional</b> untuk DAS kecil (lazim ≤ ±80–300 ha): hujan merata, durasi ≥ tc, C konstan. ' +
      'tc <b>Kirpich</b> (lereng alami/pertanian); i <b>Mononobe</b> — pendekatan dari hujan harian bila kurva ' +
      'IDF lokal tak tersedia. R24 = hujan rencana hasil analisis frekuensi sesuai kala ulang. ' +
      '<b>TIDAK termasuk</b>: hidrograf satuan (Nakayasu/SCS/Gama-1), routing saluran/kolam, analisis frekuensi ' +
      'hujan, infiltrasi detail. Hasil Q → desain penampang di tool Saluran Terbuka. Verifikasi oleh insinyur.'));

    if (state.cv) state.cv.redraw();
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.2.0', RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', v = ' ' + value;
    var d = RW - l.length - v.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + v;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n) || !isFinite(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/³/g, '3').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/Δ/g, 'd')
      .replace(/⅔/g, '2/3').replace(/Σ/g, 'sum').replace(/→/g, '->').replace(/[^\x20-\x7E]/g, '?');
  }
  function wrapR(text, width) {
    var words = text.split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var wd = words[i];
      if (cur && (cur + ' ' + wd).length > width) { lines.push(cur); cur = '   ' + wd; }
      else cur = cur ? cur + ' ' + wd : wd;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function buildReport(r) {
    var now = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('DEBIT BANJIR RENCANA - METODE RASIONAL'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Kirpich + Mononobe', dt));
    L.push('');
    L.push(' PARAMETER'); L.push(ruleR('-'));
    L.push(rowR('Luas DAS A', numR(r.A, 2) + ' ha'));
    L.push(rowR('Koef. limpasan C', numR(r.C, 2) + ' (' + tolatin(r.landLabel) + ')'));
    L.push(rowR('Hujan harian R24', numR(r.R24, 0) + ' mm'));
    L.push('');
    L.push(' WAKTU KONSENTRASI'); L.push(ruleR('-'));
    if (r.tcMode === 'kirpich') {
      L.push(rowR('L / dH / S', numR(r.Lf, 0) + ' m / ' + numR(r.dH, 1) + ' m / ' + numR(r.S * 100, 2) + ' %'));
      L.push(rowR('tc = 0.0195*L^0.77*S^-0.385', numR(r.tcMin, 1) + ' menit'));
    } else {
      L.push(rowR('tc manual', numR(r.tcMin, 1) + ' menit'));
    }
    L.push('');
    L.push(' HASIL'); L.push(ruleR('='));
    L.push(rowR('i Mononobe', numR(r.i, 1) + ' mm/jam'));
    L.push(rowR('>> Q PUNCAK = 0.00278*C*i*A', numR(r.Q, 3) + ' m3/s'));
    L.push(rowR('   ekuivalen', numR(r.Q * 1000, 0) + ' L/s'));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Metode rasional utk DAS kecil. BELUM: hidrograf satuan,');
    L.push(' routing, analisis frekuensi. Verifikasi oleh insinyur.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(' ' + rep('=', RW));
    return L.map(tolatin);
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi input dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Debit-Rasional_A' + r.A + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Debit Banjir Rasional', category: 'Hidraulika & Hidrologi', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, runtime: runtime, mouse: null };
      render(container);
    },

    unmount: function () {
      if (state.cv) {
        if (state.onMove) state.cv.canvas.removeEventListener('mousemove', state.onMove);
        if (state.onLeave) state.cv.canvas.removeEventListener('mouseleave', state.onLeave);
        state.cv.destroy();
      }
      state = {};
    }
  };
})();
