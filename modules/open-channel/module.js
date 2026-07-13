/* ============================================================
   Civil Tools — modules/open-channel/module.js  (Tier 2, kanvas 2D)
   Saluran Terbuka & Tertutup (gravitasi) — persamaan Manning.

   Rumus:
   - V = (1/n)·R^(2/3)·S^(1/2) ;  Q = V·A ;  R = A/P
   - Penampang: persegi (b), trapesium (b + talud m), segitiga (m),
     LINGKARAN terisi sebagian (D) — untuk gorong-gorong/saluran tertutup:
       θ = 2·acos(1 − 2y/D) ; A = D²/8·(θ − sin θ) ; P = D·θ/2 ; T = D·sin(θ/2)
   - Dua mode: y diketahui → Q ; Q diketahui → y normal (bisection)
   - Kedalaman kritis yc: Q²·T/(g·A³) = 1 (bisection) ; Fr = V/√(g·A/T)
   - Cek kecepatan: min 0,6 m/s (self-cleansing) · maks ± 3 m/s (erosi;
     beton bisa lebih) ; saluran tertutup: y/D ≤ 0,8 (desain gravitasi)

   TIDAK termasuk: aliran tak-seragam (backwater M1/M2, gradually varied),
   loncatan hidraulik, desain stabilitas talud/lining, sedimen, debit desain
   (pakai tool Debit Banjir Rasional). Verifikasi oleh insinyur.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'open-channel';
  var state = {};
  var G = 9.81;

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  /* ---------- geometri penampang ---------- */
  // return {A, P, T, ok} untuk kedalaman y
  function section(shape, y, b, m, D) {
    if (y <= 0) return { A: 0, P: 0.0001, T: 0.0001, ok: true };
    if (shape === 'rect') return { A: b * y, P: b + 2 * y, T: b, ok: true };
    if (shape === 'trap') return { A: (b + m * y) * y, P: b + 2 * y * Math.sqrt(1 + m * m), T: b + 2 * m * y, ok: true };
    if (shape === 'tri') return { A: m * y * y, P: 2 * y * Math.sqrt(1 + m * m), T: 2 * m * y, ok: true };
    // circle
    if (y >= D) {                                 // penuh
      return { A: Math.PI * D * D / 4, P: Math.PI * D, T: 0.0001, ok: false };
    }
    var th = 2 * Math.acos(1 - 2 * y / D);
    return { A: D * D / 8 * (th - Math.sin(th)), P: D * th / 2, T: D * Math.sin(th / 2), ok: true };
  }

  function flowOf(shape, y, b, m, D, n, S) {
    var g = section(shape, y, b, m, D);
    if (g.A <= 0) return { Q: 0, V: 0, g: g };
    var R = g.A / g.P;
    var V = (1 / n) * Math.pow(R, 2 / 3) * Math.sqrt(S);
    return { Q: V * g.A, V: V, R: R, g: g };
  }

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var shape = v.shape || 'trap';
    var mode = v.mode || 'fromY';
    var b = num(v.b), m = num(v.m), D = num(v.D);
    var n = num(v.nman) || (v.mat === 'custom' ? 0.013 : matN(v.mat));
    if (v.mat !== 'custom') n = matN(v.mat);
    var S = num(v.S);
    var yIn = num(v.y), QIn = num(v.Q);

    r.shape = shape; r.mode = mode; r.b = b; r.m = m; r.D = D; r.n = n; r.S = S;

    if (n <= 0 || S <= 0) { r.warn.push('Isi koefisien Manning n dan kemiringan S (> 0).'); return r; }
    if ((shape === 'rect' || shape === 'trap') && b <= 0) { r.warn.push('Isi lebar dasar b (> 0).'); return r; }
    if ((shape === 'trap' || shape === 'tri') && m <= 0) { r.warn.push('Isi kemiringan talud m (> 0).'); return r; }
    if (shape === 'circle' && D <= 0) { r.warn.push('Isi diameter D (> 0).'); return r; }

    var yMaxSearch = shape === 'circle' ? D * 0.999 : 20;
    var y, Q;

    if (mode === 'fromY') {
      if (yIn <= 0) { r.warn.push('Isi kedalaman air y (> 0).'); return r; }
      if (shape === 'circle' && yIn >= D) { r.warn.push('y ≥ D — saluran penuh/bertekanan. Gunakan tool Aliran Pipa.'); return r; }
      y = yIn;
      Q = flowOf(shape, y, b, m, D, n, S).Q;
    } else {
      if (QIn <= 0) { r.warn.push('Isi debit Q (> 0).'); return r; }
      // kapasitas maks (utk lingkaran ± y=0.94D puncak Q; cari numerik)
      var Qcap = 0, yCap = yMaxSearch;
      if (shape === 'circle') {
        for (var yy = 0.02 * D; yy <= yMaxSearch; yy += D / 200) {
          var qq = flowOf(shape, yy, b, m, D, n, S).Q;
          if (qq > Qcap) { Qcap = qq; yCap = yy; }
        }
        if (QIn > Qcap) {
          r.warn.push('Q = ' + QIn.toFixed(3) + ' m³/s melampaui kapasitas gravitasi maks ' + Qcap.toFixed(3) +
            ' m³/s (pada y≈' + (yCap / D).toFixed(2) + 'D) — perbesar D atau S, atau saluran menjadi bertekanan.');
          return r;
        }
      }
      // bisection Q(y) naik monotonic (utk lingkaran cari di cabang naik s/d yCap)
      var lo = 1e-4, hi = shape === 'circle' ? yCap : yMaxSearch;
      // pastikan hi cukup utk non-circle
      if (shape !== 'circle') {
        var guard = 0;
        while (flowOf(shape, hi, b, m, D, n, S).Q < QIn && guard < 30) { hi *= 1.6; guard++; }
      }
      for (var it = 0; it < 80; it++) {
        var mid = (lo + hi) / 2;
        if (flowOf(shape, mid, b, m, D, n, S).Q < QIn) lo = mid; else hi = mid;
      }
      y = (lo + hi) / 2;
      Q = QIn;
    }

    var f = flowOf(shape, y, b, m, D, n, S);
    var g = f.g;
    r.y = y; r.Q = Q; r.A = g.A; r.P = g.P; r.T = g.T; r.R = f.R; r.V = f.V;

    /* --- kedalaman kritis --- */
    var yc = null;
    (function () {
      var lo = 1e-4, hi = shape === 'circle' ? D * 0.999 : Math.max(5 * y, 5);
      var fcn = function (yy) {
        var s = section(shape, yy, b, m, D);
        if (s.A <= 0 || s.T <= 0) return -1;
        return Q * Q * s.T / (G * Math.pow(s.A, 3)) - 1;   // >0 → superkritis (yy < yc)
      };
      if (fcn(lo) > 0 && fcn(hi) < 0) {
        for (var i = 0; i < 70; i++) {
          var mid = (lo + hi) / 2;
          if (fcn(mid) > 0) lo = mid; else hi = mid;
        }
        yc = (lo + hi) / 2;
      }
    })();
    r.yc = yc;
    r.Fr = (g.T > 0 && g.A > 0) ? f.V / Math.sqrt(G * g.A / g.T) : 0;
    r.regime = r.Fr < 0.95 ? 'subkritis' : (r.Fr > 1.05 ? 'SUPERKRITIS' : 'mendekati kritis');
    r.valid = true;

    /* --- peringatan --- */
    if (r.V < 0.6) r.warn.push('V = ' + r.V.toFixed(2) + ' m/s < 0,6 m/s — risiko sedimentasi (self-cleansing tak terpenuhi).');
    if (r.V > 3.0) r.warn.push('V = ' + r.V.toFixed(2) + ' m/s > 3 m/s — risiko erosi/abrasif; pastikan material tahan (beton mutu baik ±4–6 m/s).');
    if (r.Fr > 0.8 && r.Fr < 1.2)
      r.warn.push('Fr = ' + r.Fr.toFixed(2) + ' dekat 1 — aliran tak stabil (bergelombang); hindari desain di rentang 0,8–1,2.');
    if (shape === 'circle' && y / D > 0.8)
      r.warn.push('y/D = ' + (y / D).toFixed(2) + ' > 0,8 — melampaui batas lazim desain gravitasi saluran tertutup; sisakan ruang udara.');
    if (shape !== 'circle')
      r.warn.push('Tambahkan tinggi jagaan (freeboard) — lazim ≥ 0,25·y atau sesuai standar (mis. KP-03 irigasi).');

    return r;
  }

  function matN(mat) {
    var t = { concrete: 0.013, concreteRough: 0.015, masonry: 0.025, earth: 0.022, grass: 0.030, pvc: 0.010 };
    return t[mat] || 0.013;
  }

  /* ============================================================
     KANVAS — potongan melintang + muka air
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat penampang.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sky = css('--sky') || '#30bced', line = css('--line');

    var padT = 48, padB = 44, padL = 60, padR = 60;
    var availW = w - padL - padR, availH = h - padT - padB;
    if (availW < 80 || availH < 60) return;

    // dimensi fisik utk skala
    var y = r.y, ytop = r.shape === 'circle' ? r.D : Math.max(y * 1.35, y + 0.3);
    var wTop;
    if (r.shape === 'rect') wTop = r.b;
    else if (r.shape === 'trap') wTop = r.b + 2 * r.m * ytop;
    else if (r.shape === 'tri') wTop = 2 * r.m * ytop;
    else wTop = r.D;
    var sc = Math.min(availW / wTop, availH / ytop);
    var cx = w / 2, y0 = padT + (availH + ytop * sc) / 2;   // y0 = dasar saluran (px)
    var yPx = function (yy) { return y0 - yy * sc; };

    ctx.lineWidth = 2; ctx.strokeStyle = ink;

    function waterPoly(points) {
      ctx.fillStyle = sky; ctx.globalAlpha = 0.30;
      ctx.beginPath();
      points.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (r.shape === 'circle') {
      var Rpx = r.D * sc / 2, cyC = y0 - Rpx;
      ctx.beginPath(); ctx.arc(cx, cyC, Rpx, 0, Math.PI * 2); ctx.stroke();
      // air: chord pada y
      var yw = yPx(y);
      var half = Math.sqrt(Math.max(0, Rpx * Rpx - (yw - cyC) * (yw - cyC)));
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cyC, Rpx - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = sky; ctx.globalAlpha = 0.3;
      ctx.fillRect(cx - Rpx, yw, 2 * Rpx, y0 - yw + 2);
      ctx.globalAlpha = 1;
      ctx.restore();
      // garis muka air
      ctx.strokeStyle = sky; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - half, yw); ctx.lineTo(cx + half, yw); ctx.stroke();
      ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('D=' + r.D.toFixed(2) + ' m · y/D=' + (y / r.D).toFixed(2), cx, y0 + 16);
    } else {
      var bHalf = (r.shape === 'tri' ? 0 : r.b / 2) * sc;
      var slopeDx = (r.shape === 'rect' ? 0 : r.m) * ytop * sc;
      var slopeDxW = (r.shape === 'rect' ? 0 : r.m) * y * sc;
      // dinding saluran
      ctx.strokeStyle = ink; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - bHalf - slopeDx, yPx(ytop));
      ctx.lineTo(cx - bHalf, y0);
      ctx.lineTo(cx + bHalf, y0);
      ctx.lineTo(cx + bHalf + slopeDx, yPx(ytop));
      ctx.stroke();
      // air
      waterPoly([
        [cx - bHalf - slopeDxW, yPx(y)],
        [cx - bHalf, y0],
        [cx + bHalf, y0],
        [cx + bHalf + slopeDxW, yPx(y)]
      ]);
      ctx.strokeStyle = sky; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - bHalf - slopeDxW, yPx(y)); ctx.lineTo(cx + bHalf + slopeDxW, yPx(y)); ctx.stroke();
      // dimensi b
      if (r.shape !== 'tri') {
        ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText('b=' + r.b.toFixed(2) + ' m', cx, y0 + 16);
      }
      if (r.shape !== 'rect') {
        ctx.fillStyle = dim; ctx.textAlign = 'left';
        ctx.fillText('m=' + r.m.toFixed(1), cx + bHalf + slopeDx * 0.6, yPx(ytop * 0.6));
      }
    }

    // label y & yc
    ctx.strokeStyle = sky; ctx.fillStyle = sky; ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.beginPath(); ctx.moveTo(padL - 6, y0); ctx.lineTo(padL - 6, yPx(r.y)); ctx.stroke();
    ctx.fillText('y=' + r.y.toFixed(3) + ' m', padL - 10, (y0 + yPx(r.y)) / 2 + 3);
    if (r.yc != null) {
      ctx.strokeStyle = amber; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(cx - availW * 0.44, yPx(r.yc)); ctx.lineTo(cx + availW * 0.44, yPx(r.yc)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = amber; ctx.textAlign = 'left';
      ctx.fillText('yc=' + r.yc.toFixed(3), cx + availW * 0.44 - 60, yPx(r.yc) - 4);
    }

    // ringkasan bawah
    ctx.fillStyle = dim; ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Q=' + r.Q.toFixed(3) + ' m³/s · V=' + r.V.toFixed(2) + ' m/s · Fr=' + r.Fr.toFixed(2) +
      ' (' + r.regime + ')', w / 2, h - 12);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: 36,
        text: 'A ' + r.A.toFixed(3) + ' m² · P ' + r.P.toFixed(3) + ' m · R ' + r.R.toFixed(3) + ' m'
      });
    }
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('oc-style')) return;
    var s = document.createElement('style');
    s.id = 'oc-style';
    s.textContent =
      '.oc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.oc-canvas{position:relative;flex:1 1 46%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.oc-res{flex:1 1 54%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Saluran Terbuka (Manning)'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas & kedalaman normal saluran terbuka/tertutup gravitasi ' +
      'dengan persamaan Manning — persegi, trapesium, segitiga, dan lingkaran terisi sebagian ' +
      '(gorong-gorong). Termasuk kedalaman kritis, Froude, dan cek kecepatan.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Penampang' },
      { type: 'select', id: 'shape', label: 'Bentuk', value: 'trap', options: [
        { value: 'rect', label: 'Persegi' },
        { value: 'trap', label: 'Trapesium' },
        { value: 'tri', label: 'Segitiga' },
        { value: 'circle', label: 'Lingkaran (tertutup, sebagian)' } ] },
      { type: 'number', id: 'b', label: 'Lebar dasar b', unit: 'm', value: 1.0, min: 0, step: 0.1 },
      { type: 'number', id: 'm', label: 'Talud m (horizontal : 1 vertikal)', value: 1.5, min: 0, step: 0.25 },
      { type: 'number', id: 'D', label: 'Diameter D (lingkaran)', unit: 'm', value: 1.0, min: 0.1, step: 0.1 },

      { type: 'group', label: 'Hidraulika' },
      { type: 'select', id: 'mat', label: 'Material (koef. Manning)', value: 'concrete', options: [
        { value: 'concrete', label: 'Beton halus (n 0,013)' },
        { value: 'concreteRough', label: 'Beton kasar (0,015)' },
        { value: 'masonry', label: 'Pasangan batu (0,025)' },
        { value: 'earth', label: 'Tanah lurus (0,022)' },
        { value: 'grass', label: 'Tanah berumput (0,030)' },
        { value: 'pvc', label: 'PVC/HDPE (0,010)' },
        { value: 'custom', label: 'Kustom' } ] },
      { type: 'number', id: 'nman', label: 'n kustom', value: 0.013, min: 0.008, max: 0.1, step: 0.001, hint: 'Dipakai hanya bila material = Kustom.' },
      { type: 'number', id: 'S', label: 'Kemiringan dasar S', unit: 'm/m', value: 0.001, min: 0.00001, step: 0.0005, hint: 'Contoh: 0,001 = 1 m per 1000 m.' },

      { type: 'group', label: 'Mode Hitung' },
      { type: 'segment', id: 'mode', label: 'Diketahui', value: 'fromY', options: [
        { value: 'fromY', label: 'y → hitung Q' }, { value: 'fromQ', label: 'Q → hitung y' } ] },
      { type: 'number', id: 'y', label: 'Kedalaman air y', unit: 'm', value: 0.8, min: 0.01, step: 0.05 },
      { type: 'number', id: 'Q', label: 'Debit rencana Q', unit: 'm³/s', value: 1.0, min: 0.001, step: 0.1 }
    ];

    var results = UI.el('div', 'oc-res');
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

    var work = UI.el('div', 'oc-work');
    var canvasHost = UI.el('div', 'oc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Saluran terbuka');
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
      state.cap.set('Saluran terbuka');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    var shapeLbl = { rect: 'Persegi', trap: 'Trapesium', tri: 'Segitiga', circle: 'Lingkaran' }[r.shape];
    state.cap.set(shapeLbl + ' · ' + (r.mode === 'fromY'
      ? 'Q ' + r.Q.toFixed(3) + ' m³/s'
      : 'y ' + r.y.toFixed(3) + ' m') + ' · V ' + r.V.toFixed(2) + ' m/s');

    if (r.mode === 'fromY')
      results.appendChild(UI.hero('Kapasitas debit Q', r.Q.toFixed(3), 'm³/s'));
    else
      results.appendChild(UI.hero('Kedalaman normal y', r.y.toFixed(3), 'm'));

    results.appendChild(UI.rhead('Geometri terisi'));
    results.appendChild(UI.kv('Luas basah A', r.A.toFixed(4) + ' m²'));
    results.appendChild(UI.kv('Keliling basah P', r.P.toFixed(3) + ' m'));
    results.appendChild(UI.kv('Jari-jari hidraulik R = A/P', r.R.toFixed(4) + ' m'));
    results.appendChild(UI.kv('Lebar muka air T', r.T.toFixed(3) + ' m'));
    if (r.shape === 'circle')
      results.appendChild(UI.kv('Rasio terisi y/D', (r.y / r.D).toFixed(2), r.y / r.D <= 0.8 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Hidraulika (Manning)'));
    results.appendChild(UI.kv('n / S', r.n.toFixed(3) + ' / ' + r.S));
    results.appendChild(UI.kv('Kecepatan V = (1/n)·R^⅔·S^½', r.V.toFixed(3) + ' m/s',
      (r.V >= 0.6 && r.V <= 3) ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Debit Q = V·A', r.Q.toFixed(4) + ' m³/s'));

    results.appendChild(UI.rhead('Rezim aliran'));
    if (r.yc != null) results.appendChild(UI.kv('Kedalaman kritis yc', r.yc.toFixed(3) + ' m'));
    results.appendChild(UI.kv('Froude Fr = V/√(g·A/T)', r.Fr.toFixed(3)));
    results.appendChild(UI.kv('Rezim', r.regime, r.regime === 'subkritis' ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'Persamaan <b>Manning</b> (aliran seragam/normal, satuan SI): V = (1/n)·R^(2/3)·√S. Lingkaran terisi ' +
      'sebagian memakai relasi θ (gorong-gorong gravitasi — kapasitas puncak di y≈0,94D, desain lazim y/D ≤ 0,8). ' +
      'Kedalaman kritis dari Q²T/(gA³)=1. Nilai n indikatif — sesuaikan kondisi permukaan aktual. ' +
      '<b>TIDAK termasuk</b>: aliran berubah lambat (backwater), loncatan hidraulik, stabilitas talud, ' +
      'freeboard otomatis, sedimentasi. Debit rencana dari tool Debit Banjir Rasional. Verifikasi oleh insinyur.'));

    if (state.cv) state.cv.redraw();
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.1.0', RW = 62;
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
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/θ/g, 'theta')
      .replace(/√/g, 'sqrt').replace(/⅔/g, '2/3').replace(/½/g, '1/2').replace(/→/g, '->')
      .replace(/≈/g, '~').replace(/[^\x20-\x7E]/g, '?');
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
    var shapeLbl = { rect: 'PERSEGI', trap: 'TRAPESIUM', tri: 'SEGITIGA', circle: 'LINGKARAN' }[r.shape];
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('SALURAN TERBUKA - MANNING (' + shapeLbl + ')'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Aliran seragam (normal)', dt));
    L.push('');
    L.push(' PENAMPANG & PARAMETER'); L.push(ruleR('-'));
    if (r.shape === 'rect' || r.shape === 'trap') L.push(rowR('Lebar dasar b', numR(r.b, 2) + ' m'));
    if (r.shape === 'trap' || r.shape === 'tri') L.push(rowR('Talud m (H:1V)', numR(r.m, 2)));
    if (r.shape === 'circle') L.push(rowR('Diameter D', numR(r.D, 2) + ' m'));
    L.push(rowR('Manning n / S', numR(r.n, 3) + ' / ' + r.S));
    L.push(rowR('Mode', r.mode === 'fromY' ? 'y diketahui -> Q' : 'Q diketahui -> y'));
    L.push('');
    L.push(' HASIL'); L.push(ruleR('='));
    L.push(rowR('Kedalaman y', numR(r.y, 3) + ' m' + (r.shape === 'circle' ? '  (y/D ' + numR(r.y / r.D, 2) + ')' : '')));
    L.push(rowR('A / P / R', numR(r.A, 4) + ' m2 / ' + numR(r.P, 3) + ' m / ' + numR(r.R, 4) + ' m'));
    L.push(rowR('Lebar muka air T', numR(r.T, 3) + ' m'));
    L.push(rowR('>> Kecepatan V', numR(r.V, 3) + ' m/s'));
    L.push(rowR('>> Debit Q', numR(r.Q, 4) + ' m3/s'));
    L.push(ruleR('='));
    L.push('');
    L.push(' REZIM ALIRAN'); L.push(ruleR('-'));
    if (r.yc != null) L.push(rowR('Kedalaman kritis yc', numR(r.yc, 3) + ' m'));
    L.push(rowR('Froude Fr', numR(r.Fr, 3) + '  (' + r.regime + ')'));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Aliran seragam Manning. BELUM: backwater, loncatan hidraulik,');
    L.push(' stabilitas talud, sedimen. Verifikasi oleh insinyur.');
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
    var base = 'Saluran-' + r.shape + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Saluran Terbuka (Manning)', category: 'Hidraulika & Hidrologi', needsCanvas: true, needsRenderer: false },

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
