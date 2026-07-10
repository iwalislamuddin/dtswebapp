/* ============================================================
   Civil Tools — modules/beam-flexure/module.js  (Tier 2, kanvas 2D)
   Kapasitas lentur nominal balok persegi — SNI 2847:2019
   Penampang bertulangan tunggal / rangkap, blok tegangan persegi ekuivalen.

   Metode (SNI 2847:2019):
     - β1 (Ps. 22.2.2.4.3):
         f'c ≤ 28        -> 0.85
         28 < f'c < 55   -> 0.85 - 0.05·(f'c-28)/7
         f'c ≥ 55        -> 0.65
     - Blok tegangan persegi: Cc = 0.85·f'c·b·a,  a = β1·c   (Ps. 22.2.2.4.1)
     - Kesetimbangan gaya diselesaikan umum (bisection) dengan
         fs  = min(fy, Es·0.003·(d - c)/c)     (baja tarik)
         fs' = min(fy, Es·0.003·(c - d')/c)     (baja tekan, jika ada)
       sehingga berlaku untuk under- maupun over-reinforced, tunggal/rangkap.
     - φ dari regangan tarik neto εt = 0.003·(dt - c)/c (Ps. 21.2.2, sengkang ikat):
         εt ≥ 0.005      -> tension-controlled, φ = 0.90
         εt ≤ εty        -> compression-controlled, φ = 0.65
         di antaranya    -> transisi, φ = 0.65 + 0.25·(εt-εty)/(0.005-εty)
     - Tulangan minimum (Ps. 9.6.1.2):
         As,min = max(0.25·√f'c/fy , 1.4/fy)·b·d
     - Batas daktilitas komponen lentur: εt ≥ 0.004 (Ps. 9.3.3.1).

   Es = 200000 MPa. Perpindahan beton oleh baja tekan diabaikan (konservatif,
   konsisten dengan kesetimbangan yang dipakai).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'beam-flexure';
  var Es = 200000; // MPa

  var BARS = [10, 13, 16, 19, 22, 25, 29, 32, 36];
  function barOptions() {
    return BARS.map(function (v) { return { value: v, label: 'D' + v + ' (' + v + ' mm)' }; });
  }

  var state = {};

  function Asof(n, db) { return (n > 0 && db > 0) ? n * Math.PI / 4 * db * db : 0; }
  function beta1(fc) {
    if (fc <= 28) return 0.85;
    if (fc >= 55) return 0.65;
    return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
  }
  // Sebar n batang ke nLay lapis; sisa ditaruh di lapis bawah (indeks 0 = bawah).
  function distribute(n, nLay) {
    var base = Math.floor(n / nLay), rem = n % nLay, arr = [];
    for (var i = 0; i < nLay; i++) arr.push(base + (i < rem ? 1 : 0));
    return arr;
  }

  // Gaya sisa kesetimbangan pada kedalaman sumbu netral c (N).
  // F(c) naik monoton dari negatif (c→0) ke positif (c→d): akar tunggal.
  function forceResidual(c, p) {
    var a = p.b1 * c;
    var fs = Math.min(p.fy, Math.max(0, Es * 0.003 * (p.d - c) / c));      // tarik
    var fsc = p.Asc > 0 ? Math.min(p.fy, Math.max(0, Es * 0.003 * (c - p.dp) / c)) : 0; // tekan
    return 0.85 * p.fc * p.b * a + p.Asc * fsc - p.As * fs;
  }

  function solveC(p) {
    var lo = 1e-4, hi = p.d * 0.999;
    // pastikan tanda berlawanan; jika F(hi) masih negatif (sangat over-reinforced), longgarkan
    if (forceResidual(hi, p) < 0) hi = p.d;
    for (var i = 0; i < 80; i++) {
      var mid = 0.5 * (lo + hi);
      if (forceResidual(mid, p) > 0) hi = mid; else lo = mid;
    }
    return 0.5 * (lo + hi);
  }

  function compute(v) {
    var fc = v.fc, fy = v.fy, b = v.b, h = v.h, cc = v.cc, ds = parseFloat(v.ds);
    var n1 = v.n1, db1 = parseFloat(v.db1);
    var nLay = Math.max(1, parseInt(v.nLay, 10) || 1);
    var sv = (v.sv > 0) ? v.sv : 25;                        // spasi bersih antar-lapis (mm)
    var doubly = (v.doubly === 'yes');
    var n2 = v.n2, db2 = parseFloat(v.db2);

    var r = { warn: [], valid: false };
    if (!(fc > 0) || !(fy > 0) || !(b > 0) || !(h > 0) || !(n1 > 0) || !(db1 > 0)) return r;

    if (nLay > n1) nLay = n1;                               // tak lebih banyak lapis dari batang
    var layers = distribute(n1, nLay);                     // batang per lapis (indeks 0 = bawah)
    var As = Asof(n1, db1);
    var Asc = doubly ? Asof(n2, db2) : 0;

    // Kedalaman tiap lapis dari serat tekan atas; centroid grup → tinggi efektif d.
    var yBot0 = cc + ds + db1 / 2;                          // pusat lapis terbawah dari serat bawah
    var pitch = db1 + sv;                                    // jarak pusat antar-lapis
    var sumN = 0, sumNy = 0;
    for (var li = 0; li < layers.length; li++) {
      if (!layers[li]) continue;
      var depthTop = h - (yBot0 + li * pitch);             // kedalaman pusat lapis dari atas
      sumN += layers[li]; sumNy += layers[li] * depthTop;
    }
    var d = sumNy / sumN;                                    // tinggi efektif = centroid grup
    var dt = h - yBot0;                                      // lapis terbawah (baja tarik ekstrem) → utk εt
    var dp = cc + ds + (Asc > 0 ? db2 / 2 : 0);             // pusat baja tekan dari serat atas
    if (!(d > 0) || !(dt > 0)) { r.warn.push('Tinggi efektif ≤ 0 — periksa h, selimut, sengkang, atau jumlah lapis.'); return r; }
    r.valid = true;

    var b1 = beta1(fc);
    var ey = fy / Es;
    var p = { fc: fc, fy: fy, b: b, b1: b1, As: As, Asc: Asc, d: d, dp: dp };
    var c = solveC(p);
    var a = b1 * c;

    var fs = Math.min(fy, Es * 0.003 * (d - c) / c);        // tegangan baja tarik (di centroid)
    var fsc = Asc > 0 ? Math.min(fy, Math.max(0, Es * 0.003 * (c - dp) / c)) : 0;
    var et = 0.003 * (dt - c) / c;                          // regangan tarik neto di baja ekstrem (dt)
    var esc = Asc > 0 ? 0.003 * (c - dp) / c : 0;

    // φ (sengkang ikat)
    var phi;
    if (et >= 0.005) phi = 0.90;
    else if (et <= ey) phi = 0.65;
    else phi = 0.65 + 0.25 * (et - ey) / (0.005 - ey);

    // Mn (N·mm) — konsisten dengan kesetimbangan
    var McC = 0.85 * fc * b * a * (d - a / 2);
    var McS = Asc > 0 ? Asc * fsc * (d - dp) : 0;
    var Mn = McC + McS;
    var phiMn = phi * Mn;

    var Asmin = Math.max(0.25 * Math.sqrt(fc) / fy, 1.4 / fy) * b * d;
    var rho = As / (b * d);

    // Spasi bersih horizontal — lapis dengan batang terbanyak yang menentukan (Ps. 25.2.1).
    var nmax = Math.max.apply(null, layers);
    var sClear = (nmax > 1) ? (b - 2 * (cc + ds) - nmax * db1) / (nmax - 1) : null;
    var sMin = Math.max(25, db1);                           // ≥ maks(25 mm, db); 4/3·d_agregat diabaikan

    r.fc = fc; r.fy = fy; r.b = b; r.h = h; r.cc = cc; r.ds = ds; r.sv = sv;
    r.n1 = n1; r.db1 = db1; r.nLay = nLay; r.layers = layers;
    r.doubly = doubly; r.n2 = n2; r.db2 = db2;
    r.As = As; r.Asc = Asc; r.d = d; r.dt = dt; r.dp = dp;
    r.b1 = b1; r.ey = ey; r.c = c; r.a = a;
    r.fs = fs; r.fsc = fsc; r.et = et; r.esc = esc;
    r.steelYield = (fs >= fy - 0.5);
    r.compYield = Asc > 0 ? (esc >= ey) : null;
    r.phi = phi; r.Mn = Mn; r.McC = McC; r.McS = McS; r.phiMn = phiMn;
    r.MnkNm = Mn / 1e6; r.phiMnkNm = phiMn / 1e6;
    r.Asmin = Asmin; r.rho = rho; r.belowMin = As < Asmin - 1e-6;
    r.nmax = nmax; r.sClear = sClear; r.sMin = sMin;

    // klasifikasi & peringatan
    if (et >= 0.005) r.cls = 'Terkendali tarik (daktail)';
    else if (et <= ey) r.cls = 'Terkendali tekan (getas)';
    else r.cls = 'Transisi';

    if (et < 0.004) r.warn.push('εt = ' + et.toFixed(4) + ' < 0,004 — TIDAK memenuhi Ps. 9.3.3.1 untuk komponen lentur. Kurangi tulangan tarik / tambah tinggi / pakai tulangan tekan.');
    else if (et < 0.005) r.warn.push('Penampang berada di zona transisi (φ < 0,90). Untuk desain daktail, targetkan εt ≥ 0,005.');
    if (r.belowMin) r.warn.push('As = ' + Math.round(As) + ' mm² < As,min = ' + Math.round(Asmin) + ' mm² (Ps. 9.6.1.2).');
    if (Asc > 0 && !r.compYield) r.warn.push('Baja tekan belum leleh (fs\' = ' + fsc.toFixed(0) + ' MPa < fy); kontribusinya tereduksi.');
    if (sClear !== null && sClear < 0) r.warn.push(nmax + ' batang D' + db1 + ' TIDAK MUAT dalam satu lapis (lebar bersih kurang ' + Math.round(-sClear) + ' mm). Tambah lapis, perbesar b, atau kurangi batang.');
    else if (sClear !== null && sClear < sMin) r.warn.push('Spasi bersih antar-tulangan = ' + sClear.toFixed(0) + ' mm < minimum ' + Math.round(sMin) + ' mm (Ps. 25.2.1: maks 25 mm & db). Tambah lapis atau perbesar b.');

    return r;
  }

  /* ---------- CSS scoped module ---------- */
  function injectStyle() {
    if (document.getElementById('bf-style')) return;
    var s = document.createElement('style');
    s.id = 'bf-style';
    s.textContent =
      '.bf-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.bf-canvas{position:relative;flex:1 1 52%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.bf-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Kapasitas Lentur Balok (φMn)'));
    panel.appendChild(UI.el('div', 'sub', 'Balok persegi bertulangan tunggal/rangkap — SNI 2847:2019. Blok tegangan persegi ekuivalen, φ dari regangan tarik neto. Diagram penampang & regangan otomatis.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'bf-work');
    var canvasHost = UI.el('div', 'bf-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang + blok tegangan + regangan');
    var results = UI.el('div', 'bf-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Material' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu baja', unit: 'MPa', value: 420, min: 240, step: 10 },

      { type: 'group', label: 'Penampang' },
      { type: 'number', id: 'b', label: 'b — lebar', unit: 'mm', value: 300, min: 100, step: 10 },
      { type: 'number', id: 'h', label: 'h — tinggi total', unit: 'mm', value: 500, min: 150, step: 10 },
      { type: 'number', id: 'cc', label: 'Selimut bersih', unit: 'mm', value: 40, min: 15, step: 5 },
      { type: 'number', id: 'ds', label: 'Sengkang — diameter', unit: 'mm', value: 10, min: 0, step: 1 },

      { type: 'group', label: 'Tulangan Tarik (bawah)' },
      { type: 'number', id: 'n1', label: 'Jumlah batang (total)', unit: '', value: 3, min: 1, step: 1 },
      { type: 'select', id: 'db1', label: 'Diameter', value: 19, options: barOptions() },
      { type: 'segment', id: 'nLay', label: 'Jumlah lapis', value: 1, options: [{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }] },
      { type: 'number', id: 'sv', label: 'Spasi bersih antar-lapis', unit: 'mm', value: 25, min: 25, step: 5 },

      { type: 'group', label: 'Tulangan Tekan (atas)' },
      { type: 'segment', id: 'doubly', label: 'Tulangan rangkap', value: 'no', options: [{ value: 'no', label: 'Tidak' }, { value: 'yes', label: 'Ya' }] },
      { type: 'number', id: 'n2', label: "Jumlah batang tekan", unit: '', value: 2, min: 0, step: 1 },
      { type: 'select', id: 'db2', label: 'Diameter tekan', value: 16, options: barOptions() }
    ];

    function syncVisibility(vals) {
      var showComp = vals.doubly === 'yes';
      ['n2', 'db2'].forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = showComp ? '' : 'none';
      });
      var showLayers = (parseInt(vals.nLay, 10) || 1) > 1;
      var sv = form.fields.sv;
      if (sv) sv.node.closest('.ck-field').style.display = showLayers ? '' : 'none';
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      syncVisibility(vals);
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
    repGrp.appendChild(btnPdf);
    repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

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

    syncVisibility(form.getValues());
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Penampang + blok tegangan + regangan');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi f\'c, fy, b, h, dan tulangan tarik untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set('phiMn ' + UI.fmt(r.phiMnkNm, 1) + ' kN.m · ' + r.cls);

    var heroState = (r.et >= 0.005 && !r.belowMin) ? '' : (r.et < 0.004 || r.belowMin ? 'bad' : '');
    results.appendChild(UI.hero('φMn (φ = ' + UI.fmt(r.phi, 2) + ')', UI.fmt(r.phiMnkNm, 1), 'kN·m'));
    results.appendChild(UI.el('div', 'ck-empty',
      'Mn = ' + UI.fmt(r.MnkNm, 1) + ' kN·m · ' + r.cls + ' · εt = ' + r.et.toFixed(4) + '.'));

    results.appendChild(UI.rhead('Geometri & tulangan'));
    results.appendChild(UI.kv('Tul. tarik', r.n1 + ' D' + r.db1 + (r.nLay > 1 ? ' — ' + r.nLay + ' lapis (' + r.layers.slice().reverse().join('/') + ')' : ' — 1 lapis')));
    results.appendChild(UI.kv('d (centroid, tinggi efektif)', UI.fmt(r.d, 0) + ' mm'));
    if (r.nLay > 1) results.appendChild(UI.kv('dt (baja tarik terluar)', UI.fmt(r.dt, 0) + ' mm'));
    results.appendChild(UI.kv('As (tarik)', UI.fmt(r.As, 0) + ' mm²'));
    if (r.doubly && r.Asc > 0) {
      results.appendChild(UI.kv("A's (tekan)", UI.fmt(r.Asc, 0) + ' mm²'));
      results.appendChild(UI.kv("d' (pusat tul. tekan)", UI.fmt(r.dp, 0) + ' mm'));
    }
    if (r.sClear !== null) {
      var spOk = r.sClear >= r.sMin;
      results.appendChild(UI.kv('Spasi bersih (lapis ' + r.nmax + ' batang)',
        (r.sClear < 0 ? 'tak muat' : UI.fmt(r.sClear, 0) + ' mm') + ' / min ' + Math.round(r.sMin) + ' mm',
        spOk ? 'ok' : 'bad'));
    }
    results.appendChild(UI.kv('ρ = As/(b·d)', UI.fmt(r.rho * 100, 3) + ' %'));

    results.appendChild(UI.rhead('Analisis penampang'));
    results.appendChild(UI.kv('β1', UI.fmt(r.b1, 3)));
    results.appendChild(UI.kv('c (sumbu netral)', UI.fmt(r.c, 1) + ' mm'));
    results.appendChild(UI.kv('a = β1·c', UI.fmt(r.a, 1) + ' mm'));
    results.appendChild(UI.kv('fs (baja tarik)', UI.fmt(r.fs, 0) + ' MPa', r.steelYield ? 'ok' : 'bad'));
    if (r.doubly && r.Asc > 0) results.appendChild(UI.kv("fs' (baja tekan)", UI.fmt(r.fsc, 0) + ' MPa', r.compYield ? 'ok' : ''));
    results.appendChild(UI.kv('εt (regangan tarik neto)', r.et.toFixed(4)));
    results.appendChild(UI.kv('εty (leleh)', r.ey.toFixed(4)));

    results.appendChild(UI.rhead('Kapasitas'));
    results.appendChild(UI.kv('Mn (nominal)', UI.fmt(r.MnkNm, 1) + ' kN·m'));
    results.appendChild(UI.kv('φ', UI.fmt(r.phi, 3)));
    results.appendChild(UI.kv('φMn (desain)', UI.fmt(r.phiMnkNm, 1) + ' kN·m'));

    results.appendChild(UI.rhead('Kontrol'));
    results.appendChild(UI.kv('As ≥ As,min', r.belowMin
      ? 'GAGAL — As,min = ' + UI.fmt(r.Asmin, 0) + ' mm²'
      : 'OK (As,min = ' + UI.fmt(r.Asmin, 0) + ' mm²)', r.belowMin ? 'bad' : 'ok'));
    results.appendChild(UI.kv('εt ≥ 0,004 (daktilitas)', r.et >= 0.004 ? 'OK' : 'GAGAL', r.et >= 0.004 ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Klasifikasi φ', r.cls, r.et >= 0.005 ? 'ok' : (r.et < 0.004 ? 'bad' : '')));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan — penampang daktail dan memenuhi tulangan minimum.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 2847:2019 — blok tegangan persegi (Ps. 22.2.2.4), φ dari εt (Ps. 21.2.2, sengkang ikat: 0,65–0,90), ' +
      'As,min (Ps. 9.6.1.2), εt ≥ 0,004 (Ps. 9.3.3.1), spasi bersih (Ps. 25.2.1–25.2.2). ' +
      'Multi-lapis: gaya tarik dianggap terpusat di <b>centroid grup</b> (tinggi efektif d), sedangkan ' +
      '<b>εt dihitung di baja tarik terluar (dt)</b>. Batang tersebar merata per lapis; selimut samping = cc+sengkang. ' +
      'Penampang <b>persegi</b>, Es = 200.000 MPa, perpindahan beton oleh baja tekan diabaikan, spasi minimum ' +
      'mengabaikan syarat 4/3·ukuran agregat. Verifikasi tata letak batang & geser terpisah sebelum gambar kerja.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar penampang + regangan ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), line = css('--line');

    if (!r || !r.valid) {
      ctx.fillStyle = faint;
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data penampang untuk melihat diagram.', w / 2, h / 2);
      return;
    }

    // ---- Layout: penampang (kiri) + diagram regangan (kanan) ----
    // padT lega agar judul kanvas tak berdempet; dimensi b dipindah ke BAWAH penampang.
    var padT = 40, padB = 62, padL = 72;
    var drawH = h - padT - padB;
    var secBoxW = Math.min(w * 0.40, 260);
    // skala proporsional: fit tinggi & lebar penampang dalam kotak
    var sc = Math.min(drawH / r.h, secBoxW / r.b);
    var secW = r.b * sc, secH = r.h * sc;
    var x0 = padL, y0 = padT + (drawH - secH) / 2;   // pojok kiri-atas penampang
    var yTop = y0, yBot = y0 + secH;

    var cPx = r.c * sc, aPx = r.a * sc, dPx = r.d * sc, dpPx = r.dp * sc, dtPx = r.dt * sc;
    var yNA = yTop + cPx, yA = yTop + aPx, yD = yTop + dPx, yDp = yTop + dpPx, yDt = yTop + dtPx;

    // ---- Blok beton ----
    ctx.fillStyle = css('--panel-solid'); ctx.globalAlpha = 0.9;
    ctx.fillRect(x0, yTop, secW, secH); ctx.globalAlpha = 1;
    // zona tekan (di atas garis 'a') diarsir amber lembut
    ctx.fillStyle = amber; ctx.globalAlpha = 0.16;
    ctx.fillRect(x0, yTop, secW, aPx); ctx.globalAlpha = 1;
    ctx.strokeStyle = line; ctx.lineWidth = 1.3;
    ctx.strokeRect(x0, yTop, secW, secH);

    // garis blok tegangan a
    ctx.strokeStyle = amber; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, yA); ctx.lineTo(x0 + secW, yA); ctx.stroke();
    // sumbu netral c (putus-putus)
    ctx.strokeStyle = dim; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x0 - 8, yNA); ctx.lineTo(x0 + secW + 8, yNA); ctx.stroke();
    ctx.setLineDash([]);

    // ---- Batang tulangan (inset = selimut samping nyata: cc+ds+db/2) ----
    function drawRow(n, db, ycen) {
      if (!(n > 0) || !(db > 0)) return;
      var rad = Math.max(3, Math.min(db * sc / 2, 9));
      var insetPx = (r.cc + r.ds + db / 2) * sc;   // pusat batang tepi ke tepi penampang
      var span = Math.max(0, secW - 2 * insetPx);
      for (var i = 0; i < n; i++) {
        var bx = (n === 1) ? x0 + secW / 2 : x0 + insetPx + span * (i / (n - 1));
        ctx.beginPath(); ctx.arc(bx, ycen, rad, 0, Math.PI * 2);
        ctx.fillStyle = ink; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = css('--bg2'); ctx.stroke();
      }
    }
    // tarik: gambar tiap lapis pada kedalamannya (indeks 0 = lapis terbawah)
    var pitchPx = (r.db1 + r.sv) * sc;
    for (var li = 0; li < r.layers.length; li++) {
      if (!r.layers[li]) continue;
      drawRow(r.layers[li], r.db1, yDt - li * pitchPx);
    }
    if (r.doubly && r.Asc > 0) drawRow(r.n2, r.db2, yDp);   // tekan (atas)

    // ---- Dimensi b (BAWAH penampang, agar tak berdempet judul) ----
    dimLine(ctx, x0, x0 + secW, yBot + 24, dim, 'b = ' + Math.round(r.b));
    // ---- Dimensi d (ke centroid) & h (kiri) ----
    dimVert(ctx, x0 - 18, yTop, yD, amber, 'd ' + Math.round(r.d));
    dimVert(ctx, x0 - 44, yTop, yBot, faint, 'h ' + Math.round(r.h));
    // label a & c di sisi kanan
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = amber; ctx.fillText('a=' + r.a.toFixed(0), x0 + secW + 12, yA + 3);
    ctx.fillStyle = dim; ctx.fillText('c=' + r.c.toFixed(0), x0 + secW + 12, yNA + 3);

    // ---- Diagram regangan (kanan) ----
    var sx0 = x0 + secW + 96;
    var sxMax = Math.min(w - 24, sx0 + 120);
    var strainW = sxMax - sx0;
    if (strainW > 40) {
      // segitiga regangan berbagi sumbu vertikal yang sama (top→bottom = 0.003→εt di baja)
      var eTop = 0.003, eBot = r.et;                // eBot bisa < 0? tarik positif kanan
      var eMax = Math.max(eTop, Math.abs(eBot), 0.001);
      var kx = strainW / eMax;
      // garis vertikal referensi (regangan nol) di sumbu netral
      var zeroX = sx0;
      ctx.strokeStyle = faint; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zeroX, yTop - 6); ctx.lineTo(zeroX, yBot + 6); ctx.stroke();
      // profil regangan: dari (−0.003·kx? ) di serat atas tekan ke (+et) di baja tarik, linier, nol di NA
      var xTopStrain = zeroX - eTop * kx;    // tekan → kiri dari NA-vertical? gunakan kanan=tarik
      // Buat: tekan digambar ke KIRI (negatif), tarik ke KANAN (positif), nol tepat di yNA.
      ctx.strokeStyle = amber; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(zeroX - eTop * kx, yTop);   // atas: tekan (kiri)
      ctx.lineTo(zeroX, yNA);                 // nol di sumbu netral
      ctx.lineTo(zeroX + eBot * kx, yDt);     // baja tarik terluar (kanan)
      ctx.stroke();
      // isi segitiga tipis
      ctx.fillStyle = amber; ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(zeroX, yTop); ctx.lineTo(zeroX - eTop * kx, yTop);
      ctx.lineTo(zeroX, yNA); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(zeroX, yNA); ctx.lineTo(zeroX + eBot * kx, yDt);
      ctx.lineTo(zeroX, yDt); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // label regangan
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = dim; ctx.textAlign = 'right';
      ctx.fillText('εcu 0.003', zeroX - eTop * kx - 4, yTop - 3);
      ctx.textAlign = 'left';
      ctx.fillStyle = (r.et >= 0.005 ? amber : dim);
      ctx.fillText('εt ' + r.et.toFixed(4), zeroX + eBot * kx + 4, yDt + 3);
      ctx.fillStyle = faint; ctx.textAlign = 'center';
      ctx.fillText('REGANGAN', zeroX, yBot + 42);
    }

    // Readout φMn kini tampil di label .cap (HTML) — tidak digambar di pita atas kanvas.

    // ---- Hover: sorot klasifikasi (pill ber-posisi aman via helper bersama) ----
    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: r.cls + '  (phi=' + r.phi.toFixed(2) + ')'
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
  function dimLine(ctx, x1, x2, y, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    [[x1, 1], [x2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(a[0], y); ctx.lineTo(a[0] + a[1] * 6, y - 3); ctx.lineTo(a[0] + a[1] * 6, y + 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(a[0], y - 5); ctx.lineTo(a[0], y + 5); ctx.stroke();
    });
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = css('--bg'); ctx.fillRect((x1 + x2) / 2 - tw / 2 - 4, y - 8, tw + 8, 16);
    ctx.fillStyle = color; ctx.fillText(label, (x1 + x2) / 2, y + 4);
  }
  function dimVert(ctx, x, y1, y2, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    [[y1, 1], [y2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(x, a[0]); ctx.lineTo(x - 3, a[0] + a[1] * 6); ctx.lineTo(x + 3, a[0] + a[1] * 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 5, a[0]); ctx.lineTo(x + 5, a[0]); ctx.stroke();
    });
    ctx.save(); ctx.translate(x - 10, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ---------- Report monospace (DOS-style) ---------- */
  var APP_VER = 'v0.1.0';
  var RW = 62;

  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value;
    var l = label + ' ', v = ' ' + value;
    var d = RW - l.length - v.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + v;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/ε/g, 'e').replace(/β/g, 'beta').replace(/ρ/g, 'rho').replace(/φ/g, 'phi')
      .replace(/·/g, '*').replace(/√/g, 'sqrt').replace(/²/g, '2').replace(/′/g, "'").replace(/’/g, "'")
      .replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[×]/g, 'x')
      .replace(/[^\x20-\x7E]/g, '?');
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

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());

    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('KAPASITAS LENTUR BALOK (phiMn)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019', dt));
    L.push('');
    L.push(' DESKRIPSI');
    L.push(ruleR('-'));
    L.push(' Kapasitas lentur nominal balok persegi bertulangan');
    L.push(' tunggal/rangkap. Blok tegangan persegi ekuivalen;');
    L.push(' phi dihitung dari regangan tarik neto (et).');
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR("f'c  Mutu beton", numR(r.fc, 1) + ' MPa'));
    L.push(rowR('fy   Mutu baja', numR(r.fy, 1) + ' MPa'));
    L.push(rowR('b    Lebar', numR(r.b, 0) + ' mm'));
    L.push(rowR('h    Tinggi total', numR(r.h, 0) + ' mm'));
    L.push(rowR('Selimut bersih', numR(r.cc, 0) + ' mm'));
    L.push(rowR('Sengkang', 'D' + numR(r.ds, 0)));
    L.push(rowR('Tul. tarik', r.n1 + ' D' + r.db1));
    L.push(rowR('  Lapis', r.nLay + (r.nLay > 1 ? ' (' + r.layers.slice().reverse().join('/') + ', bawah->atas ' + r.layers.join('/') + ')' : '')));
    if (r.nLay > 1) L.push(rowR('  Spasi bersih antar-lapis', numR(r.sv, 0) + ' mm'));
    if (r.doubly && r.Asc > 0) L.push(rowR('Tul. tekan', r.n2 + ' D' + r.db2));
    L.push('');
    L.push(' PERHITUNGAN');
    L.push(ruleR('-'));
    L.push(rowR('As  (tarik)', numR(r.As, 0) + ' mm2'));
    if (r.doubly && r.Asc > 0) {
      L.push(rowR("A's (tekan)", numR(r.Asc, 0) + ' mm2'));
      L.push(rowR("d'  pusat tul. tekan", numR(r.dp, 0) + ' mm'));
    }
    L.push(rowR('d   Tinggi efektif (centroid)', numR(r.d, 0) + ' mm'));
    if (r.nLay > 1) L.push(rowR('dt  Baja tarik terluar', numR(r.dt, 0) + ' mm'));
    L.push(rowR('rho = As/(b*d)', numR(r.rho * 100, 3) + ' %'));
    if (r.sClear !== null) L.push(rowR('Spasi bersih (min ' + numR(r.sMin, 0) + ' mm)', (r.sClear < 0 ? 'TAK MUAT' : numR(r.sClear, 0) + ' mm')));
    L.push(rowR('beta1', numR(r.b1, 3)));
    L.push(rowR('c   Sumbu netral', numR(r.c, 1) + ' mm'));
    L.push(rowR('a = beta1*c', numR(r.a, 1) + ' mm'));
    L.push(rowR('fs  Baja tarik', numR(r.fs, 0) + ' MPa' + (r.steelYield ? ' (leleh)' : ' (blm leleh)')));
    if (r.doubly && r.Asc > 0) L.push(rowR("fs' Baja tekan", numR(r.fsc, 0) + ' MPa' + (r.compYield ? ' (leleh)' : '')));
    L.push(rowR('et  Regangan tarik neto', numR(r.et, 4)));
    L.push(rowR('ety Regangan leleh', numR(r.ey, 4)));
    L.push('');
    L.push(' Mn = 0.85*fc*b*a*(d - a/2)');
    if (r.doubly && r.Asc > 0) L.push("      + A's*fs'*(d - d')");
    L.push('');
    L.push(' OUTPUT');
    L.push(ruleR('='));
    L.push(rowR('Mn  (nominal)', numR(r.MnkNm, 1) + ' kN.m'));
    L.push(rowR('phi', numR(r.phi, 3)));
    L.push(rowR('>> phiMn (desain)', numR(r.phiMnkNm, 1) + ' kN.m'));
    L.push(rowR('Klasifikasi', r.cls));
    L.push(ruleR('='));
    L.push('');
    L.push(' KONTROL');
    L.push(ruleR('-'));
    L.push(rowR('As >= As,min (' + numR(r.Asmin, 0) + ' mm2)', r.belowMin ? 'GAGAL' : 'OK'));
    L.push(rowR('et >= 0.004 (Ps.9.3.3.1)', r.et >= 0.004 ? 'OK' : 'GAGAL'));
    if (r.sClear !== null) L.push(rowR('Spasi bersih >= ' + numR(r.sMin, 0) + ' mm (Ps.25.2.1)', r.sClear >= r.sMin ? 'OK' : 'GAGAL'));

    var notes = r.warn.slice();
    if (notes.length) {
      L.push('');
      L.push(' CATATAN');
      L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(centerR('Alat bantu; verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L.map(tolatin);
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast('Lengkapi data penampang & tulangan dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Kapasitas-Balok_' + Math.round(r.b) + 'x' + Math.round(r.h) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Kapasitas Balok (φMn)', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null };
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
