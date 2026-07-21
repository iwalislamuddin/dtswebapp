/* ============================================================
   Civil Tools — modules/bearing-capacity/module.js  (Tier 2, kanvas 2D)
   Daya dukung tanah fondasi dangkal — TIGA METODE:
     Terzaghi (1943) · Meyerhof (1963) · Vesic (1973)

   Persamaan daya dukung batas (general bearing capacity):
     qu = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ
   dengan q = tekanan overburden efektif di dasar fondasi (γ·Df, dikoreksi MAT).

   FAKTOR DAYA DUKUNG (Nc, Nq, Nγ)
   ------------------------------------------------------------
   Terzaghi:  Nq = e^(2(3π/4−φ/2)tanφ) / (2·cos²(45+φ/2))
              Nc = (Nq−1)·cotφ   (Nc = 5.7 saat φ=0)
              Nγ = interpolasi tabel Terzaghi (general shear) [log-linear]
              Bentuk lewat KOEFISIEN Terzaghi (strip/bujur sangkar/lingkaran/
              persegi panjang); TANPA faktor kedalaman.
   Meyerhof:  Nq = e^(π·tanφ)·tan²(45+φ/2) ; Nc = (Nq−1)cotφ (5.14 @ φ=0)
              Nγ = (Nq−1)·tan(1.4φ) ; + faktor bentuk & kedalaman Meyerhof.
   Vesic:     Nq, Nc = sama Meyerhof (Prandtl–Reissner)
              Nγ = 2(Nq+1)·tanφ ; + faktor bentuk (Vesic) & kedalaman (Hansen).

   MUKA AIR TANAH (MAT) — koreksi Das:
     Dw≥Df+B: tanpa pengaruh (γ) · Df≤Dw<Df+B: γ efektif rata-rata di baji
     0<Dw<Df: q pakai γ & γ' berlapis, suku Nγ pakai γ' · Dw≤0: seluruhnya γ'.
     γ' = γsat − γw (γw = 9.81 kN/m³).

   Keruntuhan LOKAL (Terzaghi, tanah lepas/lunak): c*=⅔c, tanφ*=⅔tanφ.

   TIDAK termasuk: beban miring/eksentris (faktor inklinasi/eksentrisitas),
   dasar/permukaan miring, daya dukung tiang, penurunan (settlement),
   tanah berlapis, kompresibilitas/scale-effect Vesic penuh. Verifikasi oleh
   insinyur penanggung jawab (mis. SNI 8460:2017).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'bearing-capacity';

  var GW = 9.81;                 // berat isi air (kN/m³)
  var D2R = Math.PI / 180;

  // Bentuk fondasi
  var SHAPES = [
    ['strip', 'Menerus (strip)'],
    ['square', 'Bujur sangkar'],
    ['circular', 'Lingkaran'],
    ['rect', 'Persegi panjang']
  ];
  var METHODS = [
    ['terzaghi', 'Terzaghi (1943)'],
    ['meyerhof', 'Meyerhof (1963)'],
    ['vesic', 'Vesic (1973)']
  ];

  // Terzaghi Nγ — tabel general shear (Bowles/Das). Diinterpolasi log-linear.
  var TNG = [[0, 0], [5, 0.5], [10, 1.2], [15, 2.5], [20, 5.0],
             [25, 9.7], [30, 19.7], [35, 42.4], [40, 100.4], [45, 297.5], [50, 1153.2]];

  var state = {};
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /* ---------- Faktor daya dukung ---------- */
  function nqTerz(phi) {   // phi rad
    var a = Math.exp((0.75 * Math.PI - phi / 2) * Math.tan(phi));
    return a * a / (2 * Math.pow(Math.cos(Math.PI / 4 + phi / 2), 2));
  }
  function nqPrandtl(phi) {
    return Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
  }
  function ngTerz(phiDeg) {
    if (phiDeg <= 0) return 0;
    var cap = false;
    if (phiDeg > 50) { phiDeg = 50; cap = true; }
    var i = 0;
    for (; i < TNG.length - 1; i++) if (phiDeg < TNG[i + 1][0]) break;
    if (i >= TNG.length - 1) i = TNG.length - 2;
    var x0 = TNG[i][0], y0 = TNG[i][1], x1 = TNG[i + 1][0], y1 = TNG[i + 1][1];
    var t = (phiDeg - x0) / (x1 - x0), val;
    if (y0 > 0 && y1 > 0) val = Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0)));
    else val = y0 + t * (y1 - y0);
    ngTerz._cap = cap;
    return val;
  }

  /* ---------- Koreksi muka air tanah ---------- */
  function waterCorr(gamma, gsat, Dw, Df, B) {
    var gsub = Math.max(0.1, gsat - GW);
    var q, gBase, wc;
    if (Dw >= Df + B) { q = gamma * Df; gBase = gamma; wc = 'MAT di bawah zona pengaruh (Dw ≥ Df+B) — tanpa pengaruh.'; }
    else if (Dw >= Df) {
      q = gamma * Df;
      gBase = gsub + (Dw - Df) / B * (gamma - gsub);
      wc = 'MAT dalam zona baji (Df ≤ Dw < Df+B) — γ efektif rata-rata pada suku Nγ.';
    } else if (Dw > 0) {
      q = gamma * Dw + gsub * (Df - Dw); gBase = gsub;
      wc = 'MAT antara permukaan & dasar (0 < Dw < Df) — overburden berlapis, suku Nγ pakai γ′.';
    } else { q = gsub * Df; gBase = gsub; wc = 'MAT di / atas permukaan tanah (Dw ≤ 0) — seluruh γ′.'; }
    return { q: q, gBase: gBase, gsub: gsub, wc: wc };
  }

  /* ---------- Satu metode ---------- */
  function methodCalc(method, inp) {
    var phiDeg = inp.phiDeg, c = inp.c, localApplied = false;
    if (method === 'terzaghi' && inp.local) {
      c = (2 / 3) * inp.c;
      phiDeg = Math.atan((2 / 3) * Math.tan(inp.phiDeg * D2R)) / D2R;
      localApplied = true;
    }
    var phi = phiDeg * D2R;
    var B = inp.B, q = inp.q, g = inp.gBase, Df = inp.Df, bl = inp.bl, shape = inp.shape;
    var Nq, Nc, Ng, sc = 1, sq = 1, sg = 1, dc = 1, dq = 1, dg = 1, capNote = false;
    var t1, t2, t3;

    if (method === 'terzaghi') {
      Nq = nqTerz(phi);
      Nc = (phiDeg < 1e-4) ? 5.7 : (Nq - 1) / Math.tan(phi);
      Ng = ngTerz(phiDeg); capNote = !!ngTerz._cap;
      var kc, kg;
      if (shape === 'strip') { kc = 1.0; kg = 0.5; }
      else if (shape === 'square') { kc = 1.3; kg = 0.4; }
      else if (shape === 'circular') { kc = 1.3; kg = 0.3; }
      else { kc = 1 + 0.3 * bl; kg = (1 - 0.2 * bl) * 0.5; }
      sc = kc; sq = 1; sg = kg / 0.5;      // sg relatif thd strip (0.5) untuk tampilan
      t1 = kc * c * Nc; t2 = q * Nq; t3 = kg * g * B * Ng;
    } else {
      Nq = nqPrandtl(phi);
      Nc = (phiDeg < 1e-4) ? 5.14 : (Nq - 1) / Math.tan(phi);
      if (method === 'meyerhof') {
        Ng = (Nq - 1) * Math.tan(1.4 * phi);
        var Nphi = Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2), sN = Math.sqrt(Nphi), k = Df / B;
        sc = 1 + 0.2 * Nphi * bl;
        dc = 1 + 0.2 * sN * k;
        if (phiDeg >= 10) {
          sq = 1 + 0.1 * Nphi * bl; sg = sq;
          dq = 1 + 0.1 * sN * k; dg = dq;
        }
      } else { // vesic
        Ng = 2 * (Nq + 1) * Math.tan(phi);
        sc = 1 + (Nq / Nc) * bl;
        sq = 1 + bl * Math.tan(phi);
        sg = Math.max(0.6, 1 - 0.4 * bl);
        var kk = (Df / B <= 1) ? (Df / B) : Math.atan(Df / B);
        dc = 1 + 0.4 * kk;
        dq = 1 + 2 * Math.tan(phi) * Math.pow(1 - Math.sin(phi), 2) * kk;
        dg = 1;
      }
      t1 = c * Nc * sc * dc; t2 = q * Nq * sq * dq; t3 = 0.5 * g * B * Ng * sg * dg;
    }
    if (Ng < 0) Ng = 0;
    if (t3 < 0) t3 = 0;
    var qu = t1 + t2 + t3;
    return {
      method: method, Nc: Nc, Nq: Nq, Ng: Ng, sc: sc, sq: sq, sg: sg, dc: dc, dq: dq, dg: dg,
      t1: t1, t2: t2, t3: t3, qu: qu, phiDeg: phiDeg, c: c, local: localApplied, cap: capNote
    };
  }

  /* ---------- COMPUTE ---------- */
  function compute(v) {
    var r = { warn: [], valid: false };
    var shape = v.shape || 'strip';
    var B = num(v.B), L = num(v.L), Df = num(v.Df);
    var c = num(v.c), phiDeg = num(v.phi), gamma = num(v.gamma), gsat = num(v.gsat);
    var Dw = num(v.Dw), FS = num(v.FS);
    var local = String(v.tfail) === 'local';
    var qApp = num(v.qapp);

    if (!(B > 0)) { r.warn.push('Lebar fondasi B harus > 0.'); return r; }
    if (!(Df >= 0)) { r.warn.push('Kedalaman Df tidak boleh negatif.'); return r; }
    if (!(gamma > 0)) { r.warn.push('Berat isi tanah γ harus > 0.'); return r; }
    if (!(gsat > 0)) gsat = gamma + 1;
    if (!(FS > 0)) FS = 3;
    if (phiDeg < 0) phiDeg = 0;

    // B/L untuk faktor bentuk
    var bl;
    if (shape === 'strip') { bl = 0; L = 0; }
    else if (shape === 'square') { bl = 1; L = B; }
    else if (shape === 'circular') { bl = 1; L = B; }   // lingkaran: B=diameter
    else { if (!(L > 0)) { r.warn.push('Panjang L harus > 0 untuk fondasi persegi panjang.'); return r; } if (L < B) { var tmp = L; L = B; B = tmp; r.warn.push('L < B ditukar agar B = sisi pendek.'); } bl = B / L; }

    var wt = waterCorr(gamma, gsat, Dw, Df, B);

    var inp = { c: c, phiDeg: phiDeg, gamma: gamma, gBase: wt.gBase, q: wt.q, B: B, L: L, Df: Df, bl: bl, shape: shape, local: local };

    var methods = {
      terzaghi: methodCalc('terzaghi', inp),
      meyerhof: methodCalc('meyerhof', inp),
      vesic: methodCalc('vesic', inp)
    };
    // net & allowable per metode
    Object.keys(methods).forEach(function (k) {
      var m = methods[k];
      m.qnet = m.qu - wt.q;
      m.qall = m.qu / FS;
      m.qallNet = m.qnet / FS;
    });

    var primary = v.method || 'terzaghi';
    var pm = methods[primary];

    r.valid = true;
    r.shape = shape; r.B = B; r.L = L; r.Df = Df; r.bl = bl;
    r.c = c; r.phiDeg = phiDeg; r.gamma = gamma; r.gsat = gsat; r.Dw = Dw;
    r.FS = FS; r.local = local; r.qApp = qApp;
    r.q = wt.q; r.gBase = wt.gBase; r.gsub = wt.gsub; r.wc = wt.wc;
    r.methods = methods; r.primary = primary; r.pm = pm;
    r.inp = inp;
    r.dc = (qApp > 0) ? qApp / pm.qall : null;

    // Peringatan
    if (local) r.warn.push('Keruntuhan LOKAL (Terzaghi): c* = ⅔c dan tanφ* = ⅔tanφ diterapkan HANYA pada metode Terzaghi (tanah lepas/lunak). Meyerhof & Vesic tetap parameter penuh — perbandingan tidak setara untuk kondisi ini.');
    if (methods.terzaghi.cap) r.warn.push('φ > 50° di luar tabel Terzaghi Nγ — nilai di-clamp ke 50°; hasil Terzaghi tidak andal pada φ setinggi ini.');
    if (phiDeg > 45) r.warn.push('φ > 45° sangat tinggi — periksa parameter tanah; faktor daya dukung tumbuh sangat cepat (sensitif).');
    if (c > 0 && phiDeg > 0) r.warn.push('Tanah c–φ: pastikan parameter kekuatan (c, φ) konsisten dengan kondisi drainase (efektif vs total).');
    if (Df > B * 4) r.warn.push('Df/B = ' + (Df / B).toFixed(1) + ' > 4 — fondasi cenderung DALAM; teori daya dukung dangkal (dan faktor kedalaman) mungkin tidak berlaku. Pertimbangkan analisis fondasi dalam.');
    if (Dw < Df + B && gsat <= gamma) r.warn.push('γsat ≤ γ padahal MAT berpengaruh — periksa berat isi jenuh (γsat semestinya > γ lembab).');
    if (r.dc !== null && r.dc > 1) r.warn.push('Tekanan kerja q = ' + qApp.toFixed(1) + ' kPa > q_izin (' + pm.qall.toFixed(1) + ' kPa) metode ' + methodName(primary) + ' — TIDAK AMAN (rasio ' + r.dc.toFixed(2) + ').');
    r.warn.push('Faktor keamanan FS = ' + FS.toFixed(1) + ' terhadap keruntuhan geser; PENURUNAN (settlement) tidak diperiksa dan sering justru menentukan pada pasir/fondasi lebar.');

    return r;
  }
  function methodName(k) { for (var i = 0; i < METHODS.length; i++) if (METHODS[i][0] === k) return METHODS[i][1]; return k; }
  function shapeName(k) { for (var i = 0; i < SHAPES.length; i++) if (SHAPES[i][0] === k) return SHAPES[i][1]; return k; }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('bc-style')) return;
    var s = document.createElement('style');
    s.id = 'bc-style';
    s.textContent =
      '.bc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.bc-canvas{position:relative;flex:1 1 50%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.bc-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}' +
      '.bc-cmp{width:100%;border-collapse:collapse;margin:6px 0 2px;font-size:13px}' +
      '.bc-cmp th,.bc-cmp td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--line)}' +
      '.bc-cmp th:first-child,.bc-cmp td:first-child{text-align:left}' +
      '.bc-cmp thead th{color:var(--ink-dim);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}' +
      '.bc-cmp tr.pri td{background:color-mix(in srgb,var(--amber) 12%,transparent);font-weight:600}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Daya Dukung Tanah'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas dukung fondasi dangkal — 3 metode: Terzaghi, Meyerhof & Vesic. Faktor Nc/Nq/Nγ, faktor bentuk & kedalaman, koreksi muka air tanah, keruntuhan umum/lokal. Penampang & perbandingan qu tergambar.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'bc-work');
    var canvasHost = UI.el('div', 'bc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang fondasi & perbandingan qu');
    var results = UI.el('div', 'bc-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var shapeOpts = SHAPES.map(function (s) { return { value: s[0], label: s[1] }; });
    var methodOpts = METHODS.map(function (m) { return { value: m[0], label: m[1] }; });

    var schema = [
      { type: 'group', label: 'Geometri Fondasi' },
      { type: 'select', id: 'shape', label: 'Bentuk', value: 'square', options: shapeOpts },
      { type: 'number', id: 'B', label: 'B — lebar / sisi / diameter', unit: 'm', value: 2.0, min: 0.1, step: 0.1, hint: 'Lingkaran: B = diameter. Persegi panjang: B = sisi pendek.' },
      { type: 'number', id: 'L', label: 'L — panjang', unit: 'm', value: 3.0, min: 0.1, step: 0.1, hint: 'Hanya untuk persegi panjang.' },
      { type: 'number', id: 'Df', label: 'Df — kedalaman dasar fondasi', unit: 'm', value: 1.5, min: 0, step: 0.1, hint: 'Dari permukaan tanah ke dasar telapak.' },

      { type: 'group', label: 'Parameter Tanah' },
      { type: 'number', id: 'c', label: 'c — kohesi', unit: 'kPa', value: 10, min: 0, step: 1, hint: 'Lempung: c > 0. Pasir bersih: c = 0.' },
      { type: 'number', id: 'phi', label: 'φ — sudut geser dalam', unit: '°', value: 30, min: 0, max: 50, step: 1, hint: 'φ = 0 (lempung undrained) → Nq=1, Nγ=0.' },
      { type: 'number', id: 'gamma', label: 'γ — berat isi (lembab)', unit: 'kN/m³', value: 18, min: 8, step: 0.5 },
      { type: 'number', id: 'gsat', label: 'γsat — berat isi jenuh', unit: 'kN/m³', value: 20, min: 8, step: 0.5, hint: 'Untuk koreksi MAT; γ′ = γsat − 9,81.' },
      { type: 'number', id: 'Dw', label: 'Dw — kedalaman muka air tanah', unit: 'm', value: 99, min: -1, step: 0.1, hint: 'Dari permukaan. Besar (mis. 99) = tanpa air.' },

      { type: 'group', label: 'Analisis' },
      { type: 'select', id: 'method', label: 'Metode utama (rincian & laporan)', value: 'terzaghi', options: methodOpts },
      { type: 'segment', id: 'tfail', label: 'Keruntuhan (Terzaghi)', value: 'general',
        options: [{ value: 'general', label: 'Umum' }, { value: 'local', label: 'Lokal' }] },
      { type: 'number', id: 'FS', label: 'FS — faktor keamanan', unit: '', value: 3, min: 1, step: 0.5 },
      { type: 'number', id: 'qapp', label: 'q — tekanan kerja (opsional)', unit: 'kPa', value: 0, min: 0, step: 5, hint: '0 = lewati rasio D/C. Tekanan kotak dasar fondasi.' }
    ];

    function syncVisibility(vals) {
      var isRect = vals.shape === 'rect';
      var f = state.form.fields.L; if (f) f.node.closest('.ck-field').style.display = isRect ? '' : 'none';
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

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Penampang fondasi & perbandingan qu');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri fondasi & parameter tanah untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    var pm = r.pm;
    state.cap.set(shapeName(r.shape) + ' · B=' + r.B + ' m · ' + methodName(r.primary) + ' · qu ' + pm.qu.toFixed(0) + ' kPa');

    results.appendChild(UI.heroRow([
      { label: 'q_ult — ' + methodName(r.primary), value: UI.fmt(pm.qu, 1), unit: 'kPa' },
      { label: 'q_izin = qu/FS', value: UI.fmt(pm.qall, 1), unit: 'kPa' },
      (r.dc !== null)
        ? { label: 'D/C = q/q_izin', value: UI.fmt(r.dc, 2), unit: r.dc <= 1 ? 'OK' : 'NG', tone: r.dc <= 1 ? 'ok' : 'bad' }
        : { label: 'q_ult neto', value: UI.fmt(pm.qnet, 1), unit: 'kPa' }
    ]));
    results.appendChild(UI.el('div', 'ck-empty',
      'q_ult,net = ' + UI.fmt(pm.qnet, 1) + ' kPa · FS = ' + r.FS + '.'));

    // Tabel perbandingan 3 metode
    results.appendChild(UI.rhead('Perbandingan 3 metode'));
    var tbl = UI.el('table', 'bc-cmp');
    tbl.innerHTML = '<thead><tr><th>Metode</th><th>Nc</th><th>Nq</th><th>Nγ</th><th>qu (kPa)</th><th>q_izin (kPa)</th></tr></thead>';
    var tb = document.createElement('tbody');
    METHODS.forEach(function (mm) {
      var m = r.methods[mm[0]];
      var tr = document.createElement('tr');
      if (mm[0] === r.primary) tr.className = 'pri';
      tr.innerHTML = '<td>' + mm[1] + '</td><td>' + m.Nc.toFixed(1) + '</td><td>' + m.Nq.toFixed(1) +
        '</td><td>' + m.Ng.toFixed(1) + '</td><td>' + m.qu.toFixed(0) + '</td><td>' + m.qall.toFixed(0) + '</td>';
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    results.appendChild(tbl);

    // Rincian metode utama
    results.appendChild(UI.rhead('Rincian — ' + methodName(r.primary)));
    results.appendChild(UI.kv('Faktor Nc / Nq / Nγ', pm.Nc.toFixed(2) + ' / ' + pm.Nq.toFixed(2) + ' / ' + pm.Ng.toFixed(2)));
    if (r.primary === 'terzaghi') {
      results.appendChild(UI.kv('Koefisien bentuk (kc, ×Nγ)', pm.sc.toFixed(2) + ' , ' + (pm.sg * 0.5).toFixed(2) + '·γB'));
    } else {
      results.appendChild(UI.kv('Faktor bentuk sc / sq / sγ', pm.sc.toFixed(3) + ' / ' + pm.sq.toFixed(3) + ' / ' + pm.sg.toFixed(3)));
      results.appendChild(UI.kv('Faktor kedalaman dc / dq / dγ', pm.dc.toFixed(3) + ' / ' + pm.dq.toFixed(3) + ' / ' + pm.dg.toFixed(3)));
    }
    if (pm.local) results.appendChild(UI.kv('Parameter tereduksi (lokal)', 'c* = ' + pm.c.toFixed(1) + ' kPa · φ* = ' + pm.phiDeg.toFixed(1) + '°', ''));
    results.appendChild(UI.kv('Suku kohesi (c·Nc·…)', UI.fmt(pm.t1, 1) + ' kPa'));
    results.appendChild(UI.kv('Suku overburden (q·Nq·…)', UI.fmt(pm.t2, 1) + ' kPa'));
    results.appendChild(UI.kv('Suku berat tanah (½γB·Nγ·…)', UI.fmt(pm.t3, 1) + ' kPa'));
    results.appendChild(UI.kv('qu (daya dukung batas)', UI.fmt(pm.qu, 1) + ' kPa', 'ok'));
    results.appendChild(UI.kv('qu,net = qu − q', UI.fmt(pm.qnet, 1) + ' kPa'));
    results.appendChild(UI.kv('q_izin = qu / FS', UI.fmt(pm.qall, 1) + ' kPa', 'ok'));
    results.appendChild(UI.kv('q_izin,net = qu,net / FS', UI.fmt(pm.qallNet, 1) + ' kPa'));
    if (r.dc !== null) results.appendChild(UI.kv('q kerja / q_izin', r.dc.toFixed(2), r.dc <= 1 ? 'ok' : 'bad'));

    // Tanah & air
    results.appendChild(UI.rhead('Tanah & muka air'));
    results.appendChild(UI.kv('c / φ', UI.fmt(r.c, 1) + ' kPa / ' + r.phiDeg.toFixed(1) + '°'));
    results.appendChild(UI.kv('γ / γsat / γ′', UI.fmt(r.gamma, 1) + ' / ' + UI.fmt(r.gsat, 1) + ' / ' + UI.fmt(r.gsub, 1) + ' kN/m³'));
    results.appendChild(UI.kv('q = overburden efektif di dasar', UI.fmt(r.q, 1) + ' kPa'));
    results.appendChild(UI.kv('γ efektif (suku Nγ)', UI.fmt(r.gBase, 1) + ' kN/m³'));
    results.appendChild(UI.kv('B/L', r.bl.toFixed(3) + (r.shape === 'strip' ? ' (menerus)' : '')));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'Persamaan daya dukung umum qu = c·Nc·sc·dc + q·Nq·sq·dq + ½·γ·B·Nγ·sγ·dγ. ' +
      '<b>Terzaghi (1943)</b>: Nq bentuk tertutup, Nγ tabel general shear (log-interp), bentuk via koefisien (strip/bujur sangkar/lingkaran/persegi), tanpa faktor kedalaman. ' +
      '<b>Meyerhof (1963)</b>: Nq Prandtl, Nγ=(Nq−1)tan1,4φ, faktor bentuk & kedalaman Meyerhof. ' +
      '<b>Vesic (1973)</b>: Nq Prandtl, Nγ=2(Nq+1)tanφ, bentuk Vesic + kedalaman Hansen. ' +
      'Koreksi MAT metode Das (γ′ = γsat − 9,81). ' +
      '<b>TIDAK termasuk</b>: beban miring/eksentris, dasar/lereng miring, penurunan, tanah berlapis, fondasi dalam. ' +
      'Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi data untuk melihat penampang & perbandingan qu.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.46, w - 230);
    drawFoundation(ctx, 0, 0, splitX, h, r);
    drawBars(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: methodName(r.primary) + ' qu ' + r.pm.qu.toFixed(0) + ' kPa'
      });
    }
  }

  function drawFoundation(ctx, ox, oy, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), amber = css('--amber'), sky = css('--sky') || dim;
    var B = r.B, Df = r.Df, Dw = r.Dw;
    var padT = 46, padB = 30, padS = 34;
    var Wpx = w - 2 * padS, Hpx = h - padT - padB;

    var xspan = Math.max(B * 3, B + 2);
    var yspan = Df + Math.max(B * 1.0, 1.2);   // Df di atas + baji ~0,9B di bawah dasar
    var sc = Math.min(Wpx / xspan, Hpx / yspan);
    var usedH = yspan * sc;
    var cx = ox + w / 2, ySurf = oy + padT + Math.max(0, (Hpx - usedH) / 2);
    var soilBottom = oy + h - padB;
    function X(wx) { return cx + wx * sc; }
    function Y(d) { return ySurf + d * sc; }

    // tanah (blok) — dari permukaan sampai tepi bawah kanvas
    ctx.save();
    ctx.fillStyle = css('--bg2') || line; ctx.globalAlpha = 0.55;
    ctx.fillRect(ox + padS, ySurf, Wpx, soilBottom - ySurf);
    ctx.globalAlpha = 1;
    // permukaan tanah
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ox + padS, ySurf); ctx.lineTo(ox + w - padS, ySurf); ctx.stroke();
    // arsir permukaan
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    for (var xx = ox + padS; xx < ox + w - padS; xx += 12) {
      ctx.beginPath(); ctx.moveTo(xx, ySurf); ctx.lineTo(xx - 6, ySurf - 6); ctx.stroke();
    }
    ctx.restore();

    var xL = X(-B / 2), xR = X(B / 2), yBase = Y(Df);
    var hf = Math.max(10, Math.min(0.35 * B * sc, 0.3 * (yBase - ySurf) + 8)); // tebal telapak visual

    // baji keruntuhan (skematik) di bawah dasar
    ctx.save();
    ctx.strokeStyle = amber; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    var apexY = Y(Df + B * 0.9);
    ctx.beginPath(); ctx.moveTo(xL, yBase); ctx.lineTo(cx, apexY); ctx.lineTo(xR, yBase); ctx.stroke();
    // kurva ke tepi (pendekatan busur)
    ctx.beginPath();
    ctx.moveTo(xL, yBase);
    ctx.quadraticCurveTo(X(-B * 1.3), Y(Df + B * 0.5), X(-B * 1.6), Y(Df)); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xR, yBase);
    ctx.quadraticCurveTo(X(B * 1.3), Y(Df + B * 0.5), X(B * 1.6), Y(Df)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.restore();

    // fondasi (telapak + kolom)
    ctx.save();
    ctx.fillStyle = ink;
    ctx.fillRect(xL, yBase - hf, xR - xL, hf);           // telapak
    var colW = Math.max(8, (xR - xL) * 0.22);
    ctx.fillRect(cx - colW / 2, ySurf - 6, colW, yBase - hf - ySurf + 6); // kolom
    ctx.restore();

    // beban
    ctx.save();
    ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, ySurf - 30); ctx.lineTo(cx, ySurf - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 4, ySurf - 14); ctx.lineTo(cx, ySurf - 6); ctx.lineTo(cx + 4, ySurf - 14); ctx.closePath(); ctx.fill();
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('P', cx, ySurf - 34);
    ctx.restore();

    // muka air tanah
    if (Dw < yspan && Dw > -0.5) {
      var yW = Y(Math.max(0, Dw));
      ctx.save();
      ctx.strokeStyle = sky; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.2; ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(ox + padS, yW); ctx.lineTo(ox + w - padS, yW); ctx.stroke();
      ctx.setLineDash([]);
      // simbol ▽
      var sx = ox + w - padS - 24;
      ctx.beginPath(); ctx.moveTo(sx - 5, yW - 8); ctx.lineTo(sx + 5, yW - 8); ctx.lineTo(sx, yW - 2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(sx - 7, yW - 5); ctx.lineTo(sx + 7, yW - 5); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = sky; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('MAT', ox + padS + 2, yW - 3);
      ctx.restore();
    }

    // dimensi B
    dimLine(ctx, xL, xR, yBase + 18, dim, 'B ' + B + ' m');
    // dimensi Df
    dimVert(ctx, ox + padS + 8, ySurf, yBase, faint, 'Df ' + Df + ' m');

    // label q
    ctx.fillStyle = amber; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('q=' + r.q.toFixed(0) + ' kPa', xR + 6, yBase - hf / 2 + 3);
  }

  // Bar perbandingan qu & q_izin ketiga metode
  function drawBars(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var sage = css('--sage') || dim, sky = css('--sky') || dim, ink = css('--ink');
    var padL = 74, padR = 26, padT = 46, padB = 42;
    var gx0 = ox + padL, gx1 = ox + w - padR, gy0 = oy + padT, gy1 = oy + h - padB;

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('DAYA DUKUNG qu / q_izin (kPa)', gx0 - 4, oy + 22);

    var quMax = 0;
    METHODS.forEach(function (mm) { quMax = Math.max(quMax, r.methods[mm[0]].qu); });
    if (r.qApp > 0) quMax = Math.max(quMax, r.qApp);
    quMax = quMax * 1.12 || 1;
    function BX(v) { return gx0 + (gx1 - gx0) * Math.min(v / quMax, 1); }

    var n = METHODS.length, gap = 16;
    var rowH = (gy1 - gy0 - gap * (n - 1)) / n;
    var bh = Math.min(30, rowH);
    METHODS.forEach(function (mm, i) {
      var m = r.methods[mm[0]];
      var y = gy0 + i * (rowH + gap);
      var pri = (mm[0] === r.primary);
      // trek
      ctx.fillStyle = line; ctx.globalAlpha = 0.4; ctx.fillRect(gx0, y, gx1 - gx0, bh); ctx.globalAlpha = 1;
      // qu bar
      ctx.fillStyle = pri ? amber : sage; ctx.globalAlpha = pri ? 0.95 : 0.6;
      ctx.fillRect(gx0, y, BX(m.qu) - gx0, bh); ctx.globalAlpha = 1;
      // q_izin overlay (garis batas)
      ctx.strokeStyle = sky; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(BX(m.qall), y); ctx.lineTo(BX(m.qall), y + bh); ctx.stroke();
      // label metode
      ctx.fillStyle = pri ? amber : dim; ctx.font = (pri ? 'bold ' : '') + '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(mm[1].split(' ')[0], gx0 - 6, y + bh / 2 + 3);
      // nilai qu
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(m.qu.toFixed(0), BX(m.qu) + 5, y + bh / 2 + 3);
    });

    // legenda q_izin
    ctx.strokeStyle = sky; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(gx0, gy1 + 14); ctx.lineTo(gx0 + 14, gy1 + 14); ctx.stroke();
    ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('| q_izin = qu/FS (FS=' + r.FS + ')', gx0 + 18, gy1 + 17);

    // garis tekanan kerja
    if (r.qApp > 0) {
      ctx.strokeStyle = css('--olive') || dim; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(BX(r.qApp), gy0 - 6); ctx.lineTo(BX(r.qApp), gy1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css('--olive') || dim; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('q kerja ' + r.qApp.toFixed(0), BX(r.qApp), gy0 - 9);
    }

    var yB = oy + h - 8;
    ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = amber;
    ctx.fillText(methodName(r.primary).split(' ')[0] + ' q_izin ' + r.pm.qall.toFixed(0) + ' kPa', gx0 - 4, yB);
  }

  function dimLine(ctx, x1, x2, y, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    [[x1, 1], [x2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(a[0], y); ctx.lineTo(a[0] + a[1] * 6, y - 3); ctx.lineTo(a[0] + a[1] * 6, y + 3); ctx.closePath(); ctx.fill();
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
    });
    if (!label) return;
    ctx.save(); ctx.translate(x - 10, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ---------- Report monospace ---------- */
  var APP_VER = 'v0.4.0';
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
      .replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/Ω/g, 'Omega').replace(/·/g, '*')
      .replace(/²/g, '2').replace(/³/g, '3').replace(/⁴/g, '4').replace(/½/g, '0.5')
      .replace(/√/g, 'sqrt').replace(/×/g, 'x').replace(/′/g, "'").replace(/°/g, 'deg')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');
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
    var pm = r.pm;
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('DAYA DUKUNG TANAH - FONDASI DANGKAL'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Terzaghi / Meyerhof / Vesic', dt));
    L.push('');
    L.push(' GEOMETRI FONDASI');
    L.push(ruleR('-'));
    L.push(rowR('Bentuk', tolatin(shapeName(r.shape))));
    L.push(rowR('B (lebar/sisi/diameter)', numR(r.B, 2) + ' m'));
    if (r.shape === 'rect') L.push(rowR('L (panjang)', numR(r.L, 2) + ' m'));
    L.push(rowR('Df (kedalaman dasar)', numR(r.Df, 2) + ' m'));
    L.push(rowR('B/L', numR(r.bl, 3)));
    L.push('');
    L.push(' PARAMETER TANAH & AIR');
    L.push(ruleR('-'));
    L.push(rowR('c (kohesi)', numR(r.c, 1) + ' kPa'));
    L.push(rowR('phi (sudut geser)', numR(r.phiDeg, 1) + ' deg'));
    L.push(rowR('gamma / gamma_sat', numR(r.gamma, 1) + ' / ' + numR(r.gsat, 1) + ' kN/m3'));
    L.push(rowR('gamma\' (efektif)', numR(r.gsub, 1) + ' kN/m3'));
    L.push(rowR('Dw (muka air tanah)', numR(r.Dw, 2) + ' m'));
    L.push(rowR('q (overburden efektif)', numR(r.q, 1) + ' kPa'));
    L.push(rowR('gamma efektif (suku Ng)', numR(r.gBase, 1) + ' kN/m3'));
    L.push(' ' + tolatin(r.wc));
    L.push('');
    L.push(' PERBANDINGAN 3 METODE');
    L.push(ruleR('-'));
    L.push(' Metode      Nc      Nq      Ng     qu(kPa)  qizin');
    METHODS.forEach(function (mm) {
      var m = r.methods[mm[0]];
      var nm = mm[1].split(' ')[0];
      while (nm.length < 10) nm += ' ';
      function pad(x, wd) { x = '' + x; while (x.length < wd) x = ' ' + x; return x; }
      L.push(' ' + nm + pad(m.Nc.toFixed(1), 7) + ' ' + pad(m.Nq.toFixed(1), 7) + ' ' + pad(m.Ng.toFixed(1), 7) + ' ' + pad(m.qu.toFixed(0), 7) + ' ' + pad(m.qall.toFixed(0), 7));
    });
    L.push('');
    L.push(' RINCIAN - ' + tolatin(methodName(r.primary)));
    L.push(ruleR('='));
    L.push(rowR('Nc / Nq / Ng', numR(pm.Nc, 2) + ' / ' + numR(pm.Nq, 2) + ' / ' + numR(pm.Ng, 2)));
    if (r.primary === 'terzaghi') {
      L.push(rowR('Koef. bentuk kc', numR(pm.sc, 2)));
    } else {
      L.push(rowR('Bentuk sc/sq/sg', numR(pm.sc, 3) + ' / ' + numR(pm.sq, 3) + ' / ' + numR(pm.sg, 3)));
      L.push(rowR('Kedalaman dc/dq/dg', numR(pm.dc, 3) + ' / ' + numR(pm.dq, 3) + ' / ' + numR(pm.dg, 3)));
    }
    if (pm.local) L.push(rowR('Lokal: c* / phi*', numR(pm.c, 1) + ' kPa / ' + numR(pm.phiDeg, 1) + ' deg'));
    L.push(rowR('Suku c   (c*Nc*..)', numR(pm.t1, 1) + ' kPa'));
    L.push(rowR('Suku q   (q*Nq*..)', numR(pm.t2, 1) + ' kPa'));
    L.push(rowR('Suku 0.5gB (Ng*..)', numR(pm.t3, 1) + ' kPa'));
    L.push(rowR('>> qu (batas)', numR(pm.qu, 1) + ' kPa'));
    L.push(rowR('   qu,net = qu-q', numR(pm.qnet, 1) + ' kPa'));
    L.push(rowR('>> q_izin = qu/FS', numR(pm.qall, 1) + ' kPa  (FS=' + numR(r.FS, 1) + ')'));
    L.push(rowR('   q_izin,net', numR(pm.qallNet, 1) + ' kPa'));
    if (r.dc !== null) L.push(rowR('   q_kerja/q_izin', numR(r.dc, 2) + (r.dc <= 1 ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push(ruleR('='));
    L.push('');
    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' Terzaghi (Nq tertutup, Ng tabel), Meyerhof & Vesic (Nq Prandtl).');
    L.push(' Faktor bentuk & kedalaman; koreksi MAT (Das). TIDAK termasuk beban');
    L.push(' miring/eksentris, penurunan, tanah berlapis, fondasi dalam.');
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
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi data fondasi & tanah dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Daya-Dukung_' + shapeName(r.shape).replace(/[^\w]/g, '') + '_B' + r.B + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Daya Dukung Tanah', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
