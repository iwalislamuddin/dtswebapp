/* ============================================================
   Civil Tools — modules/lateral-broms/module.js  (Tier 2, kanvas 2D)
   KAPASITAS LATERAL TIANG — METODE BROMS (1964)

   Kapasitas lateral ultimit tiang tunggal, formulasi rigid-plastic /
   sendi plastis. Kapasitas = MIN( kegagalan tanah [tiang pendek/kaku],
   leleh lentur tiang [tiang panjang/lentur] ).

   Tanah:
   - LEMPUNG (undrained, cu): reaksi tanah p_u = 9·cu·D, nol dari 0–1,5D.
   - PASIR (cohesionless): p_u = 3·Kp·γ'·z·D, Kp = tan²(45+φ/2).

   Kepala tiang: BEBAS (free) rotasi | JEPIT (fixed, dikekang pile cap).

   Lempung (D = diameter, e = tinggi beban di atas muka tanah):
   - Bebas, pendek: f² + (4e+3D+2L)f − (L−1,5D)² = 0 ; Hu = 9cuD·f
   - Bebas, panjang: My = Hu(e+1,5D+0,5f), f = Hu/(9cuD)
   - Jepit, pendek: Hu = 9cuD(L−1,5D)
   - Jepit, panjang: 2My = Hu(e+1,5D+0,5f)

   Pasir:
   - Bebas, pendek: Hu = 0,5·Kp·γ'·D·L³/(e+L)
   - Bebas, panjang: My = Hu(e+0,667f), f = 0,816·√(Hu/(Kp·γ'·D))
   - Jepit, pendek: Hu = 1,5·Kp·γ'·D·L²
   - Jepit, panjang: 2My = Hu(e+0,667f)

   Catatan: defleksi kerja (serviceability) tidak dihitung di sini —
   gunakan tool "Analisis P-Y". Verifikasi oleh insinyur.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'lateral-broms';
  var APP_VER = 'v0.5.0';

  var state = {};

  /* ================= PERHITUNGAN ================= */
  function compute(v) {
    var r = { warn: [], valid: true, soil: v.soil, head: v.head };
    var D = v.D / 1000;                      // mm → m
    var L = v.L, e = v.e, My = v.My;
    if (!(D > 0) || !(L > 0) || !(e >= 0) || !(My > 0)) { r.valid = false; return r; }
    r.D = D; r.L = L; r.e = e; r.My = My;

    if (v.soil === 'clay') {
      var cu = v.cu;
      if (!(cu > 0)) { r.valid = false; return r; }
      if (L <= 1.5 * D) { r.valid = false; r.warn.push('L harus > 1,5·D (zona reaksi nol atas).'); return r; }
      r.cu = cu;
      r.k = 9 * cu * D;                        // kN/m per m (reaksi tanah/panjang)
      computeClay(r);
    } else {
      var phi = v.phi, gam = v.gam;
      if (!(phi > 0) || !(gam > 0)) { r.valid = false; return r; }
      r.phi = phi; r.gam = gam;
      r.Kp = Math.pow(Math.tan(Math.PI / 4 + phi * Math.PI / 360), 2);
      computeSand(r);
    }
    return r;
  }

  function computeClay(r) {
    var D = r.D, L = r.L, e = r.e, k = r.k, My = r.My;
    if (r.head === 'free') {
      // pendek (rotasi kaku)
      var A = 4 * e + 3 * D + 2 * L;
      var f = (-A + Math.sqrt(A * A + 4 * Math.pow(L - 1.5 * D, 2))) / 2;
      r.Hshort = k * f;
      r.fShort = f;
      r.rot = (f + 1.5 * D + L) / 2;           // titik rotasi (untuk gambar)
      // panjang (leleh): 0.5/k·H² + (e+1.5D)H − My = 0
      var b = e + 1.5 * D;
      r.Hlong = k * (-b + Math.sqrt(b * b + 2 * My / k));
    } else {
      r.Hshort = k * (L - 1.5 * D);
      r.MfixShort = r.Hshort * e + k * (L - 1.5 * D) * (1.5 * D + L) / 2;
      var b2 = e + 1.5 * D;
      r.Hlong = k * (-b2 + Math.sqrt(b2 * b2 + 4 * My / k));
    }
    finalize(r);
  }

  function computeSand(r) {
    var D = r.D, L = r.L, e = r.e, My = r.My, Kp = r.Kp, g = r.gam;
    var coef = Kp * g * D;                      // 3·coef·z·... base; p_u=3·Kp·γ'·z·D
    if (r.head === 'free') {
      r.Hshort = 0.5 * Kp * g * D * Math.pow(L, 3) / (e + L);
      r.fShort = 0.816 * Math.sqrt(r.Hshort / coef);
      // panjang: My = e·H + (0.5443/√coef)·H^1.5  → cari akar (bisection pada u=√H)
      r.Hlong = solveSandLong(e, My, coef, 1);
    } else {
      r.Hshort = 1.5 * Kp * g * D * L * L;
      r.MfixShort = r.Hshort * (e + 2 * L / 3);
      r.Hlong = solveSandLong(e, My, coef, 2);
    }
    finalize(r);
  }

  // Selesaikan  m·My = e·u² + (0.5443/√coef)·u³  untuk u=√H (m=1 bebas / 2 jepit)
  function solveSandLong(e, My, coef, m) {
    var c3 = 0.5443 / Math.sqrt(coef);
    function g(u) { return e * u * u + c3 * u * u * u - m * My; }
    var lo = 0, hi = 1;
    while (g(hi) < 0 && hi < 1e6) hi *= 2;
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2;
      if (g(mid) < 0) lo = mid; else hi = mid;
    }
    var u = (lo + hi) / 2;
    return u * u;
  }

  function finalize(r) {
    r.short = r.Hshort <= r.Hlong;
    r.Hu = Math.min(r.Hshort, r.Hlong);
    r.mode = r.short ? 'Tiang pendek — kegagalan tanah' : 'Tiang panjang — leleh lentur tiang';
    // depth ke momen maks & Mmax pada kapasitas governing
    if (r.soil === 'clay') {
      r.f = r.Hu / r.k;                          // f = Hu/(9cuD)
      r.zmax = 1.5 * r.D + r.f;
      r.Mmax = (r.head === 'free' || !r.short)
        ? r.Hu * (r.e + 1.5 * r.D + 0.5 * r.f)
        : r.MfixShort;
    } else {
      var coef = r.Kp * r.gam * r.D;
      r.f = 0.816 * Math.sqrt(r.Hu / coef);
      r.zmax = r.f;
      r.Mmax = (r.head === 'free' || !r.short)
        ? r.Hu * (r.e + 0.667 * r.f)
        : (r.MfixShort);
    }
    // untuk jepit pendek, momen jepit di kepala = MfixShort
    if (r.head === 'fixed' && r.short) r.Mhead = r.MfixShort;
    r.dcMom = r.Mmax / r.My;
    if (r.head === 'fixed' && r.short && r.MfixShort > r.My)
      r.warn.push('Momen jepit kepala (' + r.MfixShort.toFixed(0) + ' kNm) > My — sendi plastis terbentuk di kepala; kasus "panjang" yang menentukan.');
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('lb-style')) return;
    var s = document.createElement('style');
    s.id = 'lb-style';
    s.textContent =
      '.lb-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.lb-canvas{position:relative;flex:1 1 52%;min-height:240px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.lb-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Lateral Tiang — Broms'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas lateral ultimit tiang tunggal (lempung / pasir, kepala bebas / jepit) — metode Broms 1964.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'lb-work');
    var canvasHost = UI.el('div', 'lb-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Diagram tekanan tanah');
    var results = UI.el('div', 'lb-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Konfigurasi' },
      { type: 'segment', id: 'soil', label: 'Jenis tanah', value: 'clay',
        options: [{ value: 'clay', label: 'Lempung (cu)' }, { value: 'sand', label: 'Pasir (φ)' }] },
      { type: 'segment', id: 'head', label: 'Kepala tiang', value: 'free',
        options: [{ value: 'free', label: 'Bebas' }, { value: 'fixed', label: 'Jepit' }] },

      { type: 'group', label: 'Geometri tiang' },
      { type: 'number', id: 'D', label: 'D — diameter tiang', unit: 'mm', value: 500, min: 100, step: 50 },
      { type: 'number', id: 'L', label: 'L — panjang tertanam', unit: 'm', value: 10, min: 1, step: 0.5 },
      { type: 'number', id: 'e', label: 'e — tinggi beban di atas tanah', unit: 'm', value: 0, min: 0, step: 0.1 },
      { type: 'number', id: 'My', label: 'My — momen leleh/ultimit tiang', unit: 'kNm', value: 800, min: 1, step: 10 },

      { type: 'group', label: 'Parameter tanah' },
      { type: 'number', id: 'cu', label: 'cu — kohesi undrained', unit: 'kPa', value: 50, min: 1, step: 5 },
      { type: 'number', id: 'phi', label: "φ — sudut geser", unit: '°', value: 32, min: 20, max: 45, step: 1 },
      { type: 'number', id: 'gam', label: "γ' — berat isi efektif", unit: 'kN/m³', value: 9, min: 5, step: 0.5 }
    ];

    function syncVisibility(vals) {
      var clay = vals.soil === 'clay';
      var show = { cu: clay, phi: !clay, gam: !clay };
      Object.keys(show).forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = show[id] ? '' : 'none';
      });
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'soil') { syncVisibility(vals); vals = form.getValues(); }
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

  function dcState(dc) { return dc <= 1.0 ? 'ok' : 'bad'; }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Diagram tekanan tanah');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri, My, dan parameter tanah untuk menghitung.'));
      if (r.warn && r.warn.length)
        results.appendChild(UI.note('Periksa', r.warn.join('<br>')));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set((r.soil === 'clay' ? 'Lempung' : 'Pasir') + ' · kepala ' +
      (r.head === 'free' ? 'bebas' : 'jepit') + ' · Hu ' + UI.fmt(r.Hu, 0) + ' kN');

    results.appendChild(UI.heroRow([
      { label: 'Hu lateral ultimit', value: UI.fmt(r.Hu, 1), unit: 'kN' },
      { label: 'H tanah (pendek)', value: UI.fmt(r.Hshort, 1), unit: 'kN', tone: r.short ? 'ok' : '' },
      { label: 'H leleh (panjang)', value: UI.fmt(r.Hlong, 1), unit: 'kN', tone: r.short ? '' : 'ok' }
    ]));
    results.appendChild(UI.kv('Mode kegagalan', r.mode, r.short ? '' : 'ok'));

    results.appendChild(UI.rhead('Data'));
    results.appendChild(UI.kv('Tanah', r.soil === 'clay' ? ('Lempung · cu = ' + UI.fmt(r.cu, 0) + ' kPa') :
      ('Pasir · φ = ' + UI.fmt(r.phi, 0) + '° · γ\' = ' + UI.fmt(r.gam, 1) + ' kN/m³')));
    if (r.soil === 'sand') results.appendChild(UI.kv('Kp = tan²(45+φ/2)', UI.fmt(r.Kp, 2)));
    results.appendChild(UI.kv('D / L / e', UI.fmt(r.D * 1000, 0) + ' mm / ' + UI.fmt(r.L, 1) + ' m / ' + UI.fmt(r.e, 2) + ' m'));
    results.appendChild(UI.kv('My tiang', UI.fmt(r.My, 0) + ' kNm'));

    results.appendChild(UI.rhead('Dua moda (kapasitas = minimum)'));
    results.appendChild(UI.kv('H tanah (tiang pendek)', UI.fmt(r.Hshort, 1) + ' kN', r.short ? 'ok' : ''));
    results.appendChild(UI.kv('H leleh (tiang panjang)', UI.fmt(r.Hlong, 1) + ' kN', r.short ? '' : 'ok'));
    results.appendChild(UI.kv('→ Governing Hu', UI.fmt(r.Hu, 1) + ' kN', 'ok'));

    results.appendChild(UI.rhead('Momen'));
    results.appendChild(UI.kv('Kedalaman momen maks (dari tanah)', UI.fmt(r.zmax, 2) + ' m'));
    results.appendChild(UI.kv('Mmax pada Hu', UI.fmt(r.Mmax, 1) + ' kNm'));
    if (r.head === 'fixed' && r.short)
      results.appendChild(UI.kv('Momen jepit kepala', UI.fmt(r.MfixShort, 1) + ' kNm', dcState(r.MfixShort / r.My)));
    results.appendChild(UI.kv('Mmax / My', UI.fmt(r.dcMom, 2), dcState(r.dcMom)));

    if (r.warn.length)
      results.appendChild(UI.note('Peringatan',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));

    results.appendChild(UI.note('Metode & batasan',
      'Broms (1964), formulasi rigid-plastic/sendi plastis. Kapasitas = min(kegagalan tanah, leleh lentur). ' +
      'Terapkan faktor keamanan (SF ≈ 2–3 terhadap Hu, atau desain LRFD terpisah). Defleksi lateral kerja ' +
      '(serviceability) tidak dihitung di sini — gunakan tool <b>Analisis P-Y</b> untuk kurva beban–defleksi. ' +
      'Tanah berlapis / muka air kompleks di luar cakupan. Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ================= KANVAS (elevasi + diagram tekanan) ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint');
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data untuk melihat diagram.', w / 2, h / 2);
      return;
    }
    var padT = 46, padB = 34;
    var totH = r.L + r.e;                          // tinggi total model (m)
    var sc = (h - padT - padB) / totH;            // px per m (vertikal)
    var gy = padT + r.e * sc;                      // y muka tanah
    var cx = w * 0.42;                             // sumbu tiang
    var pileW = Math.max(10, r.D * sc);
    function zy(z) { return gy + z * sc; }         // z (m, dari tanah) → y layar

    // tanah (arsir tipis)
    ctx.fillStyle = css('--bg2'); ctx.globalAlpha = 0.5;
    ctx.fillRect(0, gy, w, h - gy - padB + 10);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    ctx.fillStyle = css('--ink-faint'); ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('muka tanah', 8, gy - 5);

    // diagram tekanan (sisi kanan tiang)
    var pmax = 60;                                 // px lebar diagram maksimum
    var x0 = cx + pileW / 2;
    if (r.soil === 'clay') {
      var top = zy(1.5 * r.D), bot = zy(r.head === 'free' ? Math.min(r.rot || r.L, r.L) : r.L);
      ctx.fillStyle = css('--amber'); ctx.globalAlpha = 0.22;
      ctx.fillRect(x0, top, pmax, bot - top);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = css('--amber'); ctx.lineWidth = 1.4;
      ctx.strokeRect(x0, top, pmax, bot - top);
      ctx.fillStyle = css('--amber'); ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('9·cu·D', x0 + 5, top - 4);
      // zona nol atas
      ctx.strokeStyle = css('--ink-faint'); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x0, zy(1.5 * r.D)); ctx.lineTo(x0, gy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css('--ink-faint'); ctx.fillText('1,5D nol', x0 + 5, zy(0.75 * r.D));
    } else {
      // segitiga 3·Kp·γ'·z·D (lebar ∝ z), sampai L
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + pmax, zy(r.L));
      ctx.lineTo(x0, zy(r.L));
      ctx.closePath();
      ctx.fillStyle = css('--amber'); ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = css('--amber'); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = css('--amber'); ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText("3·Kp·γ'·z·D", x0 + 8, zy(r.L) - 6);
    }

    // tiang
    ctx.fillStyle = css('--panel-solid'); ctx.globalAlpha = 0.95;
    ctx.fillRect(cx - pileW / 2, padT, pileW, (r.L + r.e) * sc);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--ink-dim'); ctx.lineWidth = 1.6;
    ctx.strokeRect(cx - pileW / 2, padT, pileW, (r.L + r.e) * sc);

    // kepala jepit → gambar cap
    if (r.head === 'fixed') {
      ctx.fillStyle = css('--ink-dim');
      ctx.fillRect(cx - pileW / 2 - 10, padT - 8, pileW + 20, 8);
    }

    // beban H (panah di kepala)
    var hy = padT + 2;
    ctx.strokeStyle = css('--sage') || css('--amber'); ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - pileW / 2 - 46, hy); ctx.lineTo(cx - pileW / 2 - 4, hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - pileW / 2 - 4, hy); ctx.lineTo(cx - pileW / 2 - 12, hy - 4); ctx.lineTo(cx - pileW / 2 - 12, hy + 4); ctx.closePath(); ctx.fill();
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Hu ' + r.Hu.toFixed(0) + ' kN', cx - pileW / 2 - 46, hy - 6);

    // garis momen maks
    var ym = zy(r.zmax);
    ctx.strokeStyle = css('--red') || css('--amber'); ctx.setLineDash([5, 3]); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(cx - pileW / 2 - 30, ym); ctx.lineTo(x0 + pmax + 6, ym); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = css('--red') || css('--amber'); ctx.textAlign = 'right';
    ctx.fillText('Mmax @' + r.zmax.toFixed(1) + 'm', cx - pileW / 2 - 32, ym + 3);

    // titik rotasi (free)
    if (r.head === 'free' && r.short && r.rot && r.rot <= r.L) {
      var yr = zy(r.rot);
      ctx.fillStyle = css('--ink-dim'); ctx.beginPath(); ctx.arc(cx, yr, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillText('rotasi @' + r.rot.toFixed(1) + 'm', cx + pileW / 2 + 4, yr + 3);
    }

    // dimensi L
    ctx.strokeStyle = css('--ink-dim'); ctx.lineWidth = 1; ctx.textAlign = 'center';
    var xd = cx - pileW / 2 - 30;
    dimVert(ctx, xd, gy, zy(r.L), css('--ink-dim'), 'L ' + r.L.toFixed(1) + 'm');

    if (state.mouse) {
      state.UI.canvasTip(ctx, { mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'Hu ' + r.Hu.toFixed(0) + ' kN · Mmax ' + r.Mmax.toFixed(0) + ' kNm · ' + (r.short ? 'pendek' : 'panjang') });
    }
  }

  function dimVert(ctx, x, y1, y2, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    [[y1, 1], [y2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(x, a[0]); ctx.lineTo(x - 3, a[0] + a[1] * 6); ctx.lineTo(x + 3, a[0] + a[1] * 6); ctx.closePath(); ctx.fill();
    });
    ctx.save(); ctx.translate(x - 9, (y1 + y2) / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ================= REPORT ================= */
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
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n) || !isFinite(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/·/g, '*').replace(/√/g, 'sqrt')
      .replace(/²/g, '2').replace(/³/g, '3').replace(/′/g, "'").replace(/’/g, "'")
      .replace(/°/g, 'deg').replace(/→/g, '->').replace(/[–—−]/g, '-').replace(/≤/g, '<=')
      .replace(/≥/g, '>=').replace(/×/g, 'x').replace(/[^\x20-\x7E]/g, '?');
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

  // Gbr. 1 — elevasi tiang + diagram tekanan tanah ultimit Broms
  function figBroms(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var yg = 44, cxP = 190;
    var s = 130 / r.L;
    function Y(z) { return yg + z * s; }                  // z dari muka tanah
    var yTop = yg - Math.max(14, r.e * s);                // kepala tiang (e di atas tanah)
    var wP = Math.max(8, Math.min(20, r.D * 1000 * 0.02));
    // muka tanah + hatch
    ops.push({ t: 'line', x1: 80, y1: yg, x2: 420, y2: yg, lw: 1 });
    for (var i = 0; i < 16; i++) {
      var xh = 80 + 340 * i / 15;
      ops.push({ t: 'line', x1: xh, y1: yg, x2: xh - 6, y2: yg - 6, lw: 0.4, g: 0.6 });
    }
    // tiang
    ops.push({ t: 'rect', x: cxP - wP / 2, y: yTop, w: wP, h: Y(r.L) - yTop, lw: 1.1 });
    // beban H di kepala + label e
    F.arrow(ops, cxP - 56, yTop + 4, cxP - wP / 2 - 2, yTop + 4, { lw: 1.3 });
    ops.push({ t: 'text', x: cxP - 58, y: yTop - 2, s: 'Hu=' + numR(r.Hu, 0) + ' kN', size: 6.5, align: 'r' });
    if (r.e > 0.01) {
      F.dimV(ops, yTop, yg, cxP - wP / 2 - 22, '');
      ops.push({ t: 'text', x: cxP - wP / 2 - 28, y: (yTop + yg) / 2 + 2.5, s: 'e=' + numR(r.e, 2), size: 6, align: 'r' });
    }
    ops.push({ t: 'text', x: cxP + wP / 2 + 4, y: yTop + 8, s: r.head === 'free' ? 'kepala bebas' : 'kepala jepit', size: 6, g: 0.35 });
    // diagram tekanan ultimit pu (kanan tiang)
    var xPr = cxP + wP / 2 + 26, wMax = 110;
    if (r.soil === 'clay') {
      // nol s/d 1.5D, konstan 9cuD di bawahnya
      var z0 = 1.5 * r.D;
      ops.push({ t: 'rect', x: xPr, y: Y(z0), w: wMax, h: Y(r.L) - Y(z0), fill: true, g: 0.88 });
      ops.push({ t: 'rect', x: xPr, y: Y(z0), w: wMax, h: Y(r.L) - Y(z0), lw: 0.6, g: 0.4 });
      ops.push({ t: 'text', x: xPr + wMax + 4, y: (Y(z0) + Y(r.L)) / 2 + 2.3, s: 'pu=9cuD=' + numR(r.k, 1) + ' kN/m', size: 6, g: 0.3 });
      ops.push({ t: 'text', x: xPr + 3, y: Y(z0) - 3, s: 'zona nol 1.5D', size: 5.5, g: 0.45 });
    } else {
      // segitiga 3 Kp gamma' z D
      ops.push({ t: 'poly', pts: [[xPr, yg], [xPr, Y(r.L)], [xPr + wMax, Y(r.L)]], close: true, fill: true, g: 0.88 });
      ops.push({ t: 'poly', pts: [[xPr, yg], [xPr, Y(r.L)], [xPr + wMax, Y(r.L)]], close: true, lw: 0.6, g: 0.4 });
      ops.push({ t: 'text', x: xPr + wMax + 4, y: Y(r.L) + 2.3, s: 'pu=3Kp.g\'.L.D=' + numR(3 * r.Kp * r.gam * r.L * r.D, 0) + ' kN/m', size: 6, g: 0.3 });
    }
    // zmax (lokasi Mmax)
    if (r.zmax > 0 && r.zmax < r.L) {
      ops.push({ t: 'line', x1: cxP - wP / 2 - 12, y1: Y(r.zmax), x2: xPr + wMax, y2: Y(r.zmax), lw: 0.5, g: 0.4, dash: [4, 3] });
      ops.push({ t: 'text', x: cxP - wP / 2 - 14, y: Y(r.zmax) + 2.3, s: 'zmax=' + numR(r.zmax, 2) + ' m, Mmax=' + numR(r.Mmax, 0), size: 6, align: 'r', g: 0.25 });
    }
    // dimensi L
    F.dimV(ops, yg, Y(r.L), 92, '');
    ops.push({ t: 'text', x: 86, y: (yg + Y(r.L)) / 2 + 2.5, s: 'L=' + numR(r.L, 1) + ' m', size: 6.5, align: 'r' });
    var yCap = Y(r.L) + 26;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Skema Broms ' + (r.soil === 'clay' ? 'lempung' : 'pasir') +
      ', ' + (r.head === 'free' ? 'kepala bebas' : 'kepala jepit') + ' - ' + tolatin(r.mode), size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Skema tiang & tekanan Broms - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('KAPASITAS LATERAL TIANG - METODE BROMS'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Broms (1964) rigid-plastic', dt));
    L.push('');
    L.push(' INPUT');
    L.push(ruleR('-'));
    L.push(rowR('Jenis tanah', r.soil === 'clay' ? 'Lempung (undrained)' : 'Pasir (cohesionless)'));
    L.push(rowR('Kepala tiang', r.head === 'free' ? 'Bebas (free)' : 'Jepit (fixed)'));
    L.push(rowR('D / L / e', numR(r.D * 1000, 0) + ' mm / ' + numR(r.L, 2) + ' m / ' + numR(r.e, 2) + ' m'));
    L.push(rowR('My tiang', numR(r.My, 0) + ' kNm'));
    if (r.soil === 'clay') L.push(rowR('cu', numR(r.cu, 0) + ' kPa'));
    else { L.push(rowR('phi / gamma\'', numR(r.phi, 0) + ' deg / ' + numR(r.gam, 1) + ' kN/m3')); L.push(rowR('Kp', numR(r.Kp, 2))); }
    L.push('');
    L.push(' DUA MODA KEGAGALAN');
    L.push(ruleR('-'));
    L.push(rowR('H tanah (tiang pendek)', numR(r.Hshort, 1) + ' kN'));
    L.push(rowR('H leleh (tiang panjang)', numR(r.Hlong, 1) + ' kN'));
    L.push('');
    L.push(figBroms(r));
    L.push('');
    L.push(' OUTPUT');
    L.push(ruleR('='));
    L.push(rowR('>> Hu GOVERNING', numR(r.Hu, 1) + ' kN'));
    L.push(rowR('>> MODA', r.short ? 'Tiang pendek (kegagalan tanah)' : 'Tiang panjang (leleh lentur)'));
    L.push(rowR('Kedalaman Mmax (dari tanah)', numR(r.zmax, 2) + ' m'));
    L.push(rowR('Mmax', numR(r.Mmax, 1) + ' kNm'));
    if (r.head === 'fixed' && r.short) L.push(rowR('Momen jepit kepala', numR(r.MfixShort, 1) + ' kNm'));
    L.push(rowR('Mmax / My', numR(r.dcMom, 2)));
    L.push(ruleR('='));
    if (r.warn.length) {
      L.push('');
      L.push(' CATATAN');
      L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Kapasitas ultimit; terapkan SF ~2-3 atau LRFD terpisah.');
    L.push(' Defleksi kerja -> gunakan tool Analisis P-Y.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(centerR('Alat bantu; verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L.map(function (x) { return typeof x === 'string' ? tolatin(x) : x; });
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast('Lengkapi input dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Lateral-Broms_' + r.soil + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Lateral Tiang — Broms', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
