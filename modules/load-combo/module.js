/* ============================================================
   Civil Tools — modules/load-combo/module.js  (Tier 2, kanvas 2D)
   Kombinasi Beban — SNI 1727:2020 (adopsi ASCE 7-16), Ps. 2.3 (LRFD/kuat) & 2.4 (ASD/layan).

   Tool "hulu": menggabungkan beban layan nominal (D, L, Lr, R, W, E) menjadi
   beban terfaktor desain, menampilkan SELURUH kombinasi + menandai yang KRITIS
   (maksimum untuk kekuatan; minimum untuk pembalikan/uplift bila negatif), lalu
   dapat MENGIRIM nilai puncak ke input tool lain (Pu/Mu) via runtime.handoff.

   Kombinasi (ASCE 7-16 / SNI 1727:2020):
     LRFD (Ps. 2.3.1):
       1) 1,4D
       2) 1,2D + 1,6L + 0,5(Lr|R)
       3) 1,2D + 1,6(Lr|R) + (1,0L | 0,5W)
       4) 1,2D ± 1,0W + 1,0L + 0,5(Lr|R)
       5) 1,2D ± 1,0E + 1,0L
       6) 0,9D ± 1,0W
       7) 0,9D ± 1,0E
     ASD (Ps. 2.4.1):
       1) D   2) D+L   3) D+(Lr|R)   4) D+0,75L+0,75(Lr|R)
       5) D ± 0,6W  /  D ± 0,7E
       6) D+0,75L ± 0,75·0,6W + 0,75(Lr|R)
       7) D+0,75L ± 0,75·0,7E
       8) 0,6D ± 0,6W   9) 0,6D ± 0,7E
   (Lr|R) = maks(Lr, R). Pengecualian 0,5L (Ps. 2.3.1) opsional untuk koef 1,0L.
   W & E diperlakukan ± (arah bolak-balik) → suku pembalik menghasilkan kombinasi
   minimum yang mendeteksi uplift/reversal.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'load-combo';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function payloadOf(qty, val) { var o = {}; o[qty] = val; return o; }

  /* ---------- Generator kombinasi ---------- */
  function lrfdCombos(D, L, Lr, R, W, E, LrR, Lc, Lstr) {
    var a = [];
    a.push({ id: '1', expr: '1,4D', val: 1.4 * D });
    a.push({ id: '2', expr: '1,2D + 1,6L + 0,5(Lr|R)', val: 1.2 * D + 1.6 * L + 0.5 * LrR });
    a.push({ id: '3', expr: '1,2D + 1,6(Lr|R) + ' + Lstr, val: 1.2 * D + 1.6 * LrR + Lc });
    if (W > 0) a.push({ id: '3b', expr: '1,2D + 1,6(Lr|R) + 0,5W', val: 1.2 * D + 1.6 * LrR + 0.5 * W });
    if (W > 0) {
      a.push({ id: '4+', expr: '1,2D + 1,0W + ' + Lstr + ' + 0,5(Lr|R)', val: 1.2 * D + W + Lc + 0.5 * LrR });
      a.push({ id: '4−', expr: '1,2D − 1,0W + ' + Lstr + ' + 0,5(Lr|R)', val: 1.2 * D - W + Lc + 0.5 * LrR });
    }
    if (E > 0) {
      a.push({ id: '5+', expr: '1,2D + 1,0E + ' + Lstr, val: 1.2 * D + E + Lc });
      a.push({ id: '5−', expr: '1,2D − 1,0E + ' + Lstr, val: 1.2 * D - E + Lc });
    }
    if (W > 0) {
      a.push({ id: '6+', expr: '0,9D + 1,0W', val: 0.9 * D + W });
      a.push({ id: '6−', expr: '0,9D − 1,0W', val: 0.9 * D - W });
    }
    if (E > 0) {
      a.push({ id: '7+', expr: '0,9D + 1,0E', val: 0.9 * D + E });
      a.push({ id: '7−', expr: '0,9D − 1,0E', val: 0.9 * D - E });
    }
    return a;
  }

  function asdCombos(D, L, Lr, R, W, E, LrR) {
    var a = [];
    a.push({ id: '1', expr: 'D', val: D });
    a.push({ id: '2', expr: 'D + L', val: D + L });
    a.push({ id: '3', expr: 'D + (Lr|R)', val: D + LrR });
    a.push({ id: '4', expr: 'D + 0,75L + 0,75(Lr|R)', val: D + 0.75 * L + 0.75 * LrR });
    if (W > 0) {
      a.push({ id: '5W+', expr: 'D + 0,6W', val: D + 0.6 * W });
      a.push({ id: '5W−', expr: 'D − 0,6W', val: D - 0.6 * W });
      a.push({ id: '6+', expr: 'D + 0,75L + 0,45W + 0,75(Lr|R)', val: D + 0.75 * L + 0.45 * W + 0.75 * LrR });
      a.push({ id: '6−', expr: 'D + 0,75L − 0,45W + 0,75(Lr|R)', val: D + 0.75 * L - 0.45 * W + 0.75 * LrR });
      a.push({ id: '8+', expr: '0,6D + 0,6W', val: 0.6 * D + 0.6 * W });
      a.push({ id: '8−', expr: '0,6D − 0,6W', val: 0.6 * D - 0.6 * W });
    }
    if (E > 0) {
      a.push({ id: '5E+', expr: 'D + 0,7E', val: D + 0.7 * E });
      a.push({ id: '5E−', expr: 'D − 0,7E', val: D - 0.7 * E });
      a.push({ id: '7+', expr: 'D + 0,75L + 0,525E', val: D + 0.75 * L + 0.525 * E });
      a.push({ id: '7−', expr: 'D + 0,75L − 0,525E', val: D + 0.75 * L - 0.525 * E });
      a.push({ id: '9+', expr: '0,6D + 0,7E', val: 0.6 * D + 0.7 * E });
      a.push({ id: '9−', expr: '0,6D − 0,7E', val: 0.6 * D - 0.7 * E });
    }
    return a;
  }

  function compute(v) {
    var r = { valid: false, warn: [] };
    var D = num(v.D), L = num(v.L), Lr = num(v.Lr), R = num(v.R), W = num(v.W), E = num(v.E);
    var qty = v.qty || 'axial';
    var sys = v.system || 'lrfd';
    var Lred = (v.Lred === 'yes');
    var LrR = Math.max(Lr, R);
    var Lc = Lred ? 0.5 * L : L;
    var Lstr = Lred ? '0,5L' : '1,0L';

    var combos = (sys === 'lrfd')
      ? lrfdCombos(D, L, Lr, R, W, E, LrR, Lc, Lstr)
      : asdCombos(D, L, Lr, R, W, E, LrR);

    var gov = null, govMin = null;
    combos.forEach(function (c) {
      if (gov === null || c.val > gov.val) gov = c;
      if (govMin === null || c.val < govMin.val) govMin = c;
    });

    r.valid = true;
    r.qty = qty; r.sys = sys; r.unit = (qty === 'moment') ? 'kN·m' : 'kN';
    r.qtyLabel = qty === 'moment' ? 'Momen' : (qty === 'shear' ? 'Geser' : 'Aksial');
    r.D = D; r.L = L; r.Lr = Lr; r.R = R; r.W = W; r.E = E; r.LrR = LrR; r.Lred = Lred;
    r.combos = combos; r.gov = gov; r.govMin = govMin;
    r.hasW = W > 0; r.hasE = E > 0;

    if (govMin && govMin.val < 0)
      r.warn.push('Kombinasi ' + govMin.id + ' (' + govMin.expr + ') = ' + govMin.val.toFixed(1) +
        ' ' + r.unit + ' NEGATIF — terjadi pembalikan/uplift (mis. angin/gempa mengangkat). Periksa desain untuk gaya berlawanan arah.');
    if (D === 0 && L === 0 && Lr === 0 && R === 0 && W === 0 && E === 0)
      r.warn.push('Semua beban nol — masukkan beban layan (nominal) untuk menghitung.');
    if (sys === 'lrfd' && Lred && L > 0)
      r.warn.push('Pengecualian 0,5L diterapkan (Ps. 2.3.1): hanya sah bila L₀ ≤ 4,79 kN/m² dan bukan garasi/ruang publik/beban >4,79 kN/m².');

    return r;
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('lc-style')) return;
    var s = document.createElement('style');
    s.id = 'lc-style';
    s.textContent =
      '.lc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.lc-canvas{position:relative;flex:1 1 46%;min-height:210px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.lc-res{flex:1 1 54%;overflow-y:auto;padding:18px 24px 34px}' +
      '.lc-send{display:flex;flex-direction:column;gap:6px;margin-top:6px}';
    document.head.appendChild(s);
  }

  /* ---------- Render ---------- */
  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Kombinasi Beban'));
    panel.appendChild(UI.el('div', 'sub', 'Gabungkan beban layan (D, L, Lr, R, W, E) menjadi beban terfaktor — ' +
      'SNI 1727:2020 (adopsi ASCE 7-16), LRFD (kuat) & ASD (layan). Semua kombinasi ditampilkan, yang kritis ' +
      'ditandai, dan nilai puncak dapat dikirim langsung ke input tool lain (Pu/Mu).'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Jenis Besaran & Sistem' },
      { type: 'segment', id: 'qty', label: 'Kuantitas', value: 'axial', options: [
        { value: 'axial', label: 'Aksial (kN)' }, { value: 'moment', label: 'Momen (kN·m)' }, { value: 'shear', label: 'Geser (kN)' } ] },
      { type: 'segment', id: 'system', label: 'Sistem', value: 'lrfd', options: [
        { value: 'lrfd', label: 'LRFD (kuat)' }, { value: 'asd', label: 'ASD (layan)' } ] },

      { type: 'group', label: 'Beban Layan (nominal)' },
      { type: 'number', id: 'D', label: 'D — beban mati', unit: '', value: 100, min: 0, step: 5 },
      { type: 'number', id: 'L', label: 'L — beban hidup', unit: '', value: 80, min: 0, step: 5 },
      { type: 'number', id: 'Lr', label: 'Lr — beban hidup atap', unit: '', value: 0, min: 0, step: 5 },
      { type: 'number', id: 'R', label: 'R — beban hujan', unit: '', value: 0, min: 0, step: 5 },
      { type: 'number', id: 'W', label: 'W — beban angin (magnitudo)', unit: '', value: 0, min: 0, step: 5, hint: 'Diperlakukan ± otomatis. 0 = tanpa angin.' },
      { type: 'number', id: 'E', label: 'E — beban gempa (magnitudo)', unit: '', value: 0, min: 0, step: 5, hint: 'Diperlakukan ± otomatis. 0 = tanpa gempa.' },

      { type: 'group', label: 'Opsi' },
      { type: 'segment', id: 'Lred', label: 'Reduksi 0,5L (Ps. 2.3.1)', value: 'no', options: [
        { value: 'no', label: 'Tidak (1,0L)' }, { value: 'yes', label: 'Ya (0,5L)' } ] }
    ];

    var results = UI.el('div', 'lc-res');

    var form = UI.buildForm(panel, schema, function (vals) {
      update(vals, results);
    });
    state.form = form;
    state.results = results;

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    var work = UI.el('div', 'lc-work');
    var canvasHost = UI.el('div', 'lc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Kombinasi beban');
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

  /* ---------- Update panel hasil ---------- */
  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    state.cap.set(r.qtyLabel + ' · ' + (r.sys === 'lrfd' ? 'LRFD (kuat)' : 'ASD (layan)') + ' · ' + r.combos.length + ' kombinasi');

    var govVal = r.gov ? r.gov.val : 0;
    var hasMin = r.govMin && r.govMin.val < 0;
    results.appendChild(UI.heroRow([
      { label: (r.sys === 'lrfd' ? 'LRFD' : 'ASD') + ' terfaktor maks', value: UI.fmt(govVal, 1), unit: r.unit },
      hasMin
        ? { label: 'Minimum (pembalikan)', value: UI.fmt(r.govMin.val, 1), unit: r.unit, tone: 'bad' }
        : { label: 'Kombinasi menentukan', value: r.gov ? r.gov.id : '—' },
      { label: 'Jumlah kombinasi', value: r.combos.length }
    ]));
    if (r.gov) results.appendChild(UI.el('div', 'ck-empty',
      'Menentukan: kombinasi <b>' + r.gov.id + '</b> — ' + r.gov.expr +
      (r.govMin && r.govMin.val < 0 ? ' · minimum ' + r.govMin.val.toFixed(1) + ' ' + r.unit + ' (kombinasi ' + r.govMin.id + ')' : '') + '.'));

    results.appendChild(UI.rhead('Semua kombinasi (' + (r.sys === 'lrfd' ? 'SNI 1727:2020 Ps. 2.3.1' : 'Ps. 2.4.1') + ')'));
    r.combos.forEach(function (c) {
      var isMax = (c === r.gov), isMin = (c === r.govMin && c.val < 0);
      var suffix = isMax ? '  ◄ maks' : (isMin ? '  ◄ min' : '');
      results.appendChild(UI.kv(c.id + '. ' + c.expr, UI.fmt(c.val, 1) + ' ' + r.unit + suffix,
        isMax ? 'ok' : (isMin ? 'bad' : '')));
    });

    renderHandoff(results, r);

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1727:2020 (adopsi ASCE 7-16) — kombinasi LRFD Ps. 2.3.1 & ASD Ps. 2.4.1. (Lr|R) = maks(Lr, R). ' +
      'W dan E diperlakukan ± (arah bolak-balik); kombinasi minimum negatif menandai pembalikan/uplift. ' +
      'Beban dimasukkan sebagai <b>skalar satu-komponen</b> (satu jenis gaya) — untuk gaya berpasangan (aksial+momen) ' +
      'jalankan tool per-komponen. Faktor lain (banjir Fa, tanah/fluida H, suhu T, salju S sebagai turunan) belum disertakan. ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  function renderHandoff(results, r) {
    var UI = state.UI;
    if (r.sys !== 'lrfd') {
      results.appendChild(UI.note('Kirim ke tool lain',
        'Handoff hanya untuk sistem <b>LRFD (kuat)</b> — tool penerima memakai beban terfaktor DFBK (Pu/Mu). ' +
        'Ganti sistem ke LRFD untuk mengaktifkan.'));
      return;
    }
    var targets = (window.MODULE_REGISTRY || []).filter(function (m) {
      return m.status === 'active' && m.accepts && m.accepts[r.qty];
    });
    if (!targets.length) {
      results.appendChild(UI.note('Kirim ke tool lain',
        'Belum ada tool aktif yang menerima kuantitas <b>' + r.qtyLabel.toLowerCase() + '</b>. ' +
        '(Aksial → Batang Tarik/Tekan Baja; Momen → Balok Baja Lentur.)'));
      return;
    }
    var val = r.gov ? round2(r.gov.val) : 0;
    results.appendChild(UI.rhead('Kirim ke tool lain'));
    if (val <= 0) {
      results.appendChild(UI.el('div', 'ck-empty', 'Beban terfaktor maks ≤ 0 — masukkan beban dulu sebelum mengirim.'));
      return;
    }
    var wrap = UI.el('div', 'lc-send');
    targets.forEach(function (m) {
      var b = UI.el('button', 'ck-btn ghost', '→  ' + m.name + '  (' + m.accepts[r.qty] + ' = ' + UI.fmt(val, 1) + ')');
      b.addEventListener('click', function () {
        if (state.runtime && state.runtime.handoff) {
          state.runtime.handoff.send(m.id, payloadOf(r.qty, val), 'Kombinasi Beban');
        }
      });
      wrap.appendChild(b);
    });
    results.appendChild(wrap);
    results.appendChild(UI.el('div', 'ck-empty',
      'Mengirim nilai puncak <b>' + UI.fmt(val, 1) + ' ' + r.unit + '</b> (kombinasi ' + (r.gov ? r.gov.id : '') + ') ke field tool tujuan lalu berpindah ke sana.'));
  }

  /* ---------- Kanvas: bar chart kombinasi ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid || !r.combos.length) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Masukkan beban untuk melihat kombinasi.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || css('--info') || '#30bced', line = css('--line');
    var combos = r.combos, n = combos.length;

    // .cap menempati pita atas → padT >= 34 (gotcha berulang). Tidak ada teks kanvas di y<34.
    var padT = 38, padB = 22, padL = 52, padR = 66;
    var x0 = padL, x1 = w - padR, trackW = Math.max(20, x1 - x0);
    var areaH = h - padT - padB;
    var rowH = areaH / n;
    var barH = Math.max(3, Math.min(18, rowH * 0.62));

    var posMax = (r.gov && r.gov.val > 0) ? r.gov.val : 0;
    var negMax = (r.govMin && r.govMin.val < 0) ? -r.govMin.val : 0;
    var total = (posMax + negMax) || 1;
    var zeroX = x0 + trackW * (negMax / total);
    var scale = trackW / total;

    // sumbu nol
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(zeroX, padT - 4); ctx.lineTo(zeroX, h - padB + 2); ctx.stroke();

    ctx.font = '10px "JetBrains Mono", monospace';
    var hoverIdx = -1;
    if (state.mouse) {
      var mi = Math.floor((state.mouse.y - padT) / rowH);
      if (mi >= 0 && mi < n) hoverIdx = mi;
    }

    combos.forEach(function (c, i) {
      var yMid = padT + i * rowH + rowH / 2;
      var y = yMid - barH / 2;
      var isMax = (c === r.gov), isMin = (c === r.govMin && c.val < 0);
      var barLen = c.val * scale;
      var rx = c.val >= 0 ? zeroX : zeroX + barLen;
      var rw = Math.max(1.5, Math.abs(barLen));

      var col = isMax ? amber : (isMin ? sky : sage);
      ctx.fillStyle = col;
      ctx.globalAlpha = (isMax || isMin) ? 1 : 0.55;
      if (i === hoverIdx) ctx.globalAlpha = 1;
      roundBar(ctx, rx, y, rw, barH, Math.min(4, barH / 2)); ctx.fill();
      ctx.globalAlpha = 1;

      // label id kombinasi (kiri, di luar area track)
      ctx.fillStyle = (isMax ? amber : (isMin ? sky : dim));
      ctx.textAlign = 'right';
      ctx.fillText(c.id, x0 - 6, yMid + 3);

      // nilai (kanan) + penanda menentukan
      ctx.textAlign = 'left';
      ctx.fillStyle = isMax ? amber : (isMin ? sky : ink);
      ctx.font = (isMax || isMin) ? 'bold 10px "JetBrains Mono", monospace' : '10px "JetBrains Mono", monospace';
      var lbl = c.val.toFixed(0) + (isMax ? ' ◄' : (isMin ? ' ◄' : ''));
      ctx.fillText(lbl, x1 + 5, yMid + 3);
      ctx.font = '10px "JetBrains Mono", monospace';
    });

    // hover pill: ekspresi + nilai (pakai helper posisi-aman bersama)
    if (hoverIdx >= 0) {
      var c = combos[hoverIdx];
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: padT,
        text: c.id + ': ' + c.expr.replace(/[−]/g, '-') + ' = ' + c.val.toFixed(1) + ' ' + r.unit
      });
    }
  }

  function roundBar(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- Report monospace ---------- */
  var APP_VER = 'v0.5.0';
  var RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', v = ' ' + value;
    var d = RW - l.length - v.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + v;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/·/g, '*').replace(/²/g, '2').replace(/√/g, 'sqrt').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/′/g, "'")
      .replace(/◄/g, '<<').replace(/₀/g, '0').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('KOMBINASI BEBAN'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 1727:2020 (ASCE 7-16)', dt));
    L.push('');
    L.push(' PARAMETER');
    L.push(ruleR('-'));
    L.push(rowR('Kuantitas', tolatin(r.qtyLabel) + ' (' + tolatin(r.unit) + ')'));
    L.push(rowR('Sistem', r.sys === 'lrfd' ? 'LRFD (kuat) - Ps. 2.3.1' : 'ASD (layan) - Ps. 2.4.1'));
    L.push(rowR('Reduksi 0.5L', r.Lred ? 'Ya' : 'Tidak'));
    L.push('');
    L.push(' BEBAN LAYAN (NOMINAL)');
    L.push(ruleR('-'));
    L.push(rowR('D  (mati)', numR(r.D, 2) + ' ' + tolatin(r.unit)));
    L.push(rowR('L  (hidup)', numR(r.L, 2) + ' ' + tolatin(r.unit)));
    L.push(rowR('Lr (hidup atap)', numR(r.Lr, 2) + ' ' + tolatin(r.unit)));
    L.push(rowR('R  (hujan)', numR(r.R, 2) + ' ' + tolatin(r.unit)));
    L.push(rowR('W  (angin, +/-)', numR(r.W, 2) + ' ' + tolatin(r.unit)));
    L.push(rowR('E  (gempa, +/-)', numR(r.E, 2) + ' ' + tolatin(r.unit)));
    L.push('');
    L.push(' KOMBINASI');
    L.push(ruleR('='));
    r.combos.forEach(function (c) {
      var mark = (c === r.gov) ? ' <<MAKS' : ((c === r.govMin && c.val < 0) ? ' <<MIN' : '');
      L.push(rowR(c.id + '. ' + tolatin(c.expr), numR(c.val, 1) + ' ' + tolatin(r.unit) + mark));
    });
    L.push(ruleR('='));
    L.push('');
    L.push(' HASIL');
    L.push(ruleR('='));
    if (r.gov) {
      L.push(rowR('>> Terfaktor MAKS', numR(r.gov.val, 1) + ' ' + tolatin(r.unit)));
      L.push(rowR('   Menentukan', 'komb ' + r.gov.id + ' : ' + tolatin(r.gov.expr)));
    }
    if (r.govMin && r.govMin.val < 0) {
      L.push(rowR('>> Terfaktor MIN', numR(r.govMin.val, 1) + ' ' + tolatin(r.unit)));
      L.push(rowR('   Pembalikan/uplift', 'komb ' + r.govMin.id + ' : ' + tolatin(r.govMin.expr)));
    }
    L.push(ruleR('='));

    var notes = r.warn.slice();
    if (notes.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' (Lr|R)=maks(Lr,R); W & E diperlakukan +/- (arah bolak-balik).');
    L.push(' Beban skalar satu-komponen; verifikasi oleh insinyur penanggung jawab.');
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
    if (!r.valid) { UI.toast('Masukkan beban dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Kombinasi-Beban_' + (r.sys === 'lrfd' ? 'LRFD' : 'ASD') + '_' + r.qty + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Kombinasi Beban', category: 'Umum', needsCanvas: true, needsRenderer: false },

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
