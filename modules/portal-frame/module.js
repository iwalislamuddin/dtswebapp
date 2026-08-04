/* ============================================================
   Civil Tools — modules/portal-frame/module.js  (Tier 2, kanvas 2D)
   ANALISIS PORTAL SEDERHANA (2 kolom + 1 balok, satu bentang satu tingkat)

   Metode: DIREK-KEKAKUAN (matrix stiffness) rangka 2D.
     4 simpul × 3 DOF (u, v, θ) = 12 DOF.
       N0 kaki kolom kiri (0,0)     N1 kaki kolom kanan (Lb,0)
       N2 puncak kolom kiri (0,H)   N3 puncak kolom kanan (Lb,H)
     3 batang:  kolom-kiri N0→N2, kolom-kanan N1→N3, balok N2→N3.
     Elemen rangka bidang (aksial + lentur), 6 DOF/elemen.
     Beban bentang → gaya ujung terjepit (FEF) → beban simpul ekuivalen.
     Tumpuan: sendi-sendi (u=v=0) atau jepit-jepit (u=v=θ=0) di N0 & N1.

   Kenapa matriks (bukan distribusi momen / slope-deflection):
     12 DOF sangat ringan, dan satu formulasi menangani SEMUA kasus
     (sendi/jepit, beban lateral tak simetris, penampang kolom≠balok,
     goyangan/sidesway otomatis) tanpa penanganan khusus.

   Konvensi gaya dalam: tarik (+) untuk aksial, momen sagging (+).
   Alat BANTU ANALISIS elastis — bukan cek kapasitas. Verifikasi oleh insinyur.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'portal-frame';

  var MAX_PT = 4;          // beban terpusat pada balok maksimum
  var NSEG = 48;           // sampel per batang untuk diagram
  var EPS = 1e-6;
  var GAMMA_C = 24;        // berat jenis beton (kN/m³) untuk berat sendiri
  var G = 9.81;            // gravitasi (m/s²) — konversi kg/m → kN/m profil baja

  // Tipe profil baja yang didukung tool ini (subset library baja bersama)
  var PTYPES = ['WF', 'UNP', 'SHS', 'RHS', 'PIPE'];

  var state = {};

  /* ============================================================
     ALJABAR MATRIKS KECIL
     ============================================================ */
  function matZ(n, m) { var A = []; for (var i = 0; i < n; i++) { A.push(new Array(m).fill(0)); } return A; }
  function matMul(A, B) {
    var n = A.length, k = B.length, m = B[0].length, C = matZ(n, m);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      var s = 0; for (var p = 0; p < k; p++) s += A[i][p] * B[p][j]; C[i][j] = s;
    }
    return C;
  }
  function matT(A) {
    var n = A.length, m = A[0].length, C = matZ(m, n);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) C[j][i] = A[i][j];
    return C;
  }
  // Solusi K·x = b (K simetris positif-definit setelah kondisi batas), eliminasi Gauss + pivot parsial.
  function solve(K, b) {
    var n = b.length;
    var A = K.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;   // singular (mekanisme)
      var tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      var d = A[c][c];
      for (var j = c; j <= n; j++) A[c][j] /= d;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = A[r][c];
        if (f === 0) continue;
        for (j = c; j <= n; j++) A[r][j] -= f * A[c][j];
      }
    }
    return A.map(function (r) { return r[n]; });
  }

  /* ============================================================
     ELEMEN RANGKA BIDANG
     ============================================================ */
  // Kekakuan lokal 6×6. DOF lokal: [u_i, v_i, θ_i, u_j, v_j, θ_j] (u=aksial, v=lintang).
  function kLocal(EA, EI, L) {
    var a = EA / L;
    var c1 = 12 * EI / (L * L * L), c2 = 6 * EI / (L * L), c3 = 4 * EI / L, c4 = 2 * EI / L;
    return [
      [a, 0, 0, -a, 0, 0],
      [0, c1, c2, 0, -c1, c2],
      [0, c2, c3, 0, -c2, c4],
      [-a, 0, 0, a, 0, 0],
      [0, -c1, -c2, 0, c1, -c2],
      [0, c2, c4, 0, -c2, c3]
    ];
  }
  // Matriks transformasi 6×6 (global → lokal) dari kosinus arah.
  function transform(cx, cy) {
    var T = matZ(6, 6);
    var R = [[cx, cy, 0], [-cy, cx, 0], [0, 0, 1]];
    for (var b = 0; b < 2; b++) for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      T[b * 3 + i][b * 3 + j] = R[i][j];
    return T;
  }
  // Gaya ujung terjepit LOKAL (FEF) untuk beban bentang.
  //   wx : merata aksial (N/mm, +local x),  wy : merata lintang (N/mm, +local y),
  //   pts: [{P, a}] beban terpusat lintang (N di +local y, a = jarak dari i, mm).
  // Konvensi: {f} = [k]{d} + {ff}, dengan {ff} = gaya ujung yang menahan batang
  // (= reaksi tumpuan jepit). Untuk beban ke −y, ff lintang mengarah +y (menahan).
  // Beban simpul ekuivalen yang dirakit ke struktur = −{ff}.
  function fefLocal(wx, wy, L, pts) {
    var f = [-wx * L / 2, -wy * L / 2, -wy * L * L / 12, -wx * L / 2, -wy * L / 2, wy * L * L / 12];
    (pts || []).forEach(function (p) {
      var a = p.a, bb = L - a, P = p.P;
      f[1] -= P * bb * bb * (L + 2 * a) / (L * L * L);
      f[2] -= P * a * bb * bb / (L * L);
      f[4] -= P * a * a * (L + 2 * bb) / (L * L * L);
      f[5] += P * a * a * bb / (L * L);
    });
    return f;
  }

  /* ============================================================
     PROPERTI PENAMPANG + MATERIAL (baja / beton)
     Kembalikan { A (mm²), I (mm⁴), S (mm³), E (MPa), wLine (kN/m), label, note }
     ============================================================ */
  function sectionProps(kind, v, pre) {
    if (v[pre + 'mat'] === 'beton') {
      var b = num(v[pre + 'b']), h = num(v[pre + 'h']);
      var fc = num(v[pre + 'fc']);
      if (!(b > 0 && h > 0)) return null;
      var A = b * h;                                   // mm²
      var I = b * h * h * h / 12;                      // mm⁴ (lentur dalam bidang, sumbu kuat = h)
      var S = b * h * h / 6;                            // mm³
      var E = 4700 * Math.sqrt(Math.max(1, fc));       // MPa (SNI 2847:2019)
      var wLine = (A * 1e-6) * GAMMA_C;                // kN/m  (m² × kN/m³)
      return { A: A, I: I, S: S, E: E, wLine: wLine, mat: 'beton',
        label: 'Beton ' + fmtm(b) + '×' + fmtm(h) + ' mm', b: b, h: h, fc: fc,
        note: "fc' " + fmtm(fc) + " MPa · E=4700√fc'=" + Math.round(E) + ' MPa · I bruto' };
    }
    // baja
    var prof = state.steel.get(v[pre + 'ptype'], v[pre + 'psize']);
    if (!prof) return null;
    var Fy = num(v[pre + 'fy']) || 240;
    return {
      A: prof.A * 100, I: prof.Ix * 1e4, S: prof.Sx * 1e3, E: 200000,
      wLine: prof.w * G / 1000, mat: 'baja', prof: prof, Fy: Fy,
      label: (state.steel.typeInfo(v[pre + 'ptype']).name) + ' ' + prof.name,
      note: 'E=200000 MPa · Ix=' + fmt0(prof.Ix) + ' cm⁴ · Sx=' + fmt1(prof.Sx) + ' cm³ · lentur sumbu kuat'
    };
  }

  /* ============================================================
     PERHITUNGAN UTAMA
     ============================================================ */
  function compute(v) {
    var r = { valid: true, warn: [] };

    var col = sectionProps('col', v, 'c');
    var beam = sectionProps('beam', v, 'b');
    if (!col) { r.valid = false; r.msg = 'Lengkapi penampang KOLOM.'; return r; }
    if (!beam) { r.valid = false; r.msg = 'Lengkapi penampang BALOK.'; return r; }
    r.col = col; r.beam = beam;

    var Hm = num(v.H), Lbm = num(v.Lb);
    if (!(Hm > 0) || !(Lbm > 0)) { r.valid = false; r.msg = 'Isi tinggi kolom & panjang balok.'; return r; }
    var H = Hm * 1000, Lb = Lbm * 1000;                 // mm
    r.H = Hm; r.Lb = Lbm;
    r.fixed = (v.support === 'jepit');

    // ---- geometri simpul (mm) ----
    var nodes = [[0, 0], [Lb, 0], [0, H], [Lb, H]];      // N0..N3
    r.nodes = nodes;

    // ---- beban bentang per batang (lokal) ----
    var selfOn = (v.self === 'ya');
    // kolom: berat sendiri = aksial (arah −local x karena local x mengarah ke atas)
    var wcx = selfOn ? -(col.wLine) : 0;                 // kN/m ≡ N/mm
    // balok: gravitasi ke bawah = −local y
    var qsup = num(v.q);                                 // beban merata gravitasi tambahan (kN/m)
    var wby = -((selfOn ? beam.wLine : 0) + qsup);       // N/mm ke −local y
    r.wcol = wcx; r.wbeam = wby; r.qsup = qsup;

    // beban terpusat pada balok (ke bawah → −local y)
    var pts = [];
    r.inpPt = [];
    var np = Math.max(0, Math.min(MAX_PT, Math.round(num(v.np))));
    for (var i = 1; i <= np; i++) {
      var P = num(v['p' + i + '_P']), a = num(v['p' + i + '_a']);
      if (!(Math.abs(P) > 0)) continue;
      var ca = clamp(a, 0, Lbm);
      if (ca !== a) r.warn.push('Beban terpusat #' + i + ': posisi dipotong ke 0…' + fmtm(Lbm) + ' m.');
      r.inpPt.push({ P: P, a: ca });
      pts.push({ P: -P * 1000, a: ca * 1000 });          // N ke −local y, mm dari kiri
    }

    // beban lateral di puncak kolom (ke kanan +global x)
    var H1 = num(v.HL1), H2 = num(v.HL2);
    r.HL1 = H1; r.HL2 = H2;

    // ---- definisi elemen ----
    var elems = [
      { ni: 0, nj: 2, sec: col, wx: wcx, wy: 0, pts: [] },     // kolom kiri
      { ni: 1, nj: 3, sec: col, wx: wcx, wy: 0, pts: [] },     // kolom kanan
      { ni: 2, nj: 3, sec: beam, wx: 0, wy: wby, pts: pts }    // balok
    ];

    // ---- rakit K global (12×12) & vektor beban ----
    var ND = 12;
    var K = matZ(ND, ND);
    var F = new Array(ND).fill(0);

    // beban simpul: lateral di N2 (dof 6) & N3 (dof 9), arah global x
    F[2 * 3 + 0] += H1 * 1000;
    F[3 * 3 + 0] += H2 * 1000;

    elems.forEach(function (e) {
      var xi = nodes[e.ni], xj = nodes[e.nj];
      var dx = xj[0] - xi[0], dy = xj[1] - xi[1];
      var L = Math.hypot(dx, dy);
      e.L = L; e.cx = dx / L; e.cy = dy / L;
      var EA = e.sec.E * e.sec.A, EI = e.sec.E * e.sec.I;
      var kl = kLocal(EA, EI, L);
      var T = transform(e.cx, e.cy);
      var kg = matMul(matMul(matT(T), kl), T);            // Tᵀ k T
      e.kl = kl; e.T = T; e.EI = EI; e.EA = EA;
      // FEF lokal → global → beban simpul ekuivalen (−ff)
      var ff = fefLocal(e.wx, e.wy, L, e.pts);
      e.ff = ff;
      var ffg = matMul(matT(T), ff.map(function (x) { return [x]; }));   // 6×1
      var map = [e.ni * 3, e.ni * 3 + 1, e.ni * 3 + 2, e.nj * 3, e.nj * 3 + 1, e.nj * 3 + 2];
      for (var a2 = 0; a2 < 6; a2++) {
        F[map[a2]] -= ffg[a2][0];
        for (var b2 = 0; b2 < 6; b2++) K[map[a2]][map[b2]] += kg[a2][b2];
      }
    });

    // ---- kondisi batas ----
    // sendi: u,v tertahan di N0,N1 ; jepit: u,v,θ tertahan.
    var fixedDof = [];
    [0, 1].forEach(function (nd) {
      fixedDof.push(nd * 3 + 0, nd * 3 + 1);
      if (r.fixed) fixedDof.push(nd * 3 + 2);
    });
    var isFixed = new Array(ND).fill(false);
    fixedDof.forEach(function (d) { isFixed[d] = true; });

    // reduksi ke DOF bebas
    var free = [];
    for (i = 0; i < ND; i++) if (!isFixed[i]) free.push(i);
    var nf = free.length;
    var Kr = matZ(nf, nf), Fr = new Array(nf);
    for (i = 0; i < nf; i++) {
      Fr[i] = F[free[i]];
      for (var j = 0; j < nf; j++) Kr[i][j] = K[free[i]][free[j]];
    }
    var dr = solve(Kr, Fr);
    if (!dr) { r.valid = false; r.msg = 'Struktur tidak stabil (mekanisme). Periksa tumpuan/penampang.'; return r; }
    var D = new Array(ND).fill(0);
    for (i = 0; i < nf; i++) D[free[i]] = dr[i];
    r.D = D;

    // ---- gaya ujung elemen (lokal) & pemulihan diagram ----
    var maxM = 0, maxV = 0, maxN = 0;
    elems.forEach(function (e) {
      var map = [e.ni * 3, e.ni * 3 + 1, e.ni * 3 + 2, e.nj * 3, e.nj * 3 + 1, e.nj * 3 + 2];
      var de = map.map(function (m) { return [D[m]]; });       // 6×1 global
      var dloc = matMul(e.T, de);                               // 6×1 lokal
      var fl = matMul(e.kl, dloc);                              // k·d
      var fLocal = fl.map(function (row, k) { return row[0] + e.ff[k]; });  // + FEF = gaya ujung nyata
      e.fLocal = fLocal;
      e.dloc = dloc.map(function (x) { return x[0]; });

      // sampel diagram sepanjang batang
      var stops = {};
      for (var s = 0; s <= NSEG; s++) stops[(e.L * s / NSEG).toFixed(4)] = e.L * s / NSEG;
      e.pts.forEach(function (p) {                              // dobel titik di beban terpusat
        stops[(p.a - 1e-3).toFixed(4)] = Math.max(0, p.a - 1e-3);
        stops[(p.a + 1e-3).toFixed(4)] = Math.min(e.L, p.a + 1e-3);
      });
      var xs = Object.keys(stops).map(function (k) { return stops[k]; }).sort(function (a, b) { return a - b; });
      var Ns = [], Vs = [], Ms = [];
      xs.forEach(function (x) {
        var Wx = e.wx * x;
        var Wy = e.wy * x;
        e.pts.forEach(function (p) { if (p.a < x - 1e-6) Wy += p.P; });
        var Nv = -(fLocal[0] + Wx);                            // tarik (+)
        var Vv = -(fLocal[1] + Wy);                            // geser
        // momen sagging (+): Rm = -m_i + fy_i·x + wy·x²/2 − Σ(a_k<x)(a_k−x)·P_k
        var Mv = -fLocal[2] + fLocal[1] * x + e.wy * x * x / 2;
        e.pts.forEach(function (p) { if (p.a < x - 1e-6) Mv -= (p.a - x) * p.P; });
        Ns.push(Nv); Vs.push(Vv); Ms.push(Mv);
        if (Math.abs(Nv) > Math.abs(maxN)) maxN = Nv;
        if (Math.abs(Vv) > Math.abs(maxV)) maxV = Vv;
        if (Math.abs(Mv) > Math.abs(maxM)) maxM = Mv;
      });
      e.xs = xs; e.Ns = Ns; e.Vs = Vs; e.Ms = Ms;
      // ekstrem per batang (kN, kN·m)
      e.Nmax = extAbs(Ns) / 1e3; e.Vmax = extAbs(Vs) / 1e3; e.Mmax = extAbs(Ms) / 1e6;
      // tegangan lentur & aksial elastis (informatif)
      e.fb = e.sec.S > 0 ? Math.abs(extAbs(Ms)) / e.sec.S : null;   // MPa
      e.fa = e.sec.A > 0 ? Math.abs(extAbs(Ns)) / e.sec.A : null;   // MPa
    });
    r.elems = elems;
    r.Mmax = maxM / 1e6; r.Vmax = maxV / 1e3; r.Nmax = maxN / 1e3;

    // ---- reaksi tumpuan (gaya ujung global batang di simpul kaki) ----
    function reaction(nodeIdx, elem, endIsI) {
      var Tt = matT(elem.T);
      var fg = matMul(Tt, elem.fLocal.map(function (x) { return [x]; }));  // 6×1 global
      var o = endIsI ? 0 : 3;
      return { Rx: fg[o][0] / 1e3, Ry: fg[o + 1][0] / 1e3, M: fg[o + 2][0] / 1e6 };   // kN, kN·m
    }
    r.RA = reaction(0, elems[0], true);   // kaki kolom kiri (i-end elemen 0)
    r.RB = reaction(1, elems[1], true);   // kaki kolom kanan (i-end elemen 1)

    // total beban gravitasi (untuk cek keseimbangan)
    var Wgrav = 0;
    Wgrav += Math.abs(wby) * Lb / 1e3;                        // balok merata (kN)
    r.inpPt.forEach(function (p) { Wgrav += p.P; });          // terpusat
    if (selfOn) Wgrav += Math.abs(wcx) * H / 1e3 * 2;         // dua kolom (kN)
    r.Wgrav = Wgrav;
    r.sumRy = r.RA.Ry + r.RB.Ry;
    r.sumRx = r.RA.Rx + r.RB.Rx;

    // ---- deformasi titik kritis (mm, rad) ----
    // Perpindahan simpul: N2 puncak kiri (dof 6..8), N3 puncak kanan (dof 9..11).
    var ux2 = D[6], uy2 = D[7], rot2 = D[8], ux3 = D[9], uy3 = D[10], rot3 = D[11];
    // Drift (goyangan) lateral = perpindahan horizontal puncak thd kaki (u kaki = 0).
    var driftMax = Math.abs(ux2) >= Math.abs(ux3) ? ux2 : ux3;   // simpul dg drift terbesar
    // Lendutan balok: sampel bentuk lentur (Hermite) → maks vertikal absolut & thd tali busur.
    var beam = elems[2];
    var db = beam.dloc;   // [u_i,v_i,θ_i,u_j,v_j,θ_j] lokal; balok mendatar → local y = vertikal (+atas)
    var sagRel = 0, sagX = 0, vMid = 0, vAbsMax = 0, vAbsX = 0;
    for (var s = 0; s <= 40; s++) {
      var t = s / 40;
      var vloc = (1 - 3 * t * t + 2 * t * t * t) * db[1] + beam.L * (t - 2 * t * t + t * t * t) * db[2] +
        (3 * t * t - 2 * t * t * t) * db[4] + beam.L * (-t * t + t * t * t) * db[5];   // vertikal absolut (mm, +atas)
      var chord = db[1] * (1 - t) + db[4] * t;
      var rel = vloc - chord;                                    // lendutan thd tali busur (lentur murni)
      if (Math.abs(rel) > Math.abs(sagRel)) { sagRel = rel; sagX = t * r.Lb; }
      if (Math.abs(vloc) > Math.abs(vAbsMax)) { vAbsMax = vloc; vAbsX = t * r.Lb; }
      if (t === 0.5) vMid = vloc;
    }
    r.defl = {
      ux2: ux2, uy2: uy2, rot2: rot2 * 1000, ux3: ux3, uy3: uy3, rot3: rot3 * 1000,   // mrad
      drift: driftMax, driftRatio: Math.abs(driftMax) > EPS ? H / Math.abs(driftMax) : Infinity,
      sag: sagRel, sagX: sagX, vMid: vMid, vAbs: vAbsMax, vAbsX: vAbsX,
      sagRatio: Math.abs(sagRel) > EPS ? Lb / Math.abs(sagRel) : Infinity
    };

    return r;
  }

  function extAbs(arr) { var m = 0; for (var i = 0; i < arr.length; i++) if (Math.abs(arr[i]) > Math.abs(m)) m = arr[i]; return m; }
  function num(x) { return isFinite(x) ? x : 0; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function fmtm(x) { return (Math.round(x * 1000) / 1000); }
  function fmt0(x) { return state.UI.fmt(x, 0); }
  function fmt1(x) { return state.UI.fmt(x, 1); }

  /* ============================================================
     UI
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('pf-style')) return;
    var s = document.createElement('style');
    s.id = 'pf-style';
    s.textContent =
      '.pf-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.pf-canvas{position:relative;flex:1 1 58%;min-height:320px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.pf-res{flex:1 1 42%;overflow-y:auto;padding:18px 24px 34px}' +
      '.pf-viewseg{position:absolute;right:12px;top:10px;display:flex;z-index:4;border:1px solid var(--line);border-radius:8px;overflow:hidden}' +
      '.pf-viewseg button{background:var(--panel);color:var(--ink-dim);border:0;padding:5px 11px;font:600 12px "Space Grotesk",sans-serif;cursor:pointer}' +
      '.pf-viewseg button.active{background:var(--amber);color:var(--bg)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Analisis Portal Sederhana'));
    panel.appendChild(UI.el('div', 'sub', 'Portal satu bentang–satu tingkat (2 kolom + 1 balok). Metode kekakuan langsung (matriks) rangka bidang: reaksi, diagram momen (BMD), gaya lintang (geser), dan gaya aksial. Beban gravitasi + lateral; tumpuan sendi–sendi atau jepit–jepit.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'pf-work');
    var canvasHost = UI.el('div', 'pf-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Diagram gaya dalam');
    var results = UI.el('div', 'pf-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    // ---- schema form ----
    var steelOpts = PTYPES.map(function (t) { var info = state.steel.typeInfo(t); return { value: t, label: info ? info.name : t }; });
    var matOpts = [{ value: 'baja', label: 'Baja' }, { value: 'beton', label: 'Beton' }];

    var schema = [
      { type: 'group', label: 'Geometri & Tumpuan' },
      { type: 'number', id: 'H', label: 'Tinggi kolom H', unit: 'm', value: 4, min: 0.3, step: 0.1 },
      { type: 'number', id: 'Lb', label: 'Panjang balok L', unit: 'm', value: 6, min: 0.3, step: 0.1 },
      { type: 'segment', id: 'support', label: 'Jenis tumpuan', value: 'jepit', options: [
        { value: 'sendi', label: 'Sendi–sendi' }, { value: 'jepit', label: 'Jepit–jepit' }] },
      { type: 'segment', id: 'self', label: 'Berat sendiri', value: 'ya', options: [
        { value: 'ya', label: 'Sertakan' }, { value: 'tidak', label: 'Abaikan' }] },

      { type: 'group', label: 'Penampang Kolom' },
      { type: 'segment', id: 'cmat', label: 'Material kolom', value: 'baja', options: matOpts },
      { type: 'select', id: 'cptype', label: 'Tipe profil baja', value: 'WF', options: steelOpts },
      { type: 'select', id: 'cpsize', label: 'Ukuran profil', value: '', options: [] },
      { type: 'number', id: 'cfy', label: 'fy baja (info)', unit: 'MPa', value: 240, min: 100, step: 10 },
      { type: 'number', id: 'cb', label: 'b — lebar (beton)', unit: 'mm', value: 300, min: 50, step: 10 },
      { type: 'number', id: 'ch', label: 'h — tinggi (beton, dalam bidang)', unit: 'mm', value: 400, min: 50, step: 10 },
      { type: 'number', id: 'cfc', label: "fc' beton", unit: 'MPa', value: 25, min: 10, step: 1 },

      { type: 'group', label: 'Penampang Balok' },
      { type: 'segment', id: 'bmat', label: 'Material balok', value: 'baja', options: matOpts },
      { type: 'select', id: 'bptype', label: 'Tipe profil baja', value: 'WF', options: steelOpts },
      { type: 'select', id: 'bpsize', label: 'Ukuran profil', value: '', options: [] },
      { type: 'number', id: 'bfy', label: 'fy baja (info)', unit: 'MPa', value: 240, min: 100, step: 10 },
      { type: 'number', id: 'bb', label: 'b — lebar (beton)', unit: 'mm', value: 250, min: 50, step: 10 },
      { type: 'number', id: 'bh', label: 'h — tinggi (beton, dalam bidang)', unit: 'mm', value: 500, min: 50, step: 10 },
      { type: 'number', id: 'bfc', label: "fc' beton", unit: 'MPa', value: 25, min: 10, step: 1 },

      { type: 'group', label: 'Beban Gravitasi Balok' },
      { type: 'number', id: 'q', label: 'q — merata gravitasi (di luar berat sendiri)', unit: 'kN/m', value: 20, min: 0, step: 1, hint: 'Beban mati/hidup tambahan ke bawah pada balok.' },
      { type: 'number', id: 'np', label: 'Jumlah beban terpusat', unit: '', value: 0, min: 0, max: MAX_PT, step: 1 }
    ];
    for (var i = 1; i <= MAX_PT; i++) {
      schema.push({ type: 'group', label: 'Beban terpusat #' + i, gid: 'gp' + i });
      schema.push({ type: 'number', id: 'p' + i + '_P', label: 'P — beban gravitasi ke bawah', unit: 'kN', value: i === 1 ? 40 : 0, min: 0, step: 1 });
      schema.push({ type: 'number', id: 'p' + i + '_a', label: 'a — jarak dari kolom kiri', unit: 'm', value: i === 1 ? 3 : 0, min: 0, step: 0.1 });
    }
    schema.push({ type: 'group', label: 'Beban Lateral (puncak kolom, + ke kanan)' });
    schema.push({ type: 'number', id: 'HL1', label: 'H₁ — di puncak kolom kiri', unit: 'kN', value: 0, min: -1e6, step: 1 });
    schema.push({ type: 'number', id: 'HL2', label: 'H₂ — di puncak kolom kanan', unit: 'kN', value: 0, min: -1e6, step: 1 });

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'cptype') { populateSizes('c', vals.cptype); vals = form.getValues(); }
      if (changedId === 'bptype') { populateSizes('b', vals.bptype); vals = form.getValues(); }
      syncVisibility(vals);
      update(vals, results);
    }, ID);
    state.form = form;
    state.results = results;

    populateSizes('c', form.getValues().cptype);
    populateSizes('b', form.getValues().bptype);
    form.restore('cpsize');
    form.restore('bpsize');

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

    // ---- toggle tampilan diagram ----
    state.viewMode = 'M';
    var seg = UI.el('div', 'pf-viewseg');
    var modes = [['M', 'Momen'], ['V', 'Geser'], ['N', 'Aksial'], ['D', 'Deformasi'], ['L', 'Beban']];
    var vbtns = modes.map(function (m) {
      var b = UI.el('button', m[0] === state.viewMode ? 'active' : null, m[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.viewMode = m[0];
        vbtns.forEach(function (bb, k) { bb.classList.toggle('active', modes[k][0] === m[0]); });
        if (state.cv) state.cv.redraw();
      });
      seg.appendChild(b); return b;
    });
    canvasHost.appendChild(seg);

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
    update(vals0, results);

    function populateSizes(pre, type) {
      var sel = form.fields[pre + 'psize'].node;
      var list = state.steel.list(type);
      sel.innerHTML = '';
      list.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.name; o.textContent = p.name;
        sel.appendChild(o);
      });
      if (list.length) sel.value = list[Math.min(list.length - 1, Math.floor(list.length / 2))].name;
    }

    function syncVisibility(vals) {
      if (!state.groups) indexGroups();
      // baja vs beton per anggota
      ['c', 'b'].forEach(function (pre) {
        var isBaja = vals[pre + 'mat'] !== 'beton';
        [pre + 'ptype', pre + 'psize', pre + 'fy'].forEach(function (id) { toggleField(id, isBaja); });
        [pre + 'b', pre + 'h', pre + 'fc'].forEach(function (id) { toggleField(id, !isBaja); });
      });
      var np = Math.round(vals.np);
      for (var k = 1; k <= MAX_PT; k++) {
        var show = k <= np;
        ['p' + k + '_P', 'p' + k + '_a'].forEach(function (id) { toggleField(id, show); });
        toggleGroup('gp' + k, show);
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

  function indexGroups() {
    state.groups = {};
    var form = state.form;
    var grps = form.root.querySelectorAll('.ck-grp');
    Array.prototype.forEach.call(grps, function (g) {
      var h = g.querySelector('h4');
      if (!h) return;
      var txt = h.textContent;
      for (var k = 1; k <= MAX_PT; k++) if (txt === 'Beban terpusat #' + k) state.groups['gp' + k] = g;
    });
  }

  function update(vals, results) {
    if (!state.groups) indexGroups();
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Diagram gaya dalam');
      results.appendChild(UI.el('div', 'ck-empty', r.msg || 'Lengkapi data untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set('Mmaks ' + UI.fmt(Math.abs(r.Mmax), 2) + ' kN·m · Vmaks ' + UI.fmt(Math.abs(r.Vmax), 2) +
      ' kN · Nmaks ' + UI.fmt(Math.abs(r.Nmax), 2) + ' kN');

    results.appendChild(UI.heroRow([
      { label: 'Momen maks |M|', value: UI.fmt(Math.abs(r.Mmax), 2), unit: 'kN·m' },
      { label: 'Geser maks |V|', value: UI.fmt(Math.abs(r.Vmax), 2), unit: 'kN' },
      { label: 'Aksial maks |N|', value: UI.fmt(Math.abs(r.Nmax), 2), unit: 'kN' }
    ]));

    results.appendChild(UI.rhead('Penampang'));
    results.appendChild(UI.kv('Kolom', r.col.label, ''));
    results.appendChild(UI.kv('  ', r.col.note));
    results.appendChild(UI.kv('Balok', r.beam.label, ''));
    results.appendChild(UI.kv('  ', r.beam.note));

    results.appendChild(UI.rhead('Reaksi tumpuan (' + (r.fixed ? 'jepit' : 'sendi') + ')'));
    reactRow(UI, results, 'A — kolom kiri', r.RA, r.fixed);
    reactRow(UI, results, 'B — kolom kanan', r.RB, r.fixed);
    results.appendChild(UI.kv('ΣV reaksi vs beban gravitasi', UI.fmt(r.sumRy, 2) + ' / ' + UI.fmt(r.Wgrav, 2) + ' kN',
      Math.abs(r.sumRy - r.Wgrav) < 0.5 ? 'ok' : 'bad'));
    results.appendChild(UI.kv('ΣH reaksi vs beban lateral', UI.fmt(-r.sumRx, 2) + ' / ' + UI.fmt(r.HL1 + r.HL2, 2) + ' kN',
      Math.abs(-r.sumRx - (r.HL1 + r.HL2)) < 0.5 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Gaya dalam maksimum per batang'));
    var names = ['Kolom kiri', 'Kolom kanan', 'Balok'];
    r.elems.forEach(function (e, k) {
      results.appendChild(UI.kv(names[k] + ' — |M| / |V| / |N|',
        UI.fmt(Math.abs(e.Mmax), 2) + ' kN·m · ' + UI.fmt(Math.abs(e.Vmax), 2) + ' kN · ' + UI.fmt(Math.abs(e.Nmax), 2) + ' kN'));
      if (e.fb != null) results.appendChild(UI.kv('   tegangan σ = M/S · N/A', UI.fmt(e.fb, 1) + ' + ' + UI.fmt(e.fa, 1) + ' MPa'));
    });

    var df = r.defl;
    results.appendChild(UI.rhead('Deformasi titik kritis'));
    results.appendChild(UI.kv('Drift lateral puncak Δ (maks)',
      UI.fmt(Math.abs(df.drift), 2) + ' mm  (' + (df.drift >= 0 ? 'ke kanan' : 'ke kiri') + ')'));
    results.appendChild(UI.kv('Rasio drift H/Δ', isFinite(df.driftRatio) ? UI.fmt(df.driftRatio, 0) : '—',
      isFinite(df.driftRatio) ? (df.driftRatio >= 500 ? 'ok' : (df.driftRatio >= 250 ? '' : 'bad')) : ''));
    results.appendChild(UI.kv('Lendutan balok maks δ (x = ' + UI.fmt(df.sagX, 2) + ' m)',
      UI.fmt(Math.abs(df.sag), 2) + ' mm  (' + (df.sag <= 0 ? 'ke bawah' : 'ke atas') + ', thd tali busur)'));
    results.appendChild(UI.kv('Rasio L/δ balok', isFinite(df.sagRatio) ? UI.fmt(df.sagRatio, 0) : '—',
      isFinite(df.sagRatio) ? (df.sagRatio >= 360 ? 'ok' : (df.sagRatio >= 240 ? '' : 'bad')) : ''));
    results.appendChild(UI.kv('Puncak kiri (N2) — Δx / Δy / θ',
      UI.fmt(df.ux2, 2) + ' mm / ' + UI.fmt(df.uy2, 2) + ' mm / ' + UI.fmt(df.rot2, 3) + ' mrad'));
    results.appendChild(UI.kv('Puncak kanan (N3) — Δx / Δy / θ',
      UI.fmt(df.ux3, 2) + ' mm / ' + UI.fmt(df.uy3, 2) + ' mm / ' + UI.fmt(df.rot3, 3) + ' mrad'));

    results.appendChild(UI.note('Batas deformasi (acuan umum)',
      'Δx = perpindahan horizontal puncak (goyangan) — batas layan lazim H/500…H/250. ' +
      'δ balok = lendutan lentur thd tali busur; batas L/360 (beban hidup) atau L/240 (total). ' +
      'θ = rotasi simpul (mrad). Nilai di atas batas = lebih kaku (baik).'));

    results.appendChild(UI.note('Metode & referensi',
      'Metode kekakuan langsung (direct stiffness) rangka bidang: 4 simpul × 3 DOF, elemen aksial+lentur, ' +
      'beban bentang via gaya ujung terjepit. Tumpuan ' + (r.fixed ? 'jepit–jepit (u=v=θ=0)' : 'sendi–sendi (u=v=0)') +
      '. Analisis elastis linier; kolom & balok memakai I bruto sumbu kuat (dalam bidang). ' +
      'Momen sagging positif, aksial tarik positif. σ = M/S + N/A hanya tegangan elastis (bukan cek kapasitas/tekuk). ' +
      'Untuk desain lanjut pakai tool Balok/Batang Tekan/Kolom terkait. Verifikasi oleh insinyur penanggung jawab.'));

    if (r.warn.length) {
      results.appendChild(UI.note('Catatan input',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    }

    if (state.cv) state.cv.redraw();
  }
  function reactRow(UI, results, label, R, fixed) {
    results.appendChild(UI.kv(label,
      'H=' + UI.fmt(R.Rx, 2) + ' kN · V=' + UI.fmt(R.Ry, 2) + ' kN' + (fixed ? ' · M=' + UI.fmt(R.M, 2) + ' kN·m' : '')));
  }

  /* ============================================================
     KANVAS
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint');
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((r && r.msg) ? r.msg : 'Masukkan data untuk melihat diagram.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var amber = css('--amber'), blue = css('--blue') || '#30bced', ok = css('--ok') || '#88b08a';
    var support = css('--support') || dim;

    // ---- transformasi model (mm) → layar (px), y ke atas ----
    var padL = 70, padR = 60, padT = 46, padB = 58;
    var mW = r.Lb * 1000, mH = r.H * 1000;
    // ruang ekstra untuk ordinat diagram di luar rangka
    var margin = 0.42;
    var mx0 = -mW * margin, mx1 = mW * (1 + margin);
    var my0 = -mH * margin, my1 = mH * (1 + margin * 0.5);
    var sx = (w - padL - padR) / (mx1 - mx0);
    var sy = (h - padT - padB) / (my1 - my0);
    var sc = Math.min(sx, sy);
    // pusatkan
    var offX = padL + ((w - padL - padR) - sc * (mx1 - mx0)) / 2;
    var offY = padT + ((h - padT - padB) - sc * (my1 - my0)) / 2;
    function X(xm) { return offX + (xm - mx0) * sc; }
    function Y(ym) { return h - padB - ((ym - my0) * sc) - (offY - padT); }
    // simpul layar
    var N = r.nodes.map(function (p) { return [X(p[0]), Y(p[1])]; });

    var view = state.viewMode;

    // ---- rangka (garis tengah) ----
    function member(a, b, cwidth, color) {
      ctx.strokeStyle = color; ctx.lineWidth = cwidth;
      ctx.beginPath(); ctx.moveTo(N[a][0], N[a][1]); ctx.lineTo(N[b][0], N[b][1]); ctx.stroke();
    }
    var frameColor = (view === 'D') ? faint : dim;
    member(0, 2, 3, frameColor);   // kolom kiri
    member(1, 3, 3, frameColor);   // kolom kanan
    member(2, 3, 3, frameColor);   // balok

    // ---- tumpuan ----
    drawSupport(ctx, N[0][0], N[0][1], r.fixed, support);
    drawSupport(ctx, N[1][0], N[1][1], r.fixed, support);

    // ---- diagram / beban ----
    if (view === 'L') drawLoadView(ctx, r, X, Y, N, amber, dim, faint, ink);
    else if (view === 'D') drawDeform(ctx, r, X, Y, sc, ok, faint);
    else drawDiagram(ctx, r, X, Y, sc, view, { amber: amber, blue: blue, ok: ok, dim: dim, faint: faint, line: line });

    // ---- judul mode ----
    ctx.fillStyle = dim; ctx.font = '11px "Space Grotesk", sans-serif'; ctx.textAlign = 'left';
    var titles = { M: 'Momen Lentur  M (kN·m) — digambar di sisi TARIK', V: 'Gaya Lintang  V (kN)',
      N: 'Gaya Aksial  N (kN) — tekan (−) / tarik (+)', D: 'Deformasi (diperbesar)', L: 'Model & Beban' };
    ctx.fillText(titles[view] || '', 12, h - 14);

    // dimensi H & L
    ctx.fillStyle = faint; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('L = ' + r.Lb.toFixed(2) + ' m', (N[0][0] + N[1][0]) / 2, N[0][1] + 34);
    ctx.save(); ctx.translate(N[0][0] - 30, (N[0][1] + N[2][1]) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('H = ' + r.H.toFixed(2) + ' m', 0, 0); ctx.restore();
  }

  function drawSupport(ctx, x, y, fixed, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    if (fixed) {
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.stroke();
      for (var k = -12; k < 12; k += 5) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k - 5, y + 6); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 13); ctx.lineTo(x + 8, y + 13); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 11, y + 16); ctx.lineTo(x + 11, y + 16); ctx.stroke();
      for (var j = -9; j < 11; j += 5) { ctx.beginPath(); ctx.moveTo(x + j, y + 16); ctx.lineTo(x + j - 4, y + 21); ctx.stroke(); }
    }
  }

  // gambar diagram M/V/N: ordinat tegak-lurus tiap batang, terisi.
  function drawDiagram(ctx, r, X, Y, sc, view, C) {
    var key = view === 'M' ? 'Ms' : (view === 'V' ? 'Vs' : 'Ns');
    var conv = view === 'M' ? 1e6 : 1e3;    // ke kN·m atau kN
    var color = view === 'M' ? C.amber : (view === 'V' ? C.blue : C.ok);
    // skala amplitudo: cari maks global mode ini; ordinat maks = ~30% dimensi terkecil rangka
    var gmax = 1e-9;
    r.elems.forEach(function (e) { e[key].forEach(function (val) { gmax = Math.max(gmax, Math.abs(val)); }); });
    gmax /= conv;   // samakan satuan dengan val (kN·m / kN) — cegah ordinat menciut ~1e-6 px
    var ampPx = Math.min(96, Math.max(26, 0.30 * Math.min(r.Lb, r.H) * 1000 * sc));

    r.elems.forEach(function (e) {
      var A = r.nodes[e.ni], B = r.nodes[e.nj];
      var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
      var ux = dx / L, uy = dy / L;              // arah batang (model)
      // normal tegak lurus (model). Untuk sisi gambar: momen (+sagging) di sisi tarik.
      var nx = -uy, ny = ux;                     // normal (rotasi +90° di ruang model)
      // di layar Y terbalik → gambar offset pakai koordinat layar langsung.
      var poly = [];
      var base = [];
      for (var i = 0; i < e.xs.length; i++) {
        // titik pada sumbu batang (model coords)
        var px = A[0] + dx * (e.xs[i] / e.L);
        var py = A[1] + dy * (e.xs[i] / e.L);
        var sxp = X(px), syp = Y(py);
        base.push([sxp, syp]);
        var val = e[key][i] / conv;
        // offset di layar: arah normal layar. Konversi normal model→layar (y flip)
        var off = (val / gmax) * ampPx;
        // untuk M gambar di sisi tarik: sisi tarik = arah −(kelengkungan)... praktik: gambar M positif ke sisi normal −n.
        var sgn = view === 'M' ? -1 : 1;
        var oscreenx = nx, oscreeny = -ny;       // normal model → layar (flip y)
        poly.push([sxp + sgn * off * oscreenx, syp + sgn * off * oscreeny]);
      }
      // isian
      ctx.beginPath();
      ctx.moveTo(base[0][0], base[0][1]);
      for (i = 0; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.lineTo(base[base.length - 1][0], base[base.length - 1][1]);
      ctx.closePath();
      ctx.globalAlpha = 0.16; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
      // garis diagram
      ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]);
      for (i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();

      // penanda nilai ekstrem batang
      var ei = 0, ev = 0;
      for (i = 0; i < e[key].length; i++) if (Math.abs(e[key][i]) > Math.abs(ev)) { ev = e[key][i]; ei = i; }
      var evk = ev / conv;
      if (Math.abs(evk) > 1e-6) {
        ctx.fillStyle = color; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(evk.toFixed(view === 'M' ? 1 : 1), poly[ei][0], poly[ei][1] + (poly[ei][1] < base[ei][1] ? -4 : 11));
      }
    });
  }

  // deformasi via interpolasi Hermite kubik dari perpindahan simpul
  function drawDeform(ctx, r, X, Y, sc, ok, faint) {
    // skala perbesaran otomatis: perpindahan maks → ~8% dimensi rangka
    var dmax = 1e-9;
    r.D.forEach(function (d, i) { if (i % 3 !== 2) dmax = Math.max(dmax, Math.abs(d)); });
    var target = 0.08 * Math.min(r.Lb, r.H) * 1000;     // mm
    var mag = dmax > EPS ? target / dmax : 0;

    r.elems.forEach(function (e) {
      var A = r.nodes[e.ni], B = r.nodes[e.nj];
      var dx = B[0] - A[0], dy = B[1] - A[1], L = e.L;
      var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      // perpindahan ujung dalam LOKAL (aksial u, lintang v, rotasi θ)
      var d = e.dloc;   // [u_i, v_i, θ_i, u_j, v_j, θ_j]
      ctx.beginPath();
      var npts = 24;
      for (var k = 0; k <= npts; k++) {
        var t = k / npts, s = t * L;
        // aksial linear
        var u = d[0] * (1 - t) + d[3] * t;
        // lintang: Hermite
        var N1 = 1 - 3 * t * t + 2 * t * t * t;
        var N2 = L * (t - 2 * t * t + t * t * t);
        var N3 = 3 * t * t - 2 * t * t * t;
        var N4 = L * (-t * t + t * t * t);
        var vloc = N1 * d[1] + N2 * d[2] + N3 * d[4] + N4 * d[5];
        // titik model tak-terdeformasi
        var bx = A[0] + dx * t, by = A[1] + dy * t;
        // + perpindahan: aksial searah batang, lintang searah normal
        var mxp = bx + mag * (u * ux + vloc * nx);
        var myp = by + mag * (u * uy + vloc * ny);
        var Sx = X(mxp), Syc = Y(myp);
        if (k === 0) ctx.moveTo(Sx, Syc); else ctx.lineTo(Sx, Syc);
      }
      ctx.strokeStyle = ok; ctx.lineWidth = 2; ctx.stroke();
    });

    // ---- penanda besar deformasi di titik kritis ----
    var df = r.defl;
    function dispNode(idx) {
      var n = r.nodes[idx];
      return [X(n[0] + mag * r.D[idx * 3]), Y(n[1] + mag * r.D[idx * 3 + 1])];
    }
    ctx.fillStyle = ok; ctx.font = '10px "JetBrains Mono", monospace';
    // drift lateral di kedua puncak
    [[2, df.ux2], [3, df.ux3]].forEach(function (nd) {
      var p = dispNode(nd[0]);
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.8, 0, 7); ctx.fill();
      ctx.textAlign = nd[0] === 2 ? 'right' : 'left';
      ctx.fillText('Δ=' + Math.abs(nd[1]).toFixed(2) + 'mm', p[0] + (nd[0] === 2 ? -7 : 7), p[1] - 7);
    });
    // lendutan maks balok
    var beam = r.elems[2], A = r.nodes[beam.ni], B = r.nodes[beam.nj];
    var dxb = B[0] - A[0], dyb = B[1] - A[1], Lb2 = beam.L;
    var uxb = dxb / Lb2, uyb = dyb / Lb2, nxb = -uyb, nyb = uxb, db = beam.dloc;
    var tb = r.Lb > 0 ? df.sagX / r.Lb : 0.5;
    var ub = db[0] * (1 - tb) + db[3] * tb;
    var vb = (1 - 3 * tb * tb + 2 * tb * tb * tb) * db[1] + Lb2 * (tb - 2 * tb * tb + tb * tb * tb) * db[2] +
      (3 * tb * tb - 2 * tb * tb * tb) * db[4] + Lb2 * (-tb * tb + tb * tb * tb) * db[5];
    var sp = [X(A[0] + dxb * tb + mag * (ub * uxb + vb * nxb)), Y(A[1] + dyb * tb + mag * (ub * uyb + vb * nyb))];
    ctx.beginPath(); ctx.arc(sp[0], sp[1], 2.8, 0, 7); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillText('δ=' + Math.abs(df.sag).toFixed(2) + 'mm', sp[0], sp[1] + 14);
    // catatan skala perbesaran
    ctx.fillStyle = faint; ctx.textAlign = 'right'; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('skala deformasi ×' + (mag >= 10 ? Math.round(mag) : mag.toFixed(1)), X(r.nodes[3][0]) + 4, Y(0) + 4);
  }

  function drawLoadView(ctx, r, X, Y, N, amber, dim, faint, ink) {
    // beban merata pada balok (gravitasi ke bawah)
    var yB = N[2][1];    // layar y puncak (balok)
    var xL = N[2][0], xR = N[3][0];
    if (Math.abs(r.wbeam) > EPS) {
      ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 1;
      var hArr = 16, span = xR - xL, nA = Math.max(3, Math.round(span / 26));
      ctx.beginPath(); ctx.moveTo(xL, yB - 6 - hArr); ctx.lineTo(xR, yB - 6 - hArr); ctx.stroke();
      for (var k = 0; k <= nA; k++) {
        var xx = xL + span * k / nA;
        ctx.beginPath(); ctx.moveTo(xx, yB - 6 - hArr); ctx.lineTo(xx, yB - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx - 2.5, yB - 10.5); ctx.lineTo(xx, yB - 6); ctx.lineTo(xx + 2.5, yB - 10.5); ctx.stroke();
      }
      ctx.fillStyle = dim; ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
      var wlabel = Math.abs(r.wbeam).toFixed(1) + ' kN/m' + (r.qsup > 0 ? ' (q=' + r.qsup + '+bs)' : ' (bs)');
      ctx.fillText(wlabel, (xL + xR) / 2, yB - 6 - hArr - 4);
    }
    // beban terpusat
    r.inpPt.forEach(function (p) {
      var xx = X(p.a * 1000);
      ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(xx, yB - 34); ctx.lineTo(xx, yB - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xx - 4, yB - 11); ctx.lineTo(xx, yB - 6); ctx.lineTo(xx + 4, yB - 11); ctx.stroke();
      ctx.fillStyle = dim; ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(p.P.toFixed(0) + ' kN', xx, yB - 38);
    });
    // beban lateral
    drawLateral(ctx, N[2][0], N[2][1], r.HL1, amber, dim);
    drawLateral(ctx, N[3][0], N[3][1], r.HL2, amber, dim);
    // simpul
    ctx.fillStyle = ink;
    N.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, 7); ctx.fill(); });
  }
  function drawLateral(ctx, x, y, Hkn, amber, dim) {
    if (Math.abs(Hkn) < EPS) return;
    ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 2;
    var dir = Hkn >= 0 ? 1 : -1, len = 34;
    ctx.beginPath(); ctx.moveTo(x - dir * len, y); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - dir * 6, y - 4); ctx.lineTo(x, y); ctx.lineTo(x - dir * 6, y + 4); ctx.stroke();
    ctx.fillStyle = dim; ctx.textAlign = dir > 0 ? 'right' : 'left'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(Math.abs(Hkn).toFixed(0) + ' kN', x - dir * (len + 4), y - 5);
  }

  /* ============================================================
     REPORT
     ============================================================ */
  var APP_VER = 'v0.7.0';
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
      .replace(/γ/g, 'gamma').replace(/δ/g, 'delta').replace(/θ/g, 'theta').replace(/Σ/g, 'sum').replace(/φ/g, 'phi')
      .replace(/₁/g, '1').replace(/₂/g, '2').replace(/Ø/g, 'O').replace(/×/g, 'x').replace(/′/g, "'")
      .replace(/[–—−→]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/[^\x20-\x7E]/g, '?');
  }

  // Figur portal + satu mode diagram (grayscale native PDF). Dipakai berulang,
  // tersusun ke bawah: L (model & beban), M (BMD), V (geser), N (aksial), D (deformasi).
  // Koordinat lokal figure: pt, origin kiri-atas, y KE BAWAH (lebar tersedia 528 pt).
  function figFrame(r, mode, caption) {
    var ops = [];
    var maxW = 300, maxH = 108, amp = 30;                 // amp = ordinat maks (pt)
    var sc = Math.min(maxW / r.Lb, maxH / r.H);            // pt per meter
    var fw = r.Lb * sc, fh = r.H * sc;
    var x0 = Math.max(amp + 40, (528 - fw) / 2);           // kiri rangka (sisakan ruang ordinat kolom)
    var frameTop = 14 + amp;                               // ruang ordinat ke atas balok
    var yBase = frameTop + fh;
    function SX(mx) { return x0 + mx * sc; }               // meter → pt (kanan)
    function SY(my) { return yBase - my * sc; }            // meter dari dasar → pt (y turun)
    var nx = [[0, 0], [r.Lb, 0], [0, r.H], [r.Lb, r.H]];
    var np = nx.map(function (p) { return [SX(p[0]), SY(p[1])]; });

    // rangka (garis tengah)
    function fline(a, b) { ops.push({ t: 'line', x1: np[a][0], y1: np[a][1], x2: np[b][0], y2: np[b][1], lw: 1.3, g: 0.12 }); }
    fline(0, 2); fline(1, 3); fline(2, 3);
    // tumpuan
    [0, 1].forEach(function (k) {
      var x = np[k][0], y = np[k][1];
      if (r.fixed) {
        ops.push({ t: 'line', x1: x - 8, y1: y, x2: x + 8, y2: y, lw: 0.8, g: 0.2 });
        for (var hh = -8; hh < 8; hh += 4) ops.push({ t: 'line', x1: x + hh, y1: y, x2: x + hh - 3, y2: y + 4, lw: 0.5, g: 0.3 });
      } else {
        ops.push({ t: 'poly', pts: [[x, y], [x - 5, y + 8], [x + 5, y + 8]], close: true, g: 0.3 });
        ops.push({ t: 'line', x1: x - 7, y1: y + 10, x2: x + 7, y2: y + 10, lw: 0.5, g: 0.3 });
      }
    });

    if (mode === 'M' || mode === 'V' || mode === 'N') {
      var key = mode === 'M' ? 'Ms' : (mode === 'V' ? 'Vs' : 'Ns');
      var conv = mode === 'M' ? 1e6 : 1e3;
      var gmax = 1e-9;
      r.elems.forEach(function (e) { e[key].forEach(function (v) { gmax = Math.max(gmax, Math.abs(v)); }); });
      gmax /= conv;
      r.elems.forEach(function (e) {
        var A = nx[e.ni], B = nx[e.nj], dxm = B[0] - A[0], dym = B[1] - A[1], Lm = Math.hypot(dxm, dym);
        var uxm = dxm / Lm, uym = dym / Lm, nxm = -uym, nym = uxm;
        var pts = [], baseP = [];
        for (var i = 0; i < e.xs.length; i++) {
          var t = e.xs[i] / e.L;
          var bxS = SX(A[0] + dxm * t), byS = SY(A[1] + dym * t);
          baseP.push([bxS, byS]);
          var off = (e[key][i] / conv / gmax) * amp, sgn = mode === 'M' ? -1 : 1;
          pts.push([bxS + sgn * off * nxm, byS + sgn * off * (-nym)]);   // fig y turun → model +y jadi −y
        }
        ops.push({ t: 'poly', pts: baseP.concat(pts.slice().reverse()), close: true, fill: true, g: 0.85 });
        ops.push({ t: 'poly', pts: pts, lw: 0.8, g: 0.22 });
        var ei = 0, ev = 0;
        for (i = 0; i < e[key].length; i++) if (Math.abs(e[key][i]) > Math.abs(ev)) { ev = e[key][i]; ei = i; }
        var evk = ev / conv;
        if (Math.abs(evk) > 1e-6)
          ops.push({ t: 'text', x: pts[ei][0], y: pts[ei][1] + (pts[ei][1] < baseP[ei][1] ? -2 : 6), s: evk.toFixed(1), size: 6, align: 'c', g: 0.1 });
      });
    } else if (mode === 'D') {
      var dmax = 1e-9;
      r.D.forEach(function (d, i) { if (i % 3 !== 2) dmax = Math.max(dmax, Math.abs(d)); });
      var target = 0.08 * Math.min(r.Lb, r.H) * 1000;      // mm
      var mag = dmax > EPS ? target / dmax : 0;
      r.elems.forEach(function (e) {
        var A = nx[e.ni], B = nx[e.nj], dxm = B[0] - A[0], dym = B[1] - A[1], Lm = Math.hypot(dxm, dym);
        var uxm = dxm / Lm, uym = dym / Lm, nxm = -uym, nym = uxm, d = e.dloc, pts = [];
        for (var k = 0; k <= 20; k++) {
          var t = k / 20;
          var u = d[0] * (1 - t) + d[3] * t;
          var vloc = (1 - 3 * t * t + 2 * t * t * t) * d[1] + e.L * (t - 2 * t * t + t * t * t) * d[2] +
            (3 * t * t - 2 * t * t * t) * d[4] + e.L * (-t * t + t * t * t) * d[5];
          var mxp = A[0] + dxm * t + mag * (u * uxm + vloc * nxm) / 1000;   // mm → m
          var myp = A[1] + dym * t + mag * (u * uym + vloc * nym) / 1000;
          pts.push([SX(mxp), SY(myp)]);
        }
        ops.push({ t: 'poly', pts: pts, lw: 1, g: 0.25 });
      });
      // label besar deformasi di titik kritis
      var df = r.defl;
      [[2, df.ux2], [3, df.ux3]].forEach(function (ndd) {
        var n = nx[ndd[0]], px = SX(n[0] + mag * r.D[ndd[0] * 3] / 1000), py = SY(n[1] + mag * r.D[ndd[0] * 3 + 1] / 1000);
        ops.push({ t: 'text', x: px + (ndd[0] === 2 ? -3 : 3), y: py - 3, s: 'd=' + Math.abs(ndd[1]).toFixed(2) + 'mm', size: 6, align: ndd[0] === 2 ? 'r' : 'l', g: 0.1 });
      });
      var bm = r.elems[2], An = nx[bm.ni], Bn = nx[bm.nj], Lm2 = bm.L;
      var uxb = (Bn[0] - An[0]) / Lm2, uyb = (Bn[1] - An[1]) / Lm2, nxb = -uyb, nyb = uxb, dbb = bm.dloc, tb = r.Lb > 0 ? df.sagX / r.Lb : 0.5;
      var ubb = dbb[0] * (1 - tb) + dbb[3] * tb;
      var vbb = (1 - 3 * tb * tb + 2 * tb * tb * tb) * dbb[1] + Lm2 * (tb - 2 * tb * tb + tb * tb * tb) * dbb[2] +
        (3 * tb * tb - 2 * tb * tb * tb) * dbb[4] + Lm2 * (-tb * tb + tb * tb * tb) * dbb[5];
      var spx = SX(An[0] + (Bn[0] - An[0]) * tb + mag * (ubb * uxb + vbb * nxb) / 1000);
      var spy = SY(An[1] + (Bn[1] - An[1]) * tb + mag * (ubb * uyb + vbb * nyb) / 1000);
      ops.push({ t: 'text', x: spx, y: spy + 8, s: 'dv=' + Math.abs(df.sag).toFixed(2) + 'mm', size: 6, align: 'c', g: 0.1 });
    } else if (mode === 'L') {
      var AR = window.CivilReport.fig.arrow;
      // beban merata balok (panah ke bawah menuju balok)
      if (Math.abs(r.wbeam) > EPS) {
        var y1 = np[2][1], nAr = Math.max(3, Math.round(fw / 26));
        for (var a = 0; a <= nAr; a++) { var xx = np[2][0] + fw * a / nAr; AR(ops, xx, y1 - amp * 0.55, xx, y1 - 2, { lw: 0.5, g: 0.35 }); }
        ops.push({ t: 'line', x1: np[2][0], y1: y1 - amp * 0.55, x2: np[3][0], y2: y1 - amp * 0.55, lw: 0.5, g: 0.35 });
        ops.push({ t: 'text', x: (np[2][0] + np[3][0]) / 2, y: y1 - amp * 0.55 - 3, s: Math.abs(r.wbeam).toFixed(1) + ' kN/m', size: 6, align: 'c', g: 0.1 });
      }
      r.inpPt.forEach(function (pt) {
        var xx = SX(pt.a), yb = np[2][1];
        AR(ops, xx, yb - amp * 0.9, xx, yb - 2, { lw: 0.9, g: 0.05 });
        ops.push({ t: 'text', x: xx, y: yb - amp * 0.9 - 3, s: pt.P.toFixed(0) + ' kN', size: 6, align: 'c', g: 0.1 });
      });
      [[2, r.HL1], [3, r.HL2]].forEach(function (hl) {
        var Hkn = hl[1]; if (Math.abs(Hkn) < EPS) return;
        var x = np[hl[0]][0], y = np[hl[0]][1], dir = Hkn >= 0 ? 1 : -1;
        AR(ops, x - dir * 30, y, x, y, { lw: 1, g: 0.05 });
        ops.push({ t: 'text', x: x - dir * 32, y: y - 4, s: Math.abs(Hkn).toFixed(0) + ' kN', size: 6, align: dir > 0 ? 'r' : 'l', g: 0.1 });
      });
    }

    // dimensi ringkas L (di bawah) untuk figur pertama
    if (mode === 'L') {
      ops.push({ t: 'text', x: (np[0][0] + np[1][0]) / 2, y: yBase + 12, s: 'L = ' + r.Lb.toFixed(2) + ' m  |  H = ' + r.H.toFixed(2) + ' m', size: 6, align: 'c', g: 0.3 });
    }
    var capY = yBase + (mode === 'L' ? 24 : 16);
    ops.push({ t: 'text', x: 264, y: capY, s: caption, size: 7.5, align: 'c', g: 0 });
    return { fig: { h: Math.ceil((capY + 8) / 11.5), ops: ops, alt: caption + ' - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('ANALISIS PORTAL SEDERHANA (2 KOLOM + 1 BALOK)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Metode kekakuan langsung - rangka bidang', dt));
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR('Tinggi kolom H', numR(r.H, 2) + ' m'));
    L.push(rowR('Panjang balok L', numR(r.Lb, 2) + ' m'));
    L.push(rowR('Tumpuan', r.fixed ? 'jepit - jepit' : 'sendi - sendi'));
    L.push(rowR('Kolom', r.col.label));
    L.push(rowR('   ' + tolatin(r.col.note).slice(0, RW - 6), ''));
    L.push(rowR('Balok', r.beam.label));
    L.push(rowR('   ' + tolatin(r.beam.note).slice(0, RW - 6), ''));
    L.push('');
    L.push(' BEBAN');
    L.push(ruleR('-'));
    L.push(rowR('Berat sendiri', vals.self === 'ya' ? 'disertakan' : 'diabaikan'));
    L.push(rowR('Merata gravitasi balok q', numR(r.qsup, 2) + ' kN/m'));
    L.push(rowR('Merata total balok (q + bs)', numR(Math.abs(r.wbeam), 3) + ' kN/m'));
    r.inpPt.forEach(function (pt, i) {
      L.push(rowR('Terpusat #' + (i + 1), 'P=' + numR(pt.P, 2) + ' kN @ ' + numR(pt.a, 2) + ' m'));
    });
    L.push(rowR('Lateral puncak H1 / H2', numR(r.HL1, 2) + ' / ' + numR(r.HL2, 2) + ' kN'));
    L.push('');
    L.push(' DIAGRAM (tersusun ke bawah)');
    L.push(ruleR('-'));
    L.push(figFrame(r, 'L', 'Gbr. 1  Model & Beban'));
    L.push(figFrame(r, 'M', 'Gbr. 2  Diagram Momen / BMD  (kN.m)'));
    L.push(figFrame(r, 'V', 'Gbr. 3  Diagram Gaya Lintang / Geser  (kN)'));
    L.push(figFrame(r, 'N', 'Gbr. 4  Diagram Gaya Aksial  (kN)'));
    L.push(figFrame(r, 'D', 'Gbr. 5  Deformasi (diperbesar)'));
    L.push('');
    L.push(' REAKSI TUMPUAN');
    L.push(ruleR('-'));
    L.push(rowR('A kiri  H / V' + (r.fixed ? ' / M' : ''),
      numR(r.RA.Rx, 2) + ' / ' + numR(r.RA.Ry, 2) + (r.fixed ? ' / ' + numR(r.RA.M, 2) : '') + ' (kN' + (r.fixed ? ',kNm' : '') + ')'));
    L.push(rowR('B kanan H / V' + (r.fixed ? ' / M' : ''),
      numR(r.RB.Rx, 2) + ' / ' + numR(r.RB.Ry, 2) + (r.fixed ? ' / ' + numR(r.RB.M, 2) : '') + ' (kN' + (r.fixed ? ',kNm' : '') + ')'));
    L.push(rowR('sum V reaksi / beban grav', numR(r.sumRy, 2) + ' / ' + numR(r.Wgrav, 2) + ' kN'));
    L.push('');
    L.push(' GAYA DALAM MAKSIMUM');
    L.push(ruleR('='));
    var names = ['Kolom kiri ', 'Kolom kanan', 'Balok      '];
    r.elems.forEach(function (e, k) {
      L.push(rowR(names[k] + ' |M|', numR(Math.abs(e.Mmax), 2) + ' kN*m'));
      L.push(rowR(names[k] + ' |V| / |N|', numR(Math.abs(e.Vmax), 2) + ' / ' + numR(Math.abs(e.Nmax), 2) + ' kN'));
    });
    L.push(rowR('>> Momen maks global', numR(Math.abs(r.Mmax), 2) + ' kN*m'));
    L.push(rowR('>> Geser maks global', numR(Math.abs(r.Vmax), 2) + ' kN'));
    L.push(rowR('>> Aksial maks global', numR(Math.abs(r.Nmax), 2) + ' kN'));
    L.push(ruleR('='));
    L.push('');
    L.push(' DEFORMASI TITIK KRITIS');
    L.push(ruleR('-'));
    var df = r.defl;
    L.push(rowR('Drift lateral puncak (maks)', numR(Math.abs(df.drift), 2) + ' mm (' + (df.drift >= 0 ? 'kanan' : 'kiri') + ')'));
    L.push(rowR('Rasio drift H/delta', isFinite(df.driftRatio) ? numR(df.driftRatio, 0) : '-'));
    L.push(rowR('Lendutan balok maks @ x=' + numR(df.sagX, 2) + 'm', numR(Math.abs(df.sag), 2) + ' mm (' + (df.sag <= 0 ? 'bawah' : 'atas') + ')'));
    L.push(rowR('Rasio L/delta balok', isFinite(df.sagRatio) ? numR(df.sagRatio, 0) : '-'));
    L.push(rowR('Puncak kiri N2 dx/dy/rot', numR(df.ux2, 2) + '/' + numR(df.uy2, 2) + ' mm /' + numR(df.rot2, 3) + ' mrad'));
    L.push(rowR('Puncak kanan N3 dx/dy/rot', numR(df.ux3, 2) + '/' + numR(df.uy3, 2) + ' mm /' + numR(df.rot3, 3) + ' mrad'));
    L.push(' Batas layan lazim: drift H/500..H/250 ; lendutan balok L/360..L/240.');
    L.push('');
    L.push(' Analisis elastis linier (I bruto sumbu kuat). Momen sagging (+),');
    L.push(' aksial tarik (+). Bukan cek kapasitas/tekuk - verifikasi oleh insinyur.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(' ' + rep('=', RW));
    return L.map(function (x) { return typeof x === 'string' ? tolatin(x) : x; });
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast(r.msg || 'Lengkapi data dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Portal_' + (r.fixed ? 'jepit' : 'sendi') + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Analisis Portal', category: 'Analisis Struktur', needsCanvas: true, needsRenderer: false },

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
