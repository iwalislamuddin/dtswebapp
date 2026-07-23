/* ============================================================
   Civil Tools — modules/py-analysis/module.js  (Tier 2, kanvas 2D)
   ANALISIS P-Y — TIANG DIBEBANI LATERAL (beam on nonlinear Winkler)

   Persamaan balok di atas pegas tak-linear (kurva p-y), diselesaikan
   dengan beda-hingga (finite difference) orde-4 + iterasi sekan:
       EI·y'''' + p(y,z) = 0
   BC kepala (z=0, muka tanah): geser = H, momen = M0 = M + H·e
       (bebas) atau kemiringan = 0 (jepit).
   BC ujung: momen = 0, geser = 0 (ujung bebas).

   Kurva p-y:
   - LEMPUNG LUNAK (Matlock 1970, statik):
       p_u = min[(3 + γ'z/cu + J·z/D), 9]·cu·D , J=0,5
       y50 = 2,5·ε50·D ;  p = 0,5·p_u·(y/y50)^(1/3) ≤ p_u
   - PASIR (API RP2A / O'Neill-Murchison):
       p_u = min[(C1·z + C2·D), C3·D]·γ'·z  (C1,C2,C3 = f(φ), Reese)
       p = A·p_u·tanh(k·z·y/(A·p_u)) , A = maks(3−0,8z/D; 0,9) statik

   Output: profil defleksi & momen vs kedalaman + kurva beban-defleksi
   kepala (H vs y0). Pembebanan bertahap (warm-start) untuk konvergensi.
   Catatan: satu lapis homogen, penampang utuh (retak → reduksi EI manual).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'py-analysis';
  var APP_VER = 'v0.5.0';

  var NEL = 60;          // jumlah elemen (61 node)
  var STEPS = 10;        // langkah pembebanan (kurva H-y0)

  var state = {};

  /* ============ KURVA P-Y ============ */
  // Kembalikan reaksi p (kN/m) untuk defleksi y (m) di kedalaman z (m).
  function pOfY(P, z, y) {
    var ay = Math.abs(y), sgn = y < 0 ? -1 : 1;
    var pu = puAt(P, z);
    if (pu <= 0 || ay < 1e-12) return 0;
    var p;
    if (P.soil === 'clay') {
      var yr = ay / P.y50;
      p = yr >= 8 ? pu : 0.5 * pu * Math.cbrt(yr);
    } else {
      var A = Math.max(3 - 0.8 * z / P.D, 0.9);
      p = A * pu * Math.tanh(P.kpy * z * ay / (A * pu));
    }
    return sgn * Math.min(p, pu);
  }

  function puAt(P, z) {
    if (P.soil === 'clay') {
      var ps = (3 + P.gam * z / P.cu + 0.5 * z / P.D) * P.cu * P.D;
      return Math.min(ps, 9 * P.cu * P.D);
    }
    var pus = (P.C1 * z + P.C2 * P.D) * P.gam * z;
    var pud = P.C3 * P.D * P.gam * z;
    return Math.max(0, Math.min(pus, pud));
  }

  // Modulus sekan k_i (kN/m per m = kN/m²) dari kurva p-y pada y saat ini.
  function secant(P, z, y) {
    var ay = Math.abs(y);
    if (ay < 1e-9) {
      // slope awal: pasir = k·z (hingga); lempung ~ tak hingga → pakai nilai pada y kecil
      if (P.soil === 'sand') return P.kpy * z;
      var ys = 1e-5;
      return Math.abs(pOfY(P, z, ys)) / ys;
    }
    return Math.abs(pOfY(P, z, y)) / ay;
  }

  /* ============ SOLVER BEDA-HINGGA ============ */
  // Selesaikan A·x = b (Gauss elim + pivot parsial). A: array baris (Float64Array).
  function solveLin(A, b, N) {
    for (var c = 0; c < N; c++) {
      var piv = c, mx = Math.abs(A[c][c]);
      for (var rr = c + 1; rr < N; rr++) { var av = Math.abs(A[rr][c]); if (av > mx) { mx = av; piv = rr; } }
      if (piv !== c) { var t = A[piv]; A[piv] = A[c]; A[c] = t; var tb = b[piv]; b[piv] = b[c]; b[c] = tb; }
      var d = A[c][c];
      if (Math.abs(d) < 1e-30) continue;
      for (var r2 = c + 1; r2 < N; r2++) {
        var fac = A[r2][c] / d;
        if (fac === 0) continue;
        for (var k = c; k < N; k++) A[r2][k] -= fac * A[c][k];
        b[r2] -= fac * b[c];
      }
    }
    var x = new Float64Array(N);
    for (var i = N - 1; i >= 0; i--) {
      var s = b[i];
      for (var j = i + 1; j < N; j++) s -= A[i][j] * x[j];
      x[i] = Math.abs(A[i][i]) < 1e-30 ? 0 : s / A[i][i];
    }
    return x;
  }

  // Satu solusi non-linear untuk beban (H, M0). yInit: tebakan awal (warm start).
  function solvePile(P, H, M0, yInit) {
    var n = NEL, dz = P.L / n, N = n + 5;         // unknown y_{-2..n+2}, idx = i+2
    var EI = P.EI;
    var c4 = EI / Math.pow(dz, 4);
    var y = yInit ? yInit.slice() : new Float64Array(n + 1);
    var conv = false, iters = 0;

    for (var it = 0; it < 100; it++) {
      iters = it + 1;
      // rakit matriks
      var A = new Array(N), b = new Float64Array(N);
      for (var r = 0; r < N; r++) A[r] = new Float64Array(N);

      // governing i = 0..n  → baris i
      for (var i = 0; i <= n; i++) {
        var z = i * dz;
        var ki = secant(P, z, y[i]);
        var row = A[i];
        row[i + 0] += c4 * 1;      // y_{i-2}
        row[i + 1] += c4 * -4;     // y_{i-1}
        row[i + 2] += c4 * 6 + ki; // y_i
        row[i + 3] += c4 * -4;     // y_{i+1}
        row[i + 4] += c4 * 1;      // y_{i+2}
        b[i] = 0;
      }
      // BC baris n+1..n+4
      var c2 = EI / (dz * dz), c3 = EI / (2 * dz * dz * dz);
      // top: idx y_{-2}=0,y_{-1}=1,y0=2,y1=3,y2=4
      if (P.head === 'fixed') {
        // kemiringan 0: (y1 - y_{-1})/(2dz)=0 → y_{-1}=y1
        A[n + 1][1] += 1; A[n + 1][3] += -1; b[n + 1] = 0;
      } else {
        // momen: −EI(y_{-1}-2y0+y1)/dz² = M0  (y positif searah H)
        A[n + 1][1] += c2; A[n + 1][2] += -2 * c2; A[n + 1][3] += c2; b[n + 1] = M0;
      }
      // top geser: −EI(-y_{-2}+2y_{-1}-2y1+y2)/(2dz³) = H
      A[n + 2][0] += -c3; A[n + 2][1] += 2 * c3; A[n + 2][3] += -2 * c3; A[n + 2][4] += c3; b[n + 2] = H;
      // bottom momen: (y_{n-1}-2y_n+y_{n+1})=0  → idx n+1,n+2,n+3
      A[n + 3][n + 1] += c2; A[n + 3][n + 2] += -2 * c2; A[n + 3][n + 3] += c2; b[n + 3] = 0;
      // bottom geser: (-y_{n-2}+2y_{n-1}-2y_{n+1}+y_{n+2})=0 → idx n,n+1,n+3,n+4
      A[n + 4][n + 0] += -c3; A[n + 4][n + 1] += 2 * c3; A[n + 4][n + 3] += -2 * c3; A[n + 4][n + 4] += c3; b[n + 4] = 0;

      var x = solveLin(A, b, N);
      // ekstrak & under-relaksasi
      var maxd = 0, ynew = new Float64Array(n + 1);
      for (var q = 0; q <= n; q++) {
        var val = 0.5 * y[q] + 0.5 * x[q + 2];
        maxd = Math.max(maxd, Math.abs(val - y[q]));
        ynew[q] = val;
      }
      y = ynew;
      if (maxd < 1e-7) { conv = true; break; }
    }
    // momen M_i = -EI y'' (beda tengah), ujung pakai BC
    var M = new Float64Array(n + 1), p = new Float64Array(n + 1);
    for (var m = 0; m <= n; m++) {
      var zz = m * dz;
      p[m] = pOfY(P, zz, y[m]);
      if (m === 0) {
        // konvensi M = +EI·y'' (konsisten dgn beban +): bebas → M0; jepit → reaksi EI·2(y1−y0)/dz²
        M[m] = P.head === 'fixed' ? EI * 2 * (y[1] - y[0]) / (dz * dz) : M0;
      }
      else if (m === n) M[m] = 0;
      else M[m] = EI * (y[m - 1] - 2 * y[m] + y[m + 1]) / (dz * dz);
    }
    return { y: y, M: M, p: p, dz: dz, conv: conv, iters: iters };
  }

  /* ============ REESE C1,C2,C3 (pasir) ============ */
  function sandCoef(phiDeg) {
    var phi = phiDeg * Math.PI / 180;
    var a = phi / 2, beta = Math.PI / 4 + phi / 2;
    var Ko = 0.4, Ka = Math.pow(Math.tan(Math.PI / 4 - phi / 2), 2);
    var tb = Math.tan(beta), tbf = Math.tan(beta - phi);
    var C1 = (Ko * Math.tan(phi) * Math.sin(beta)) / (tbf * Math.cos(a)) +
      (tb * tb * Math.tan(a)) / tbf + Ko * tb * (Math.tan(phi) * Math.sin(beta) - Math.tan(a));
    var C2 = tb / tbf - Ka;
    var C3 = Ka * (Math.pow(tb, 8) - 1) + Ko * Math.tan(phi) * Math.pow(tb, 4);
    return { C1: C1, C2: C2, C3: C3, Kp: Math.pow(tb, 2) };
  }

  /* ============ COMPUTE (pembebanan bertahap) ============ */
  function compute(v) {
    var r = { warn: [], valid: true, soil: v.soil, head: v.head };
    var D = v.D / 1000, L = v.L, E = v.E;
    if (!(D > 0) || !(L > 0) || !(E > 0)) { r.valid = false; return r; }
    var I = Math.PI * Math.pow(D, 4) / 64;
    var EI = E * 1000 * I;                          // MPa→kPa · m⁴ = kN·m²
    var P = { soil: v.soil, head: v.head, D: D, L: L, EI: EI, gam: v.gam };
    r.D = D; r.L = L; r.E = E; r.I = I; r.EI = EI;

    if (v.soil === 'clay') {
      if (!(v.cu > 0) || !(v.gam > 0) || !(v.eps50 > 0)) { r.valid = false; return r; }
      P.cu = v.cu; P.eps50 = v.eps50; P.y50 = 2.5 * v.eps50 * D;
      r.cu = v.cu; r.eps50 = v.eps50; r.y50 = P.y50;
    } else {
      if (!(v.phi > 0) || !(v.gam > 0) || !(v.kpy > 0)) { r.valid = false; return r; }
      var sc = sandCoef(v.phi);
      P.C1 = sc.C1; P.C2 = sc.C2; P.C3 = sc.C3;
      P.kpy = v.kpy * 1000;                          // MN/m³ → kN/m³
      r.phi = v.phi; r.kpy = v.kpy; r.Kp = sc.Kp; r.C1 = sc.C1; r.C2 = sc.C2; r.C3 = sc.C3;
    }
    r.gam = v.gam;
    r.H = v.H; r.M = v.M; r.e = v.e || 0;
    var M0 = (v.M || 0) + v.H * (v.e || 0);
    r.M0 = M0;
    r.P = P;

    if (!(v.H > 0)) { r.valid = false; r.warn.push('Masukkan beban lateral H > 0.'); return r; }

    // pembebanan bertahap dengan warm start → kurva H-y0
    var curve = [{ H: 0, y0: 0 }];
    var yPrev = null, last = null, allConv = true;
    for (var s = 1; s <= STEPS; s++) {
      var Hs = v.H * s / STEPS, Ms = M0 * s / STEPS;
      var sol = solvePile(P, Hs, Ms, yPrev);
      yPrev = sol.y; last = sol;
      if (!sol.conv) allConv = false;
      curve.push({ H: Hs, y0: sol.y[0] * 1000 });    // mm
    }
    r.sol = last; r.curve = curve; r.conv = allConv;

    // ringkasan
    var y = last.y, M = last.M, dz = last.dz;
    r.y0 = y[0] * 1000;                              // mm
    r.slope0 = (y[1] - y[0]) / dz;                   // rad (approx)
    var ymax = 0, ymaxZ = 0, Mmax = 0, MmaxZ = 0;
    for (var i = 0; i < y.length; i++) {
      if (Math.abs(y[i]) > Math.abs(ymax)) { ymax = y[i]; ymaxZ = i * dz; }
      if (Math.abs(M[i]) > Math.abs(Mmax)) { Mmax = M[i]; MmaxZ = i * dz; }
    }
    r.ymax = ymax * 1000; r.ymaxZ = ymaxZ; r.Mmax = Mmax; r.MmaxZ = MmaxZ;
    // kedalaman defleksi ~0 pertama (perkiraan panjang aktif)
    r.puTop = puAt(P, 0.5 * D);
    if (!allConv) r.warn.push('Iterasi belum konvergen penuh pada sebagian langkah — hasil perkiraan; coba kurangi H atau periksa parameter.');
    return r;
  }

  /* ================= UI ================= */
  var VIEWS = [
    { value: 'defl', label: 'Defleksi' },
    { value: 'mom', label: 'Momen' },
    { value: 'curve', label: 'Kurva H–y₀' }
  ];

  function injectStyle() {
    if (document.getElementById('py-style')) return;
    var s = document.createElement('style');
    s.id = 'py-style';
    s.textContent =
      '.py-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.py-canvas{position:relative;flex:1 1 54%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.py-viewbar{position:absolute;left:12px;bottom:10px;z-index:3}' +
      '.py-res{flex:1 1 46%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Analisis P-Y Tiang Lateral'));
    panel.appendChild(UI.el('div', 'sub', 'Beda-hingga balok di atas pegas p-y tak-linear (Matlock lempung / API pasir) — profil defleksi, momen, dan kurva beban-defleksi.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'py-work');
    var canvasHost = UI.el('div', 'py-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Profil defleksi');
    var results = UI.el('div', 'py-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Konfigurasi' },
      { type: 'segment', id: 'soil', label: 'Jenis tanah', value: 'clay',
        options: [{ value: 'clay', label: 'Lempung (Matlock)' }, { value: 'sand', label: 'Pasir (API)' }] },
      { type: 'segment', id: 'head', label: 'Kepala tiang', value: 'free',
        options: [{ value: 'free', label: 'Bebas' }, { value: 'fixed', label: 'Jepit' }] },

      { type: 'group', label: 'Beban di muka tanah' },
      { type: 'number', id: 'H', label: 'H — beban lateral', unit: 'kN', value: 200, min: 0, step: 10 },
      { type: 'number', id: 'M', label: 'M — momen (kepala bebas)', unit: 'kNm', value: 0, step: 10 },
      { type: 'number', id: 'e', label: 'e — tinggi beban di atas tanah', unit: 'm', value: 0, min: 0, step: 0.1 },

      { type: 'group', label: 'Tiang' },
      { type: 'number', id: 'D', label: 'D — diameter tiang', unit: 'mm', value: 600, min: 100, step: 50 },
      { type: 'number', id: 'L', label: 'L — panjang tertanam', unit: 'm', value: 15, min: 1, step: 0.5 },
      { type: 'number', id: 'E', label: 'E — modulus elastis', unit: 'MPa', value: 25000, min: 1000, step: 1000 },

      { type: 'group', label: 'Parameter tanah' },
      { type: 'number', id: 'gam', label: "γ' — berat isi efektif", unit: 'kN/m³', value: 8, min: 3, step: 0.5 },
      { type: 'number', id: 'cu', label: 'cu — kohesi undrained', unit: 'kPa', value: 40, min: 1, step: 5 },
      { type: 'number', id: 'eps50', label: 'ε50 — regangan 50%', unit: '', value: 0.01, min: 0.003, step: 0.001 },
      { type: 'number', id: 'phi', label: 'φ — sudut geser', unit: '°', value: 33, min: 25, max: 45, step: 1 },
      { type: 'number', id: 'kpy', label: 'k — modulus subgrade awal', unit: 'MN/m³', value: 16, min: 1, step: 1 }
    ];

    function syncVisibility(vals) {
      var clay = vals.soil === 'clay';
      var show = { M: vals.head === 'free', cu: clay, eps50: clay, phi: !clay, kpy: !clay };
      Object.keys(show).forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = show[id] ? '' : 'none';
      });
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'soil' || changedId === 'head') { syncVisibility(vals); vals = form.getValues(); }
      update(vals, results);
    }, ID);
    state.form = form;
    state.results = results;

    var viewWrap = UI.el('div', 'py-viewbar');
    var seg = UI.el('div', 'ck-seg');
    state.view = 'defl';
    VIEWS.forEach(function (o) {
      var b = UI.el('button', o.value === state.view ? 'active' : null, o.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.view = o.value;
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        state.cap.set(o.value === 'defl' ? 'Profil defleksi' : o.value === 'mom' ? 'Profil momen' : 'Kurva H–y₀');
        if (state.cv) state.cv.redraw();
      });
      seg.appendChild(b);
    });
    viewWrap.appendChild(seg);
    canvasHost.appendChild(viewWrap);

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
      state.cap.set('Profil defleksi');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi beban, tiang, dan parameter tanah untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa', r.warn.join('<br>')));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set((r.soil === 'clay' ? 'Lempung' : 'Pasir') + ' · y₀ ' + UI.fmt(r.y0, 1) +
      ' mm · Mmax ' + UI.fmt(r.Mmax, 0) + ' kNm');

    results.appendChild(UI.heroRow([
      { label: 'Defleksi kepala y₀', value: UI.fmt(r.y0, 2), unit: 'mm' },
      { label: 'Momen maks', value: UI.fmt(r.Mmax, 1), unit: 'kNm' },
      { label: 'Rotasi kepala', value: UI.fmt(Math.abs(r.slope0) * 1000, 3), unit: 'mrad' }
    ]));

    results.appendChild(UI.rhead('Hasil pada beban penuh'));
    results.appendChild(UI.kv('Defleksi kepala y₀', UI.fmt(r.y0, 2) + ' mm'));
    results.appendChild(UI.kv('Rotasi kepala', UI.fmt(Math.abs(r.slope0) * 1000, 3) + ' mrad'));
    results.appendChild(UI.kv('Momen maksimum', UI.fmt(r.Mmax, 1) + ' kNm @ ' + UI.fmt(r.MmaxZ, 2) + ' m'));
    if (r.head === 'fixed') results.appendChild(UI.kv('Momen jepit kepala (M0)', UI.fmt(r.sol.M[0], 1) + ' kNm'));
    results.appendChild(UI.kv('Konvergensi', r.conv ? 'OK (' + r.sol.iters + ' iterasi langkah akhir)' : 'perkiraan', r.conv ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Tiang & tanah'));
    results.appendChild(UI.kv('EI', UI.fmt(r.EI, 0) + ' kN·m²  (I = ' + UI.fmt(r.I * 1e4, 1) + '×10⁻⁴ m⁴)'));
    if (r.soil === 'clay') {
      results.appendChild(UI.kv('cu / ε50 / y50', UI.fmt(r.cu, 0) + ' kPa / ' + UI.fmt(r.eps50, 3) + ' / ' + UI.fmt(r.y50 * 1000, 1) + ' mm'));
    } else {
      results.appendChild(UI.kv('φ / Kp', UI.fmt(r.phi, 0) + '° / ' + UI.fmt(r.Kp, 2)));
      results.appendChild(UI.kv('C1 / C2 / C3 (Reese)', UI.fmt(r.C1, 2) + ' / ' + UI.fmt(r.C2, 2) + ' / ' + UI.fmt(r.C3, 1)));
      results.appendChild(UI.kv('k subgrade awal', UI.fmt(r.kpy, 0) + ' MN/m³'));
    }

    if (r.warn.length)
      results.appendChild(UI.note('Peringatan',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));

    results.appendChild(UI.note('Metode & batasan',
      'Beda-hingga (' + NEL + ' elemen) balok di atas pegas p-y tak-linear, iterasi sekan. Kurva statik ' +
      '(Matlock lempung lunak / API pasir), satu lapis homogen. <b>EI penampang utuh</b> — untuk beton retak ' +
      'gunakan E atau I tereduksi (≈0,4–0,7 Ig). Kapasitas ultimit lateral → bandingkan tool <b>Broms</b>. ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ================= KANVAS ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint');
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data untuk melihat profil.', w / 2, h / 2);
      return;
    }
    if (state.view === 'curve') { drawCurve(ctx, w, h, r); return; }
    drawProfile(ctx, w, h, r);
  }

  function drawProfile(ctx, w, h, r) {
    var isDefl = state.view === 'defl';
    var arr = isDefl ? r.sol.y : r.sol.M;
    var scaleF = isDefl ? 1000 : 1;                 // y→mm, M→kNm
    var n = arr.length, dz = r.sol.dz, L = r.L;
    var padT = 46, padB = 34, padL = 92, padR = 40;
    var plotH = h - padT - padB;
    var yScale = plotH / L;                          // px per m depth
    var axisX = padL;
    // rentang nilai
    var vmax = 1e-9;
    for (var i = 0; i < n; i++) vmax = Math.max(vmax, Math.abs(arr[i] * scaleF));
    var half = (w - padL - padR) / 2 - 10;
    var xScale = half / vmax;

    // sumbu vertikal (tiang @ axisX = nilai 0)
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(axisX, padT); ctx.lineTo(axisX, padT + plotH); ctx.stroke();
    // muka tanah
    ctx.fillStyle = css('--ink-faint'); ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText('0 m', axisX - 6, padT + 3);
    ctx.fillText(L.toFixed(0) + ' m', axisX - 6, padT + plotH + 3);
    // grid kedalaman tiap 1/5
    ctx.strokeStyle = css('--line'); ctx.globalAlpha = 0.4;
    for (var g = 1; g < 5; g++) { var yy = padT + plotH * g / 5; ctx.beginPath(); ctx.moveTo(axisX, yy); ctx.lineTo(w - padR, yy); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // kurva
    ctx.strokeStyle = css('--amber'); ctx.lineWidth = 2; ctx.beginPath();
    for (var k = 0; k < n; k++) {
      var zx = axisX + arr[k] * scaleF * xScale;
      var zy = padT + k * dz * yScale;
      if (k === 0) ctx.moveTo(zx, zy); else ctx.lineTo(zx, zy);
    }
    ctx.stroke();
    // isi area tipis
    ctx.globalAlpha = 0.12; ctx.fillStyle = css('--amber');
    ctx.lineTo(axisX, padT + (n - 1) * dz * yScale); ctx.lineTo(axisX, padT); ctx.fill(); ctx.globalAlpha = 1;

    // label puncak
    ctx.fillStyle = css('--amber'); ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace';
    if (isDefl) ctx.fillText('y₀ = ' + r.y0.toFixed(1) + ' mm', axisX + 8, padT + 14);
    else {
      var my = padT + r.MmaxZ * yScale;
      var mx = axisX + r.Mmax * xScale;
      ctx.fillText('Mmax ' + r.Mmax.toFixed(0), mx + 6, my);
      ctx.strokeStyle = css('--ink-dim'); ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(axisX, my); ctx.lineTo(mx, my); ctx.stroke(); ctx.setLineDash([]);
    }
    // judul sumbu bawah
    ctx.fillStyle = css('--ink-faint'); ctx.textAlign = 'center';
    ctx.fillText(isDefl ? 'defleksi y (mm) →' : 'momen M (kNm) →', (axisX + w - padR) / 2, h - 10);

    // hover: baca nilai pada kedalaman kursor
    if (state.mouse && state.mouse.y >= padT && state.mouse.y <= padT + plotH) {
      var idx = Math.round((state.mouse.y - padT) / yScale / dz);
      idx = Math.max(0, Math.min(n - 1, idx));
      var zdep = idx * dz;
      state.UI.canvasTip(ctx, { mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'z ' + zdep.toFixed(2) + 'm · ' + (isDefl ? 'y ' + (r.sol.y[idx] * 1000).toFixed(2) + 'mm' : 'M ' + r.sol.M[idx].toFixed(0) + 'kNm') });
    }
  }

  function drawCurve(ctx, w, h, r) {
    var padT = 46, padB = 46, padL = 64, padR = 30;
    var pw = w - padL - padR, ph = h - padT - padB;
    var c = r.curve;
    var ymax = 0, xmax = 0;
    c.forEach(function (pt) { ymax = Math.max(ymax, pt.H); xmax = Math.max(xmax, pt.y0); });
    if (xmax <= 0) xmax = 1;
    var xS = pw / xmax, yS = ph / ymax;
    var ox = padL, oy = padT + ph;
    // sumbu
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ox, padT); ctx.lineTo(ox, oy); ctx.lineTo(ox + pw, oy); ctx.stroke();
    ctx.fillStyle = css('--ink-faint'); ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.fillText('y₀ kepala (mm)', ox + pw / 2, h - 12);
    ctx.save(); ctx.translate(18, padT + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('H (kN)', 0, 0); ctx.restore();
    // ticks
    ctx.textAlign = 'right'; ctx.fillText(ymax.toFixed(0), ox - 6, padT + 4);
    ctx.textAlign = 'left'; ctx.fillText(xmax.toFixed(1), ox + pw - 4, oy + 14);
    // kurva
    ctx.strokeStyle = css('--amber'); ctx.lineWidth = 2; ctx.beginPath();
    c.forEach(function (pt, i) { var X = ox + pt.y0 * xS, Y = oy - pt.H * yS; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    ctx.stroke();
    // titik
    c.forEach(function (pt) { ctx.fillStyle = css('--amber'); ctx.beginPath(); ctx.arc(ox + pt.y0 * xS, oy - pt.H * yS, 2.5, 0, Math.PI * 2); ctx.fill(); });
    // titik beban penuh
    ctx.fillStyle = css('--ink'); ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('(' + r.y0.toFixed(1) + ' mm, ' + r.H.toFixed(0) + ' kN)', ox + r.y0 * xS - 120, oy - r.H * yS - 8);
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
      .replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/ε/g, 'eps').replace(/·/g, '*')
      .replace(/₀/g, '0').replace(/²/g, '2').replace(/³/g, '3').replace(/⁻/g, '-').replace(/⁴/g, '4')
      .replace(/′/g, "'").replace(/’/g, "'").replace(/°/g, 'deg').replace(/→/g, '->')
      .replace(/[–—−]/g, '-').replace(/×/g, 'x').replace(/[^\x20-\x7E]/g, '?');
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

  // Gbr. 1 — profil defleksi & momen sepanjang tiang + kurva H-y0
  function figPY(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var top = 20, ph = 160, bot = top + ph;
    var y = r.sol.y, M = r.sol.M, dz = r.sol.dz, n = y.length - 1;
    function Z(z) { return top + z / r.L * ph; }
    /* --- panel kiri: y(z) & M(z), sumbu nol vertikal --- */
    var x0 = 150, half = 66;
    var yAbs = Math.max(Math.abs(r.ymax) / 1000, 1e-9);
    var mAbs = Math.max(Math.abs(r.Mmax), 1e-9);
    ops.push({ t: 'line', x1: x0, y1: top, x2: x0, y2: bot, lw: 0.8 });
    // muka tanah
    ops.push({ t: 'line', x1: x0 - half - 16, y1: top, x2: x0 + half + 16, y2: top, lw: 0.9 });
    for (var ih = 0; ih < 8; ih++) {
      var xh = x0 - half - 16 + (2 * half + 32) * ih / 7;
      ops.push({ t: 'line', x1: xh, y1: top, x2: xh - 5, y2: top - 5, lw: 0.4, g: 0.6 });
    }
    // tick kedalaman
    var stZ = F.niceStep(r.L, 5);
    for (var tz = 0; tz <= r.L; tz += stZ) {
      ops.push({ t: 'line', x1: x0 - 2.5, y1: Z(tz), x2: x0 + 2.5, y2: Z(tz), lw: 0.4, g: 0.4 });
      ops.push({ t: 'text', x: x0 - half - 20, y: Z(tz) + 2.3, s: numR(tz, 0), size: 6, align: 'r', g: 0.35 });
    }
    ops.push({ t: 'text', x: x0 - half - 20, y: bot + 10, s: 'z (m)', size: 6.5, align: 'r', g: 0.3 });
    // kurva defleksi (solid) & momen (dashed)
    var ptsY = [], ptsM = [];
    for (var i = 0; i <= n; i++) {
      ptsY.push([x0 + (y[i] / yAbs) * half, Z(i * dz)]);
      ptsM.push([x0 + (M[i] / mAbs) * half, Z(i * dz)]);
    }
    ops.push({ t: 'poly', pts: ptsY, lw: 1.2 });
    ops.push({ t: 'poly', pts: ptsM, lw: 0.9, g: 0.45, dash: [3, 2] });
    // legenda + marker Mmax
    ops.push({ t: 'line', x1: x0 - half, y1: bot + 16, x2: x0 - half + 16, y2: bot + 16, lw: 1.2 });
    ops.push({ t: 'text', x: x0 - half + 20, y: bot + 18.3, s: 'y (maks ' + numR(r.ymax, 1) + ' mm)', size: 6 });
    ops.push({ t: 'line', x1: x0 - half, y1: bot + 26, x2: x0 - half + 16, y2: bot + 26, lw: 0.9, g: 0.45, dash: [3, 2] });
    ops.push({ t: 'text', x: x0 - half + 20, y: bot + 28.3, s: 'M (maks ' + numR(r.Mmax, 0) + ' kNm)', size: 6, g: 0.35 });
    var iMx = Math.max(0, Math.min(n, Math.round(r.MmaxZ / dz)));
    F.cross(ops, x0 + (M[iMx] / mAbs) * half, Z(r.MmaxZ), '', 0.3);
    ops.push({ t: 'text', x: x0 + half + 4, y: Z(r.MmaxZ) + 2.3, s: 'Mmax @ ' + numR(r.MmaxZ, 1) + ' m', size: 5.5, g: 0.35 });
    // panah H di kepala
    F.arrow(ops, x0 - half - 4, top - 10, x0 - 4, top - 10, { lw: 1.2 });
    ops.push({ t: 'text', x: x0 - half - 8, y: top - 14, s: 'H=' + numR(r.H, 0) + ' kN', size: 6.5, align: 'r' });
    /* --- panel kanan: kurva H-y0 --- */
    var px = 330, pw2 = 150;
    var yMaxC = Math.max(r.y0, 0.001) * 1.08, hMaxC = r.H * 1.08;
    function XC(yv) { return px + yv / yMaxC * pw2; }
    function YC(hv) { return bot - hv / hMaxC * ph * 0.85; }
    ops.push({ t: 'line', x1: px, y1: bot - ph * 0.85, x2: px, y2: bot, lw: 0.8 });
    ops.push({ t: 'line', x1: px, y1: bot, x2: px + pw2, y2: bot, lw: 0.8 });
    ops.push({ t: 'text', x: px - 3, y: bot - ph * 0.85 - 4, s: 'H (kN)', size: 6.5, g: 0.3 });
    ops.push({ t: 'text', x: px + pw2, y: bot + 10, s: 'y0 (mm)', size: 6.5, align: 'r', g: 0.3 });
    var ptsC = r.curve.map(function (pt) { return [XC(pt.y0), YC(pt.H)]; });
    ops.push({ t: 'poly', pts: ptsC, lw: 1.2 });
    F.cross(ops, XC(r.y0), YC(r.H), '(' + numR(r.y0, 1) + ', ' + numR(r.H, 0) + ')');
    var yCap = bot + 42;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Profil defleksi & momen (kiri) dan kurva beban-defleksi kepala H-y0 (kanan)', size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Profil defleksi-momen & kurva H-y0 - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('ANALISIS P-Y TIANG LATERAL'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Beda-hingga + kurva p-y', dt));
    L.push('');
    L.push(' INPUT');
    L.push(ruleR('-'));
    L.push(rowR('Tanah / kepala', (r.soil === 'clay' ? 'Lempung (Matlock)' : 'Pasir (API)') + ' / ' + (r.head === 'free' ? 'bebas' : 'jepit')));
    L.push(rowR('H / M / e', numR(r.H, 0) + ' kN / ' + numR(r.M, 0) + ' kNm / ' + numR(r.e, 2) + ' m'));
    L.push(rowR('D / L / E', numR(r.D * 1000, 0) + ' mm / ' + numR(r.L, 1) + ' m / ' + numR(r.E, 0) + ' MPa'));
    L.push(rowR('EI', numR(r.EI, 0) + ' kN*m2'));
    if (r.soil === 'clay') {
      L.push(rowR("cu / gamma' / eps50", numR(r.cu, 0) + ' kPa / ' + numR(r.gam, 1) + ' / ' + numR(r.eps50, 3)));
      L.push(rowR('y50', numR(r.y50 * 1000, 1) + ' mm'));
    } else {
      L.push(rowR("phi / gamma' / k", numR(r.phi, 0) + ' deg / ' + numR(r.gam, 1) + ' / ' + numR(r.kpy, 0) + ' MN/m3'));
      L.push(rowR('C1 / C2 / C3', numR(r.C1, 2) + ' / ' + numR(r.C2, 2) + ' / ' + numR(r.C3, 1)));
    }
    L.push('');
    L.push(' KURVA BEBAN-DEFLEKSI KEPALA (H vs y0)');
    L.push(ruleR('-'));
    r.curve.forEach(function (pt) { if (pt.H > 0) L.push(rowR('H = ' + numR(pt.H, 0) + ' kN', 'y0 = ' + numR(pt.y0, 2) + ' mm')); });
    L.push('');
    L.push(figPY(r));
    L.push('');
    L.push(' OUTPUT (beban penuh)');
    L.push(ruleR('='));
    L.push(rowR('>> Defleksi kepala y0', numR(r.y0, 2) + ' mm'));
    L.push(rowR('Rotasi kepala', numR(Math.abs(r.slope0) * 1000, 3) + ' mrad'));
    L.push(rowR('>> Momen maksimum', numR(r.Mmax, 1) + ' kNm @ ' + numR(r.MmaxZ, 2) + ' m'));
    if (r.head === 'fixed') L.push(rowR('Momen jepit kepala', numR(r.sol.M[0], 1) + ' kNm'));
    L.push(rowR('Konvergensi', r.conv ? 'OK' : 'perkiraan'));
    L.push(ruleR('='));
    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' EI penampang utuh; beton retak -> reduksi EI manual.');
    L.push(' Kapasitas ultimit -> bandingkan tool Broms.');
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
    var base = 'PY-Analysis_' + r.soil + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Analisis P-Y', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null, view: 'defl' };
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
