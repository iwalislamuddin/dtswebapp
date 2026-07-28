/* ============================================================
   Civil Tools — modules/steel-beam-analysis/module.js  (Tier 2, kanvas 2D)
   ANALISIS BALOK BAJA SEDERHANA (di atas dua tumpuan, sendi–rol)
   Statika balok statis tertentu: reaksi, gaya geser (SFD), momen lentur
   (BMD), dan lendutan (elastic curve) untuk kombinasi beban:
     - Beban merata / segitiga / trapesium : "patch" beban linier
       intensitas w1 di x=a1 → w2 di x=a2 (jarak dari tumpuan kiri).
         merata penuh  : a1=0, a2=L, w1=w2
         merata sebagian: a1..a2, w1=w2
         segitiga      : w1=0 atau w2=0
         trapesium     : w1, w2 sembarang
     - Beban terpusat : P pada jarak a dari tumpuan kiri (maks 4).
     - (opsional) berat sendiri profil sebagai merata penuh.

   METODE
     Reaksi        : ΣV=0, ΣM=0 (balok statis tertentu).
     V(x), M(x)    : integrasi gaya di kiri penampang (closed-form untuk
                     patch trapesium — luas & momen parsial analitik).
     Lendutan y(x) : integrasi ganda kurva EI·y'' = M(x) (trapesium
                     kumulatif), syarat batas y(0)=y(L)=0 → konstanta C1.
                     Konvensi: beban & lendutan ke BAWAH positif, M sagging
                     (serat bawah tarik) positif.
     E = 200000 MPa (baja), I = Ix profil (sumbu kuat).

   Alat BANTU ANALISIS — bukan cek kapasitas. Untuk kapasitas lentur (φMn,
   LTB) pakai tool "Balok Baja (Lentur)". Verifikasi oleh insinyur.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'steel-beam-analysis';

  var MAX_DIST = 3;      // patch beban merata/trapesium maksimum
  var MAX_PT = 4;        // beban terpusat maksimum
  var NINT = 400;        // jumlah interval integrasi (grid seragam)
  var EPS = 1e-6;

  // Tipe profil yang didukung tool ini (subset library baja bersama)
  var PTYPES = ['WF', 'UNP', 'CNP', 'RHS', 'SHS'];

  var state = {};

  /* ============================================================
     LOAD HELPER — patch trapesium (koordinat & satuan SI: mm, N, N/mm)
     ============================================================ */
  // luas & momen (thd penampang x) dari bagian patch yang berada di KIRI x.
  // return { A: gaya resultan bagian kiri (N), Mo: momen thd x (N·mm) }
  function patchLeft(d, x) {
    if (x <= d.a1 + EPS) return { A: 0, Mo: 0 };
    var t = Math.min(x, d.a2);
    var Lp = d.a2 - d.a1;
    var wt = (Lp > EPS) ? d.w1 + (d.w2 - d.w1) * (t - d.a1) / Lp : d.w1;
    var len = t - d.a1;
    var A = (d.w1 + wt) / 2 * len;                       // N
    var xbar = (d.w1 + wt) > EPS ? len * (d.w1 + 2 * wt) / (3 * (d.w1 + wt)) : len / 2;
    var pos = d.a1 + xbar;                                // posisi resultan dari kiri (mm)
    return { A: A, Mo: A * (x - pos) };
  }
  // resultan penuh 1 patch (untuk reaksi): { W, xpos }
  function patchFull(d) {
    var Lp = d.a2 - d.a1;
    var W = (d.w1 + d.w2) / 2 * Lp;
    var xc = (d.w1 + d.w2) > EPS ? Lp * (d.w1 + 2 * d.w2) / (3 * (d.w1 + d.w2)) : Lp / 2;
    return { W: W, xpos: d.a1 + xc };
  }

  /* ================= PERHITUNGAN ================= */
  function compute(v) {
    var r = { valid: true, warn: [] };
    var prof = state.profile;
    if (!prof) { r.valid = false; return r; }
    r.prof = prof;

    var Lm = v.L;
    if (!(Lm > 0)) { r.valid = false; return r; }
    var cLm = Math.max(0, num(v.cL)), cRm = Math.max(0, num(v.cR));   // kantilever kiri/kanan (m)
    var LtotM = cLm + Lm + cRm;                         // panjang total balok (m)
    var L = Lm * 1000;                                  // bentang antar tumpuan (mm)
    var Ltot = LtotM * 1000;                            // panjang total (mm)
    var xA = cLm * 1000, xB = (cLm + Lm) * 1000;        // posisi tumpuan A (sendi) & B (rol), mm dari ujung kiri
    var E = (v.E > 0) ? v.E : 200000;                   // N/mm²
    var I = prof.Ix * 1e4;                              // cm⁴ → mm⁴
    var EI = E * I;
    r.L = Lm; r.cL = cLm; r.cR = cRm; r.Ltot = LtotM; r.xA = xA / 1000; r.xB = xB / 1000;
    r.E = E; r.I = prof.Ix; r.EI = EI;

    // ---- kumpulkan beban (satuan SI internal) ----
    var D = [];   // patch: {w1,w2,a1,a2} → N/mm & mm
    var P = [];   // titik: {P,a} → N & mm
    r.inpDist = []; r.inpPt = [];

    var nd = Math.max(0, Math.min(MAX_DIST, Math.round(v.nd)));
    for (var i = 1; i <= nd; i++) {
      var w1 = num(v['d' + i + '_w1']), w2 = num(v['d' + i + '_w2']);
      var a1 = num(v['d' + i + '_a1']), a2 = num(v['d' + i + '_a2']);
      if (a2 <= a1) { r.warn.push('Beban merata #' + i + ': a2 (' + fmtm(a2) + ') ≤ a1 (' + fmtm(a1) + ') — diabaikan.'); continue; }
      var ca1 = clamp(a1, 0, LtotM), ca2 = clamp(a2, 0, LtotM);
      if (ca1 !== a1 || ca2 !== a2) r.warn.push('Beban merata #' + i + ': posisi dipotong ke panjang balok 0…' + fmtm(LtotM) + ' m.');
      if (ca2 <= ca1) continue;
      if ((w1 === 0 && w2 === 0)) continue;
      r.inpDist.push({ w1: w1, w2: w2, a1: ca1, a2: ca2 });
      D.push({ w1: w1, w2: w2, a1: ca1 * 1000, a2: ca2 * 1000 });   // w[kN/m]≡[N/mm]
    }

    // berat sendiri profil (merata penuh) — kg/m → kN/m
    if (v.self === 'ya' && prof.w > 0) {
      var wsw = prof.w * 9.81 / 1000;                   // kN/m
      r.wself = wsw;
      D.push({ w1: wsw, w2: wsw, a1: 0, a2: Ltot });
      r.inpDist.push({ w1: wsw, w2: wsw, a1: 0, a2: LtotM, self: true });
    }

    var np = Math.max(0, Math.min(MAX_PT, Math.round(v.np)));
    for (i = 1; i <= np; i++) {
      var Pv = num(v['p' + i + '_P']), a = num(v['p' + i + '_a']);
      if (!(Math.abs(Pv) > 0)) continue;
      var ca = clamp(a, 0, LtotM);
      if (ca !== a) r.warn.push('Beban terpusat #' + i + ': posisi dipotong ke 0…' + fmtm(LtotM) + ' m.');
      r.inpPt.push({ P: Pv, a: ca });
      P.push({ P: Pv * 1000, a: ca * 1000 });           // N, mm
    }

    if (!D.length && !P.length) { r.valid = false; r.noload = true; return r; }
    r.D = D; r.P = P;

    // ---- reaksi (ΣM tumpuan A; tumpuan bisa internal bila ada kantilever) ----
    var sumF = 0, sumMA = 0;
    D.forEach(function (d) { var f = patchFull(d); sumF += f.W; sumMA += f.W * (f.xpos - xA); });
    P.forEach(function (p) { sumF += p.P; sumMA += p.P * (p.a - xA); });
    var RB = sumMA / L;                                  // ΣM_A = 0 → RB·L = Σ Fi·(xi−xA)
    var RA = sumF - RB;
    r.RA = RA / 1000; r.RB = RB / 1000;                 // kN
    r.Wtot = sumF / 1000;

    // ---- fungsi V & M (reaksi RA di xA, RB di xB) ----
    function shear(x, right) {
      var s = 0;
      if (right ? xA <= x + EPS : xA < x - EPS) s += RA;
      if (right ? xB <= x + EPS : xB < x - EPS) s += RB;
      P.forEach(function (p) { if (right ? p.a <= x + EPS : p.a < x - EPS) s -= p.P; });
      D.forEach(function (d) { s -= patchLeft(d, x).A; });
      return s;                                          // N
    }
    function moment(x) {
      var m = 0;
      if (xA < x + EPS) m += RA * (x - xA);
      if (xB < x + EPS) m += RB * (x - xB);
      P.forEach(function (p) { if (p.a <= x + EPS) m -= p.P * (x - p.a); });
      D.forEach(function (d) { m -= patchLeft(d, x).Mo; });
      return m;                                          // N·mm
    }

    // ---- grid seragam (seluruh panjang balok) untuk M & integrasi lendutan ----
    var xs = new Array(NINT + 1), M = new Array(NINT + 1), kappa = new Array(NINT + 1);
    for (i = 0; i <= NINT; i++) {
      var x = Ltot * i / NINT;
      xs[i] = x;
      M[i] = moment(x);
      kappa[i] = M[i] / EI;
    }

    // integrasi ganda: θ0 = ∫κ, y0 = ∫θ0 (trapesium kumulatif dari x=0; v0(0)=v0'(0)=0)
    var th0 = new Array(NINT + 1), y0 = new Array(NINT + 1);
    th0[0] = 0; y0[0] = 0;
    for (i = 1; i <= NINT; i++) {
      var h = xs[i] - xs[i - 1];
      th0[i] = th0[i - 1] + (kappa[i] + kappa[i - 1]) / 2 * h;
      y0[i] = y0[i - 1] + (th0[i] + th0[i - 1]) / 2 * h;
    }
    // v(x) = v0(x) + C1·x + C2 (v positif KE ATAS). Syarat batas: v=0 di KEDUA
    // tumpuan (xA, xB) — bisa internal bila ada kantilever. Interpolasi v0 di xA/xB.
    var v0A = interpY(xs, y0, xA), v0B = interpY(xs, y0, xB);
    var C1 = -(v0B - v0A) / L;
    var C2 = -(v0A + C1 * xA);
    var yv = new Array(NINT + 1);
    for (i = 0; i <= NINT; i++) yv[i] = -(y0[i] + C1 * xs[i] + C2);   // mm (+ = ke bawah)

    // ---- ekstrem ----
    // momen maks: kandidat grid + titik geser nol (interpolasi V) + posisi beban titik
    var Mmax = 0, xMmax = 0;
    for (i = 0; i <= NINT; i++) if (Math.abs(M[i]) > Math.abs(Mmax)) { Mmax = M[i]; xMmax = xs[i]; }
    // refine di lokasi V=0 (ganti tanda antar station memakai nilai kanan)
    var prevV = shear(0, true);
    for (i = 1; i <= NINT; i++) {
      var vNow = shear(xs[i], true);
      if (prevV === 0 || (prevV > 0) !== (vNow > 0)) {
        var xz = xs[i - 1] + (xs[i] - xs[i - 1]) * Math.abs(prevV) / (Math.abs(prevV) + Math.abs(vNow) + EPS);
        var mz = moment(xz);
        if (Math.abs(mz) > Math.abs(Mmax)) { Mmax = mz; xMmax = xz; }
      }
      prevV = vNow;
    }
    P.forEach(function (p) { var mp = moment(p.a); if (Math.abs(mp) > Math.abs(Mmax)) { Mmax = mp; xMmax = p.a; } });
    // momen di tumpuan (hogging maks di atas tumpuan bila ada kantilever)
    [xA, xB].forEach(function (xt) { var mt = moment(xt); if (Math.abs(mt) > Math.abs(Mmax)) { Mmax = mt; xMmax = xt; } });

    // geser maks: cek kedua sisi tiap beban titik & tumpuan (reaksi = lompatan geser)
    var Vmax = 0, xVmax = 0;
    function chkV(x, right) { var vv = shear(x, right); if (Math.abs(vv) > Math.abs(Vmax)) { Vmax = vv; xVmax = x; } }
    chkV(0, true); chkV(Ltot, false);
    chkV(xA, false); chkV(xA, true); chkV(xB, false); chkV(xB, true);
    P.forEach(function (p) { chkV(p.a, false); chkV(p.a, true); });
    for (i = 0; i <= NINT; i++) chkV(xs[i], true);

    // lendutan maks (magnitudo, bisa ke bawah + / ke atas −)
    var ymax = 0, xYmax = 0;
    for (i = 0; i <= NINT; i++) if (Math.abs(yv[i]) > Math.abs(ymax)) { ymax = yv[i]; xYmax = xs[i]; }

    r.Mmax = Mmax / 1e6; r.xMmax = xMmax / 1000;          // kN·m, m
    r.Vmax = Vmax / 1e3; r.xVmax = xVmax / 1000;          // kN, m
    r.ymax = ymax; r.xYmax = xYmax / 1000;                // mm, m
    r.ratio = Math.abs(ymax) > EPS ? L / Math.abs(ymax) : Infinity;

    // tegangan lentur fb = |Mmax| / Sx  (Sx cm³ → mm³)
    var Sx = prof.Sx * 1e3;
    r.fb = Sx > 0 ? Math.abs(Mmax) / Sx : null;           // MPa

    // ---- data plot ----
    // SFD: sertakan lompatan di beban titik & tumpuan (reaksi) → nilai kiri & kanan
    var Vpts = [];
    var jumpAt = [];   // posisi lompatan geser (beban titik + tumpuan)
    P.forEach(function (p) { jumpAt.push(p.a); });
    jumpAt.push(xA); jumpAt.push(xB);
    var stops = [0];
    for (i = 1; i < NINT; i++) stops.push(xs[i]);
    stops.push(Ltot);
    jumpAt.forEach(function (x) { stops.push(x); });
    D.forEach(function (d) { stops.push(d.a1); stops.push(d.a2); });
    stops = uniqSort(stops.filter(function (x) { return x >= 0 && x <= Ltot; }));
    stops.forEach(function (x) {
      var isJump = jumpAt.some(function (j) { return Math.abs(j - x) < 1e-3; });
      if (isJump && x > EPS) Vpts.push([x, shear(x, false)]);     // sisi kiri
      Vpts.push([x, shear(x, true)]);                             // sisi kanan
    });
    r.plot = { xs: xs, M: M, y: yv, Vpts: Vpts };
    // fungsi bantu untuk hover (kembalikan kN, kN·m, mm)
    r.at = function (xm) {
      var x = clamp(xm, 0, LtotM) * 1000;
      return { V: shear(x, true) / 1e3, M: moment(x) / 1e6, y: interpY(xs, yv, x) };
    };
    return r;
  }

  function interpY(xs, yv, x) {
    if (x <= xs[0]) return yv[0];
    if (x >= xs[xs.length - 1]) return yv[yv.length - 1];
    var i = Math.min(xs.length - 2, Math.floor(x / (xs[1] - xs[0])));
    while (i < xs.length - 1 && xs[i + 1] < x) i++;
    var t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return yv[i] + (yv[i + 1] - yv[i]) * t;
  }
  function num(x) { return isFinite(x) ? x : 0; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function fmtm(x) { return (Math.round(x * 1000) / 1000); }
  function uniqSort(arr) {
    arr.sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < arr.length; i++) if (i === 0 || arr[i] - out[out.length - 1] > 1e-4) out.push(arr[i]);
    return out;
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('sba-style')) return;
    var s = document.createElement('style');
    s.id = 'sba-style';
    s.textContent =
      '.sba-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.sba-canvas{position:relative;flex:1 1 56%;min-height:300px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.sba-res{flex:1 1 44%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Analisis Balok Baja Sederhana'));
    panel.appendChild(UI.el('div', 'sub', 'Reaksi, gaya geser (SFD), momen (BMD) & lendutan balok di atas dua tumpuan (sendi–rol), dengan opsi kantilever kiri/kanan. Statika elastis; E = 200.000 MPa, lentur sumbu kuat.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'sba-work');
    var canvasHost = UI.el('div', 'sba-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Diagram gaya dalam & lendutan');
    var results = UI.el('div', 'sba-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    // ---- schema form ----
    var schema = [
      { type: 'group', label: 'Profil & Bentang' },
      { type: 'select', id: 'ptype', label: 'Tipe profil', value: 'WF', options: PTYPES.map(function (t) {
        var info = state.steel.typeInfo(t); return { value: t, label: info ? info.name : t };
      }) },
      { type: 'select', id: 'psize', label: 'Ukuran profil', value: '', options: [] },
      { type: 'number', id: 'L', label: 'L — bentang antar tumpuan', unit: 'm', value: 6, min: 0.3, step: 0.1 },
      { type: 'number', id: 'cL', label: 'Kantilever kiri (di luar tumpuan A)', unit: 'm', value: 0, min: 0, step: 0.1, hint: 'Bagian menjorok di kiri tumpuan A. 0 = tanpa kantilever.' },
      { type: 'number', id: 'cR', label: 'Kantilever kanan (di luar tumpuan B)', unit: 'm', value: 0, min: 0, step: 0.1, hint: 'Semua posisi beban diukur dari UJUNG KIRI balok (x=0).' },
      { type: 'number', id: 'E', label: 'E — modulus elastisitas', unit: 'MPa', value: 200000, min: 1000, step: 1000 },
      { type: 'segment', id: 'self', label: 'Berat sendiri profil', value: 'ya', options: [
        { value: 'ya', label: 'Sertakan' }, { value: 'tidak', label: 'Abaikan' }] },

      { type: 'group', label: 'Beban Merata / Segitiga / Trapesium' },
      { type: 'number', id: 'nd', label: 'Jumlah beban merata/trapesium', unit: '', value: 1, min: 0, max: MAX_DIST, step: 1 }
    ];
    for (var i = 1; i <= MAX_DIST; i++) {
      schema.push({ type: 'group', label: 'Beban merata #' + i + ' — w1→w2 dari a1 ke a2', gid: 'gd' + i });
      schema.push({ type: 'number', id: 'd' + i + '_w1', label: 'w1 — intensitas di a1', unit: 'kN/m', value: i === 1 ? 15 : 0, min: 0, step: 0.5 });
      schema.push({ type: 'number', id: 'd' + i + '_w2', label: 'w2 — intensitas di a2', unit: 'kN/m', value: i === 1 ? 15 : 0, min: 0, step: 0.5 });
      schema.push({ type: 'number', id: 'd' + i + '_a1', label: 'a1 — awal (dari ujung kiri)', unit: 'm', value: 0, min: 0, step: 0.1 });
      schema.push({ type: 'number', id: 'd' + i + '_a2', label: 'a2 — akhir (dari ujung kiri)', unit: 'm', value: 6, min: 0, step: 0.1 });
    }
    schema.push({ type: 'group', label: 'Beban Terpusat' });
    schema.push({ type: 'number', id: 'np', label: 'Jumlah beban terpusat', unit: '', value: 1, min: 0, max: MAX_PT, step: 1 });
    for (i = 1; i <= MAX_PT; i++) {
      schema.push({ type: 'group', label: 'Beban terpusat #' + i, gid: 'gp' + i });
      schema.push({ type: 'number', id: 'p' + i + '_P', label: 'P — beban', unit: 'kN', value: i === 1 ? 30 : 0, min: -1e6, step: 1 });
      schema.push({ type: 'number', id: 'p' + i + '_a', label: 'a — jarak dari ujung kiri', unit: 'm', value: i === 1 ? 3 : 0, min: 0, step: 0.1 });
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'ptype') { populateSizes(vals.ptype); vals = form.getValues(); }
      syncVisibility(vals);
      resolveProfile(vals);
      update(vals, results);
    }, ID);
    state.form = form;
    state.results = results;

    // isi opsi ukuran + pulihkan pilihan tersimpan
    populateSizes(form.getValues().ptype);
    form.restore('psize');

    // ---- tombol laporan ----
    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    // ---- kanvas ----
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

    var vals0 = form.getValues();
    syncVisibility(vals0);
    resolveProfile(vals0);
    update(vals0, results);

    function populateSizes(type) {
      var sel = form.fields.psize.node;
      var list = state.steel.list(type);
      sel.innerHTML = '';
      list.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.name; o.textContent = p.name;
        sel.appendChild(o);
      });
      // pilih default menengah bila belum ada pilihan valid
      if (list.length) sel.value = list[Math.min(list.length - 1, Math.floor(list.length / 2))].name;
    }

    function syncVisibility(vals) {
      if (!state.groups) indexGroups();
      var nd = Math.round(vals.nd), np = Math.round(vals.np);
      // grup patch & titik: tampil sesuai jumlah
      for (var k = 1; k <= MAX_DIST; k++) {
        var show = k <= nd;
        ['d' + k + '_w1', 'd' + k + '_w2', 'd' + k + '_a1', 'd' + k + '_a2'].forEach(function (id) {
          toggleField(id, show);
        });
        toggleGroup('gd' + k, show);
      }
      for (k = 1; k <= MAX_PT; k++) {
        var showp = k <= np;
        ['p' + k + '_P', 'p' + k + '_a'].forEach(function (id) { toggleField(id, showp); });
        toggleGroup('gp' + k, showp);
      }
    }
    function toggleField(id, show) {
      var f = form.fields[id];
      if (f) { var w = f.node.closest('.ck-field'); if (w) w.style.display = show ? '' : 'none'; }
    }
    function toggleGroup(gid, show) {
      var g = state.groups && state.groups[gid];
      if (g) g.style.display = show ? '' : 'none';
    }
  }

  // pasang penanda gid ke elemen grup (buildForm tak menyimpannya) — cari via urutan header
  function indexGroups() {
    state.groups = {};
    var form = state.form;
    // Kita perlu memetakan header grup ke gid. buildForm memberi <h4> teks;
    // gunakan pencocokan teks label yang kita set unik di schema.
    var grps = form.root.querySelectorAll('.ck-grp');
    Array.prototype.forEach.call(grps, function (g) {
      var h = g.querySelector('h4');
      if (!h) return;
      var txt = h.textContent;
      for (var k = 1; k <= MAX_DIST; k++) if (txt.indexOf('Beban merata #' + k + ' —') === 0) state.groups['gd' + k] = g;
      for (k = 1; k <= MAX_PT; k++) if (txt === 'Beban terpusat #' + k) state.groups['gp' + k] = g;
    });
  }

  function resolveProfile(vals) {
    state.profile = state.steel.get(vals.ptype, vals.psize) || null;
  }

  function update(vals, results) {
    if (!state.groups) indexGroups();
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Diagram gaya dalam & lendutan');
      results.appendChild(UI.el('div', 'ck-empty',
        r.noload ? 'Tambahkan minimal satu beban (merata atau terpusat).'
                 : 'Pilih profil dan lengkapi bentang untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set('Mmaks ' + UI.fmt(Math.abs(r.Mmax), 2) + ' kN·m · Vmaks ' + UI.fmt(Math.abs(r.Vmax), 2) +
      ' kN · δmaks ' + UI.fmt(Math.abs(r.ymax), 2) + ' mm');

    results.appendChild(UI.heroRow([
      { label: 'Momen maks |M|', value: UI.fmt(Math.abs(r.Mmax), 2), unit: 'kN·m' },
      { label: 'Geser maks |V|', value: UI.fmt(Math.abs(r.Vmax), 2), unit: 'kN' },
      { label: 'Lendutan maks', value: UI.fmt(Math.abs(r.ymax), 2), unit: 'mm' }
    ]));

    results.appendChild(UI.rhead('Profil — ' + state.steel.typeInfo(vals.ptype).name + ' ' + r.prof.name));
    results.appendChild(UI.kv('Ix (sumbu kuat)', UI.fmt(r.prof.Ix, 0) + ' cm⁴'));
    results.appendChild(UI.kv('Sx (modulus penampang)', UI.fmt(r.prof.Sx, 1) + ' cm³'));
    if (r.prof.Zx) results.appendChild(UI.kv('Zx (modulus plastis)', UI.fmt(r.prof.Zx, 1) + ' cm³'));
    results.appendChild(UI.kv('Berat', UI.fmt(r.prof.w, 1) + ' kg/m' + (r.prof.source === 'hitung' ? ' (dihitung)' : '')));
    results.appendChild(UI.kv('E · Ix', UI.fmt(r.EI / 1e9, 0) + ' ×10⁹ N·mm²'));

    results.appendChild(UI.rhead('Reaksi tumpuan'));
    if (r.cL > 0 || r.cR > 0) {
      results.appendChild(UI.kv('Konfigurasi balok', 'panjang total ' + UI.fmt(r.Ltot, 2) + ' m' +
        (r.cL > 0 ? ' · kantilever kiri ' + UI.fmt(r.cL, 2) + ' m' : '') +
        (r.cR > 0 ? ' · kantilever kanan ' + UI.fmt(r.cR, 2) + ' m' : '')));
      results.appendChild(UI.kv('Posisi tumpuan A / B (dari ujung kiri)', UI.fmt(r.xA, 2) + ' / ' + UI.fmt(r.xB, 2) + ' m'));
    }
    results.appendChild(UI.kv('RA — tumpuan A (sendi)', UI.fmt(r.RA, 2) + ' kN'));
    results.appendChild(UI.kv('RB — tumpuan B (rol)', UI.fmt(r.RB, 2) + ' kN'));
    results.appendChild(UI.kv('ΣW — total beban', UI.fmt(r.Wtot, 2) + ' kN'));
    if (r.wself) results.appendChild(UI.kv('Berat sendiri (disertakan)', UI.fmt(r.wself, 3) + ' kN/m'));

    results.appendChild(UI.rhead('Gaya dalam & lendutan'));
    results.appendChild(UI.kv('Momen maks M (x = ' + UI.fmt(r.xMmax, 2) + ' m)',
      UI.fmt(r.Mmax, 2) + ' kN·m' + (r.Mmax < 0 ? ' (hogging)' : '')));
    results.appendChild(UI.kv('Geser maks V (x = ' + UI.fmt(r.xVmax, 2) + ' m)', UI.fmt(r.Vmax, 2) + ' kN'));
    results.appendChild(UI.kv('Lendutan maks δ (x = ' + UI.fmt(r.xYmax, 2) + ' m)',
      UI.fmt(r.ymax, 2) + ' mm' + (r.ymax < 0 ? ' (ke atas)' : ' (ke bawah)')));
    results.appendChild(UI.kv('Rasio L/δ', isFinite(r.ratio) ? UI.fmt(r.ratio, 0) : '—',
      isFinite(r.ratio) ? (r.ratio >= 360 ? 'ok' : (r.ratio >= 240 ? '' : 'bad')) : ''));
    if (r.fb != null) results.appendChild(UI.kv('Tegangan lentur fb = |M|/Sx', UI.fmt(r.fb, 1) + ' MPa'));

    results.appendChild(UI.note('Rasio lendutan (acuan umum)',
      'L/δ hasil ' + (isFinite(r.ratio) ? UI.fmt(r.ratio, 0) : '—') + '. Batas lazim SNI 1729/PPIUG: ' +
      'balok lantai L/360 (beban hidup), atap/total L/240. Nilai di atas batas = lebih kaku (baik). ' +
      'fb hanya tegangan lentur elastis (M/Sx) — belum termasuk tekuk torsi-lateral.'));

    if (r.warn.length) {
      results.appendChild(UI.note('Catatan input',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    }
    results.appendChild(UI.note('Metode & referensi',
      'Balok statis tertentu di atas dua tumpuan (sendi–rol). Reaksi dari kesetimbangan; V(x) & M(x) dari integrasi gaya; ' +
      'lendutan dari integrasi ganda EI·y″ = M(x) dengan y(0)=y(L)=0. Beban & lendutan ke bawah positif, momen sagging positif. ' +
      'Untuk cek kapasitas lentur (φMn, LTB) lanjutkan ke tool <b>Balok Baja (Lentur)</b>. Verifikasi oleh insinyur penanggung jawab.'));

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
      ctx.fillText(r && r.noload ? 'Tambahkan beban untuk melihat diagram.' : 'Masukkan data untuk melihat diagram.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), blue = css('--blue') || '#30bced', ok = css('--ok') || '#88b08a', line = css('--line');

    var padL = 52, padR = 26, padT = 30, padB = 10;
    var L = r.Ltot, plot = r.plot;   // sumbu-x = seluruh panjang balok (termasuk kantilever)
    function X(xm) { return padL + (xm / L) * (w - padL - padR); }

    // pembagian tinggi: baris balok (schematic) + 3 band diagram
    var beamH = 60;
    var gap = 12;
    var avail = h - padT - padB - beamH - gap * 3;
    var bandH = Math.max(52, avail / 3);
    var yBeam = padT + 30;                             // garis balok schematic
    var b1 = padT + beamH + gap;                       // SFD top
    var b2 = b1 + bandH + gap;                         // BMD top
    var b3 = b2 + bandH + gap;                         // lendutan top

    // ---------- balok + tumpuan + beban ----------
    drawLoads(ctx, r, X, yBeam, dim, faint, ink, amber);

    // ---------- SFD ----------
    var Varr = plot.Vpts.map(function (p) { return p[1] / 1e3; });   // kN
    var Vmx = maxAbs(Varr);
    drawDiagram(ctx, {
      top: b1, hh: bandH, X: X, L: L, color: blue, line: line, faint: faint, dim: dim,
      title: 'Gaya Geser  V (kN)', maxAbs: Vmx,
      poly: plot.Vpts.map(function (p) { return [p[0] / 1000, p[1] / 1e3]; }),
      maxVal: r.Vmax, maxX: r.xVmax, unit: 'kN'
    });

    // ---------- BMD ----------
    var Marr = plot.M.map(function (m) { return m / 1e6; });
    var Mmx = maxAbs(Marr);
    drawDiagram(ctx, {
      top: b2, hh: bandH, X: X, L: L, color: amber, line: line, faint: faint, dim: dim,
      title: 'Momen Lentur  M (kN·m)', maxAbs: Mmx, invert: true,   // sagging (+) ke bawah
      poly: plot.xs.map(function (x, i) { return [x / 1000, plot.M[i] / 1e6]; }),
      maxVal: r.Mmax, maxX: r.xMmax, unit: 'kN·m'
    });

    // ---------- Lendutan ----------
    var Yarr = plot.y;
    var Ymx = maxAbs(Yarr);
    drawDiagram(ctx, {
      top: b3, hh: bandH, X: X, L: L, color: ok, line: line, faint: faint, dim: dim,
      title: 'Lendutan  δ (mm)', maxAbs: Ymx, invert: true,    // ke bawah (+) ke bawah
      poly: plot.xs.map(function (x, i) { return [x / 1000, plot.y[i]]; }),
      maxVal: r.ymax, maxX: r.xYmax, unit: 'mm', fill: false
    });

    // ---------- hover: garis vertikal + tooltip ----------
    if (state.mouse) {
      var mx = state.mouse.x;
      if (mx >= padL - 2 && mx <= w - padR + 2) {
        var xm = clamp((mx - padL) / (w - padL - padR) * L, 0, L);
        var vals = r.at(xm);
        ctx.save();
        ctx.strokeStyle = faint; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(X(xm), padT + beamH); ctx.lineTo(X(xm), h - padB); ctx.stroke();
        ctx.restore();
        var txt = 'x=' + xm.toFixed(2) + 'm  V=' + vals.V.toFixed(1) + 'kN  M=' + vals.M.toFixed(1) + 'kNm  δ=' + vals.y.toFixed(2) + 'mm';
        state.UI.canvasTip(ctx, { mx: state.mouse.x, my: Math.max(state.mouse.y, padT + 40), w: w, h: h, text: txt, topBand: padT + beamH });
      }
    }
  }

  function maxAbs(arr) { var m = 1e-9; for (var i = 0; i < arr.length; i++) if (Math.abs(arr[i]) > m) m = Math.abs(arr[i]); return m; }

  // gambar balok schematic + tumpuan + beban merata/trapesium + beban titik
  function drawLoads(ctx, r, X, yBeam, dim, faint, ink, amber) {
    var xEndL = X(0), xEndR = X(r.Ltot);   // ujung balok (bisa kantilever)
    var xA = X(r.xA), xB = X(r.xB);         // posisi tumpuan A (sendi) & B (rol)
    // balok (seluruh panjang, termasuk bagian kantilever)
    ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(xEndL, yBeam); ctx.lineTo(xEndR, yBeam); ctx.stroke();
    // tumpuan A = sendi (segitiga), B = rol (segitiga + garis) — di posisi tumpuan
    ctx.strokeStyle = css('--support') || dim; ctx.fillStyle = css('--support') || dim; ctx.lineWidth = 1.5;
    tri(ctx, xA, yBeam); tri(ctx, xB, yBeam);
    ctx.beginPath(); ctx.moveTo(xB - 9, yBeam + 15); ctx.lineTo(xB + 9, yBeam + 15); ctx.stroke();
    // tanda ujung kantilever bebas
    if (r.cL > 0 || r.cR > 0) {
      ctx.strokeStyle = faint; ctx.lineWidth = 1;
      if (r.cL > 0) { ctx.beginPath(); ctx.moveTo(xEndL, yBeam - 5); ctx.lineTo(xEndL, yBeam + 5); ctx.stroke(); }
      if (r.cR > 0) { ctx.beginPath(); ctx.moveTo(xEndR, yBeam - 5); ctx.lineTo(xEndR, yBeam + 5); ctx.stroke(); }
    }

    // beban merata / trapesium
    ctx.font = '10px "JetBrains Mono", monospace';
    r.inpDist.forEach(function (d) {
      var x1 = X(d.a1), x2 = X(d.a2);
      var mx = maxDistW(r);
      var hMax = 18;
      var h1 = mx > 0 ? (Math.abs(d.w1) / mx) * hMax : 0;
      var h2 = mx > 0 ? (Math.abs(d.w2) / mx) * hMax : 0;
      var yTop = yBeam - 6;
      ctx.strokeStyle = d.self ? faint : amber; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1;
      // outline atas (garis w1..w2)
      ctx.beginPath(); ctx.moveTo(x1, yTop - h1); ctx.lineTo(x2, yTop - h2); ctx.stroke();
      // panah-panah kecil
      var span = x2 - x1, nA = Math.max(2, Math.min(24, Math.round(span / 16)));
      for (var k = 0; k <= nA; k++) {
        var xx = x1 + span * k / nA;
        var hh = h1 + (h2 - h1) * k / nA;
        ctx.beginPath(); ctx.moveTo(xx, yTop - hh); ctx.lineTo(xx, yTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx - 2, yTop - 4); ctx.lineTo(xx, yTop); ctx.lineTo(xx + 2, yTop - 4); ctx.stroke();
      }
      if (!d.self) {
        ctx.fillStyle = dim; ctx.textAlign = 'center';
        var lbl = (d.w1 === d.w2) ? d.w1.toFixed(1) : d.w1.toFixed(1) + '→' + d.w2.toFixed(1);
        ctx.fillText(lbl, (x1 + x2) / 2, yTop - Math.max(h1, h2) - 3);
      }
    });

    // beban terpusat
    r.inpPt.forEach(function (p) {
      var x = X(p.a);
      ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 1.8;
      var up = p.P < 0;   // beban ke atas → panah naik
      var y0 = yBeam - 26, y1 = yBeam - 5;
      if (up) { y0 = yBeam + 26; y1 = yBeam + 5; }
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      var dir = up ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x - 3.5, y1 - dir * 5); ctx.lineTo(x, y1); ctx.lineTo(x + 3.5, y1 - dir * 5); ctx.stroke();
      ctx.fillStyle = dim; ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(Math.abs(p.P).toFixed(0) + 'kN', x, up ? yBeam + 38 : yBeam - 30);
    });

    // label reaksi di posisi tumpuan
    ctx.fillStyle = css('--ok') || dim; ctx.textAlign = 'center'; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('RA=' + r.RA.toFixed(1), xA, yBeam + 27);
    ctx.fillText('RB=' + r.RB.toFixed(1), xB, yBeam + 27);
    // bentang antar tumpuan
    ctx.fillStyle = faint; ctx.fillText('L = ' + r.L.toFixed(2) + ' m', (xA + xB) / 2, yBeam + 27);
    // label kantilever
    if (r.cL > 0) ctx.fillText('c=' + r.cL.toFixed(2), (xEndL + xA) / 2, yBeam + 27);
    if (r.cR > 0) ctx.fillText('c=' + r.cR.toFixed(2), (xB + xEndR) / 2, yBeam + 27);
  }
  function tri(ctx, x, y) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 12); ctx.lineTo(x + 7, y + 12); ctx.closePath();
    ctx.stroke();
  }
  function maxDistW(r) {
    var m = 0; r.inpDist.forEach(function (d) { m = Math.max(m, Math.abs(d.w1), Math.abs(d.w2)); }); return m;
  }

  // gambar satu diagram (SFD/BMD/lendutan) dengan garis nol, isian, & penanda maks
  function drawDiagram(ctx, o) {
    var zeroY = o.top + o.hh / 2;
    var sc = (o.hh / 2 - 12) / o.maxAbs;
    var sgn = o.invert ? 1 : -1;    // invert: nilai positif digambar ke bawah
    function Y(val) { return zeroY + sgn * val * sc; }

    // garis nol + baseline label
    ctx.strokeStyle = o.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.X(0), zeroY); ctx.lineTo(o.X(o.L), zeroY); ctx.stroke();
    ctx.fillStyle = o.dim; ctx.font = '10px "Space Grotesk", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(o.title, o.X(0), o.top + 11);

    // kurva + isian
    var pts = o.poly;
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(o.X(pts[0][0]), Y(pts[0][1]));
      for (var i = 1; i < pts.length; i++) ctx.lineTo(o.X(pts[i][0]), Y(pts[i][1]));
      var stroke = ctx;
      // isian tipis ke garis nol
      if (o.fill !== false) {
        ctx.save();
        ctx.lineTo(o.X(pts[pts.length - 1][0]), zeroY);
        ctx.lineTo(o.X(pts[0][0]), zeroY);
        ctx.closePath();
        ctx.globalAlpha = 0.12; ctx.fillStyle = o.color; ctx.fill();
        ctx.restore();
      }
      // garis kurva (gambar ulang tanpa penutup isian)
      ctx.beginPath();
      ctx.moveTo(o.X(pts[0][0]), Y(pts[0][1]));
      for (i = 1; i < pts.length; i++) ctx.lineTo(o.X(pts[i][0]), Y(pts[i][1]));
      ctx.strokeStyle = o.color; ctx.lineWidth = 1.8; ctx.stroke();
    }

    // penanda nilai maks
    if (Math.abs(o.maxVal) > 1e-9) {
      var xm = o.X(o.maxX), ym = Y(o.maxVal);
      ctx.strokeStyle = o.color; ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xm, zeroY); ctx.lineTo(xm, ym); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(xm, ym, 2.6, 0, 7); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
      var below = sgn * o.maxVal > 0;   // titik di bawah nol?
      ctx.fillText(o.maxVal.toFixed(o.unit === 'mm' ? 2 : 1), xm, ym + (below ? 13 : -6));
    }
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.6.0';
  var RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value;
    var l = label + ' ', vv = ' ' + value;
    var d = RW - l.length - vv.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + vv;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/·/g, '*').replace(/²/g, '2').replace(/³/g, '3').replace(/⁴/g, '4')
      .replace(/γ/g, 'gamma').replace(/δ/g, 'delta').replace(/Σ/g, 'sum').replace(/φ/g, 'phi')
      .replace(/Ø/g, 'O').replace(/×/g, 'x').replace(/′/g, "'").replace(/’/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−→]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=')
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

  // Gbr.1 — balok+beban + SFD + BMD + lendutan (grayscale, native PDF)
  function figDiagrams(r) {
    var ops = [];
    var x0 = 60, wpx = 460, sx = wpx / r.Ltot;   // sumbu-x = seluruh panjang balok
    function X(xm) { return x0 + xm * sx; }
    var yBeam = 26;
    // beban titik & merata (skematik ringkas)
    r.inpDist.forEach(function (d) {
      var mxw = 1; r.inpDist.forEach(function (q) { mxw = Math.max(mxw, q.w1, q.w2); });
      var h1 = 12 * (Math.abs(d.w1) / mxw), h2 = 12 * (Math.abs(d.w2) / mxw);
      ops.push({ t: 'line', x1: X(d.a1), y1: yBeam - 6 - h1, x2: X(d.a2), y2: yBeam - 6 - h2, lw: 0.5, g: 0.5 });
      var span = X(d.a2) - X(d.a1), nA = Math.max(2, Math.round(span / 20));
      for (var k = 0; k <= nA; k++) {
        var xx = X(d.a1) + span * k / nA, hh = h1 + (h2 - h1) * k / nA;
        window.CivilReport.fig.arrow(ops, xx, yBeam - 6 - hh, xx, yBeam - 6, { lw: 0.4, g: 0.55 });
      }
    });
    r.inpPt.forEach(function (p) {
      window.CivilReport.fig.arrow(ops, X(p.a), yBeam - 22, X(p.a), yBeam - 4, { lw: 0.9, g: 0.1 });
      ops.push({ t: 'text', x: X(p.a), y: yBeam - 24, s: numR(Math.abs(p.P), 0) + 'kN', size: 6, align: 'c', g: 0.2 });
    });
    // balok (seluruh panjang) + tumpuan A/B di posisi tumpuan
    ops.push({ t: 'line', x1: X(0), y1: yBeam, x2: X(r.Ltot), y2: yBeam, lw: 1.6 });
    ops.push({ t: 'poly', pts: [[X(r.xA), yBeam], [X(r.xA) - 5, yBeam + 8], [X(r.xA) + 5, yBeam + 8]], close: true, g: 0.3 });
    ops.push({ t: 'poly', pts: [[X(r.xB), yBeam], [X(r.xB) - 5, yBeam + 8], [X(r.xB) + 5, yBeam + 8]], close: true, g: 0.3 });
    ops.push({ t: 'text', x: X(r.xA), y: yBeam + 18, s: 'RA=' + numR(r.RA, 1), size: 6, align: 'c', g: 0.2 });
    ops.push({ t: 'text', x: X(r.xB), y: yBeam + 18, s: 'RB=' + numR(r.RB, 1), size: 6, align: 'c', g: 0.2 });
    ops.push({ t: 'text', x: (X(r.xA) + X(r.xB)) / 2, y: yBeam + 18, s: 'L=' + numR(r.L, 2) + 'm', size: 6, align: 'c', g: 0.4 });

    // helper band
    function band(yc, hh, poly, maxAbs, maxVal, maxX, title, invert, dp) {
      var zeroY = yc + hh / 2, sc = (hh / 2 - 8) / maxAbs, sgn = invert ? 1 : -1;
      function Y(vv) { return zeroY + sgn * vv * sc; }
      ops.push({ t: 'line', x1: X(0), y1: zeroY, x2: X(r.Ltot), y2: zeroY, lw: 0.5, g: 0.6 });
      ops.push({ t: 'text', x: X(0), y: yc + 6, s: title, size: 6.5, g: 0.15 });
      var pts = poly.map(function (p) { return [X(p[0]), Y(p[1])]; });
      ops.push({ t: 'poly', pts: pts, lw: 1 });
      if (Math.abs(maxVal) > 1e-9) {
        ops.push({ t: 'text', x: X(maxX), y: Y(maxVal) + (sgn * maxVal > 0 ? 8 : -3), s: numR(maxVal, dp), size: 6, align: 'c', g: 0.1 });
      }
    }
    var plot = r.plot;
    var Vmx = 1e-9, Mmx = 1e-9, Ymx = 1e-9;
    plot.Vpts.forEach(function (p) { Vmx = Math.max(Vmx, Math.abs(p[1] / 1e3)); });
    plot.M.forEach(function (m) { Mmx = Math.max(Mmx, Math.abs(m / 1e6)); });
    plot.y.forEach(function (yy) { Ymx = Math.max(Ymx, Math.abs(yy)); });

    var bh = 46;
    band(48, bh, plot.Vpts.map(function (p) { return [p[0] / 1000, p[1] / 1e3]; }), Vmx, r.Vmax, r.xVmax, 'V (kN)', false, 1);
    band(48 + bh + 8, bh, plot.xs.map(function (x, i) { return [x / 1000, plot.M[i] / 1e6]; }), Mmx, r.Mmax, r.xMmax, 'M (kNm)', true, 1);
    band(48 + 2 * (bh + 8), bh, plot.xs.map(function (x, i) { return [x / 1000, plot.y[i]]; }), Ymx, r.ymax, r.xYmax, 'defl (mm)', true, 2);

    var yCap = 48 + 3 * (bh + 8) + 6;
    ops.push({ t: 'text', x: 290, y: yCap, s: 'Gbr. 1  Balok + beban, SFD, BMD & lendutan', size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops, alt: 'Gbr.1 SFD/BMD/lendutan - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var tinfo = state.steel.typeInfo(vals.ptype);
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('ANALISIS BALOK BAJA SEDERHANA (SFD / BMD / LENDUTAN)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Balok statis tertentu (sendi-rol)', dt));
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR('Tipe profil', (tinfo ? tinfo.name : vals.ptype) + ' ' + r.prof.name));
    L.push(rowR('Ix / Sx / Zx', numR(r.prof.Ix, 0) + ' / ' + numR(r.prof.Sx, 1) + ' / ' + (r.prof.Zx ? numR(r.prof.Zx, 1) : '-') + ' (cm4/cm3)'));
    L.push(rowR('Berat profil', numR(r.prof.w, 1) + ' kg/m'));
    L.push(rowR('Bentang antar tumpuan L', numR(r.L, 2) + ' m'));
    if (r.cL > 0 || r.cR > 0) {
      L.push(rowR('Kantilever kiri / kanan', numR(r.cL, 2) + ' / ' + numR(r.cR, 2) + ' m'));
      L.push(rowR('Panjang total balok', numR(r.Ltot, 2) + ' m'));
      L.push(rowR('Tumpuan A / B dari ujung kiri', numR(r.xA, 2) + ' / ' + numR(r.xB, 2) + ' m'));
    }
    L.push(rowR('Modulus E', numR(r.E, 0) + ' MPa'));
    L.push(rowR('Berat sendiri', r.wself ? 'disertakan (' + numR(r.wself, 3) + ' kN/m)' : 'diabaikan'));
    L.push('');
    L.push(' BEBAN');
    L.push(ruleR('-'));
    r.inpDist.forEach(function (d, i) {
      if (d.self) return;
      L.push(rowR('Merata #' + (i + 1) + ' w1-w2', numR(d.w1, 2) + '-' + numR(d.w2, 2) + ' kN/m'));
      L.push(rowR('   rentang a1..a2', numR(d.a1, 2) + ' .. ' + numR(d.a2, 2) + ' m'));
    });
    r.inpPt.forEach(function (pt, i) {
      L.push(rowR('Terpusat #' + (i + 1), 'P=' + numR(pt.P, 2) + ' kN @ ' + numR(pt.a, 2) + ' m'));
    });
    if (!r.inpPt.length && r.inpDist.every(function (d) { return d.self; })) L.push(' (hanya berat sendiri)');
    L.push('');
    L.push(figDiagrams(r));
    L.push('');
    L.push(' REAKSI');
    L.push(ruleR('-'));
    L.push(rowR('RA (kiri, sendi)', numR(r.RA, 2) + ' kN'));
    L.push(rowR('RB (kanan, rol)', numR(r.RB, 2) + ' kN'));
    L.push(rowR('Total beban ΣW', numR(r.Wtot, 2) + ' kN'));
    L.push('');
    L.push(' OUTPUT');
    L.push(ruleR('='));
    L.push(rowR('>> Momen maks |M| @ x=' + numR(r.xMmax, 2) + 'm', numR(r.Mmax, 2) + ' kN·m'));
    L.push(rowR('>> Geser maks |V| @ x=' + numR(r.xVmax, 2) + 'm', numR(r.Vmax, 2) + ' kN'));
    L.push(rowR('>> Lendutan maks @ x=' + numR(r.xYmax, 2) + 'm', numR(r.ymax, 2) + ' mm ' + (r.ymax < 0 ? '(atas)' : '(bawah)')));
    L.push(rowR('>> Rasio L/delta', isFinite(r.ratio) ? numR(r.ratio, 0) : '-'));
    if (r.fb != null) L.push(rowR('>> Tegangan lentur fb=|M|/Sx', numR(r.fb, 1) + ' MPa'));
    L.push(ruleR('='));
    L.push('');
    L.push(' Batas lendutan lazim: L/360 (beban hidup lantai), L/240 (total).');
    L.push(' fb = tegangan lentur elastis; belum termasuk tekuk torsi-lateral.');
    L.push(' Untuk cek kapasitas (phiMn, LTB) pakai tool Balok Baja (Lentur).');

    if (r.warn.length) {
      L.push('');
      L.push(' CATATAN INPUT');
      L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
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
    if (!r.valid) { UI.toast(r.noload ? 'Tambahkan beban dulu' : 'Lengkapi profil & bentang dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'BalokBaja_' + vals.ptype + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Analisis Balok Baja', category: 'Baja', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, steel: runtime.steel, mouse: null };
      if (!state.steel) { container.innerHTML = '<div class="welcome"><p>Library profil baja belum dimuat.</p></div>'; return; }
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
