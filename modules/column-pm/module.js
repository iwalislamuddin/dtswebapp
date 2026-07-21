/* ============================================================
   Civil Tools — modules/column-pm/module.js  (Tier 3, Three.js / WebGL)
   Diagram Interaksi P–M Kolom Persegi — UNIAKSIAL & BIAKSIAL — SNI 2847:2019.
   Permukaan interaksi 3D (P–Mx–My) via kompatibilitas regangan dengan
   SUMBU NETRAL MIRING (sapuan sudut θ × kedalaman c).

   Metode:
   - Untuk tiap arah sumbu netral θ (0..360°) dan kedalaman c:
     koordinat kedalaman u(p) = umax − p·n, n = (cosθ, sinθ);
     regangan ε(p) = 0,003·(c − u)/c; baja fs = ±fy klem elastis,
     baris dalam blok tekan dikoreksi beton terdesak (fs − 0,85f'c).
   - Blok tegangan persegi: poligon = penampang ∩ {u ≤ a}, a = β1·c
     (clipping Sutherland–Hodgman); Cc = 0,85·f'c·A_blok di centroid blok.
   - P = Cc + ΣAs·fs,eff ; Mx = ΣF·y ; My = ΣF·x (terhadap centroid).
   - φ dari εt baja tarik terjauh (Tabel 21.2.2): 0,65/0,75 → 0,90
     transisi εty..εty+0,003; plafon aksial φPn ≤ φ·(0,80|0,85)·Po (22.4.2).
   - Cek biaksial: IRIS permukaan desain pada P = Pu → kontur (φMnx, φMny);
     D/C = |Mu| / |Mkap| pada arah β = atan2(Muy, Mux) (metode kontur beban
     eksak dari permukaan — bukan pendekatan Bresler).
   - Visual 3D: permukaan desain (mesh transparan + meridian/paralel),
     sumbu P/Mx/My, kontur iris di Pu, titik demand; orbit/pan/zoom.

   TIDAK termasuk: kelangsingan/orde-2 (Ps. 6.6.4 — Mu sudah diperbesar),
   detail gempa (Ps. 18), penampang non-persegi, tulangan tak-simetris.
   Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'column-pm';
  var THREE = window.THREE;
  var state = {};
  var ES = 200000, ECU = 0.003;

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  /* ============================================================
     KALKULASI — kompatibilitas regangan sumbu netral miring
     ============================================================ */
  function beta1Of(fc) {
    if (fc <= 28) return 0.85;
    return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
  }

  // posisi batang (x,y) relatif centroid — pola keliling simetris
  function barList(b, h, dp, nx, ny, Abar) {
    var bars = [], xe = b / 2 - dp, ye = h / 2 - dp, i;
    nx = Math.max(2, Math.round(nx)); ny = Math.max(2, Math.round(ny));
    for (i = 0; i < nx; i++) {
      var x = nx === 1 ? 0 : -xe + 2 * xe * i / (nx - 1);
      bars.push({ x: x, y: ye, As: Abar });
      bars.push({ x: x, y: -ye, As: Abar });
    }
    for (i = 1; i < ny - 1; i++) {
      var y = -ye + 2 * ye * i / (ny - 1);
      bars.push({ x: -xe, y: y, As: Abar });
      bars.push({ x: xe, y: y, As: Abar });
    }
    return bars;
  }

  // clip poligon (CCW) terhadap halfplane dot(p,n) >= k  (Sutherland–Hodgman)
  function clipPoly(poly, nvec, k) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], bpt = poly[(i + 1) % poly.length];
      var da = a.x * nvec.x + a.y * nvec.y - k;
      var db = bpt.x * nvec.x + bpt.y * nvec.y - k;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        var t = da / (da - db);
        out.push({ x: a.x + t * (bpt.x - a.x), y: a.y + t * (bpt.y - a.y) });
      }
    }
    return out;
  }

  // luas + centroid poligon (shoelace)
  function polyProps(poly) {
    var A = 0, cx = 0, cy = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      var cr = p.x * q.y - q.x * p.y;
      A += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
    }
    A /= 2;
    if (Math.abs(A) < 1e-9) return { A: 0, cx: 0, cy: 0 };
    return { A: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) };
  }

  // satu titik permukaan utk (θ, c). Hasil N & N·mm (Mx thd sumbu-x, My thd sumbu-y).
  function pointAt(theta, c, geo) {
    var n = { x: Math.cos(theta), y: Math.sin(theta) };
    var corners = [
      { x: -geo.b / 2, y: -geo.h / 2 }, { x: geo.b / 2, y: -geo.h / 2 },
      { x: geo.b / 2, y: geo.h / 2 }, { x: -geo.b / 2, y: geo.h / 2 }
    ];
    var umax = -Infinity, umin = Infinity;
    corners.forEach(function (p) {
      var d = p.x * n.x + p.y * n.y;
      if (d > umax) umax = d;
      if (d < umin) umin = d;
    });
    var extent = umax - umin;
    var a = Math.min(geo.beta1 * c, extent);

    // blok tekan: u <= a  ↔  p·n >= umax − a
    var blk = clipPoly(corners, n, umax - a);
    var pp = polyProps(blk);
    var Cc = 0.85 * geo.fc * pp.A;
    var P = Cc, Mx = Cc * pp.cy, My = Cc * pp.cx;

    var uTmax = -Infinity;                              // baja tarik terjauh
    geo.bars.forEach(function (bar) {
      var u = umax - (bar.x * n.x + bar.y * n.y);       // kedalaman dari serat tekan
      if (u > uTmax) uTmax = u;
      var eps = ECU * (c - u) / c;
      var fs = Math.max(-geo.fy, Math.min(geo.fy, eps * ES));
      var fsEff = (u <= a) ? fs - 0.85 * geo.fc : fs;
      var F = bar.As * fsEff;
      P += F; Mx += F * bar.y; My += F * bar.x;
    });
    var epsT = ECU * (uTmax - c) / c;                   // + = tarik
    return { P: P, Mx: Mx, My: My, epsT: epsT, extent: extent };
  }

  function phiOf(epsT, ety, tie) {
    var lo = tie === 'spiral' ? 0.75 : 0.65;
    if (epsT <= ety) return lo;
    if (epsT >= ety + 0.003) return 0.9;
    return lo + (0.9 - lo) * (epsT - ety) / 0.003;
  }

  var NTH = 48, NC = 34;                                // resolusi permukaan

  function compute(v) {
    var r = { valid: false, warn: [] };
    var b = num(v.b), h = num(v.h), dp = num(v.dp);
    var fc = num(v.fc), fy = num(v.fy);
    var db = num(v.db), nx = Math.max(2, Math.round(num(v.nx))), ny = Math.max(2, Math.round(num(v.ny)));
    var tie = v.tie || 'tie';
    var Pu = num(v.Pu), Mux = num(v.Mux), Muy = num(v.Muy);

    r.b = b; r.h = h; r.dp = dp; r.fc = fc; r.fy = fy; r.db = db;
    r.nx = nx; r.ny = ny; r.tie = tie; r.Pu = Pu; r.Mux = Mux; r.Muy = Muy;

    if (b <= 0 || h <= 0 || fc <= 0 || fy <= 0 || db <= 0 || dp <= 0 || dp >= Math.min(b, h) / 2) {
      r.warn.push('Lengkapi dimensi, material, dan d\' (0 < d\' < sisi terkecil/2).');
      return r;
    }

    var Abar = Math.PI * db * db / 4;
    var bars = barList(b, h, dp, nx, ny, Abar);
    var nBars = bars.length;
    var Ast = nBars * Abar;
    var Ag = b * h;
    var rho = Ast / Ag;
    var beta1 = beta1Of(fc);
    var ety = fy / ES;
    r.Abar = Abar; r.nBars = nBars; r.Ast = Ast; r.Ag = Ag; r.rho = rho;
    r.beta1 = beta1; r.ety = ety; r.bars = bars;

    var geo = { b: b, h: h, fc: fc, fy: fy, beta1: beta1, bars: bars };

    /* --- titik acuan --- */
    var Po = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1000;
    var alphaMax = tie === 'spiral' ? 0.85 : 0.80;
    var phiC = tie === 'spiral' ? 0.75 : 0.65;
    r.Po = Po; r.PnMax = alphaMax * Po; r.phiPnMax = phiC * alphaMax * Po;
    r.alphaMax = alphaMax; r.phiC = phiC;
    r.Pnt = -fy * Ast / 1000; r.phiPnt = 0.9 * r.Pnt;

    /* --- permukaan desain: grid θ × c --- */
    // surf[it][ic] = {Mx, My, P} (kN·m, kN — DESAIN dengan φ + plafon)
    var surf = [], nomSlice90 = null;
    for (var it = 0; it <= NTH; it++) {
      var th = 2 * Math.PI * it / NTH;
      var row = [];
      // apex tarik
      row.push({ Mx: 0, My: 0, P: r.phiPnt });
      var ext = pointAt(th, 1, geo).extent;
      for (var ic = 0; ic < NC; ic++) {
        var c = 0.04 * ext * Math.pow((2.4 * ext) / (0.04 * ext), ic / (NC - 1));  // log spacing
        var p = pointAt(th, c, geo);
        var phi = phiOf(p.epsT, ety, tie);
        var Pd = Math.min(phi * p.P / 1000, r.phiPnMax);
        row.push({ Mx: phi * p.Mx / 1e6, My: phi * p.My / 1e6, P: Pd,
                   nMx: p.Mx / 1e6, nMy: p.My / 1e6, nP: p.P / 1000, phi: phi, c: c });
      }
      // apex tekan (plafon)
      row.push({ Mx: 0, My: 0, P: r.phiPnMax });
      surf.push(row);
    }
    r.surf = surf;

    /* --- nilai kunci uniaksial (θ=90°: tekan sisi +y → lentur thd sumbu-x) --- */
    var dtX = h / 2 + (h / 2 - dp);                     // jarak serat tekan → baja terjauh
    var cBalX = ECU / (ECU + ety) * dtX;
    var pbX = pointAt(Math.PI / 2, cBalX, geo);
    r.cBalX = cBalX; r.MbalX = pbX.Mx / 1e6; r.PbalX = pbX.P / 1000;
    var dtY = b / 2 + (b / 2 - dp);
    var cBalY = ECU / (ECU + ety) * dtY;
    var pbY = pointAt(0, cBalY, geo);
    r.cBalY = cBalY; r.MbalY = pbY.My / 1e6; r.PbalY = pbY.P / 1000;

    // lentur murni per sumbu (interpolasi P=0 di meridian θ=90° & θ=0°)
    r.M0x = zeroCross(geo, Math.PI / 2, 'Mx');
    r.M0y = zeroCross(geo, 0, 'My');

    /* --- cek biaksial: iris permukaan di P = Pu --- */
    var dc = null, capM = null, contour = [];
    var Mu = Math.sqrt(Mux * Mux + Muy * Muy);
    r.Mu = Mu;
    if (Pu > r.phiPnMax) {
      dc = Pu / r.phiPnMax;
      r.warn.push('Pu = ' + Pu.toFixed(0) + ' kN > plafon φPn,maks = ' + r.phiPnMax.toFixed(0) + ' kN — aksial saja sudah NG.');
    } else if (Pu < r.phiPnt) {
      dc = Math.abs(Pu / r.phiPnt);
      r.warn.push('Pu tarik melampaui φPnt.');
    } else {
      // kontur di P = Pu: interpolasi per meridian
      for (var jt = 0; jt < NTH; jt++) {
        var rowj = surf[jt];
        for (var jc = 0; jc < rowj.length - 1; jc++) {
          var p1 = rowj[jc], p2 = rowj[jc + 1];
          if ((p1.P - Pu) * (p2.P - Pu) <= 0 && p2.P !== p1.P) {
            var t = (Pu - p1.P) / (p2.P - p1.P);
            var Mxi = p1.Mx + t * (p2.Mx - p1.Mx);
            var Myi = p1.My + t * (p2.My - p1.My);
            // ambil crossing dengan |M| terbesar (cabang luar permukaan)
            var mm = Math.sqrt(Mxi * Mxi + Myi * Myi);
            if (!contour[jt] || mm > contour[jt].m) contour[jt] = { Mx: Mxi, My: Myi, m: mm };
          }
        }
      }
      contour = contour.filter(function (x) { return !!x; });
      if (contour.length >= 8 && Mu > 0.001) {
        var beta = Math.atan2(Muy, Mux);
        var best = null;
        for (var kk = 0; kk < contour.length; kk++) {
          var q1 = contour[kk], q2 = contour[(kk + 1) % contour.length];
          var b1 = Math.atan2(q1.My, q1.Mx), b2 = Math.atan2(q2.My, q2.Mx);
          var d1 = angDiff(beta, b1), d2 = angDiff(beta, b2);
          if (d1 * d2 <= 0 && Math.abs(d1) < 1 && Math.abs(d2) < 1) {
            var tt = Math.abs(d1) + Math.abs(d2) < 1e-12 ? 0 : Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
            var Mxc = q1.Mx + tt * (q2.Mx - q1.Mx);
            var Myc = q1.My + tt * (q2.My - q1.My);
            best = Math.sqrt(Mxc * Mxc + Myc * Myc);
            capM = { Mx: Mxc, My: Myc, m: best };
            break;
          }
        }
        if (best) dc = Mu / best;
      } else if (Mu <= 0.001) {
        dc = Pu > 0 ? Pu / r.phiPnMax : 0;
      }
    }
    r.contour = contour; r.capM = capM; r.dc = dc;
    r.valid = true;

    /* --- peringatan --- */
    if (rho < 0.01) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% < 1% (Ps. 10.6.1.1) — tambah tulangan.');
    if (rho > 0.08) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% > 8% — melampaui batas maksimum.');
    else if (rho > 0.04) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% > 4% — sulit di sambungan lewatan (praktik).');
    var clear = (b - 2 * dp) / Math.max(1, nx - 1) - db;
    if (nx > 1 && clear < Math.max(40, 1.5 * db))
      r.warn.push('Spasi bersih antar batang muka lebar ≈ ' + clear.toFixed(0) + ' mm < maks(40, 1,5db) (Ps. 25.2.3).');
    if (dc != null && dc > 1) r.warn.push('D/C = ' + dc.toFixed(2) + ' > 1 — titik beban di LUAR permukaan desain.');
    r.warn.push('Kelangsingan/momen orde-2 TIDAK diperhitungkan — Mux & Muy harus sudah termasuk pembesaran momen (Ps. 6.6.4).');

    return r;
  }

  function angDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  // interpolasi momen saat P=0 sepanjang meridian θ
  function zeroCross(geo, theta, key) {
    var prev = null;
    for (var i = 0; i < 60; i++) {
      var ext = pointAt(theta, 1, geo).extent;
      var c = 0.03 * ext * Math.pow(80, i / 59);
      var p = pointAt(theta, c, geo);
      if (prev && prev.P <= 0 && p.P > 0) {
        var t = (0 - prev.P) / (p.P - prev.P);
        var M = (key === 'Mx' ? prev.Mx + t * (p.Mx - prev.Mx) : prev.My + t * (p.My - prev.My));
        return M / 1e6;
      }
      prev = p;
    }
    return 0;
  }

  /* ============================================================
     SCENE 3D — permukaan interaksi
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function colHex(name, fallback) { var c = css(name); return c ? new THREE.Color(c) : new THREE.Color(fallback); }

  function buildScene() {
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    cam.position.set(5.2, 3.6, 6.4);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    var dir2 = new THREE.DirectionalLight(0xffffff, 0.25);
    dir2.position.set(-6, -4, -5);
    scene.add(dir2);

    var group = new THREE.Group();
    scene.add(group);

    state.scene = scene; state.cam = cam; state.contentGroup = group;
    return { scene: scene, cam: cam, group: group };
  }

  function rebuild(r) {
    var g = state.contentGroup;
    if (!g) return;
    state.UI.disposeObject(g);
    while (g.children.length) g.remove(g.children[0]);
    if (!r || !r.valid) return;

    var cAmber = colHex('--amber', '#f28f3b');
    var cBlue = colHex('--sky', '#30bced');
    var cSage = colHex('--sage', '#a4c2a5');
    var cInk = colHex('--ink-dim', '#acb89b');
    var cLine = colHex('--line', '#2b3123');
    var cBad = colHex('--bad', '#e5694f');

    /* --- skala: M → bidang XZ, P → sumbu Y --- */
    var maxM = 1, maxP = r.phiPnMax, minP = r.phiPnt;
    r.surf.forEach(function (row) {
      row.forEach(function (p) { maxM = Math.max(maxM, Math.abs(p.Mx), Math.abs(p.My)); });
    });
    maxM = Math.max(maxM, Math.abs(r.Mux), Math.abs(r.Muy)) || 1;
    var sM = 1.9 / maxM;
    var Pmid = (maxP + minP) / 2, sP = 3.0 / Math.max(1, maxP - minP);
    var X = function (Mx) { return Mx * sM; };
    var Z = function (My) { return My * sM; };
    var Y = function (P) { return (P - Pmid) * sP; };
    state.mapY = Y; state.mapX = X; state.mapZ = Z;

    /* --- mesh permukaan --- */
    var nTh = r.surf.length, nC = r.surf[0].length;
    var pos = new Float32Array(nTh * nC * 3);
    var k = 0;
    for (var i = 0; i < nTh; i++) for (var j = 0; j < nC; j++) {
      var p = r.surf[i][j];
      pos[k++] = X(p.Mx); pos[k++] = Y(p.P); pos[k++] = Z(p.My);
    }
    var idx = [];
    for (var a = 0; a < nTh - 1; a++) for (var c2 = 0; c2 < nC - 1; c2++) {
      var i0 = a * nC + c2, i1 = (a + 1) * nC + c2;
      idx.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
    }
    var geoM = new THREE.BufferGeometry();
    geoM.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geoM.setIndex(idx);
    geoM.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({
      color: cSage, transparent: true, opacity: 0.30, roughness: 0.9, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false
    });
    g.add(new THREE.Mesh(geoM, mat));

    /* --- garis meridian (tiap 4 θ) & paralel (tiap 4 c) --- */
    var lineMat = new THREE.LineBasicMaterial({ color: cInk, transparent: true, opacity: 0.4 });
    for (var im = 0; im < nTh - 1; im += 4) {
      var ptsm = [];
      for (var jm = 0; jm < nC; jm++) {
        var q = r.surf[im][jm];
        ptsm.push(new THREE.Vector3(X(q.Mx), Y(q.P), Z(q.My)));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsm), lineMat));
    }
    for (var jp = 2; jp < nC - 1; jp += 4) {
      var ptsp = [];
      for (var ip = 0; ip < nTh; ip++) {
        var q2 = r.surf[ip][jp];
        ptsp.push(new THREE.Vector3(X(q2.Mx), Y(q2.P), Z(q2.My)));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsp), lineMat));
    }

    /* --- sumbu --- */
    var axLen = 2.6;
    var mkArrow = function (dirV, col, len) {
      return new THREE.ArrowHelper(dirV.clone().normalize(), new THREE.Vector3(0, Y(0), 0), len, col.getHex(), len * 0.08, len * 0.035);
    };
    g.add(mkArrow(new THREE.Vector3(1, 0, 0), cAmber, axLen));                 // Mx
    g.add(mkArrow(new THREE.Vector3(0, 0, 1), cBlue, axLen));                  // My
    var pAxis = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, Y(minP) - 0.15, 0), Y(maxP) - Y(minP) + 0.45, cInk.getHex(), 0.16, 0.07);
    g.add(pAxis);

    // grid lantai di P=0
    var grid = new THREE.GridHelper(5.4, 12, cLine, cLine);
    grid.material.transparent = true; grid.material.opacity = 0.28;
    grid.position.y = Y(0);
    g.add(grid);

    /* --- kontur iris di Pu + titik demand --- */
    if (r.contour && r.contour.length >= 8) {
      var cpts = r.contour.map(function (q) { return new THREE.Vector3(X(q.Mx), Y(r.Pu), Z(q.My)); });
      cpts.push(cpts[0].clone());
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cpts),
        new THREE.LineBasicMaterial({ color: cAmber, linewidth: 2 })));
    }
    if (r.Pu > 0 || r.Mu > 0) {
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 14),
        new THREE.MeshStandardMaterial({ color: cBad, roughness: 0.4 }));
      dot.position.set(X(r.Mux), Y(r.Pu), Z(r.Muy));
      g.add(dot);
      // garis dari sumbu P ke titik demand (radius di bidang iris)
      var lpts = [new THREE.Vector3(0, Y(r.Pu), 0), dot.position.clone()];
      var lm = new THREE.LineBasicMaterial({ color: cBad, transparent: true, opacity: 0.6 });
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lpts), lm));
      // proyeksi kapasitas se-arah (bila ada)
      if (r.capM) {
        var capDot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10),
          new THREE.MeshStandardMaterial({ color: cAmber.getHex(), roughness: 0.5 }));
        capDot.position.set(X(r.capM.Mx), Y(r.Pu), Z(r.capM.My));
        g.add(capDot);
      }
    }

    // auto-fit
    state.fitRadius = 6.4;
    if (state.controls) state.controls.setView([0, 0, 0], state.fitRadius);
  }

  /* ============================================================
     RENDER DOM + WIRING (pola tier-3, ikut anchor-bolt-group)
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('pm-style')) return;
    var s = document.createElement('style');
    s.id = 'pm-style';
    s.textContent =
      '.pm-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.pm-view{position:relative;flex:1 1 55%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(130% 130% at 30% 0%, var(--bg2), var(--bg));overflow:hidden}' +
      '.pm-hint{position:absolute;right:10px;bottom:8px;font:10px "JetBrains Mono",monospace;color:var(--ink-faint);' +
        'pointer-events:none;text-align:right;line-height:1.5}' +
      '.pm-legend{position:absolute;left:12px;bottom:8px;font:10px "JetBrains Mono",monospace;' +
        'color:var(--ink-faint);pointer-events:none;line-height:1.55}' +
      '.pm-legend b{font-weight:600}' +
      '.pm-res{flex:1 1 45%;overflow-y:auto;padding:16px 22px 30px}' +
      '.pm-fitwrap{position:absolute;left:10px;top:38px}' +
      '.pm-fitbtn{font:11px "Space Grotesk",sans-serif;background:var(--panel-solid);color:var(--ink-dim);' +
        'border:1px solid var(--line);border-radius:7px;padding:4px 9px;cursor:pointer}' +
      '.pm-fitbtn:hover{border-color:var(--amber);color:var(--amber)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Diagram P–M Kolom'));
    panel.appendChild(UI.el('div', 'sub', 'Permukaan interaksi 3D aksial–momen dua arah (P–Mx–My) kolom beton ' +
      'persegi via kompatibilitas regangan sumbu netral miring — SNI 2847:2019. Cek biaksial: iris permukaan ' +
      'di P = Pu, D/C pada arah momen resultan. Putar: seret · Zoom: roda · Geser: klik-kanan.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Penampang' },
      { type: 'number', id: 'b', label: 'Lebar b (sumbu-x)', unit: 'mm', value: 400, min: 150, step: 25 },
      { type: 'number', id: 'h', label: 'Tinggi h (sumbu-y)', unit: 'mm', value: 400, min: 150, step: 25 },
      { type: 'number', id: 'dp', label: "Selimut ke pusat tulangan d'", unit: 'mm', value: 60, min: 30, step: 5, hint: 'cc + Øsengkang + db/2 (≈60 mm untuk cc 40, sengkang 10, D22).' },

      { type: 'group', label: 'Material' },
      { type: 'number', id: 'fc', label: "Mutu beton f'c", unit: 'MPa', value: 25, min: 15, step: 1 },
      { type: 'number', id: 'fy', label: 'Mutu baja fy', unit: 'MPa', value: 400, min: 240, step: 10 },

      { type: 'group', label: 'Tulangan (pola keliling simetris)' },
      { type: 'number', id: 'db', label: 'Diameter batang db', unit: 'mm', value: 19, min: 10, step: 1 },
      { type: 'number', id: 'nx', label: 'Batang per muka lebar (nx)', value: 3, min: 2, step: 1, hint: 'Baris atas & bawah, termasuk sudut.' },
      { type: 'number', id: 'ny', label: 'Batang per muka tinggi (ny)', value: 3, min: 2, step: 1, hint: 'Termasuk sudut. Total = 2nx + 2(ny−2).' },
      { type: 'segment', id: 'tie', label: 'Pengikat', value: 'tie', options: [
        { value: 'tie', label: 'Sengkang ikat (0,80Po)' }, { value: 'spiral', label: 'Spiral (0,85Po)' } ] },

      { type: 'group', label: 'Beban Terfaktor (titik uji)' },
      { type: 'number', id: 'Pu', label: 'Aksial Pu', unit: 'kN', value: 1200, min: 0, step: 50 },
      { type: 'number', id: 'Mux', label: 'Momen Mux (thd sumbu-x)', unit: 'kN·m', value: 150, step: 10, hint: 'Momen yang menekan sisi atas/bawah (arah tinggi h).' },
      { type: 'number', id: 'Muy', label: 'Momen Muy (thd sumbu-y)', unit: 'kN·m', value: 0, step: 10, hint: '0 = uniaksial. Termasuk pembesaran momen bila langsing.' }
    ];

    var results = UI.el('div', 'pm-res');
    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); }, ID);
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

    var work = UI.el('div', 'pm-work');
    var view = UI.el('div', 'pm-view');
    state.cap = UI.canvasCap(view, 'Diagram P–M kolom');
    view.appendChild(UI.el('div', 'pm-hint', 'seret: putar · roda: zoom · klik-kanan: geser'));
    view.appendChild(UI.el('div', 'pm-legend',
      '<b>tegak</b> = φPn (kN) · <b>lantai</b> = φMnx (oranye) × φMny (biru)<br>' +
      'cincin oranye = iris di Pu · titik merah = (Mux, Muy, Pu)'));
    var fitWrap = UI.el('div', 'pm-fitwrap');
    var fitBtn = UI.el('button', 'pm-fitbtn', '⟲ Reset tampilan');
    fitBtn.addEventListener('click', function () {
      if (state.controls && state.fitRadius) state.controls.setView([0, 0, 0], state.fitRadius);
    });
    fitWrap.appendChild(fitBtn); view.appendChild(fitWrap);
    work.appendChild(view);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);
    state.view = view;

    var R = state.runtime.getRenderer ? state.runtime.getRenderer() : null;
    if (!R) {
      view.appendChild(UI.el('div', 'ck-empty', 'WebGL tidak tersedia di browser ini — visual 3D dinonaktifkan. Hasil numerik tetap dihitung.'));
    } else {
      state.R = R;
      var sc = buildScene();
      R.mount(view);
      R.onResize = function (w, h) { sc.cam.aspect = w / Math.max(1, h); sc.cam.updateProjectionMatrix(); };
      state.controls = state.runtime.orbit.create(sc.cam, R.canvas, {
        target: [0, 0, 0], minDistance: 1.2, maxDistance: 40, damping: 0.12
      });
      state.themeObs = new MutationObserver(function () { rebuild(state.result); });
      state.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      R.start(function () {
        if (state.controls) state.controls.update();
        R.renderer.render(sc.scene, sc.cam);
      });
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
      state.cap.set('Diagram P–M kolom');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      rebuild(r);
      return;
    }

    var biax = Math.abs(r.Muy) > 0.001 && Math.abs(r.Mux) > 0.001;
    state.cap.set(r.b + '×' + r.h + ' · ' + r.nBars + 'D' + r.db +
      (r.dc != null ? ' · D/C ' + r.dc.toFixed(2) + (biax ? ' (biaksial)' : '') : ''));

    if (r.dc != null)
      results.appendChild(UI.heroRow([
        { label: 'D/C ' + (biax ? 'biaksial' : 'uniaksial'), value: UI.fmt(r.dc, 2),
          unit: r.dc <= 1 ? 'OK' : 'NG', tone: r.dc <= 1 ? 'ok' : 'bad' },
        { label: '|Mu| resultan', value: UI.fmt(r.Mu, 1), unit: 'kN·m' },
        r.capM
          ? { label: 'φMn kapasitas @Pu', value: UI.fmt(r.capM.m, 1), unit: 'kN·m' }
          : { label: 'φPn plafon', value: UI.fmt(r.phiPnMax, 0), unit: 'kN' }
      ]));
    else
      results.appendChild(UI.heroRow([
        { label: 'φPn maks (plafon aksial)', value: UI.fmt(r.phiPnMax, 0), unit: 'kN' },
        { label: 'Po tekan murni', value: UI.fmt(r.Po, 0), unit: 'kN' },
        { label: 'Pnt tarik murni', value: UI.fmt(r.Pnt, 0), unit: 'kN' }
      ]));

    results.appendChild(UI.rhead('Penampang & tulangan'));
    results.appendChild(UI.kv('Ag / Ast', UI.fmt(r.Ag, 0) + ' / ' + UI.fmt(r.Ast, 0) + ' mm²'));
    results.appendChild(UI.kv('Jumlah batang / ρg', r.nBars + 'D' + r.db + ' / ' + (r.rho * 100).toFixed(2) + ' %',
      (r.rho >= 0.01 && r.rho <= 0.08) ? 'ok' : 'bad'));
    results.appendChild(UI.kv('β1 / εty', r.beta1.toFixed(3) + ' / ' + r.ety.toFixed(4)));

    results.appendChild(UI.rhead('Titik kunci (nominal)'));
    results.appendChild(UI.kv('Po tekan murni', UI.fmt(r.Po, 0) + ' kN'));
    results.appendChild(UI.kv('Pn,maks = ' + r.alphaMax.toFixed(2) + '·Po', UI.fmt(r.PnMax, 0) + ' kN'));
    results.appendChild(UI.kv('Balanced-X (cb=' + r.cBalX.toFixed(0) + ')', 'Mbx ' + UI.fmt(r.MbalX, 0) + ' kN·m · Pb ' + UI.fmt(r.PbalX, 0) + ' kN'));
    results.appendChild(UI.kv('Balanced-Y (cb=' + r.cBalY.toFixed(0) + ')', 'Mby ' + UI.fmt(r.MbalY, 0) + ' kN·m · Pb ' + UI.fmt(r.PbalY, 0) + ' kN'));
    results.appendChild(UI.kv('Lentur murni M0x / M0y', UI.fmt(r.M0x, 0) + ' / ' + UI.fmt(r.M0y, 0) + ' kN·m'));
    results.appendChild(UI.kv('Tarik murni Pnt', UI.fmt(r.Pnt, 0) + ' kN'));

    results.appendChild(UI.rhead('Kurva desain (φ)'));
    results.appendChild(UI.kv('φ tekan / tarik terkendali', r.phiC.toFixed(2) + ' / 0,90'));
    results.appendChild(UI.kv('φPn plafon', UI.fmt(r.phiPnMax, 0) + ' kN'));

    if (r.dc != null) {
      results.appendChild(UI.rhead('Cek titik beban (P = ' + UI.fmt(r.Pu, 0) + ' kN)'));
      results.appendChild(UI.kv('Momen resultan |Mu|', UI.fmt(r.Mu, 1) + ' kN·m' +
        (biax ? ' (arah ' + (Math.atan2(r.Muy, r.Mux) * 180 / Math.PI).toFixed(0) + '°)' : '')));
      if (r.capM)
        results.appendChild(UI.kv('Kapasitas se-arah di iris Pu', 'φMnx ' + UI.fmt(r.capM.Mx, 1) +
          ' · φMny ' + UI.fmt(r.capM.My, 1) + ' → |φMn| ' + UI.fmt(r.capM.m, 1) + ' kN·m'));
      results.appendChild(UI.kv('D/C = |Mu| / |φMn|', UI.fmt(r.dc, 2), r.dc <= 1 ? 'ok' : 'bad'));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 2847:2019 — kompatibilitas regangan (εcu 0,003, blok persegi β1) dengan <b>sumbu netral miring</b> ' +
      '(sapuan 48 sudut × 34 kedalaman): blok tekan di-clip poligon eksak, baja elastoplastis ±fy + koreksi beton ' +
      'terdesak. φ Tabel 21.2.2, plafon 0,80/0,85·Po (Ps. 22.4.2). <b>Cek biaksial dari permukaan eksak</b> ' +
      '(iris P=Pu, kontur beban) — lebih akurat daripada pendekatan resiprokal Bresler. Pola tulangan keliling ' +
      'simetris. <b>TIDAK termasuk</b>: kelangsingan (Ps. 6.6.4 — Mu sudah diperbesar), detail gempa (Ps. 18), ' +
      'penampang non-persegi. Verifikasi oleh insinyur penanggung jawab.'));

    rebuild(r);
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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/ρ/g, 'rho')
      .replace(/φ/g, 'phi').replace(/β/g, 'beta').replace(/ε/g, 'eps').replace(/θ/g, 'theta')
      .replace(/°/g, 'deg').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('DIAGRAM P-M KOLOM BIAKSIAL (SNI 2847:2019)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Permukaan interaksi P-Mx-My (strain compat.)', dt));
    L.push('');
    L.push(' PENAMPANG & MATERIAL'); L.push(ruleR('-'));
    L.push(rowR('b x h / d\'', r.b + ' x ' + r.h + ' / ' + r.dp + ' mm'));
    L.push(rowR("f'c / fy", r.fc + ' / ' + r.fy + ' MPa'));
    L.push(rowR('Tulangan', r.nBars + 'D' + r.db + ' (nx=' + r.nx + ', ny=' + r.ny + ')'));
    L.push(rowR('Ast / rho_g', numR(r.Ast, 0) + ' mm2 / ' + numR(r.rho * 100, 2) + ' %'));
    L.push(rowR('beta1 / Pengikat', numR(r.beta1, 3) + ' / ' + (r.tie === 'spiral' ? 'spiral' : 'sengkang ikat')));
    L.push('');
    L.push(' TITIK KUNCI (NOMINAL)'); L.push(ruleR('='));
    L.push(rowR('Po tekan murni', numR(r.Po, 0) + ' kN'));
    L.push(rowR('Pn,maks = ' + numR(r.alphaMax, 2) + '*Po', numR(r.PnMax, 0) + ' kN'));
    L.push(rowR('Balanced-X (cb ' + numR(r.cBalX, 0) + ')', 'Mbx ' + numR(r.MbalX, 0) + ' kNm / Pb ' + numR(r.PbalX, 0) + ' kN'));
    L.push(rowR('Balanced-Y (cb ' + numR(r.cBalY, 0) + ')', 'Mby ' + numR(r.MbalY, 0) + ' kNm / Pb ' + numR(r.PbalY, 0) + ' kN'));
    L.push(rowR('Lentur murni M0x / M0y', numR(r.M0x, 0) + ' / ' + numR(r.M0y, 0) + ' kNm'));
    L.push(rowR('Tarik murni Pnt', numR(r.Pnt, 0) + ' kN'));
    L.push(rowR('phi tekan/tarik ; plafon', numR(r.phiC, 2) + ' / 0.90 ; ' + numR(r.phiPnMax, 0) + ' kN'));
    if (r.dc != null) {
      L.push('');
      L.push(' CEK TITIK BEBAN (iris P = Pu)'); L.push(ruleR('='));
      L.push(rowR('Pu / Mux / Muy', numR(r.Pu, 0) + ' kN / ' + numR(r.Mux, 1) + ' / ' + numR(r.Muy, 1) + ' kNm'));
      L.push(rowR('|Mu| resultan', numR(r.Mu, 1) + ' kNm'));
      if (r.capM) L.push(rowR('|phiMn| se-arah di P=Pu', numR(r.capM.m, 1) + ' kNm'));
      L.push(rowR('>> D/C = |Mu|/|phiMn|', numR(r.dc, 2) + (r.dc <= 1 ? ' OK' : ' NG')));
      L.push(ruleR('='));
    }
    if (r.contour && r.contour.length >= 8) {
      L.push('');
      L.push(' SAMPEL KONTUR KAPASITAS DI P=Pu (phiMnx ; phiMny kNm)');
      L.push(ruleR('-'));
      var stp = Math.max(1, Math.floor(r.contour.length / 12));
      for (var i = 0; i < r.contour.length; i += stp)
        L.push(rowR('  ' + numR(r.contour[i].Mx, 1), numR(r.contour[i].My, 1)));
    }

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Permukaan eksak sumbu netral miring (48 theta x 34 c), kontur');
    L.push(' beban di P=Pu (bukan Bresler). BELUM: kelangsingan, Ps. 18.');
    L.push(' Verifikasi oleh insinyur penanggung jawab.');
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
    var base = 'Kolom-PM-Biaksial_' + r.b + 'x' + r.h + '_' + r.nBars + 'D' + r.db + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Diagram P–M Kolom', category: 'Beton Bertulang', needsCanvas: false, needsRenderer: true },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, runtime: runtime };
      render(container);
    },

    unmount: function () {
      if (state.R) {
        state.R.stop();
        state.R.unmount();
      }
      if (state.controls) state.controls.dispose();
      if (state.themeObs) state.themeObs.disconnect();
      if (state.scene) state.UI.disposeObject(state.scene);
      state = {};
    }
  };
})();
