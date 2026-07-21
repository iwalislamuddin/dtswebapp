/* ============================================================
   Civil Tools — modules/cpt-pile/module.js  (Tier 2, kanvas 2D)
   Daya Dukung Tiang dari Data CPT/Sondir (metode langsung).

   Metode:
   - UJUNG (Schmertmann–Nottingham, disederhanakan): qp = (qc1 + qc2)/2
       qc1 = rata-rata qc dari ujung tiang sampai 4D di bawah ujung
       qc2 = rata-rata qc dari 8D di atas ujung sampai ujung
     Qp = qp·Ap. (Rata-rata aritmetika; versi lengkap memakai jalur minimum.)
   - SELIMUT: Qs = Σ fs·K·Δz sepanjang tiang tertanam
       fs dari KOLOM DATA sondir (bila ada) atau estimasi fs = (Rf/100)·qc.
       fs dibatasi maks 120 kPa (praktik lazim — peringatan bila tercapai).
   - IZIN (praktik sondir Indonesia): Q_izin = Qp/FSp + Qs/FSs
     (default FSp = 3, FSs = 5); pembanding: Qu/FS global 2,5.

   Input data: tempel "z qc" atau "z qc fs" per baris. Satuan qc kg/cm² atau
   MPa; fs mengikuti (kg/cm² atau kPa).

   TIDAK termasuk: efisiensi kelompok, gesekan negatif (downdrag), tiang
   tarik/lateral, penurunan tiang, koreksi qt (CPTu), jalur-minimum
   Schmertmann penuh, faktor jenis tiang LCPC (kc/α per kategori tanah).
   Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'cpt-pile';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  var KGCM2 = 98.0665;                     // kPa per kg/cm²
  var FS_LIMIT = 120;                      // kPa batas lunak selimut

  /* ---------- parser & interpolasi ---------- */
  function parseCPT(text, unit) {
    var pts = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      if (!s || /^[#\/]/.test(s)) return;
      var p = s.split(/[\s,;]+/).map(parseFloat);
      if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) && p[1] >= 0) {
        var qc = unit === 'mpa' ? p[1] * 1000 : p[1] * KGCM2;                       // kPa
        var fs = null;
        if (p.length >= 3 && isFinite(p[2]) && p[2] >= 0)
          fs = unit === 'mpa' ? p[2] : p[2] * KGCM2;                                // kPa
        pts.push({ z: p[0], qc: qc, fs: fs });
      }
    });
    pts.sort(function (a, b) { return a.z - b.z; });
    var out = [];
    pts.forEach(function (p) { if (!out.length || p.z > out[out.length - 1].z + 1e-9) out.push(p); });
    return out;
  }

  function interpAt(pts, z, key) {
    if (!pts.length) return 0;
    if (z <= pts[0].z) return pts[0][key] || 0;
    if (z >= pts[pts.length - 1].z) return pts[pts.length - 1][key] || 0;
    for (var i = 1; i < pts.length; i++) {
      if (z <= pts[i].z) {
        var a = pts[i - 1], b = pts[i];
        var va = a[key] || 0, vb = b[key] || 0;
        return va + (vb - va) * (z - a.z) / (b.z - a.z);
      }
    }
    return pts[pts.length - 1][key] || 0;
  }

  function avg(pts, z1, z2, key) {
    if (z2 <= z1) return interpAt(pts, z1, key);
    var n = 50, sum = 0;
    for (var i = 0; i < n; i++) sum += interpAt(pts, z1 + (i + 0.5) * (z2 - z1) / n, key);
    return sum / n;
  }

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v, pts) {
    var r = { valid: false, warn: [] };
    var shape = v.shape || 'circle';
    var D = num(v.D), Lp = num(v.Lp);
    var fsrc = v.fsrc || 'data';
    var Rf = num(v.Rf) || 1;
    var FSp = num(v.FSp) || 3, FSs = num(v.FSs) || 5;
    var Pw = num(v.Pw);                                    // beban kerja kN

    r.shape = shape; r.D = D; r.Lp = Lp; r.fsrc = fsrc; r.Rf = Rf;
    r.FSp = FSp; r.FSs = FSs; r.Pw = Pw; r.pts = pts; r.nPts = pts.length;

    if (!pts.length) { r.warn.push('Tempel data CPT (z & qc per baris) terlebih dulu.'); return r; }
    if (D <= 0 || Lp <= 0) { r.warn.push('Isi diameter/sisi D dan panjang tiang L (> 0).'); return r; }

    var zMax = pts[pts.length - 1].z;
    r.zMax = zMax;
    var hasFs = pts.some(function (p) { return p.fs != null; });
    r.hasFs = hasFs;
    if (fsrc === 'data' && !hasFs) {
      r.fsrc = fsrc = 'rf';
      r.warn.push('Kolom fs tidak ditemukan di data — selimut memakai estimasi Rf = ' + Rf + '% · qc.');
    }
    if (Lp > zMax)
      r.warn.push('Ujung tiang L = ' + Lp.toFixed(1) + ' m di bawah data terdalam (' + zMax.toFixed(1) +
        ' m) — qc diekstrapolasi konstan (hati-hati).');

    /* --- ujung --- */
    var Ap = shape === 'circle' ? Math.PI * D * D / 4 : D * D;                 // m²
    var K = shape === 'circle' ? Math.PI * D : 4 * D;                          // m keliling
    var qc1 = avg(pts, Lp, Lp + 4 * D, 'qc');
    var qc2 = avg(pts, Math.max(0, Lp - 8 * D), Lp, 'qc');
    var qp = (qc1 + qc2) / 2;                                                  // kPa
    var Qp = qp * Ap;                                                          // kN
    r.Ap = Ap; r.K = K; r.qc1 = qc1; r.qc2 = qc2; r.qp = qp; r.Qp = Qp;

    /* --- selimut --- */
    var n = 200, dz = Lp / n, Qs = 0, fsMax = 0, capped = false;
    for (var i = 0; i < n; i++) {
      var z = (i + 0.5) * dz;
      var fs = fsrc === 'data' ? interpAt(pts, z, 'fs') : (Rf / 100) * interpAt(pts, z, 'qc');
      if (fs > FS_LIMIT) { fs = FS_LIMIT; capped = true; }
      fsMax = Math.max(fsMax, fs);
      Qs += fs * K * dz;
    }
    r.Qs = Qs; r.fsMax = fsMax; r.capped = capped;

    /* --- izin --- */
    var Qu = Qp + Qs;
    var Qall = Qp / FSp + Qs / FSs;
    var QallGlobal = Qu / 2.5;
    r.Qu = Qu; r.Qall = Qall; r.QallGlobal = QallGlobal;
    r.dc = (Pw > 0 && Qall > 0) ? Pw / Qall : 0;
    r.valid = true;

    if (capped)
      r.warn.push('fs dibatasi ' + FS_LIMIT + ' kPa (batas lunak praktik) pada sebagian kedalaman.');
    if (qp > 20000)
      r.warn.push('qp = ' + (qp / 1000).toFixed(1) + ' MPa sangat tinggi — pastikan tiang benar-benar mencapai lapisan ini dan tinjau batas struktural penampang tiang.');
    if (Lp - 8 * D < 0)
      r.warn.push('Zona 8D di atas ujung terpotong permukaan (L < 8D) — qc2 dirata-rata dari 0.');
    r.warn.push('Kapasitas STRUKTURAL penampang tiang (bahan) tidak dicek di sini.');
    if (r.dc > 1) r.warn.push('D/C = ' + r.dc.toFixed(2) + ' > 1 — beban kerja melampaui Q izin.');

    return r;
  }

  /* ============================================================
     KANVAS — kiri: profil qc + tiang; kanan: bar Qs/Qp/Qu/Qall
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid || !r.pts.length) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Tempel data CPT untuk melihat profil.', w / 2, h / 2);
      return;
    }
    var line = css('--line');
    var splitX = Math.max(250, w * 0.55);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(splitX, 8); ctx.lineTo(splitX, h - 8); ctx.stroke();

    drawProfile(ctx, 0, 0, splitX, h, r);
    drawBars(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse && state.mouse.x < splitX) {
      var padT = 44, padB = 30, plotH = h - padT - padB;
      var zMaxD = Math.max(r.zMax, r.Lp + 4 * r.D) * 1.03;
      var my = state.mouse.y;
      if (my >= padT && my <= padT + plotH) {
        var zH = (my - padT) / plotH * zMaxD;
        var qcH = interpAt(r.pts, zH, 'qc');
        var fsH = r.fsrc === 'data' ? interpAt(r.pts, zH, 'fs') : (r.Rf / 100) * qcH;
        state.UI.canvasTip(ctx, {
          mx: state.mouse.x, my: my, w: w, h: h, topBand: 34,
          text: 'z=' + zH.toFixed(1) + ' m · qc ' + (qcH / 1000).toFixed(2) + ' MPa · fs ' + Math.min(fsH, FS_LIMIT).toFixed(0) + ' kPa'
        });
      }
    }
  }

  function drawProfile(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', line = css('--line');
    var padT = 44, padB = 30, padL = 60, padR = 16;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    if (plotW < 60 || plotH < 60) return;

    var zMaxD = Math.max(r.zMax, r.Lp + 4 * r.D) * 1.03;
    var qcMax = 1;
    r.pts.forEach(function (p) { qcMax = Math.max(qcMax, p.qc); });
    qcMax *= 1.1;
    var xOf = function (qc) { return x0 + padL + qc / qcMax * plotW; };
    var yOf = function (z) { return y0 + padT + z / zMaxD * plotH; };

    // grid
    ctx.strokeStyle = line; ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = dim;
    for (var gz = 0; gz <= zMaxD; gz += Math.max(1, Math.ceil(zMaxD / 8))) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(x0 + padL, yOf(gz)); ctx.lineTo(x0 + W - padR, yOf(gz)); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.fillText(gz.toFixed(0) + ' m', x0 + padL - 5, yOf(gz) + 3);
    }
    ctx.textAlign = 'left'; ctx.fillText('qc (MPa)', x0 + W - padR - 52, y0 + padT - 6);

    // jendela ujung: 8D atas (sage) & 4D bawah (sky)
    ctx.fillStyle = sage; ctx.globalAlpha = 0.16;
    ctx.fillRect(x0 + padL, yOf(Math.max(0, r.Lp - 8 * r.D)), plotW, yOf(r.Lp) - yOf(Math.max(0, r.Lp - 8 * r.D)));
    ctx.fillStyle = sky; ctx.globalAlpha = 0.14;
    ctx.fillRect(x0 + padL, yOf(r.Lp), plotW, yOf(Math.min(zMaxD, r.Lp + 4 * r.D)) - yOf(r.Lp));
    ctx.globalAlpha = 1;

    // kurva qc
    ctx.strokeStyle = amber; ctx.lineWidth = 1.8;
    ctx.beginPath();
    r.pts.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(xOf(p.qc), yOf(p.z)); else ctx.lineTo(xOf(p.qc), yOf(p.z));
    });
    ctx.stroke();

    // tiang
    var pileW = Math.max(7, plotW * 0.05);
    var px = x0 + padL + plotW * 0.1;
    ctx.fillStyle = dim; ctx.globalAlpha = 0.85;
    ctx.fillRect(px - pileW / 2, yOf(0), pileW, yOf(r.Lp) - yOf(0));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.strokeRect(px - pileW / 2, yOf(0), pileW, yOf(r.Lp) - yOf(0));
    // panah ujung
    ctx.strokeStyle = sky; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(px, yOf(r.Lp) + 12); ctx.lineTo(px, yOf(r.Lp) + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 4, yOf(r.Lp) + 7); ctx.lineTo(px, yOf(r.Lp) + 2); ctx.lineTo(px + 4, yOf(r.Lp) + 7); ctx.stroke();

    ctx.fillStyle = dim; ctx.textAlign = 'left'; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText((r.shape === 'circle' ? 'Ø' : '□') + r.D.toFixed(2) + ' m · L=' + r.Lp.toFixed(1) + ' m', px + pileW, yOf(0) + 12);
    ctx.fillStyle = sky;
    ctx.fillText('qp ' + (r.qp / 1000).toFixed(1) + ' MPa', px + pileW, yOf(r.Lp) + 8);
  }

  function drawBars(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', bad = css('--bad') || '#e5694f';
    var padT = 46, padB = 26, padL = 86, padR = 60;
    var availW = W - padL - padR;
    if (availW < 40) return;

    var rows = [
      { label: 'Qs selimut', val: r.Qs, col: sage },
      { label: 'Qp ujung', val: r.Qp, col: sky },
      { label: 'Qu ultimit', val: r.Qu, col: dim },
      { label: 'Q izin', val: r.Qall, col: amber, gov: true }
    ];
    var maxV = 1;
    rows.forEach(function (b) { maxV = Math.max(maxV, b.val); });
    maxV = Math.max(maxV, r.Pw);

    var n = rows.length, areaH = H - padT - padB, rowH = areaH / n, barH = Math.max(8, Math.min(20, rowH * 0.5));
    ctx.font = '10px "JetBrains Mono", monospace';
    rows.forEach(function (b, i) {
      var yMid = y0 + padT + i * rowH + rowH / 2, y = yMid - barH / 2;
      var len = b.val / maxV * availW;
      ctx.fillStyle = b.col;
      ctx.globalAlpha = b.gov ? 1 : 0.6;
      ctx.fillRect(x0 + padL, y, Math.max(2, len), barH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.gov ? amber : dim; ctx.textAlign = 'right';
      ctx.fillText(b.label, x0 + padL - 8, yMid + 3);
      ctx.fillStyle = ink; ctx.textAlign = 'left';
      ctx.fillText(b.val.toFixed(0), x0 + padL + Math.max(2, len) + 5, yMid + 3);
      if (r.Pw > 0) {
        var dx = x0 + padL + r.Pw / maxV * availW;
        ctx.strokeStyle = bad; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(dx, y - 3); ctx.lineTo(dx, y + barH + 3); ctx.stroke();
      }
    });
    ctx.fillStyle = dim; ctx.textAlign = 'left';
    ctx.fillText('kN · garis merah = P kerja', x0 + padL, y0 + H - 10);
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('cp-style')) return;
    var s = document.createElement('style');
    s.id = 'cp-style';
    s.textContent =
      '.cp-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.cp-canvas{position:relative;flex:1 1 48%;min-height:240px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.cp-res{flex:1 1 52%;overflow-y:auto;padding:16px 22px 30px}' +
      '.cp-ta{width:100%;min-height:130px;resize:vertical;background:var(--bg2);color:var(--ink);' +
        'border:1px solid var(--line);border-radius:8px;padding:8px 10px;' +
        'font:11px "JetBrains Mono",monospace;line-height:1.5}' +
      '.cp-ta:focus{outline:none;border-color:var(--amber)}';
    document.head.appendChild(s);
  }

  var SAMPLE =
    '# z(m)  qc(kg/cm2)  fs(kg/cm2)\n0.0  5  0.1\n1.0  10  0.2\n2.0  15  0.3\n3.0  25  0.5\n' +
    '4.0  35  0.6\n5.0  50  0.8\n6.0  60  0.9\n7.0  75  1.0\n8.0  90  1.1\n9.0  110  1.2\n' +
    '10.0  130  1.3\n11.0  150  1.4\n12.0  175  1.5\n13.0  200  1.6\n14.0  220  1.7\n16.0  250  1.8';

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Daya Dukung Tiang (CPT)'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas aksial tiang tunggal langsung dari data sondir/CPT: ' +
      'ujung Schmertmann (rata-rata 4D bawah & 8D atas) + selimut dari fs sondir atau rasio gesek Rf. ' +
      'Q izin = Qp/3 + Qs/5 (praktik sondir).'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Data CPT' },
      { type: 'segment', id: 'unit', label: 'Satuan qc (fs mengikuti)', value: 'kgcm2', options: [
        { value: 'kgcm2', label: 'kg/cm²' }, { value: 'mpa', label: 'MPa (fs kPa)' } ] },

      { type: 'group', label: 'Tiang' },
      { type: 'segment', id: 'shape', label: 'Penampang', value: 'circle', options: [
        { value: 'circle', label: 'Bulat Ø' }, { value: 'square', label: 'Persegi □' } ] },
      { type: 'number', id: 'D', label: 'Diameter / sisi D', unit: 'm', value: 0.4, min: 0.1, step: 0.05 },
      { type: 'number', id: 'Lp', label: 'Panjang tertanam L', unit: 'm', value: 12, min: 1, step: 0.5 },

      { type: 'group', label: 'Selimut' },
      { type: 'segment', id: 'fsrc', label: 'Sumber gesekan', value: 'data', options: [
        { value: 'data', label: 'Kolom fs data' }, { value: 'rf', label: 'Estimasi Rf·qc' } ] },
      { type: 'number', id: 'Rf', label: 'Rasio gesek Rf', unit: '%', value: 1.0, min: 0.2, max: 8, step: 0.1, hint: 'Pasir ± 0,5–1%, lanau 1–2%, lempung 2–5%. Dipakai bila tanpa kolom fs.' },

      { type: 'group', label: 'Faktor Keamanan & Beban' },
      { type: 'number', id: 'FSp', label: 'FS ujung', value: 3, min: 1.5, step: 0.5 },
      { type: 'number', id: 'FSs', label: 'FS selimut', value: 5, min: 1.5, step: 0.5 },
      { type: 'number', id: 'Pw', label: 'Beban kerja P (opsional)', unit: 'kN', value: 0, min: 0, step: 10 }
    ];

    var results = UI.el('div', 'cp-res');
    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); }, ID);
    state.form = form;

    var taWrap = UI.el('div', 'ck-field');
    taWrap.appendChild(UI.el('label', null, 'Data z–qc–fs (satu titik per baris)'));
    var ta = document.createElement('textarea');
    ta.className = 'cp-ta';
    ta.spellcheck = false;
    ta.value = SAMPLE;
    taWrap.appendChild(ta);
    taWrap.appendChild(UI.el('div', 'ck-field-hint',
      'Format: kedalaman, qc, lalu fs (opsional), dipisah spasi/tab/koma. Baris # dilewati.'));
    form.root.querySelector('.ck-grp').appendChild(taWrap);
    state.ta = ta;
    state.onTa = function () { update(form.getValues(), results); };
    ta.addEventListener('input', state.onTa);

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    var work = UI.el('div', 'cp-work');
    var canvasHost = UI.el('div', 'cp-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Daya dukung tiang CPT');
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
    var pts = parseCPT(state.ta ? state.ta.value : '', vals.unit);
    var r = compute(vals, pts);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Daya dukung tiang CPT');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set((r.shape === 'circle' ? 'Ø' : '□') + r.D + ' m · L ' + r.Lp + ' m · Q,izin ' +
      r.Qall.toFixed(0) + ' kN');

    results.appendChild(UI.heroRow([
      { label: 'Q izin total', value: UI.fmt(r.Qall, 0), unit: 'kN' },
      { label: 'Qp ujung (ult)', value: UI.fmt(r.Qp, 0), unit: 'kN' },
      r.dc > 0
        ? { label: 'D/C = P/Qizin', value: UI.fmt(r.dc, 2), unit: r.dc <= 1 ? 'OK' : 'NG', tone: r.dc <= 1 ? 'ok' : 'bad' }
        : { label: 'Qs selimut (ult)', value: UI.fmt(r.Qs, 0), unit: 'kN' }
    ]));

    results.appendChild(UI.rhead('Tahanan ujung (Schmertmann 4D/8D)'));
    results.appendChild(UI.kv('qc1 (L → L+4D)', (r.qc1 / 1000).toFixed(2) + ' MPa'));
    results.appendChild(UI.kv('qc2 (L−8D → L)', (r.qc2 / 1000).toFixed(2) + ' MPa'));
    results.appendChild(UI.kv('qp = (qc1+qc2)/2', (r.qp / 1000).toFixed(2) + ' MPa = ' + (r.qp / KGCM2).toFixed(0) + ' kg/cm²'));
    results.appendChild(UI.kv('Ap', r.Ap.toFixed(4) + ' m²'));
    results.appendChild(UI.kv('Qp = qp·Ap', UI.fmt(r.Qp, 0) + ' kN'));

    results.appendChild(UI.rhead('Tahanan selimut (' + (r.fsrc === 'data' ? 'fs data sondir' : 'Rf ' + r.Rf + '% · qc') + ')'));
    results.appendChild(UI.kv('Keliling K', r.K.toFixed(3) + ' m'));
    results.appendChild(UI.kv('fs maks terpakai', UI.fmt(r.fsMax, 1) + ' kPa' + (r.capped ? ' (dibatasi ' + FS_LIMIT + ')' : '')));
    results.appendChild(UI.kv('Qs = Σ fs·K·Δz', UI.fmt(r.Qs, 0) + ' kN'));

    results.appendChild(UI.rhead('Kapasitas'));
    results.appendChild(UI.kv('Qu = Qp + Qs', UI.fmt(r.Qu, 0) + ' kN'));
    results.appendChild(UI.kv('Q izin (FS terpisah ' + r.FSp + '/' + r.FSs + ')', UI.fmt(r.Qall, 0) + ' kN', 'ok'));
    results.appendChild(UI.kv('Pembanding: Qu/2,5 (FS global)', UI.fmt(r.QallGlobal, 0) + ' kN'));
    if (r.dc > 0)
      results.appendChild(UI.kv('D/C = P/Q izin', UI.fmt(r.dc, 2), r.dc <= 1 ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'Metode langsung CPT. <b>Ujung</b>: Schmertmann–Nottingham disederhanakan — qp = rata-rata(qc 4D di bawah, ' +
      '8D di atas), tanpa jalur-minimum. <b>Selimut</b>: fs sleeve sondir (atau Rf·qc bila tanpa kolom fs), ' +
      'dibatasi ' + FS_LIMIT + ' kPa. <b>Q izin = Qp/FSp + Qs/FSs</b> (lazim 3 & 5 di praktik sondir Indonesia); ' +
      'pembanding FS global 2,5. 1 kg/cm² = 98,07 kPa. <b>TIDAK termasuk</b>: efisiensi kelompok, downdrag, ' +
      'tarik/lateral, penurunan, kapasitas struktural tiang, LCPC kc/α. Bandingkan dengan tool "Daya Dukung Tiang" ' +
      '(parameter tanah). Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).'));

    if (state.cv) state.cv.redraw();
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.4.0', RW = 62;
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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x').replace(/Ø/g, 'D').replace(/□/g, 'sq')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/Δ/g, 'd').replace(/Σ/g, 'sum')
      .replace(/α/g, 'alpha').replace(/→/g, '->').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('DAYA DUKUNG TIANG DARI CPT/SONDIR'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Schmertmann ujung + fs selimut', dt));
    L.push('');
    L.push(' TIANG & DATA'); L.push(ruleR('-'));
    L.push(rowR('Penampang', (r.shape === 'circle' ? 'Bulat D=' : 'Persegi s=') + numR(r.D, 2) + ' m'));
    L.push(rowR('Panjang tertanam L', numR(r.Lp, 1) + ' m'));
    L.push(rowR('Ap / K', numR(r.Ap, 4) + ' m2 / ' + numR(r.K, 3) + ' m'));
    L.push(rowR('Data CPT', r.nPts + ' titik, 0-' + numR(r.zMax, 1) + ' m'));
    L.push(rowR('Sumber selimut', r.fsrc === 'data' ? 'kolom fs sondir' : 'Rf ' + r.Rf + '% * qc'));
    L.push('');
    L.push(' TAHANAN UJUNG'); L.push(ruleR('='));
    L.push(rowR('qc1 (L..L+4D)', numR(r.qc1 / 1000, 2) + ' MPa'));
    L.push(rowR('qc2 (L-8D..L)', numR(r.qc2 / 1000, 2) + ' MPa'));
    L.push(rowR('qp = (qc1+qc2)/2', numR(r.qp / 1000, 2) + ' MPa'));
    L.push(rowR('Qp = qp*Ap', numR(r.Qp, 0) + ' kN'));
    L.push('');
    L.push(' TAHANAN SELIMUT'); L.push(ruleR('='));
    L.push(rowR('fs maks terpakai', numR(r.fsMax, 1) + ' kPa' + (r.capped ? ' (cap ' + FS_LIMIT + ')' : '')));
    L.push(rowR('Qs = sum fs*K*dz', numR(r.Qs, 0) + ' kN'));
    L.push('');
    L.push(' KAPASITAS'); L.push(ruleR('='));
    L.push(rowR('Qu = Qp + Qs', numR(r.Qu, 0) + ' kN'));
    L.push(rowR('>> Q IZIN (Qp/' + r.FSp + ' + Qs/' + r.FSs + ')', numR(r.Qall, 0) + ' kN'));
    L.push(rowR('   pembanding Qu/2.5', numR(r.QallGlobal, 0) + ' kN'));
    if (r.dc > 0) L.push(rowR('>> D/C (P=' + numR(r.Pw, 0) + ' kN)', numR(r.dc, 2) + (r.dc <= 1 ? ' OK' : ' NG')));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' BELUM: efisiensi kelompok, downdrag, tarik/lateral, penurunan,');
    L.push(' kapasitas struktural, LCPC. Verifikasi oleh insinyur (SNI 8460).');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(' ' + rep('=', RW));
    return L.map(tolatin);
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals, parseCPT(state.ta.value, vals.unit));
    if (!r.valid) { UI.toast('Lengkapi data CPT dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'CPT-Tiang_D' + r.D + '_L' + r.Lp + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Daya Dukung Tiang (CPT)', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
      if (state.ta && state.onTa) state.ta.removeEventListener('input', state.onTa);
      state = {};
    }
  };
})();
