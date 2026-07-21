/* ============================================================
   Civil Tools — modules/weld-connection/module.js  (Tier 2, kanvas 2D)
   Sambungan Las Sudut (Fillet) — SNI 1729:2020 (adopsi AISC 360-16) Ps. J2, DFBK.

   Cakupan:
   - Kuat las sudut (J2.4): Rn = 0,60·FEXX·Awe, Awe = 0,707·w·Lw (throat efektif)
     φ = 0,75. Opsi faktor arah beban: kd = (1,0 + 0,50·sin^1,5 θ)
     (θ = 90° transversal → 1,5 ; θ = 0° longitudinal → 1,0).
   - Reduksi las ujung-panjang (J2.2b): bila Lw/w > 100 (las longitudinal
     end-loaded), β = 1,2 − 0,002·(Lw/w) ≤ 1,0 (dan ≥ 0,60 pada Lw/w=300).
   - Logam dasar (J4.2): leleh geser φRn = 1,00·0,60·Fy·Agv dan
     fraktur geser φRn = 0,75·0,60·Fu·Anv, Agv = Anv = t·Lw.
   - Batas ukuran las (J2.2b): w_min Tabel J2.4 (berdasar t tertipis),
     w_maks = t (t<6 mm) / t−2 mm (t≥6 mm); panjang efektif min 4w.

   TIDAK termasuk: las tumpul (groove/CJP/PJP), grup las eksentris (metode ICR),
   las pada kombinasi throat berbeda, pengecekan kombinasi kd untuk grup multi-arah
   (J2.4(c)), fatik. Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'weld-connection';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  // ukuran las minimum (Tabel J2.4) — berdasar tebal bagian tertipis (mm)
  function weldMin(t) {
    if (t <= 6) return 3;
    if (t <= 13) return 5;
    if (t <= 19) return 6;
    return 8;
  }

  /* ============================================================
     KALKULASI (SNI 1729:2020 Ps. J2/J4, DFBK)
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var Fexx = num(v.Fexx) || (v.electrode === 'e60' ? 413 : v.electrode === 'e80' ? 551 : 482);
    if (v.electrode !== 'custom') Fexx = (v.electrode === 'e60' ? 413 : v.electrode === 'e80' ? 551 : 482);
    var w = num(v.w);                       // kaki las (mm)
    var Lw = num(v.Lw);                     // panjang efektif TOTAL (mm)
    var theta = Math.max(0, Math.min(90, num(v.theta)));   // derajat
    var useDir = (v.useDir === 'yes');
    var endLoaded = (v.endLoaded === 'yes');
    var t = num(v.t), Fy = num(v.Fy), Fu = num(v.Fu);      // logam dasar (bagian tertipis)
    var Ru = num(v.Ru);                     // kN beban terfaktor

    r.electrode = v.electrode; r.Fexx = Fexx; r.w = w; r.Lw = Lw; r.theta = theta;
    r.useDir = useDir; r.endLoaded = endLoaded; r.t = t; r.Fy = Fy; r.Fu = Fu; r.Ru = Ru;

    /* --- throat & luas efektif --- */
    var te = 0.707 * w;                     // throat efektif (mm)
    var Awe = te * Lw;                      // mm²
    r.te = te; r.Awe = Awe;

    /* --- faktor arah kd --- */
    var kd = useDir ? (1.0 + 0.50 * Math.pow(Math.sin(theta * Math.PI / 180), 1.5)) : 1.0;
    r.kd = kd;

    /* --- reduksi ujung-panjang β (J2.2b) — las longitudinal end-loaded --- */
    var beta = 1.0, ratioLw = w > 0 ? Lw / w : 0;
    if (endLoaded && ratioLw > 100) {
      beta = Math.max(0.6, Math.min(1.0, 1.2 - 0.002 * ratioLw));
      if (ratioLw > 300) beta = 0.6;
    }
    r.beta = beta; r.ratioLw = ratioLw;

    /* --- kuat las (J2.4) --- */
    var Rnw = 0.60 * Fexx * kd * beta * Awe / 1000;   // kN
    var phiRnw = 0.75 * Rnw;
    r.Rnw = Rnw; r.phiRnw = phiRnw;

    /* --- logam dasar (J4.2) --- */
    var baseOk = (t > 0 && Fy > 0 && Fu > 0);
    var Agv = t * Lw;
    var phiRyBase = 1.00 * 0.60 * Fy * Agv / 1000;    // leleh geser
    var phiRuBase = 0.75 * 0.60 * Fu * Agv / 1000;    // fraktur geser
    var phiBase = baseOk ? Math.min(phiRyBase, phiRuBase) : Infinity;
    r.baseOk = baseOk; r.Agv = Agv; r.phiRyBase = phiRyBase; r.phiRuBase = phiRuBase; r.phiBase = phiBase;
    r.baseGov = phiRyBase <= phiRuBase ? 'leleh' : 'fraktur';

    /* --- desain = min(las, logam dasar) --- */
    var phiRn = Math.min(phiRnw, phiBase);
    r.phiRn = phiRn;
    r.weldGoverns = phiRnw <= phiBase;
    r.dc = Ru > 0 ? (phiRn > 0 ? Ru / phiRn : Infinity) : 0;
    r.valid = true;

    /* --- batas ukuran & panjang --- */
    var wMin = baseOk ? weldMin(t) : 3;
    var wMax = baseOk ? (t < 6 ? t : t - 2) : Infinity;
    r.wMin = wMin; r.wMax = wMax;
    if (baseOk && w < wMin)
      r.warn.push('Ukuran las w = ' + w + ' mm < minimum Tabel J2.4 = ' + wMin + ' mm (untuk t = ' + t + ' mm) — TIDAK memenuhi.');
    if (baseOk && isFinite(wMax) && w > wMax)
      r.warn.push('Ukuran las w = ' + w + ' mm > maksimum sepanjang tepi = ' + wMax.toFixed(0) + ' mm (J2.2b) — kurangi w atau pakai groove.');
    if (w > 0 && Lw < 4 * w)
      r.warn.push('Panjang las Lw = ' + Lw + ' mm < 4·w = ' + (4 * w) + ' mm — panjang efektif dianggap 25% Lw (J2.2b); hasil di atas TIDAK berlaku.');
    if (endLoaded && ratioLw > 100)
      r.warn.push('Las longitudinal end-loaded dengan Lw/w = ' + ratioLw.toFixed(0) + ' > 100 — reduksi β = ' + beta.toFixed(2) + ' diterapkan.');
    if (!baseOk)
      r.warn.push('Data logam dasar (t, Fy, Fu) belum lengkap — cek logam dasar dilewati; kapasitas = las saja.');
    if (useDir && theta > 0)
      r.warn.push('Faktor arah kd = ' + kd.toFixed(2) + ' hanya sah untuk las sudut SATU arah beban seragam — jangan pakai untuk grup las multi-arah tanpa J2.4(c).');
    if (r.dc > 1)
      r.warn.push('D/C = ' + r.dc.toFixed(2) + ' > 1 — perbesar w / perpanjang Lw' + (r.weldGoverns ? '' : ' (logam dasar menentukan: perbesar t)') + '.');

    return r;
  }

  /* ============================================================
     KANVAS — kiri: sketsa sambungan T fillet; kanan: bar kapasitas
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat las.', w / 2, h / 2);
      return;
    }
    var splitX = Math.max(210, w * 0.42);
    var line = css('--line');
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(splitX, 8); ctx.lineTo(splitX, h - 8); ctx.stroke();

    drawJoint(ctx, 0, 0, splitX, h, r);
    drawBars(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: 34,
        text: 'φRn ' + r.phiRn.toFixed(1) + ' kN (' + (r.weldGoverns ? 'las' : 'logam dasar') + ')' +
          (r.Ru > 0 ? ' · D/C ' + r.dc.toFixed(2) : '')
      });
    }
  }

  // Potongan sambungan T dengan las sudut dua sisi + label kaki w
  function drawJoint(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sky = css('--sky') || '#30bced', line = css('--line'), bad = css('--bad') || '#e5694f';
    var padT = 44, padB = 30;
    var cx = x0 + W / 2, cy = y0 + padT + (H - padT - padB) / 2;
    var scale = Math.min((W - 70) / 200, (H - padT - padB) / 170);
    if (scale <= 0) return;

    var tPl = Math.max(8, Math.min(22, (r.t || 10) * 1.2)) * scale; // tebal visual
    var flangeW = 170 * scale, stemH = 70 * scale, weldS = Math.max(6, Math.min(18, r.w * 1.4)) * scale;

    // pelat dasar (horizontal) & badan (vertikal)
    ctx.fillStyle = line; ctx.globalAlpha = 0.35;
    ctx.fillRect(cx - flangeW / 2, cy + stemH / 2, flangeW, tPl);
    ctx.fillRect(cx - tPl / 2, cy - stemH / 2 - tPl, tPl, stemH + tPl + stemH * 0.0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = dim; ctx.lineWidth = 1.1;
    ctx.strokeRect(cx - flangeW / 2, cy + stemH / 2, flangeW, tPl);
    ctx.strokeRect(cx - tPl / 2, cy - stemH / 2 - tPl, tPl, stemH + tPl);

    // segitiga las kiri & kanan (amber)
    var byTop = cy + stemH / 2;                       // permukaan pelat dasar
    ctx.fillStyle = amber; ctx.globalAlpha = 0.85;
    ctx.beginPath();                                   // kiri
    ctx.moveTo(cx - tPl / 2, byTop);
    ctx.lineTo(cx - tPl / 2 - weldS, byTop);
    ctx.lineTo(cx - tPl / 2, byTop - weldS);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();                                   // kanan
    ctx.moveTo(cx + tPl / 2, byTop);
    ctx.lineTo(cx + tPl / 2 + weldS, byTop);
    ctx.lineTo(cx + tPl / 2, byTop - weldS);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // panah beban pada badan (arah sesuai θ: 90 = tegak lurus sumbu las → horizontal di sketsa)
    if (r.Ru > 0) {
      var thRad = r.theta * Math.PI / 180;
      var axStart = { x: cx, y: cy - stemH / 2 - tPl - 24 };
      ctx.strokeStyle = bad; ctx.fillStyle = bad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(axStart.x, axStart.y); ctx.lineTo(cx, cy - stemH / 2 - tPl - 4); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - stemH / 2 - tPl - 11); ctx.lineTo(cx, cy - stemH / 2 - tPl - 4);
      ctx.lineTo(cx + 5, cy - stemH / 2 - tPl - 11); ctx.stroke();
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('Ru ' + r.Ru.toFixed(0) + ' kN · θ=' + r.theta.toFixed(0) + '°', cx + 9, axStart.y + 8);
    }

    // label kaki las
    ctx.strokeStyle = sky; ctx.fillStyle = sky; ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.beginPath();
    ctx.moveTo(cx - tPl / 2 - weldS - 6, byTop);
    ctx.lineTo(cx - tPl / 2 - weldS - 14, byTop);
    ctx.stroke();
    ctx.fillText('w=' + r.w + ' mm', cx - tPl / 2 - weldS - 16, byTop + 3);

    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('fillet 2 sisi (ilustrasi) · Lw total ' + r.Lw + ' mm', cx, y0 + H - 12);
  }

  // Bar kapasitas: las vs logam dasar vs demand
  function drawBars(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, bad = css('--bad') || '#e5694f';
    var padT = 46, padB = 26, padL = 128, padR = 62;
    var availW = W - padL - padR;
    if (availW < 40) return;

    var rows = [{ label: 'Las (J2.4)', cap: r.phiRnw, gov: r.weldGoverns }];
    if (r.baseOk) {
      rows.push({ label: 'Dasar-leleh (J4.2)', cap: r.phiRyBase, gov: !r.weldGoverns && r.baseGov === 'leleh' });
      rows.push({ label: 'Dasar-fraktur', cap: r.phiRuBase, gov: !r.weldGoverns && r.baseGov === 'fraktur' });
    }
    var maxV = 1;
    rows.forEach(function (b) { maxV = Math.max(maxV, b.cap); });
    maxV = Math.max(maxV, r.Ru);

    var n = rows.length, areaH = H - padT - padB, rowH = areaH / n, barH = Math.max(8, Math.min(20, rowH * 0.5));
    ctx.font = '10px "JetBrains Mono", monospace';
    rows.forEach(function (b, i) {
      var yMid = y0 + padT + i * rowH + rowH / 2, y = yMid - barH / 2;
      var len = b.cap / maxV * availW;
      ctx.fillStyle = b.gov ? amber : sage;
      ctx.globalAlpha = b.gov ? 1 : 0.55;
      ctx.fillRect(x0 + padL, y, Math.max(2, len), barH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.gov ? amber : dim; ctx.textAlign = 'right';
      ctx.fillText(b.label, x0 + padL - 8, yMid + 3);
      ctx.fillStyle = ink; ctx.textAlign = 'left';
      ctx.fillText(b.cap.toFixed(0), x0 + padL + Math.max(2, len) + 5, yMid + 3);
      if (r.Ru > 0) {
        var dx = x0 + padL + r.Ru / maxV * availW;
        ctx.strokeStyle = bad; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(dx, y - 3); ctx.lineTo(dx, y + barH + 3); ctx.stroke();
      }
    });
    ctx.fillStyle = dim; ctx.textAlign = 'left';
    ctx.fillText('kN · garis merah = Ru', x0 + padL, y0 + H - 10);
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('wc-style')) return;
    var s = document.createElement('style');
    s.id = 'wc-style';
    s.textContent =
      '.wc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.wc-canvas{position:relative;flex:1 1 44%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.wc-res{flex:1 1 56%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Sambungan Las'));
    panel.appendChild(UI.el('div', 'sub', 'Kuat las sudut (fillet): throat efektif 0,707·w, faktor arah beban, ' +
      'reduksi las panjang, dan cek logam dasar (leleh/fraktur geser) — SNI 1729:2020 (AISC 360-16) Ps. J2 & J4, DFBK.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Las' },
      { type: 'select', id: 'electrode', label: 'Elektroda', value: 'e70', options: [
        { value: 'e60', label: 'E60XX (FEXX 413 MPa)' },
        { value: 'e70', label: 'E70XX (FEXX 482 MPa)' },
        { value: 'e80', label: 'E80XX (FEXX 551 MPa)' },
        { value: 'custom', label: 'Kustom' } ] },
      { type: 'number', id: 'Fexx', label: 'FEXX kustom', unit: 'MPa', value: 482, min: 100, step: 1, hint: 'Dipakai hanya bila elektroda = Kustom.' },
      { type: 'number', id: 'w', label: 'Ukuran kaki las w', unit: 'mm', value: 6, min: 2, step: 1 },
      { type: 'number', id: 'Lw', label: 'Panjang efektif total Lw', unit: 'mm', value: 200, min: 10, step: 10, hint: 'Jumlah seluruh segmen las yang memikul beban.' },
      { type: 'number', id: 'theta', label: 'Sudut beban θ', unit: '°', value: 0, min: 0, max: 90, step: 5, hint: '0° = sejajar sumbu las (longitudinal), 90° = tegak lurus (transversal).' },
      { type: 'segment', id: 'useDir', label: 'Faktor arah (1+0,5sin¹·⁵θ)', value: 'yes', options: [
        { value: 'yes', label: 'Pakai' }, { value: 'no', label: 'Abaikan (konservatif)' } ] },
      { type: 'segment', id: 'endLoaded', label: 'Longitudinal end-loaded', value: 'no', options: [
        { value: 'no', label: 'Tidak' }, { value: 'yes', label: 'Ya (cek β)' } ] },

      { type: 'group', label: 'Logam Dasar (bagian tertipis)' },
      { type: 'number', id: 't', label: 'Tebal t', unit: 'mm', value: 10, min: 0, step: 1 },
      { type: 'number', id: 'Fy', label: 'Fy', unit: 'MPa', value: 240, min: 0, step: 10, hint: 'BJ37: Fy 240, Fu 370. BJ41: 250/410. BJ50: 290/500.' },
      { type: 'number', id: 'Fu', label: 'Fu', unit: 'MPa', value: 370, min: 0, step: 10 },

      { type: 'group', label: 'Beban Terfaktor (DFBK)' },
      { type: 'number', id: 'Ru', label: 'Beban las Ru', unit: 'kN', value: 150, min: 0, step: 5 }
    ];

    var results = UI.el('div', 'wc-res');
    var form = UI.buildForm(panel, schema, function (vals) {
      update(vals, results);
    }, ID);
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

    var work = UI.el('div', 'wc-work');
    var canvasHost = UI.el('div', 'wc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Sambungan las');
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

    state.cap.set('w' + r.w + ' × ' + r.Lw + ' mm · φRn ' + UI.fmt(r.phiRn, 1) + ' kN' +
      (r.Ru > 0 ? ' · D/C ' + (isFinite(r.dc) ? r.dc.toFixed(2) : '—') : ''));

    results.appendChild(UI.heroRow([
      { label: 'φRn desain — ' + (r.weldGoverns ? 'las' : 'logam dasar'), value: UI.fmt(r.phiRn, 1), unit: 'kN' },
      { label: 'φRn las', value: UI.fmt(r.phiRnw, 1), unit: 'kN', tone: r.weldGoverns ? 'ok' : '' },
      (r.Ru > 0)
        ? { label: 'D/C = Ru/φRn', value: isFinite(r.dc) ? UI.fmt(r.dc, 2) : '—', unit: r.dc <= 1 ? 'OK' : 'NG', tone: r.dc <= 1 ? 'ok' : 'bad' }
        : (r.baseOk
          ? { label: 'φRn logam dasar', value: UI.fmt(r.phiBase, 1), unit: 'kN', tone: !r.weldGoverns ? 'ok' : '' }
          : { label: 'FEXX', value: r.Fexx, unit: 'MPa' })
    ]));

    results.appendChild(UI.rhead('Kuat las sudut (J2.4)'));
    results.appendChild(UI.kv('FEXX', r.Fexx + ' MPa'));
    results.appendChild(UI.kv('Throat efektif te = 0,707·w', UI.fmt(r.te, 2) + ' mm'));
    results.appendChild(UI.kv('Awe = te·Lw', UI.fmt(r.Awe, 0) + ' mm²'));
    results.appendChild(UI.kv('Faktor arah kd (θ=' + r.theta.toFixed(0) + '°)', r.kd.toFixed(3)));
    if (r.beta < 1) results.appendChild(UI.kv('Reduksi β (Lw/w=' + r.ratioLw.toFixed(0) + ')', r.beta.toFixed(2), 'bad'));
    results.appendChild(UI.kv('Rn = 0,6·FEXX·kd·β·Awe', UI.fmt(r.Rnw, 1) + ' kN'));
    results.appendChild(UI.kv('φRn las (φ=0,75)', UI.fmt(r.phiRnw, 1) + ' kN', r.weldGoverns ? 'ok' : ''));

    if (r.baseOk) {
      results.appendChild(UI.rhead('Logam dasar (J4.2), Agv = t·Lw = ' + UI.fmt(r.Agv, 0) + ' mm²'));
      results.appendChild(UI.kv('Leleh geser φRn = 1,0·0,6·Fy·Agv', UI.fmt(r.phiRyBase, 1) + ' kN'));
      results.appendChild(UI.kv('Fraktur geser φRn = 0,75·0,6·Fu·Agv', UI.fmt(r.phiRuBase, 1) + ' kN'));
      results.appendChild(UI.kv('φRn logam dasar (min)', UI.fmt(r.phiBase, 1) + ' kN', !r.weldGoverns ? 'ok' : ''));
    }

    results.appendChild(UI.rhead('Batas ukuran (J2.2b)'));
    results.appendChild(UI.kv('w minimum (t=' + r.t + ' mm)', r.wMin + ' mm', r.w >= r.wMin ? 'ok' : 'bad'));
    results.appendChild(UI.kv('w maksimum tepi', isFinite(r.wMax) ? r.wMax.toFixed(0) + ' mm' : '—',
      (isFinite(r.wMax) && r.w > r.wMax) ? 'bad' : 'ok'));
    results.appendChild(UI.kv('Panjang min 4·w', (4 * r.w) + ' mm', r.Lw >= 4 * r.w ? 'ok' : 'bad'));

    if (r.Ru > 0) {
      results.appendChild(UI.rhead('Rasio pemanfaatan'));
      results.appendChild(UI.kv('D/C = Ru/φRn', UI.fmt(r.dc, 2), r.dc <= 1 ? 'ok' : 'bad'));
      results.appendChild(UI.kv('Kebutuhan panjang (w tetap)', UI.fmt(r.Lw * Math.max(1, r.dc), 0) + ' mm'));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1729:2020 (adopsi AISC 360-16) Ps. J2.4 & J4.2, DFBK. Las <b>sudut (fillet)</b> beban seragam satu arah, ' +
      'throat efektif 0,707·w (SMAW). Faktor arah kd=(1+0,5·sin<sup>1,5</sup>θ) opsional; reduksi β untuk las ' +
      'longitudinal end-loaded Lw/w&gt;100. Logam dasar dicek geser pada bidang leleh/fraktur t·Lw. ' +
      '<b>TIDAK termasuk</b>: las tumpul (groove), grup las eksentris (ICR), kombinasi multi-arah J2.4(c), fatik. ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x').replace(/°/g, 'deg')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/θ/g, 'theta')
      .replace(/φ/g, 'phi').replace(/β/g, 'beta').replace(/¹|⁵|·/g, '').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('SAMBUNGAN LAS SUDUT (SNI 1729:2020 Ps. J2)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('DFBK, fillet weld', dt));
    L.push('');
    L.push(' KONFIGURASI'); L.push(ruleR('-'));
    L.push(rowR('Elektroda / FEXX', (r.electrode || '-').toUpperCase() + ' / ' + r.Fexx + ' MPa'));
    L.push(rowR('Kaki las w / Lw total', r.w + ' / ' + r.Lw + ' mm'));
    L.push(rowR('Sudut beban theta', numR(r.theta, 0) + ' deg'));
    L.push(rowR('Throat te / Awe', numR(r.te, 2) + ' mm / ' + numR(r.Awe, 0) + ' mm2'));
    L.push(rowR('Logam dasar t/Fy/Fu', numR(r.t, 0) + ' mm / ' + numR(r.Fy, 0) + ' / ' + numR(r.Fu, 0) + ' MPa'));
    L.push('');
    L.push(' KUAT LAS (J2.4)'); L.push(ruleR('='));
    L.push(rowR('kd arah', numR(r.kd, 3)));
    if (r.beta < 1) L.push(rowR('beta end-loaded', numR(r.beta, 2)));
    L.push(rowR('Rn = 0.6*FEXX*kd*beta*Awe', numR(r.Rnw, 1) + ' kN'));
    L.push(rowR('phi*Rn las (0.75)', numR(r.phiRnw, 1) + ' kN'));
    if (r.baseOk) {
      L.push('');
      L.push(' LOGAM DASAR (J4.2)'); L.push(ruleR('='));
      L.push(rowR('Leleh geser (1.0*0.6*Fy*Agv)', numR(r.phiRyBase, 1) + ' kN'));
      L.push(rowR('Fraktur geser (0.75*0.6*Fu*Agv)', numR(r.phiRuBase, 1) + ' kN'));
    }
    L.push(ruleR('='));
    L.push(rowR('>> phi*Rn DESAIN (' + (r.weldGoverns ? 'las' : 'logam dasar') + ')', numR(r.phiRn, 1) + ' kN'));
    if (r.Ru > 0) L.push(rowR('>> D/C = Ru/phiRn', numR(r.dc, 2) + (r.dc <= 1 ? ' OK' : ' NG')));
    L.push(ruleR('='));
    L.push('');
    L.push(' BATAS UKURAN (J2.2b)'); L.push(ruleR('-'));
    L.push(rowR('w min / maks', r.wMin + ' / ' + (isFinite(r.wMax) ? numR(r.wMax, 0) : '-') + ' mm'));
    L.push(rowR('Panjang min 4w', (4 * r.w) + ' mm'));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Fillet satu arah beban. BELUM: groove, grup eksentris (ICR),');
    L.push(' kombinasi multi-arah J2.4(c), fatik. Verifikasi oleh insinyur.');
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
    var base = 'Sambungan-Las_w' + r.w + 'x' + r.Lw + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Sambungan Las', category: 'Sambungan', needsCanvas: true, needsRenderer: false },

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
