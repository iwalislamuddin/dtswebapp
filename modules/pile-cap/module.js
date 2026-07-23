/* ============================================================
   Civil Tools — modules/pile-cap/module.js  (Tier 2, kanvas 2D denah)
   DESAIN PILE CAP (poer) — SNI 2847:2019 (adopsi ACI 318-19)

   Metode kaku (rigid cap), pendekatan lentur-geser konvensional:
   1. SUSUNAN 2–6 tiang (baris, segitiga, bujursangkar, quincunx, 2x3).
   2. REAKSI TIANG:
      - Basis "beban ultimate kolom": Ru = Pu/N (+ opsi momen biaksial,
        distribusi kaku Ru,i = Pu/N + Muy*xi/Sx2 + Mux*yi/Sy2).
      - Basis "kapasitas tekan tiang" (desain kapasitas): Ru = Q_tiang
        untuk SEMUA tiang → poer didesain agar tiang menjadi "sekring".
   3. LENTUR (Ps. 13.4.2): momen di muka kolom dari reaksi tiang di luar
      muka → As tiap arah, cek As,min (Ps. 13.3 → 7.6.1.1/8.6.1.1).
   4. GESER SATU ARAH / balok (Ps. 22.5): penampang kritis d dari muka
      kolom, reaksi tiang diinterpolasi bila memotong penampang (dp/2).
   5. GESER DUA ARAH / pons kolom (Ps. 22.6): keliling d/2 sekeliling kolom.
   6. PONS TIANG (Ps. 22.6): keliling d/2 sekeliling tiang terkritis,
      dipangkas tepi poer (sudut/tepi/dalam → alpha_s 20/30/40).

   Catatan: berat sendiri poer diabaikan (konservatif untuk lentur/geser).
   Poer dalam (deep) dp/h kecil → strut-and-tie (Ps. 23) di luar cakupan.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'pile-cap';
  var APP_VER = 'v0.5.0';

  var BARS = [16, 19, 22, 25, 29, 32, 36];
  var PHI_F = 0.9;      // lentur (tension-controlled)
  var PHI_V = 0.75;     // geser
  var LAMBDA = 1.0;     // beton normal

  var state = {};

  function Ab(db) { return Math.PI / 4 * db * db; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ============ SUSUNAN TIANG ============ */
  // Kembalikan array {x,y} (mm), origin di titik berat = pusat kolom.
  function pileLayout(n, s) {
    if (n === 2) return [{ x: -s / 2, y: 0 }, { x: s / 2, y: 0 }];
    if (n === 3) {
      var R = s / Math.sqrt(3);                 // jari-jari lingkar (segitiga sama sisi)
      return [{ x: 0, y: R }, { x: -s / 2, y: -R / 2 }, { x: s / 2, y: -R / 2 }];
    }
    if (n === 4) return [
      { x: -s / 2, y: -s / 2 }, { x: s / 2, y: -s / 2 },
      { x: -s / 2, y: s / 2 }, { x: s / 2, y: s / 2 }];
    if (n === 5) return [
      { x: -s / 2, y: -s / 2 }, { x: s / 2, y: -s / 2 },
      { x: -s / 2, y: s / 2 }, { x: s / 2, y: s / 2 }, { x: 0, y: 0 }];
    // n === 6 : 2 baris x 3 kolom
    return [
      { x: -s, y: -s / 2 }, { x: 0, y: -s / 2 }, { x: s, y: -s / 2 },
      { x: -s, y: s / 2 }, { x: 0, y: s / 2 }, { x: s, y: s / 2 }];
  }

  /* ============ PERHITUNGAN ============ */
  function compute(v) {
    var r = { warn: [], valid: true };
    var n = parseInt(v.n, 10);
    var fc = v.fc, fy = v.fy, dp = v.dp, s = v.s, ov = v.ov;
    var cx = v.cx, cy = v.cy, h = v.h, cov = v.cov, db = parseFloat(v.db);
    if (!(fc > 0) || !(fy > 0) || !(dp > 0) || !(s > 0) || !(ov > 0) ||
        !(cx > 0) || !(cy > 0) || !(h > 0) || !(cov >= 0)) { r.valid = false; return r; }
    r.n = n; r.fc = fc; r.fy = fy; r.dp = dp; r.s = s; r.ov = ov;
    r.cx = cx; r.cy = cy; r.h = h; r.cov = cov; r.db = db; r.Ab = Ab(db);
    r.mode = v.mode;

    if (s < 2.5 * dp) r.warn.push('Spasi tiang s = ' + s.toFixed(0) + ' mm < 2,5·dp (' +
      (2.5 * dp).toFixed(0) + ' mm) — jarak antar tiang lazimnya ≥ 2,5–3·dp.');
    if (ov < dp / 2 + 50) r.warn.push('Overhang tepi ' + ov.toFixed(0) + ' mm terlalu kecil — jarak pusat tiang ke tepi poer sebaiknya ≥ dp/2 + selimut.');

    // Geometri poer dari bounding box tiang + overhang
    var P = pileLayout(n, s);
    r.piles = P;
    var xs = P.map(function (p) { return p.x; }), ys = P.map(function (p) { return p.y; });
    r.spanX = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    r.spanY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    r.Lx = r.spanX + 2 * ov;
    r.Ly = r.spanY + 2 * ov;

    // Tinggi efektif dua lapis; lapis luar (d besar) ke arah kantilever terbesar
    r.cantX = Math.max.apply(null, xs.map(Math.abs)) - cx / 2;   // kantilever arah X
    r.cantY = Math.max.apply(null, ys.map(Math.abs)) - cy / 2;
    var dOut = h - cov - db / 2;
    var dIn = h - cov - 1.5 * db;
    if (dIn <= 0) { r.valid = false; r.warn.push('Tebal poer terlalu kecil dibanding selimut + tulangan.'); return r; }
    r.xOuter = r.cantX >= r.cantY;              // true → tulangan arah X di lapis luar
    r.dx = r.xOuter ? dOut : dIn;               // d untuk tulangan arah X
    r.dy = r.xOuter ? dIn : dOut;               // d untuk tulangan arah Y
    r.davg = (r.dx + r.dy) / 2;

    /* ---- Reaksi tiang ---- */
    var Sx2 = xs.reduce(function (a, x) { return a + x * x; }, 0);
    var Sy2 = ys.reduce(function (a, y) { return a + y * y; }, 0);
    r.Sx2 = Sx2; r.Sy2 = Sy2;
    var R = [];
    if (v.mode === 'kapasitas') {
      var Q = v.Q;
      if (!(Q > 0)) { r.valid = false; return r; }
      r.Q = Q; r.Ptot = n * Q;
      for (var i = 0; i < n; i++) R.push(Q);
      r.Mux = 0; r.Muy = 0;
    } else {
      var Pu = v.Pu, Mux = v.Mux || 0, Muy = v.Muy || 0;
      if (!(Pu > 0)) { r.valid = false; return r; }
      r.Pu = Pu; r.Mux = Mux; r.Muy = Muy; r.Ptot = Pu;
      if (Math.abs(Mux) > 1e-6 && Sy2 < 1e-6)
        r.warn.push('Susunan tiang tidak punya lengan arah-Y → Mux tak dapat ditahan kopel tiang (diabaikan).');
      if (Math.abs(Muy) > 1e-6 && Sx2 < 1e-6)
        r.warn.push('Susunan tiang tidak punya lengan arah-X → Muy tak dapat ditahan kopel tiang (diabaikan).');
      for (var j = 0; j < n; j++) {
        var Ri = Pu / n +
          (Sx2 > 1e-6 ? Muy * 1000 * P[j].x / Sx2 : 0) +
          (Sy2 > 1e-6 ? Mux * 1000 * P[j].y / Sy2 : 0);
        R.push(Ri);
      }
    }
    r.R = R;
    r.Rmax = Math.max.apply(null, R);
    r.Rmin = Math.min.apply(null, R);
    if (r.Rmin < -1e-6) r.warn.push('Reaksi tiang minimum negatif (' + r.Rmin.toFixed(1) +
      ' kN) → tiang tertarik (cabut). Perlu tiang tahan tarik / perbesar susunan.');

    /* ---- Lentur di muka kolom ---- */
    r.flexX = flexure(r, 'x');   // tulangan arah X (momen di muka ⊥ X), lebar = Ly
    r.flexY = flexure(r, 'y');

    /* ---- Geser satu arah ---- */
    r.vx = oneWay(r, 'x');
    r.vy = oneWay(r, 'y');

    /* ---- Pons kolom ---- */
    r.punchCol = punchColumn(r);

    /* ---- Pons tiang terkritis ---- */
    r.punchPile = punchPile(r);

    // Rekap D/C governing
    var checks = [
      { name: 'Lentur X', dc: r.flexX.dc }, { name: 'Lentur Y', dc: r.flexY.dc },
      { name: 'Geser 1-arah X', dc: r.vx.dc }, { name: 'Geser 1-arah Y', dc: r.vy.dc },
      { name: 'Pons kolom', dc: r.punchCol.dc }, { name: 'Pons tiang', dc: r.punchPile.dc }
    ];
    r.checks = checks;
    r.gov = checks.reduce(function (a, b) { return b.dc > a.dc ? b : a; });
    r.ok = r.gov.dc <= 1.0 && r.Rmin >= -1e-6;
    return r;
  }

  // Lentur satu arah pada muka kolom. axis 'x' → tulangan sejajar X, momen
  // dari tiang dengan |x|>cx/2, lebar penampang b = Ly.
  function flexure(r, axis) {
    var isX = axis === 'x';
    var face = (isX ? r.cx : r.cy) / 2;
    var b = isX ? r.Ly : r.Lx;
    var d = isX ? r.dx : r.dy;
    var o = { b: b, d: d, face: face };
    // momen tiap sisi (kN·mm), ambil maks
    var Mp = 0, Mm = 0;
    for (var i = 0; i < r.n; i++) {
      var c = isX ? r.piles[i].x : r.piles[i].y;
      if (c > face) Mp += r.R[i] * (c - face);
      else if (c < -face) Mm += r.R[i] * (-face - c);
    }
    o.Mp = Mp; o.Mm = Mm;
    o.Mu = Math.max(Mp, Mm);                  // kN·mm
    var MuN = o.Mu * 1e3;                      // N·mm
    // As perlu (penampang persegi bertulang tarik)
    var Rn = MuN / (PHI_F * b * d * d);
    o.Rn = Rn;
    var disc = 1 - 2 * Rn / (0.85 * r.fc);
    if (disc < 0) { o.over = true; o.rho = NaN; o.AsReq = Infinity; }
    else {
      o.rho = (0.85 * r.fc / r.fy) * (1 - Math.sqrt(disc));
      o.AsReq = o.rho * b * d;
    }
    // As minimum (susut-suhu, Ps. 13.3 → 24.4.3.2), per lebar b
    o.rhoMin = r.fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / r.fy, 0.0014);
    o.AsMin = o.rhoMin * b * r.h;
    o.AsMinGov = o.AsReq < o.AsMin;
    o.As = Math.max(isFinite(o.AsReq) ? o.AsReq : 0, o.AsMin);
    o.nBar = Math.max(2, Math.ceil(o.As / r.Ab));
    o.AsProv = o.nBar * r.Ab;
    o.spacing = o.nBar > 1 ? (b - 2 * r.cov) / (o.nBar - 1) : 0;
    o.sMax = Math.min(3 * r.h, 450);
    // Kapasitas terpasang φMn
    var a = o.AsProv * r.fy / (0.85 * r.fc * b);
    o.a = a;
    o.phiMn = PHI_F * o.AsProv * r.fy * (d - a / 2) / 1e6;   // kN·m
    o.dc = o.phiMn > 0 ? o.Mu / 1e3 / o.phiMn : Infinity;
    return o;
  }

  // Fraksi reaksi tiang yang diperhitungkan pada penampang geser satu-arah.
  // pileC : koordinat pusat tiang; critC : lokasi penampang (bertanda, di sisi +).
  function fracOneWay(pileC, critC, dp) {
    // sisi +: tiang di luar (pileC > critC) menyumbang
    return clamp(0.5 + (pileC - critC) / dp, 0, 1);
  }

  function oneWay(r, axis) {
    var isX = axis === 'x';
    var face = (isX ? r.cx : r.cy) / 2;
    var d = isX ? r.dx : r.dy;
    var b = isX ? r.Ly : r.Lx;
    var critP = face + d, critM = -(face + d);
    var o = { d: d, b: b, crit: critP };
    var Vp = 0, Vm = 0;
    for (var i = 0; i < r.n; i++) {
      var c = isX ? r.piles[i].x : r.piles[i].y;
      Vp += r.R[i] * fracOneWay(c, critP, r.dp);
      Vm += r.R[i] * fracOneWay(-c, -critM, r.dp);   // cermin sisi -
    }
    o.Vu = Math.max(Vp, Vm);                          // kN
    o.Vc = 0.17 * LAMBDA * Math.sqrt(r.fc) * b * d / 1e3;   // kN
    o.phiVc = PHI_V * o.Vc;
    o.dc = o.phiVc > 0 ? o.Vu / o.phiVc : Infinity;
    return o;
  }

  function punchColumn(r) {
    var d = r.davg;
    var bx = r.cx + d, by = r.cy + d;               // sisi keliling kritis
    var b0 = 2 * (bx + by);
    var o = { d: d, b0: b0, bx: bx, by: by };
    // Vu = reaksi tiang di luar keliling (fraksi)
    var Vu = 0;
    for (var i = 0; i < r.n; i++) {
      var dxo = Math.abs(r.piles[i].x) - bx / 2;
      var dyo = Math.abs(r.piles[i].y) - by / 2;
      var outSigned = Math.max(dxo, dyo);            // >0 di luar
      Vu += r.R[i] * clamp(0.5 + outSigned / r.dp, 0, 1);
    }
    o.Vu = Vu;
    var beta = Math.max(r.cx, r.cy) / Math.min(r.cx, r.cy);
    var alphaS = 40;                                 // kolom interior
    o.beta = beta;
    var vc = Math.min(
      0.33 * LAMBDA * Math.sqrt(r.fc),
      0.17 * (1 + 2 / beta) * LAMBDA * Math.sqrt(r.fc),
      0.083 * (2 + alphaS * d / b0) * LAMBDA * Math.sqrt(r.fc)
    );
    o.vc = vc;
    o.Vc = vc * b0 * d / 1e3;                        // kN
    o.phiVc = PHI_V * o.Vc;
    o.dc = o.phiVc > 0 ? o.Vu / o.phiVc : Infinity;
    return o;
  }

  // Keliling pons tiang dipangkas tepi poer. Tiang round → persegi ekuivalen
  // (luas sama) sisi a = 0,886·dp.
  function punchPile(r) {
    var d = r.davg;
    var a = 0.886 * r.dp;
    var he = a / 2 + d / 2;                          // setengah bentang keliling
    var best = null;
    for (var i = 0; i < r.n; i++) {
      var px = r.piles[i].x, py = r.piles[i].y;
      var xl = px - he, xr = px + he, yb = py - he, yt = py + he;
      var HX = r.Lx / 2, HY = r.Ly / 2;
      var sides = 0, b0 = 0;
      // sisi kiri (x=xl): ada bila di dalam poer
      if (xl >= -HX) { b0 += Math.min(yt, HY) - Math.max(yb, -HY); sides++; }
      if (xr <= HX) { b0 += Math.min(yt, HY) - Math.max(yb, -HY); sides++; }
      if (yb >= -HY) { b0 += Math.min(xr, HX) - Math.max(xl, -HX); sides++; }
      if (yt <= HY) { b0 += Math.min(xr, HX) - Math.max(xl, -HX); sides++; }
      if (b0 <= 0) continue;
      var missing = 4 - sides;                       // sisi di luar beton
      var alphaS = missing >= 2 ? 20 : (missing === 1 ? 30 : 40);
      var vc = Math.min(
        0.33 * LAMBDA * Math.sqrt(r.fc),
        0.083 * (2 + alphaS * d / b0) * LAMBDA * Math.sqrt(r.fc)
      );
      var Vc = vc * b0 * d / 1e3;
      var phiVc = PHI_V * Vc;
      var dc = phiVc > 0 ? r.R[i] / phiVc : Infinity;
      if (!best || dc > best.dc)
        best = { i: i, d: d, a: a, b0: b0, sides: sides, alphaS: alphaS, vc: vc,
          Vc: Vc, phiVc: phiVc, Vu: r.R[i], dc: dc };
    }
    return best || { d: d, a: a, b0: 0, Vu: 0, phiVc: 0, dc: Infinity };
  }

  /* ================= UI ================= */
  var NPILE = [{ value: 2, label: '2 tiang' }, { value: 3, label: '3 tiang' },
    { value: 4, label: '4 tiang' }, { value: 5, label: '5 tiang' }, { value: 6, label: '6 tiang' }];

  var VIEWS = [
    { value: 'layout', label: 'Susunan' },
    { value: 'flexure', label: 'Lentur' },
    { value: 'oneway', label: 'Geser 1-arah' },
    { value: 'punch', label: 'Pons' }
  ];

  function injectStyle() {
    if (document.getElementById('pc-style')) return;
    var s = document.createElement('style');
    s.id = 'pc-style';
    s.textContent =
      '.pc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.pc-canvas{position:relative;flex:1 1 52%;min-height:240px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.pc-viewbar{position:absolute;left:12px;bottom:10px;z-index:3}' +
      '.pc-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Desain Pile Cap'));
    panel.appendChild(UI.el('div', 'sub', 'Poer 2–6 tiang: reaksi tiang, lentur, geser satu-arah, pons kolom & pons tiang — SNI 2847:2019 (metode kaku).'));
    layout.appendChild(panel);

    var work = UI.el('div', 'pc-work');
    var canvasHost = UI.el('div', 'pc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Denah pile cap');
    var results = UI.el('div', 'pc-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var barOpts = BARS.map(function (d) { return { value: d, label: 'D' + d + ' (' + Ab(d).toFixed(0) + ' mm²)' }; });

    var schema = [
      { type: 'group', label: 'Beban desain' },
      { type: 'segment', id: 'mode', label: 'Basis beban', value: 'pu',
        options: [{ value: 'pu', label: 'Ultimate kolom (Pu)' }, { value: 'kapasitas', label: 'Kapasitas tiang' }] },
      { type: 'number', id: 'Pu', label: 'Pu — aksial terfaktor kolom', unit: 'kN', value: 4000, min: 0, step: 50 },
      { type: 'number', id: 'Mux', label: 'Mux — momen sb-X (opsional)', unit: 'kNm', value: 0, step: 10 },
      { type: 'number', id: 'Muy', label: 'Muy — momen sb-Y (opsional)', unit: 'kNm', value: 0, step: 10 },
      { type: 'number', id: 'Q', label: 'Q — kapasitas aksial terfaktor / tiang', unit: 'kN', value: 1200, min: 0, step: 50 },

      { type: 'group', label: 'Susunan tiang' },
      { type: 'select', id: 'n', label: 'Jumlah tiang', value: 4, options: NPILE },
      { type: 'number', id: 'dp', label: 'dp — diameter tiang', unit: 'mm', value: 400, min: 100, step: 50 },
      { type: 'number', id: 's', label: 's — spasi antar tiang', unit: 'mm', value: 1200, min: 200, step: 50 },
      { type: 'number', id: 'ov', label: 'ov — overhang tepi (pusat→tepi)', unit: 'mm', value: 400, min: 100, step: 25 },

      { type: 'group', label: 'Kolom & poer' },
      { type: 'number', id: 'cx', label: 'cx — kolom arah X', unit: 'mm', value: 500, min: 100, step: 50 },
      { type: 'number', id: 'cy', label: 'cy — kolom arah Y', unit: 'mm', value: 500, min: 100, step: 50 },
      { type: 'number', id: 'h', label: 'h — tebal poer', unit: 'mm', value: 800, min: 300, step: 50 },
      { type: 'number', id: 'cov', label: 'selimut (ke pusat tul. bawah)', unit: 'mm', value: 75, min: 40, step: 5 },

      { type: 'group', label: 'Material & tulangan' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 30, min: 17, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tulangan', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'select', id: 'db', label: 'db — tulangan lentur', value: 25, options: barOpts }
    ];

    function syncVisibility(vals) {
      var isCap = vals.mode === 'kapasitas';
      var show = {
        Pu: !isCap, Mux: !isCap, Muy: !isCap, Q: isCap
      };
      Object.keys(show).forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = show[id] ? '' : 'none';
      });
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'mode') { syncVisibility(vals); vals = form.getValues(); }
      update(vals, results);
    }, ID);
    state.form = form;
    state.results = results;

    // Segmen pemilih overlay kanvas
    var viewWrap = UI.el('div', 'pc-viewbar');
    var seg = UI.el('div', 'ck-seg');
    state.view = 'layout';
    VIEWS.forEach(function (o) {
      var b = UI.el('button', o.value === state.view ? 'active' : null, o.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.view = o.value;
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
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

  function dcState(dc) { return dc <= 1.0 ? 'ok' : 'bad'; }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Denah pile cap');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi beban, susunan tiang, dan dimensi untuk menghitung.'));
      if (r.warn.length)
        results.appendChild(UI.note('Periksa', r.warn.map(function (w) { return w; }).join('<br>')));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set(r.n + ' tiang · poer ' + Math.round(r.Lx) + '×' + Math.round(r.Ly) +
      ' · Ru,maks ' + UI.fmt(r.Rmax, 0) + ' kN');

    results.appendChild(UI.heroRow([
      { label: 'D/C — ' + r.gov.name, value: UI.fmt(r.gov.dc, 2), unit: r.ok ? 'AMAN' : 'NG', tone: r.ok ? 'ok' : 'bad' },
      { label: 'Ru maks / tiang', value: UI.fmt(r.Rmax, 1), unit: 'kN' },
      { label: 'Ru min / tiang', value: UI.fmt(r.Rmin, 1), unit: 'kN', tone: r.Rmin >= -1e-6 ? '' : 'bad' }
    ]));

    // Reaksi & geometri
    results.appendChild(UI.rhead('Reaksi tiang & geometri'));
    if (r.mode === 'kapasitas') {
      results.appendChild(UI.kv('Basis', 'Kapasitas tiang · Q = ' + UI.fmt(r.Q, 0) + ' kN/tiang'));
      results.appendChild(UI.kv('ΣP = N·Q', UI.fmt(r.Ptot, 0) + ' kN'));
    } else {
      results.appendChild(UI.kv('Basis', 'Pu kolom = ' + UI.fmt(r.Pu, 0) + ' kN' +
        ((r.Mux || r.Muy) ? ' + momen' : '')));
      if (r.Mux || r.Muy)
        results.appendChild(UI.kv('Mux / Muy', UI.fmt(r.Mux, 0) + ' / ' + UI.fmt(r.Muy, 0) + ' kNm'));
    }
    results.appendChild(UI.kv('Reaksi tiang Ru (maks / min)', UI.fmt(r.Rmax, 1) + ' / ' + UI.fmt(r.Rmin, 1) + ' kN',
      r.Rmin >= -1e-6 ? '' : 'bad'));
    results.appendChild(UI.kv('Dimensi poer (Lx × Ly)', Math.round(r.Lx) + ' × ' + Math.round(r.Ly) + ' mm'));
    results.appendChild(UI.kv('d efektif (X / Y)', UI.fmt(r.dx, 0) + ' / ' + UI.fmt(r.dy, 0) + ' mm'));

    // Lentur
    var fx = r.flexX, fy = r.flexY;
    results.appendChild(UI.rhead('Lentur di muka kolom (Ps. 13.4.2)'));
    flexRows(results, UI, 'X (b=Ly)', fx, r);
    flexRows(results, UI, 'Y (b=Lx)', fy, r);

    // Geser satu arah
    results.appendChild(UI.rhead('Geser satu-arah / balok (Ps. 22.5)'));
    shearRow(results, UI, 'Arah X', r.vx);
    shearRow(results, UI, 'Arah Y', r.vy);

    // Pons kolom
    var pc = r.punchCol;
    results.appendChild(UI.rhead('Pons dua-arah kolom (Ps. 22.6)'));
    results.appendChild(UI.kv('b0 keliling (d/2)', UI.fmt(pc.b0, 0) + ' mm  ·  β = ' + UI.fmt(pc.beta, 2)));
    results.appendChild(UI.kv('vc', UI.fmt(pc.vc, 3) + ' MPa  →  φVc = ' + UI.fmt(pc.phiVc, 0) + ' kN'));
    results.appendChild(UI.kv('Vu / φVc', UI.fmt(pc.Vu, 0) + ' / ' + UI.fmt(pc.phiVc, 0) + ' kN  (D/C ' + UI.fmt(pc.dc, 2) + ')', dcState(pc.dc)));

    // Pons tiang
    var pp = r.punchPile;
    results.appendChild(UI.rhead('Pons tiang terkritis (Ps. 22.6)'));
    results.appendChild(UI.kv('Tiang # / posisi', (pp.i != null ? (pp.i + 1) : '—') + ' · ' +
      (pp.sides === 4 ? 'dalam' : pp.sides === 3 ? 'tepi' : 'sudut') + ' (αs=' + pp.alphaS + ')'));
    results.appendChild(UI.kv('b0 keliling terpangkas', UI.fmt(pp.b0, 0) + ' mm'));
    results.appendChild(UI.kv('Vu(=Ru) / φVc', UI.fmt(pp.Vu, 0) + ' / ' + UI.fmt(pp.phiVc, 0) + ' kN  (D/C ' + UI.fmt(pp.dc, 2) + ')', dcState(pp.dc)));

    if (r.warn.length)
      results.appendChild(UI.note('Peringatan',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));

    results.appendChild(UI.note('Metode & batasan',
      'Metode kaku (rigid cap): reaksi tiang merata (+ opsi momen), lentur & geser konvensional SNI 2847:2019. ' +
      'Berat sendiri poer diabaikan (konservatif). Untuk poer tebal dengan bentang geser pendek (av/d ≲ 2) ' +
      'aksi <b>strut-and-tie</b> (Ps. 23) lebih tepat dan tidak dicakup di sini. Tulangan minimum & detailing ' +
      'lihat tool <i>Tulangan Minimum</i>. Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  function flexRows(results, UI, tag, o, r) {
    results.appendChild(UI.kv('Mu ' + tag, UI.fmt(o.Mu / 1e3, 1) + ' kNm  →  As,perlu ' +
      (isFinite(o.AsReq) ? UI.fmt(o.AsReq, 0) + ' mm²' : 'over-reinf!'), o.over ? 'bad' : ''));
    results.appendChild(UI.kv('As pakai ' + tag + (o.AsMinGov ? ' (As,min)' : ''),
      o.nBar + 'D' + r.db + ' = ' + UI.fmt(o.AsProv, 0) + ' mm² @' + UI.fmt(o.spacing, 0) + ' mm',
      o.spacing <= o.sMax ? 'ok' : 'bad'));
    results.appendChild(UI.kv('φMn ' + tag + '  (D/C)', UI.fmt(o.phiMn, 0) + ' kNm  (' + UI.fmt(o.dc, 2) + ')', dcState(o.dc)));
  }

  function shearRow(results, UI, tag, o) {
    results.appendChild(UI.kv(tag + ' — Vu / φVc',
      state.UI.fmt(o.Vu, 0) + ' / ' + state.UI.fmt(o.phiVc, 0) + ' kN  (D/C ' + state.UI.fmt(o.dc, 2) + ')', dcState(o.dc)));
  }

  /* ================= KANVAS (denah) ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint');
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data untuk melihat denah poer.', w / 2, h / 2);
      return;
    }
    var padT = 46, padB = 40, padL = 40, padR = 40;
    var sc = Math.min((w - padL - padR) / r.Lx, (h - padT - padB) / r.Ly);
    var ox = w / 2, oy = padT + (h - padT - padB) / 2;   // origin (pusat kolom) di layar
    function sx(mx) { return ox + mx * sc; }
    function sy(my) { return oy - my * sc; }

    // poer
    ctx.fillStyle = css('--panel-solid'); ctx.globalAlpha = 0.9;
    ctx.fillRect(sx(-r.Lx / 2), sy(r.Ly / 2), r.Lx * sc, r.Ly * sc);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.4;
    ctx.strokeRect(sx(-r.Lx / 2), sy(r.Ly / 2), r.Lx * sc, r.Ly * sc);

    var v = state.view;
    // overlay lentur: garis muka kolom
    if (v === 'flexure') {
      dashLine(ctx, sx(r.cx / 2), sy(r.Ly / 2), sx(r.cx / 2), sy(-r.Ly / 2), css('--amber'));
      dashLine(ctx, sx(-r.cx / 2), sy(r.Ly / 2), sx(-r.cx / 2), sy(-r.Ly / 2), css('--amber'));
      dashLine(ctx, sx(-r.Lx / 2), sy(r.cy / 2), sx(r.Lx / 2), sy(r.cy / 2), css('--sage') || css('--amber'));
      dashLine(ctx, sx(-r.Lx / 2), sy(-r.cy / 2), sx(r.Lx / 2), sy(-r.cy / 2), css('--sage') || css('--amber'));
    }
    // overlay geser satu arah: penampang d dari muka
    if (v === 'oneway') {
      var xL = r.cx / 2 + r.dx, yL = r.cy / 2 + r.dy;
      [xL, -xL].forEach(function (xx) { dashLine(ctx, sx(xx), sy(r.Ly / 2), sx(xx), sy(-r.Ly / 2), css('--amber')); });
      [yL, -yL].forEach(function (yy) { dashLine(ctx, sx(-r.Lx / 2), sy(yy), sx(r.Lx / 2), sy(yy), css('--amber')); });
    }
    // overlay pons: keliling kolom + tiang kritis
    if (v === 'punch') {
      var pc = r.punchCol;
      dashRect(ctx, sx(-pc.bx / 2), sy(pc.by / 2), pc.bx * sc, pc.by * sc, css('--amber'));
      var pp = r.punchPile;
      if (pp.i != null) {
        var he = (pp.a / 2 + pp.d / 2);
        var p = r.piles[pp.i];
        dashRect(ctx, sx(p.x - he), sy(p.y + he), 2 * he * sc, 2 * he * sc, css('--sage') || css('--amber'));
      }
    }

    // kolom
    ctx.strokeStyle = css('--ink-dim'); ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.strokeRect(sx(-r.cx / 2), sy(r.cy / 2), r.cx * sc, r.cy * sc);
    ctx.fillStyle = css('--ink-faint'); ctx.globalAlpha = 0.25;
    ctx.fillRect(sx(-r.cx / 2), sy(r.cy / 2), r.cx * sc, r.cy * sc);
    ctx.globalAlpha = 1;

    // tiang
    var hotIdx = -1;
    if (state.mouse) {
      for (var k = 0; k < r.n; k++) {
        if (Math.hypot(state.mouse.x - sx(r.piles[k].x), state.mouse.y - sy(r.piles[k].y)) <= r.dp / 2 * sc + 3) hotIdx = k;
      }
    }
    for (var i = 0; i < r.n; i++) {
      var p = r.piles[i], px = sx(p.x), py = sy(p.y), rad = r.dp / 2 * sc;
      var isCrit = (v === 'punch' && r.punchPile.i === i);
      ctx.beginPath(); ctx.arc(px, py, Math.max(4, rad), 0, Math.PI * 2);
      ctx.fillStyle = css('--bg2'); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = (i === hotIdx || isCrit) ? css('--amber') : css('--ink-dim');
      ctx.lineWidth = (i === hotIdx || isCrit) ? 2.2 : 1.4;
      ctx.stroke();
      ctx.fillStyle = css('--ink-dim');
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('' + (i + 1), px, py);
    }
    ctx.textBaseline = 'alphabetic';

    // dimensi Lx, Ly (mode susunan)
    if (v === 'layout') {
      dimLine(ctx, sx(-r.Lx / 2), sx(r.Lx / 2), sy(-r.Ly / 2) + 20, css('--ink-dim'), 'Lx = ' + Math.round(r.Lx));
      dimVert(ctx, sx(-r.Lx / 2) - 16, sy(r.Ly / 2), sy(-r.Ly / 2), css('--ink-dim'), 'Ly ' + Math.round(r.Ly));
    }

    // tooltip reaksi tiang
    if (hotIdx >= 0) {
      state.UI.canvasTip(ctx, { mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'Tiang ' + (hotIdx + 1) + ' · Ru ' + r.R[hotIdx].toFixed(1) + ' kN' });
    }
  }

  function dashLine(ctx, x1, y1, x2, y2, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  function dashRect(ctx, x, y, w, h, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h); ctx.restore();
  }
  function dimLine(ctx, x1, x2, y, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = css('--bg'); ctx.fillRect((x1 + x2) / 2 - tw / 2 - 4, y - 8, tw + 8, 16);
    ctx.fillStyle = color; ctx.fillText(label, (x1 + x2) / 2, y + 4);
  }
  function dimVert(ctx, x, y1, y2, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    ctx.save(); ctx.translate(x - 10, (y1 + y2) / 2);
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
      .replace(/ρ/g, 'rho').replace(/φ/g, 'phi').replace(/Ø/g, 'O').replace(/·/g, '*')
      .replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/²/g, '2').replace(/³/g, '3')
      .replace(/β/g, 'beta').replace(/α/g, 'alpha').replace(/Σ/g, 'S').replace(/×/g, 'x')
      .replace(/′/g, "'").replace(/’/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/±/g, '+/-').replace(/[^\x20-\x7E]/g, '?');
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

  // Gbr. 1 — denah poer: tiang + reaksi, kolom, perimeter pons, dimensi
  function figPileCap(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var sc = Math.min(230 / r.Lx, 132 / r.Ly);
    var cx0 = 250, cyc = 28 + r.Ly * sc / 2;
    function X(x) { return cx0 + x * sc; }
    function Y(y) { return cyc - y * sc; }                // denah: y ke atas
    // poer
    ops.push({ t: 'rect', x: X(-r.Lx / 2), y: Y(r.Ly / 2), w: r.Lx * sc, h: r.Ly * sc, lw: 1.2 });
    // kolom (pusat)
    ops.push({ t: 'rect', x: X(-r.cx / 2), y: Y(r.cy / 2), w: r.cx * sc, h: r.cy * sc, fill: true, g: 0.55 });
    // perimeter pons kolom (d/2 dari muka)
    var bx = (r.cx + r.davg) * sc, by = (r.cy + r.davg) * sc;
    ops.push({ t: 'rect', x: cx0 - bx / 2, y: cyc - by / 2, w: bx, h: by, lw: 0.6, g: 0.4, dash: [4, 3] });
    ops.push({ t: 'text', x: cx0 + bx / 2 + 3, y: cyc - by / 2 + 6, s: 'b0 pons', size: 5.5, g: 0.4 });
    // tiang + reaksi
    var rp = Math.max(4, r.dp / 2 * sc);
    r.piles.forEach(function (pl, i2) {
      ops.push({ t: 'circle', cx: X(pl.x), cy: Y(pl.y), r: rp, lw: 1 });
      ops.push({ t: 'circle', cx: X(pl.x), cy: Y(pl.y), r: 1.2, fill: true, g: 0.3 });
      ops.push({ t: 'text', x: X(pl.x), y: Y(pl.y) + rp + 8, s: numR(r.R[i2], 0), size: 5.5, align: 'c', g: 0.25 });
    });
    // dimensi
    F.dimH(ops, X(-r.Lx / 2), X(r.Lx / 2), Y(-r.Ly / 2) + 18, 'Lx = ' + Math.round(r.Lx));
    F.dimV(ops, Y(r.Ly / 2), Y(-r.Ly / 2), X(r.Lx / 2) + 16, '');
    ops.push({ t: 'text', x: X(r.Lx / 2) + 22, y: cyc + 2.5, s: 'Ly = ' + Math.round(r.Ly), size: 6.5 });
    if (r.piles.length >= 2) {
      var pA = r.piles[0], pB = r.piles[1];
      if (Math.abs(pA.y - pB.y) < 1)
        F.dimH(ops, X(pA.x), X(pB.x), Y(r.Ly / 2) - 10, 's = ' + Math.round(r.s));
    }
    var yCap = Y(-r.Ly / 2) + 34;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Denah poer ' + r.n + ' tiang (angka = reaksi kN) - ' +
      'governing: ' + tolatin(r.gov.name) + ' D/C ' + numR(r.gov.dc, 2), size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Denah poer & reaksi tiang - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('DESAIN PILE CAP - ' + r.n + ' TIANG'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019 (metode kaku)', dt));
    L.push('');
    L.push(' INPUT');
    L.push(ruleR('-'));
    if (r.mode === 'kapasitas') {
      L.push(rowR('Basis beban', 'Kapasitas tiang (desain kapasitas)'));
      L.push(rowR('Q terfaktor / tiang', numR(r.Q, 0) + ' kN'));
      L.push(rowR('SP = N*Q', numR(r.Ptot, 0) + ' kN'));
    } else {
      L.push(rowR('Basis beban', 'Ultimate kolom Pu'));
      L.push(rowR('Pu', numR(r.Pu, 0) + ' kN'));
      L.push(rowR('Mux / Muy', numR(r.Mux, 0) + ' / ' + numR(r.Muy, 0) + ' kNm'));
    }
    L.push(rowR('Jumlah tiang', '' + r.n));
    L.push(rowR('dp / s / overhang', numR(r.dp, 0) + ' / ' + numR(r.s, 0) + ' / ' + numR(r.ov, 0) + ' mm'));
    L.push(rowR('Kolom cx x cy', numR(r.cx, 0) + ' x ' + numR(r.cy, 0) + ' mm'));
    L.push(rowR('Poer Lx x Ly x h', numR(r.Lx, 0) + ' x ' + numR(r.Ly, 0) + ' x ' + numR(r.h, 0) + ' mm'));
    L.push(rowR("f'c / fy / selimut", numR(r.fc, 0) + ' / ' + numR(r.fy, 0) + ' MPa / ' + numR(r.cov, 0) + ' mm'));
    L.push(rowR('d efektif X / Y', numR(r.dx, 0) + ' / ' + numR(r.dy, 0) + ' mm'));
    L.push('');
    L.push(' REAKSI TIANG (kN)');
    L.push(ruleR('-'));
    r.R.forEach(function (Ri, i) {
      L.push(rowR('Tiang ' + (i + 1) + '  (x=' + numR(r.piles[i].x, 0) + ', y=' + numR(r.piles[i].y, 0) + ')', numR(Ri, 1)));
    });
    L.push(rowR('Ru maks / min', numR(r.Rmax, 1) + ' / ' + numR(r.Rmin, 1) + ' kN'));
    L.push('');
    L.push(figPileCap(r));
    L.push('');
    L.push(' LENTUR DI MUKA KOLOM (Ps. 13.4.2)');
    L.push(ruleR('-'));
    [['X (b=Ly)', r.flexX], ['Y (b=Lx)', r.flexY]].forEach(function (pr) {
      var o = pr[1];
      L.push(rowR('Mu ' + pr[0], numR(o.Mu / 1e3, 1) + ' kNm'));
      L.push(rowR('  As perlu / As,min', numR(o.AsReq, 0) + ' / ' + numR(o.AsMin, 0) + ' mm2'));
      L.push(rowR('  >> PAKAI', o.nBar + 'D' + r.db + ' = ' + numR(o.AsProv, 0) + ' mm2 @ ' + numR(o.spacing, 0) + ' mm'));
      L.push(rowR('  phiMn / D-C', numR(o.phiMn, 0) + ' kNm / ' + numR(o.dc, 2)));
    });
    L.push('');
    L.push(' GESER SATU-ARAH (Ps. 22.5)');
    L.push(ruleR('-'));
    [['X', r.vx], ['Y', r.vy]].forEach(function (pr) {
      var o = pr[1];
      L.push(rowR('Arah ' + pr[0] + '  Vu / phiVc', numR(o.Vu, 0) + ' / ' + numR(o.phiVc, 0) + ' kN'));
      L.push(rowR('  D-C', numR(o.dc, 2) + (o.dc <= 1 ? '  OK' : '  NG')));
    });
    L.push('');
    L.push(' PONS DUA-ARAH (Ps. 22.6)');
    L.push(ruleR('-'));
    L.push(rowR('Kolom  b0 / beta', numR(r.punchCol.b0, 0) + ' mm / ' + numR(r.punchCol.beta, 2)));
    L.push(rowR('  Vu / phiVc', numR(r.punchCol.Vu, 0) + ' / ' + numR(r.punchCol.phiVc, 0) + ' kN'));
    L.push(rowR('  D-C', numR(r.punchCol.dc, 2) + (r.punchCol.dc <= 1 ? '  OK' : '  NG')));
    L.push(rowR('Tiang kritis #' + (r.punchPile.i != null ? r.punchPile.i + 1 : '-') + '  b0', numR(r.punchPile.b0, 0) + ' mm (alpha_s=' + r.punchPile.alphaS + ')'));
    L.push(rowR('  Vu / phiVc', numR(r.punchPile.Vu, 0) + ' / ' + numR(r.punchPile.phiVc, 0) + ' kN'));
    L.push(rowR('  D-C', numR(r.punchPile.dc, 2) + (r.punchPile.dc <= 1 ? '  OK' : '  NG')));
    L.push('');
    L.push(' OUTPUT');
    L.push(ruleR('='));
    L.push(rowR('>> GOVERNING', r.gov.name + '  D/C = ' + numR(r.gov.dc, 2)));
    L.push(rowR('>> STATUS', r.ok ? 'AMAN (semua D/C <= 1,0)' : 'TIDAK OK - perbesar poer/tebal'));
    L.push(ruleR('='));
    if (r.warn.length) {
      L.push('');
      L.push(' CATATAN');
      L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Metode kaku; berat sendiri poer diabaikan. Poer tebal bentang');
    L.push(' geser pendek -> tinjau strut-and-tie (Ps. 23). ');
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
    var base = 'Pile-Cap_' + r.n + 'tiang_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Desain Pile Cap', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null, view: 'layout' };
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
