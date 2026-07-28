/* ============================================================
   Civil Tools — modules/footing-design/module.js  (Tier 3, Three.js / WebGL)
   DESAIN PONDASI TAPAK (SPREAD / ISOLATED FOOTING) — SNI 2847:2019 + SNI 8460
   Beban gabungan: aksial P + geser Hx,Hy + momen Mx,My (biaksial).

   ALUR:
   1. STABILITAS (beban layan):
      - N = P + berat tapak (Wf) + berat tanah timbunan (Ws)
      - Momen di dasar: MxB = Mx + Hy·tf ; MyB = My + Hx·tf
      - Eksentrisitas ex = MyB/N (arah L) ; ey = MxB/N (arah B)
      - Tekanan sudut q = N/A·(1 ± 6ex/L ± 6ey/B); cek kern ex/L+ey/B ≤ 1/6
      - SF daya dukung = qa/qmax ; SF guling = N·(dim/2)/M ; SF geser = μ·N/H
   2. STRUKTUR (beban ultimit, tekanan neto Pu/A tanpa berat sendiri):
      - Lentur kantilever muka kolom (2 arah) → tulangan, spasi kelipatan 25 mm
      - Geser satu-arah (balok) di d dari muka kolom
      - Geser dua-arah (pons) di keliling d/2 — min 3 rumus ACI 22.6.5
   3. VISUAL 3D: distribusi tegangan tanah di bawah tapak (bidang miring linear,
      warna biru→merah menurut besar tekanan) + tapak & kolom.

   Asumsi: tapak kaku, distribusi tegangan tanah linear (elastis), beban di
   dasar kolom, faktor beban ultimit rata-rata LF (default 1,5) untuk desain
   struktur. Tanpa gesekan pasif/kohesi pada cek geser (hanya μ·N). Verifikasi
   oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'footing-design';
  var THREE = window.THREE;
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  function beta1(fc) { return fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7); }
  function rhoTemp(fy) { return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014); }

  /* Desain tulangan tarik per meter lebar (b=1000) terhadap Mu (kN·m/m). */
  function designAsPerM(Mu, d, fc, fy) {
    var o = { Mu: Mu, As: 0, rho: 0, a: 0, c: 0, et: Infinity, tc: true, infeasible: false };
    var b = 1000, phi = 0.9;
    if (!(Mu > 0) || !(d > 0)) return o;
    var Rn = Mu * 1e6 / (phi * b * d * d);
    var disc = 1 - 2 * Rn / (0.85 * fc);
    if (disc < 0) { o.infeasible = true; disc = 0; }
    o.rho = (0.85 * fc / fy) * (1 - Math.sqrt(disc));
    o.As = o.rho * b * d;
    o.a = o.As * fy / (0.85 * fc * b);
    o.c = o.a / beta1(fc);
    o.et = o.c > 0 ? 0.003 * (d - o.c) / o.c : Infinity;
    o.tc = o.et >= 0.005;
    return o;
  }

  /* Lentur & geser kantilever satu arah. span, colDim, arm dalam meter;
     e eksentrisitas (m) searah span; quavg tekanan neto ultimit (kPa);
     dEff tinggi efektif (mm). Kembalikan Mu (kN·m/m) & Vu (kN/m) sisi menentukan. */
  function cantilever(span, colDim, e, quavg, dEff) {
    var arm = span / 2 - colDim / 2;
    function integ(sideSign, fromD) {
      var sFace = sideSign * (colDim / 2 + (fromD ? dEff / 1000 : 0));
      var sEnd = sideSign * span / 2;
      if (Math.abs(sFace) >= span / 2 - 1e-9) return { M: 0, V: 0 };
      var lo = Math.min(sFace, sEnd), hi = Math.max(sFace, sEnd), n = 60, ds = (hi - lo) / n, M = 0, V = 0;
      for (var i = 0; i < n; i++) {
        var s = lo + (i + 0.5) * ds;
        var q = quavg * (1 + 12 * e * s / (span * span)); if (q < 0) q = 0;
        var dist = Math.abs(s) - colDim / 2;
        M += q * dist * ds; V += q * ds;
      }
      return { M: M, V: V };
    }
    var pos = integ(1, false), neg = integ(-1, false);
    var govSign = pos.M >= neg.M ? 1 : -1;
    var Mu = Math.max(pos.M, neg.M);
    var Vu = integ(govSign, true).V;
    return { arm: arm, Mu: Mu, Vu: Vu };
  }

  /* ================= COMPUTE ================= */
  function compute(v) {
    var r = { warn: [], valid: false };
    var L = num(v.L), B = num(v.B), tf = num(v.tf) / 1000, Df = num(v.Df);
    var c1 = num(v.c1) / 1000, c2 = num(v.c2) / 1000;
    var P = num(v.P), Hx = num(v.Hx), Hy = num(v.Hy), Mx = num(v.Mx), My = num(v.My);
    var LF = num(v.LF) > 0 ? num(v.LF) : 1.5;
    var fc = num(v.fc), fy = num(v.fy);
    var gc = num(v.gc) > 0 ? num(v.gc) : 24, gs = num(v.gs) > 0 ? num(v.gs) : 18;
    var qa = num(v.qa), mu = num(v.mu);
    var cc = num(v.cc), db = num(v.db);
    if (!(L > 0) || !(B > 0) || !(tf > 0) || !(P > 0) || !(fc > 0) || !(fy > 0) || !(qa > 0)) return r;
    if (c1 >= L || c2 >= B) { r.warn.push('Kolom lebih besar dari tapak — periksa dimensi.'); }

    r.L = L; r.B = B; r.tf = tf; r.Df = Df; r.c1 = c1; r.c2 = c2;
    r.P = P; r.Hx = Hx; r.Hy = Hy; r.Mx = Mx; r.My = My; r.LF = LF;
    r.fc = fc; r.fy = fy; r.qa = qa; r.mu = mu; r.db = db; r.cc = cc; r.gc = gc; r.gs = gs;

    var A = L * B; r.A = A;
    r.Wf = gc * A * tf;
    r.Ws = gs * A * Math.max(0, Df - tf);
    var N = P + r.Wf + r.Ws; r.N = N;
    var MxB = Mx + Hy * tf, MyB = My + Hx * tf;
    r.MxB = MxB; r.MyB = MyB;
    var ex = MyB / N, ey = MxB / N;   // ex sepanjang L, ey sepanjang B
    r.ex = ex; r.ey = ey;
    r.qavgS = N / A;
    r.kern = Math.abs(ex) / L + Math.abs(ey) / B;
    r.uplift = r.kern > 1 / 6 + 1e-9;

    // tekanan sudut (± kombinasi) — layan
    r.qc = {
      pp: r.qavgS * (1 + 6 * ex / L + 6 * ey / B),
      pm: r.qavgS * (1 + 6 * ex / L - 6 * ey / B),
      mp: r.qavgS * (1 - 6 * ex / L + 6 * ey / B),
      mm: r.qavgS * (1 - 6 * ex / L - 6 * ey / B)
    };
    r.qmax = Math.max(r.qc.pp, r.qc.pm, r.qc.mp, r.qc.mm);
    r.qmin = Math.min(r.qc.pp, r.qc.pm, r.qc.mp, r.qc.mm);
    r.SFbear = qa / r.qmax;

    // guling & geser (layan)
    r.SFotX = MxB > 1e-9 ? N * (B / 2) / MxB : Infinity;
    r.SFotY = MyB > 1e-9 ? N * (L / 2) / MyB : Infinity;
    r.SFot = Math.min(r.SFotX, r.SFotY);
    r.Hres = Math.hypot(Hx, Hy);
    r.SFslide = r.Hres > 1e-9 ? (mu * N) / r.Hres : Infinity;

    if (r.uplift) r.warn.push('Terjadi angkat (uplift): ex/L + ey/B = ' + r.kern.toFixed(3) +
      ' > 1/6 — sebagian tapak tidak menekan tanah; rumus tekanan linear tak berlaku, perbesar tapak atau kurangi eksentrisitas.');
    if (r.qmax > qa) r.warn.push('qmax = ' + r.qmax.toFixed(1) + ' kPa > qa = ' + qa.toFixed(1) + ' kPa — daya dukung terlampaui.');
    if (r.SFot < 1.5 && isFinite(r.SFot)) r.warn.push('SF guling = ' + r.SFot.toFixed(2) + ' < 1,5.');
    if (r.SFslide < 1.5 && isFinite(r.SFslide)) r.warn.push('SF geser = ' + r.SFslide.toFixed(2) + ' < 1,5.');

    /* ---------- STRUKTUR (ultimit) ---------- */
    var Pu = LF * P, quavg = Pu / A;
    r.Pu = Pu; r.quavg = quavg;
    var h = tf * 1000;
    var dx = h - cc - db / 2;          // arah L (lapis bawah)
    var dy = h - cc - 1.5 * db;        // arah B (di atas lapis L)
    r.dx = dx; r.dy = dy;

    if (dx > 0 && dy > 0) {
      // lentur + tulangan tiap arah
      r.flexL = designDir(cantilever(L, c1, ex, quavg, dx), dx, fc, fy, db, h);   // tulangan // L
      r.flexB = designDir(cantilever(B, c2, ey, quavg, dy), dy, fc, fy, db, h);   // tulangan // B

      // geser satu-arah (φVc per meter)
      var phi = 0.75;
      r.phiVc1L = phi * 0.17 * Math.sqrt(fc) * 1000 * dx / 1000;   // kN/m
      r.phiVc1B = phi * 0.17 * Math.sqrt(fc) * 1000 * dy / 1000;
      r.dc1L = r.flexL.Vu / r.phiVc1L;
      r.dc1B = r.flexB.Vu / r.phiVc1B;

      // geser dua-arah (pons)
      var davg = (dx + dy) / 2;
      var b0 = 2 * (c1 * 1000 + davg) + 2 * (c2 * 1000 + davg);   // mm
      var Ain = (c1 * 1000 + davg) * (c2 * 1000 + davg) / 1e6;    // m²
      r.b0 = b0; r.Ain = Ain; r.davg = davg;
      r.Vup = Pu - quavg * Ain;                                   // kN
      var betaC = Math.max(c1, c2) / Math.max(1e-9, Math.min(c1, c2));
      var vc1 = 0.33 * Math.sqrt(fc);
      var vc2 = 0.17 * (1 + 2 / betaC) * Math.sqrt(fc);
      var vc3 = 0.083 * (40 * davg / b0 + 2) * Math.sqrt(fc);
      r.vcPunch = Math.min(vc1, vc2, vc3);
      r.vcGov = (r.vcPunch === vc1) ? 'dasar 0,33√f\'c' : (r.vcPunch === vc2) ? '(1+2/βc)' : '(αs·d/b0+2)';
      r.Vcp = r.vcPunch * b0 * davg / 1000;                       // kN
      r.phiVcp = phi * r.Vcp;
      r.dcPunch = r.Vup / r.phiVcp;
      r.betaC = betaC;
      r.desOk = true;
    } else {
      r.warn.push('Tinggi efektif ≤ 0 — pertebal tapak atau kurangi selimut/diameter.');
    }

    r.valid = true;
    return r;
  }

  function designDir(cant, dEff, fc, fy, db, h) {
    var o = { arm: cant.arm, Mu: cant.Mu, Vu: cant.Vu };
    var a = designAsPerM(cant.Mu, dEff, fc, fy);
    o.et = a.et; o.tc = a.tc; o.infeasible = a.infeasible; o.AsFlex = a.As;
    o.AsMin = rhoTemp(fy) * 1000 * h;               // susut-suhu pada penampang bruto
    o.AsReq = Math.max(a.As, o.AsMin);
    o.govMin = o.AsReq > a.As + 1e-6;
    var Ab = Math.PI / 4 * db * db;
    var sTeo = 1000 * Ab / o.AsReq;
    var s = Math.floor(sTeo / 25) * 25;
    var sMax = Math.floor(Math.min(3 * h, 450) / 25) * 25;
    o.spacingCap = sTeo > Math.min(3 * h, 450);
    if (s > sMax) s = sMax;
    if (s < 50) s = 50;
    o.s = s; o.sMax = Math.min(3 * h, 450);
    o.AsProv = 1000 * Ab / s;
    o.db = db;
    return o;
  }

  /* ================= 3D SCENE ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function colHex(name, fb) { var c = css(name); return c ? new THREE.Color(c) : new THREE.Color(fb); }

  // peta warna tekanan: t 0..1 → biru → cyan → hijau → kuning → merah
  function pColor(t) {
    t = Math.max(0, Math.min(1, t));
    var stops = [[0.20, 0.45, 0.95], [0.15, 0.80, 0.85], [0.45, 0.80, 0.30], [0.95, 0.80, 0.20], [0.90, 0.25, 0.20]];
    var x = t * (stops.length - 1), i = Math.floor(x), f = x - i;
    if (i >= stops.length - 1) return new THREE.Color(stops[stops.length - 1][0], stops[stops.length - 1][1], stops[stops.length - 1][2]);
    var a = stops[i], b = stops[i + 1];
    return new THREE.Color(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }

  function buildScene() {
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(45, 1, 0.02, 500);
    cam.position.set(4, 3, 5);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    var dir = new THREE.DirectionalLight(0xffffff, 0.55); dir.position.set(5, 9, 6); scene.add(dir);
    var dir2 = new THREE.DirectionalLight(0xffffff, 0.2); dir2.position.set(-5, 3, -4); scene.add(dir2);
    var group = new THREE.Group(); scene.add(group);
    state.scene = scene; state.cam = cam; state.contentGroup = group;
    return { scene: scene, cam: cam, group: group };
  }

  function rebuild(r) {
    var g = state.contentGroup;
    if (!g) return;
    state.UI.disposeObject(g);
    while (g.children.length) g.remove(g.children[0]);
    if (!r || !r.valid) return;

    var L = r.L, B = r.B, tf = r.tf, c1 = r.c1, c2 = r.c2;
    var maxDim = Math.max(L, B);
    var qmaxAbs = Math.max(r.qmax, 1e-6);
    var sP = 0.55 * maxDim / qmaxAbs;         // skala tekanan → kedalaman
    state.fitRadius = maxDim * 2.4;

    function qAt(x, y) {   // x∈[-L/2,L/2], y∈[-B/2,B/2]
      var q = r.qavgS * (1 + 12 * r.ex * x / (L * L) + 12 * r.ey * y / (B * B));
      return q < 0 ? 0 : q;
    }

    /* --- distribusi tegangan: permukaan bawah (grid vertex-warna) --- */
    var Ndiv = 16;
    var verts = [], cols = [], idx = [];
    for (var i = 0; i <= Ndiv; i++) {
      for (var j = 0; j <= Ndiv; j++) {
        var x = -L / 2 + L * i / Ndiv, y = -B / 2 + B * j / Ndiv;
        var q = qAt(x, y);
        verts.push(x, -q * sP, y);
        var col = pColor(q / qmaxAbs);
        cols.push(col.r, col.g, col.b);
      }
    }
    for (i = 0; i < Ndiv; i++) for (j = 0; j < Ndiv; j++) {
      var a = i * (Ndiv + 1) + j, b = (i + 1) * (Ndiv + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

    /* --- dinding sisi (agar terlihat solid) di 4 tepi --- */
    function wall(fixed, axis) {
      // axis 'x' → tepi pada y=±B/2 ; 'y' → tepi pada x=±L/2
      var wv = [], wc = [], wi = [];
      for (var k = 0; k <= Ndiv; k++) {
        var x, y;
        if (axis === 'x') { x = -L / 2 + L * k / Ndiv; y = fixed; }
        else { y = -B / 2 + B * k / Ndiv; x = fixed; }
        var q = qAt(x, y);
        wv.push(x, 0, y); wv.push(x, -q * sP, y);
        var col = pColor(q / qmaxAbs);
        wc.push(col.r, col.g, col.b); wc.push(col.r, col.g, col.b);
      }
      for (k = 0; k < Ndiv; k++) {
        var t0 = k * 2, t1 = k * 2 + 2;
        wi.push(t0, t0 + 1, t1, t0 + 1, t1 + 1, t1);
      }
      var wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wv), 3));
      wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wc), 3));
      wg.setIndex(wi);
      g.add(new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
    wall(-B / 2, 'x'); wall(B / 2, 'x'); wall(-L / 2, 'y'); wall(L / 2, 'y');

    /* --- tapak beton (kotak transparan) --- */
    var cConc = colHex('--ink-dim', '#9fb08a');
    var foot = new THREE.Mesh(new THREE.BoxGeometry(L, tf, B),
      new THREE.MeshStandardMaterial({ color: cConc, transparent: true, opacity: 0.35, roughness: 0.9, metalness: 0 }));
    foot.position.y = tf / 2; g.add(foot);
    var footEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, tf, B)),
      new THREE.LineBasicMaterial({ color: colHex('--ink', '#e8ecdf').getHex() }));
    footEdge.position.y = tf / 2; g.add(footEdge);

    /* --- kolom --- */
    var colH = Math.max(0.35 * maxDim, 0.4);
    var colM = new THREE.Mesh(new THREE.BoxGeometry(c1, colH, c2),
      new THREE.MeshStandardMaterial({ color: colHex('--amber', '#f28f3b'), transparent: true, opacity: 0.55, roughness: 0.7 }));
    colM.position.y = tf + colH / 2; g.add(colM);

    /* --- panah beban aksial di atas kolom --- */
    var cAmber = colHex('--amber', '#f28f3b');
    g.add(new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, tf + colH + 0.5 * maxDim * 0.5, 0), 0.5 * maxDim * 0.5, cAmber.getHex(),
      0.12 * maxDim, 0.06 * maxDim));

    /* --- garis grid pada permukaan tekanan (tiap 4) --- */
    var lineMat = new THREE.LineBasicMaterial({ color: colHex('--line', '#2b3123').getHex(), transparent: true, opacity: 0.5 });
    for (i = 0; i <= Ndiv; i += 4) {
      var p1 = [], p2 = [];
      for (j = 0; j <= Ndiv; j++) {
        var xx = -L / 2 + L * i / Ndiv, yy = -B / 2 + B * j / Ndiv;
        p1.push(new THREE.Vector3(xx, -qAt(xx, yy) * sP, yy));
        var xx2 = -L / 2 + L * j / Ndiv, yy2 = -B / 2 + B * i / Ndiv;
        p2.push(new THREE.Vector3(xx2, -qAt(xx2, yy2) * sP, yy2));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p1), lineMat));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p2), lineMat));
    }
  }

  /* ================= 2D: DENAH + POTONGAN (fallback + toggle) ================= */
  function cdimH(ctx, x1, x2, y, label, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    [x1, x2].forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke(); });
    ctx.fillStyle = col; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, (x1 + x2) / 2, y - 4);
  }
  function cdimV(ctx, y1, y2, x, label, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    [y1, y2].forEach(function (y) { ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.stroke(); });
    ctx.save(); ctx.translate(x - 4, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = col; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, 0, 0); ctx.restore();
  }

  function drawPlan(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint'); ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('Lengkapi input untuk melihat denah & potongan.', w / 2, h / 2); return;
    }
    var half = w / 2;
    drawDenahRegion(ctx, 0, 0, half, h, r);
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(half, 16); ctx.lineTo(half, h - 16); ctx.stroke();
    drawSectionRegion(ctx, half, 0, half, h, r);
  }

  function drawDenahRegion(ctx, rx, ry, rw, rh, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint'), amber = css('--amber'), sky = css('--sky') || '#30bced';
    ctx.fillStyle = faint; ctx.font = '11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DENAH (tampak atas)', rx + rw / 2, ry + 16);
    var pad = 40;
    var sc = Math.min((rw - 2 * pad) / r.L, (rh - 2 * pad - 20) / r.B);
    var cx = rx + rw / 2, cy = ry + 20 + (rh - 20) / 2;
    var Lp = r.L * sc, Bp = r.B * sc;
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(cx - Lp / 2, cy - Bp / 2, Lp, Bp);
    var c1p = r.c1 * sc, c2p = r.c2 * sc;
    ctx.fillStyle = 'rgba(242,143,59,0.25)'; ctx.strokeStyle = amber; ctx.lineWidth = 1.5;
    ctx.fillRect(cx - c1p / 2, cy - c2p / 2, c1p, c2p); ctx.strokeRect(cx - c1p / 2, cy - c2p / 2, c1p, c2p);
    if (r.davg) {
      var pw = (r.c1 + r.davg / 1000) * sc, ph = (r.c2 + r.davg / 1000) * sc;
      ctx.strokeStyle = sky; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph); ctx.setLineDash([]);
    }
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    if (r.flexL) ctx.fillText('∥L D' + r.db + '-' + r.flexL.s, cx, cy - Bp / 2 - 8);
    if (r.flexB) { ctx.save(); ctx.translate(cx - Lp / 2 - 10, cy); ctx.rotate(-Math.PI / 2); ctx.fillText('∥B D' + r.db + '-' + r.flexB.s, 0, 0); ctx.restore(); }
    // dimensi L & B
    cdimH(ctx, cx - Lp / 2, cx + Lp / 2, cy + Bp / 2 + 16, 'L ' + r.L.toFixed(2) + 'm', dim);
    cdimV(ctx, cy - Bp / 2, cy + Bp / 2, cx + Lp / 2 + 14, 'B ' + r.B.toFixed(2) + 'm', dim);
    // tekanan sudut
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = amber;
    [['pp', 1, -1], ['mp', -1, -1], ['pm', 1, 1], ['mm', -1, 1]].forEach(function (co) {
      var x = cx + co[1] * Lp / 2, y = cy + co[2] * Bp / 2;
      ctx.textAlign = co[1] > 0 ? 'right' : 'left';
      ctx.fillText(r.qc[co[0]].toFixed(0), x + co[1] * -3, y + co[2] * 11);
    });
    ctx.fillStyle = faint; ctx.textAlign = 'center';
    ctx.fillText('q sudut kPa · qmax ' + r.qmax.toFixed(0) + '/qmin ' + r.qmin.toFixed(0), rx + rw / 2, ry + rh - 8);
  }

  function drawSectionRegion(ctx, rx, ry, rw, rh, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint'), amber = css('--amber'), sky = css('--sky') || '#30bced';
    ctx.fillStyle = faint; ctx.font = '11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POTONGAN', rx + rw / 2, ry + 16);
    var pad = 42;
    var L = r.L, tf = r.tf, Df = r.Df, c1 = r.c1;
    var stubH = Math.max(0.3, 0.22 * Df);         // kolom di atas tanah (ilustrasi)
    var totH = Df + stubH;
    var sc = Math.min((rw - 2 * pad) / L, (rh - 2 * pad - 26) / totH);
    var cx = rx + rw / 2;
    var topY = ry + 30;                            // puncak kolom
    var groundY = topY + stubH * sc;
    var baseY = groundY + Df * sc;
    var footTopY = baseY - tf * sc;
    var Lp = L * sc, c1p = c1 * sc;

    // tanah + muka tanah
    ctx.fillStyle = 'rgba(150,140,90,0.07)';
    ctx.fillRect(rx + pad - 10, groundY, rw - 2 * pad + 20, baseY - groundY + 6);
    ctx.strokeStyle = dim; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(rx + pad - 12, groundY); ctx.lineTo(rx + rw - pad + 12, groundY); ctx.stroke();
    for (var gx = rx + pad - 6; gx < rx + rw - pad + 12; gx += 12) {
      ctx.strokeStyle = faint; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(gx, groundY); ctx.lineTo(gx - 5, groundY - 5); ctx.stroke();
    }
    // tapak
    ctx.fillStyle = 'rgba(160,175,140,0.30)'; ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    ctx.fillRect(cx - Lp / 2, footTopY, Lp, tf * sc); ctx.strokeRect(cx - Lp / 2, footTopY, Lp, tf * sc);
    // kolom
    ctx.fillStyle = 'rgba(242,143,59,0.30)'; ctx.strokeStyle = amber; ctx.lineWidth = 1.4;
    ctx.fillRect(cx - c1p / 2, topY, c1p, footTopY - topY); ctx.strokeRect(cx - c1p / 2, topY, c1p, footTopY - topY);

    // tekanan tanah (panah ke atas di bawah tapak) — trapesium sepanjang L
    var qLm = (r.qc.mp + r.qc.mm) / 2, qRm = (r.qc.pp + r.qc.pm) / 2;
    var qref = Math.max(r.qmax, 1e-6), aMax = 20;
    ctx.strokeStyle = sky; ctx.fillStyle = sky; ctx.lineWidth = 1;
    var naArr = 7;
    for (var k = 0; k <= naArr; k++) {
      var fx = k / naArr, x = cx - Lp / 2 + Lp * fx;
      var q = qLm + (qRm - qLm) * fx; if (q < 0) q = 0;
      var alen = 6 + aMax * q / qref;
      ctx.beginPath(); ctx.moveTo(x, baseY + 6 + alen); ctx.lineTo(x, baseY + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 2.5, baseY + 6 + 4); ctx.lineTo(x, baseY + 6); ctx.lineTo(x + 2.5, baseY + 6 + 4); ctx.stroke();
    }
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = sky; ctx.textAlign = 'center';
    ctx.fillText('tegangan tanah', cx, baseY + 6 + aMax + 18);

    // dimensi
    cdimV(ctx, groundY, baseY, cx - Lp / 2 - 16, 'Df ' + Df.toFixed(2) + 'm', dim);
    cdimV(ctx, footTopY, baseY, cx + Lp / 2 + 16, 'tf ' + (tf * 1000).toFixed(0), dim);
    cdimH(ctx, cx - Lp / 2, cx + Lp / 2, footTopY - 8, 'L ' + L.toFixed(2) + 'm', dim);
    cdimH(ctx, cx - c1p / 2, cx + c1p / 2, topY - 6, 'c1 ' + (c1 * 1000).toFixed(0), amber);
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('fd-style')) return;
    var s = document.createElement('style'); s.id = 'fd-style';
    s.textContent =
      '.fd-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.fd-view{position:relative;flex:1 1 54%;min-height:280px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.fd-res{flex:1 1 46%;overflow-y:auto;padding:18px 24px 34px}' +
      '.fd-viewseg{position:absolute;right:12px;top:10px;display:flex;gap:0;z-index:4;border:1px solid var(--line);border-radius:8px;overflow:hidden}' +
      '.fd-viewseg button{background:var(--panel);color:var(--ink-dim);border:0;padding:5px 12px;font:600 12px "Space Grotesk",sans-serif;cursor:pointer}' +
      '.fd-viewseg button.active{background:var(--amber);color:var(--bg)}' +
      '.fd-fit{position:absolute;left:12px;bottom:12px;z-index:4;background:var(--panel);border:1px solid var(--line);color:var(--ink-dim);' +
        'padding:5px 10px;border-radius:8px;font:600 12px "Space Grotesk",sans-serif;cursor:pointer}' +
      '.fd-sec{position:absolute;inset:0;display:none}' +
      '.fd-legend{position:absolute;left:12px;top:10px;z-index:4;font:600 10px "JetBrains Mono",monospace;color:var(--ink-dim);' +
        'background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 9px;line-height:1.5}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');
    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Desain Pondasi Tapak'));
    panel.appendChild(UI.el('div', 'sub', 'Stabilitas (guling, geser, daya dukung) + penulangan lentur & geser pons — SNI 2847:2019, dengan distribusi tegangan tanah 3D.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'fd-work');
    var view = UI.el('div', 'fd-view');
    state.cap = UI.canvasCap(view, 'Distribusi tegangan tanah');
    var results = UI.el('div', 'fd-res');
    work.appendChild(view); work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);
    state.view = view; state.results = results;

    var legend = UI.el('div', 'fd-legend', 'Tegangan tanah<br>■ rendah → ■ tinggi');
    legend.querySelectorAll ? null : null;
    legend.innerHTML = 'Tegangan tanah<br><span style="color:#3573f2">■</span> rendah → <span style="color:#e64033">■</span> tinggi';
    view.appendChild(legend);

    var schema = [
      { type: 'group', label: 'Beban layan (di dasar kolom)' },
      { type: 'number', id: 'P', label: 'P — aksial vertikal', unit: 'kN', value: 900, min: 1, step: 10 },
      { type: 'number', id: 'Mx', label: 'Mx — momen thd sumbu-x', unit: 'kN·m', value: 60, min: 0, step: 5 },
      { type: 'number', id: 'My', label: 'My — momen thd sumbu-y', unit: 'kN·m', value: 40, min: 0, step: 5 },
      { type: 'number', id: 'Hx', label: 'Hx — geser arah x', unit: 'kN', value: 30, min: 0, step: 5 },
      { type: 'number', id: 'Hy', label: 'Hy — geser arah y', unit: 'kN', value: 20, min: 0, step: 5 },
      { type: 'number', id: 'LF', label: 'Faktor beban ultimit rata-rata', unit: '', value: 1.5, min: 1, step: 0.05, hint: 'Pu = LF·P untuk desain struktur (mis. 1,5 ≈ 1,2D+1,6L campuran).' },

      { type: 'group', label: 'Geometri tapak & kolom' },
      { type: 'number', id: 'L', label: 'L — panjang tapak (arah x)', unit: 'm', value: 2.5, min: 0.5, step: 0.1 },
      { type: 'number', id: 'B', label: 'B — lebar tapak (arah y)', unit: 'm', value: 2.5, min: 0.5, step: 0.1 },
      { type: 'number', id: 'tf', label: 'tf — tebal tapak', unit: 'mm', value: 500, min: 150, step: 25 },
      { type: 'number', id: 'Df', label: 'Df — kedalaman dasar tapak', unit: 'm', value: 1.5, min: 0.2, step: 0.1 },
      { type: 'number', id: 'c1', label: 'c1 — kolom arah x', unit: 'mm', value: 400, min: 100, step: 25 },
      { type: 'number', id: 'c2', label: 'c2 — kolom arah y', unit: 'mm', value: 400, min: 100, step: 25 },

      { type: 'group', label: 'Material & tanah' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tulangan', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'qa', label: 'qa — daya dukung izin tanah', unit: 'kPa', value: 200, min: 20, step: 10 },
      { type: 'number', id: 'mu', label: 'μ — koef. gesek dasar', unit: '', value: 0.5, min: 0.1, step: 0.05 },
      { type: 'number', id: 'gc', label: 'γc — berat beton', unit: 'kN/m³', value: 24, min: 20, step: 1 },
      { type: 'number', id: 'gs', label: 'γs — berat tanah timbunan', unit: 'kN/m³', value: 18, min: 12, step: 1 },

      { type: 'group', label: 'Tulangan' },
      { type: 'number', id: 'cc', label: 'Selimut bersih', unit: 'mm', value: 75, min: 40, step: 5 },
      { type: 'select', id: 'db', label: 'Ø tulangan lentur', value: 16, options: [13, 16, 19, 22, 25].map(function (d) { return { value: d, label: 'D' + d }; }) }
    ];

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

    // 2D denah (fallback + toggle)
    var secDiv = UI.el('div', 'fd-sec');
    view.appendChild(secDiv);
    state.sec = window.CivilCanvas2D ? window.CivilCanvas2D.create(secDiv, drawPlan) : null;

    var seg = UI.el('div', 'fd-viewseg');
    var b3 = UI.el('button', 'active', '3D Tegangan'); var bd = UI.el('button', null, 'Denah');
    b3.type = 'button'; bd.type = 'button';
    var fit = UI.el('button', 'fd-fit', '⟲ Reset tampilan');
    function setMode(m) {
      state.viewMode = m;
      b3.classList.toggle('active', m === '3d'); bd.classList.toggle('active', m === 'sec');
      secDiv.style.display = m === 'sec' ? 'block' : 'none';
      fit.style.display = m === 'sec' ? 'none' : '';
      legend.style.display = m === 'sec' ? 'none' : '';
      // Sembunyikan kanvas WebGL bersama saat mode denah — kanvas 2D transparan,
      // tanpa ini frame 3D terakhir (freeze) tembus di latar.
      if (state.R && state.R.canvas) state.R.canvas.style.display = (m === 'sec') ? 'none' : 'block';
      if (state.R && state.loopFn) { if (m === 'sec') state.R.stop(); else state.R.start(state.loopFn); }
      if (m === 'sec' && state.sec) state.sec.resize();
    }
    b3.addEventListener('click', function () { setMode('3d'); });
    bd.addEventListener('click', function () { setMode('sec'); });
    fit.addEventListener('click', function () { if (state.controls && state.fitRadius) state.controls.setView([0, 0, 0], state.fitRadius); });
    seg.appendChild(b3); seg.appendChild(bd);
    view.appendChild(seg); view.appendChild(fit);

    var R = state.runtime.getRenderer ? state.runtime.getRenderer() : null;
    if (!R) {
      legend.style.display = 'none'; b3.style.display = 'none';
      setMode('sec');
    } else {
      state.R = R;
      var sc = buildScene();
      R.mount(view);
      R.onResize = function (w, h) { sc.cam.aspect = w / Math.max(1, h); sc.cam.updateProjectionMatrix(); };
      state.controls = state.runtime.orbit.create(sc.cam, R.canvas, { target: [0, -0.5, 0], minDistance: 0.8, maxDistance: 60, damping: 0.12 });
      state.themeObs = new MutationObserver(function () { rebuild(state.result); });
      state.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      state.loopFn = function () { if (state.controls) state.controls.update(); R.renderer.render(sc.scene, sc.cam); };
      R.start(state.loopFn);
      state.viewMode = '3d';
    }

    update(form.getValues(), results);
  }

  function sfState(sf, thr) { return !isFinite(sf) ? 'ok' : (sf >= thr ? 'ok' : 'bad'); }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';
    if (!r.valid) {
      state.cap.set('Distribusi tegangan tanah');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri, beban, dan material untuk menghitung.'));
      rebuild(r); if (state.sec) state.sec.redraw();
      return;
    }
    state.cap.set('qmax ' + UI.fmt(r.qmax, 0) + ' kPa · SF dd ' + UI.fmt(r.SFbear, 2) +
      (r.dcPunch != null ? ' · pons D/C ' + UI.fmt(r.dcPunch, 2) : ''));

    results.appendChild(UI.heroRow([
      { label: 'qmax tanah', value: UI.fmt(r.qmax, 0), unit: 'kPa', tone: r.qmax <= r.qa ? 'ok' : 'bad' },
      { label: 'SF daya dukung', value: UI.fmt(r.SFbear, 2), unit: r.SFbear >= 1 ? 'OK' : 'NG', tone: r.SFbear >= 1 ? 'ok' : 'bad' },
      { label: 'qmin tanah', value: UI.fmt(r.qmin, 0), unit: 'kPa', tone: r.qmin >= 0 ? 'ok' : 'bad' }
    ]));

    results.appendChild(UI.rhead('Stabilitas (beban layan)'));
    results.appendChild(UI.kv('Berat tapak Wf / tanah Ws', UI.fmt(r.Wf, 0) + ' / ' + UI.fmt(r.Ws, 0) + ' kN'));
    results.appendChild(UI.kv('N total di dasar', UI.fmt(r.N, 0) + ' kN'));
    results.appendChild(UI.kv('Eksentrisitas ex / ey', UI.fmt(r.ex, 3) + ' / ' + UI.fmt(r.ey, 3) + ' m'));
    results.appendChild(UI.kv('Kern ex/L + ey/B ≤ 1/6', UI.fmt(r.kern, 3) + ' ≤ 0,167', r.uplift ? 'bad' : 'ok'));
    results.appendChild(UI.kv('qmax / qa', UI.fmt(r.qmax, 1) + ' / ' + UI.fmt(r.qa, 0) + ' kPa', r.qmax <= r.qa ? 'ok' : 'bad'));
    results.appendChild(UI.kv('SF guling (min 1,5)', isFinite(r.SFot) ? UI.fmt(r.SFot, 2) : '∞', sfState(r.SFot, 1.5)));
    results.appendChild(UI.kv('SF geser dasar (min 1,5)', isFinite(r.SFslide) ? UI.fmt(r.SFslide, 2) : '∞', sfState(r.SFslide, 1.5)));

    if (r.desOk) {
      results.appendChild(UI.rhead('Penulangan lentur (φ=0,90) — tekanan neto qu ' + UI.fmt(r.quavg, 0) + ' kPa'));
      [['Arah L (// panjang)', r.flexL, r.dx], ['Arah B (// lebar)', r.flexB, r.dy]].forEach(function (a) {
        var f = a[1];
        var tone = f.infeasible ? 'bad' : (f.tc ? 'ok' : '');
        results.appendChild(UI.kv(a[0] + ' — d ' + UI.fmt(a[2], 0) + ' mm · Mu ' + UI.fmt(f.Mu, 1) + ' kN·m/m',
          'D' + r.db + '-' + f.s + ' · As ' + UI.fmt(f.AsReq, 0) + ' mm²/m' + (f.govMin ? ' (As,min)' : ''), tone));
      });
      results.appendChild(UI.kv('As,min susut-suhu / spasi maks', UI.fmt(r.flexL.AsMin, 0) + ' mm²/m · ' + UI.fmt(r.flexL.sMax, 0) + ' mm'));

      results.appendChild(UI.rhead('Geser satu-arah (φ=0,75, di d dari muka)'));
      results.appendChild(UI.kv('Arah L: Vu / φVc', UI.fmt(r.flexL.Vu, 1) + ' / ' + UI.fmt(r.phiVc1L, 1) + ' kN/m — D/C ' + UI.fmt(r.dc1L, 2), r.dc1L <= 1 ? 'ok' : 'bad'));
      results.appendChild(UI.kv('Arah B: Vu / φVc', UI.fmt(r.flexB.Vu, 1) + ' / ' + UI.fmt(r.phiVc1B, 1) + ' kN/m — D/C ' + UI.fmt(r.dc1B, 2), r.dc1B <= 1 ? 'ok' : 'bad'));

      results.appendChild(UI.rhead('Geser dua-arah / pons (φ=0,75)'));
      results.appendChild(UI.kv('Keliling kritis b0 (d/2)', UI.fmt(r.b0, 0) + ' mm · d rata2 ' + UI.fmt(r.davg, 0) + ' mm'));
      results.appendChild(UI.kv('Vu pons = Pu − qu·Ain', UI.fmt(r.Vup, 0) + ' kN'));
      results.appendChild(UI.kv('vc menentukan ' + r.vcGov, UI.fmt(r.vcPunch, 2) + ' MPa'));
      results.appendChild(UI.kv('Vu / φVc pons — D/C', UI.fmt(r.Vup, 0) + ' / ' + UI.fmt(r.phiVcp, 0) + ' kN · ' + UI.fmt(r.dcPunch, 2), r.dcPunch <= 1 ? 'ok' : 'bad'));
    }

    if (r.warn.length) results.appendChild(UI.note('Peringatan',
      '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    results.appendChild(UI.note('Metode & asumsi',
      'Tapak kaku, tegangan tanah linear elastis; beban di dasar kolom, momen dasar menambah H·tf. Stabilitas memakai beban layan; ' +
      'struktur memakai tekanan neto ultimit qu = Pu/A (LF·P) tanpa berat sendiri. Geser pons memakai min tiga rumus SNI 2847:2019 Ps. 22.6.5. ' +
      'Spasi tulangan dibulatkan ke kelipatan 25 mm ≤ min(3h; 450). Cek geser dasar hanya gesekan μ·N (tanpa tanah pasif). Verifikasi oleh insinyur penanggung jawab.'));

    rebuild(r);
    if (state.sec) state.sec.redraw();
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.6.0';
  var RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', vv = ' ' + value;
    var d = RW - l.length - vv.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + vv;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }

  // Gbr. 1 — denah tapak + kolom + nilai tekanan sudut
  function figPlan(r) {
    var ops = [];
    var x0 = 150, y0 = 30, maxW = 210;
    var sc = Math.min(maxW / r.L, 150 / r.B);
    var Lp = r.L * sc, Bp = r.B * sc;
    var cxp = x0 + Lp / 2, cyp = y0 + Bp / 2;
    ops.push({ t: 'rect', x: x0, y: y0, w: Lp, h: Bp, lw: 1.2 });
    var c1p = r.c1 * sc, c2p = r.c2 * sc;
    ops.push({ t: 'rect', x: cxp - c1p / 2, y: cyp - c2p / 2, w: c1p, h: c2p, lw: 1, g: 0.3 });
    if (r.davg) {
      var pw = (r.c1 + r.davg / 1000) * sc, ph = (r.c2 + r.davg / 1000) * sc;
      ops.push({ t: 'rect', x: cxp - pw / 2, y: cyp - ph / 2, w: pw, h: ph, lw: 0.7, g: 0.4, dash: [3, 2] });
    }
    ops.push({ t: 'text', x: x0 - 4, y: y0 - 3, s: numR(r.qc.mp, 0), size: 6.5, align: 'r' });
    ops.push({ t: 'text', x: x0 + Lp + 4, y: y0 - 3, s: numR(r.qc.pp, 0), size: 6.5 });
    ops.push({ t: 'text', x: x0 - 4, y: y0 + Bp + 8, s: numR(r.qc.mm, 0), size: 6.5, align: 'r' });
    ops.push({ t: 'text', x: x0 + Lp + 4, y: y0 + Bp + 8, s: numR(r.qc.pm, 0), size: 6.5 });
    ops.push({ t: 'text', x: cxp, y: y0 + Bp + 22, s: 'Gbr. 1  Denah tapak ' + numR(r.L, 2) + ' x ' + numR(r.B, 2) + ' m - tekanan sudut (kPa), qmax ' + numR(r.qmax, 0), size: 7, align: 'c' });
    return { fig: { h: Math.ceil((Bp + 40) / 11.5), ops: ops, alt: 'Gbr. 1 Denah tapak - lihat versi PDF' } };
  }

  // Gbr. 2 — potongan tapak: dimensi L, tf, Df, kolom + tegangan tanah
  function figSection(r) {
    var F = window.CivilReport.fig, ops = [];
    var stubH = Math.max(0.3, 0.22 * r.Df), totH = r.Df + stubH;
    var sc = Math.min(240 / r.L, 92 / totH);
    var Lp = r.L * sc, c1p = r.c1 * sc, tfp = r.tf * sc;
    var x0 = (528 - Lp) / 2, cxp = x0 + Lp / 2;
    var topY = 8, groundY = topY + stubH * sc, baseY = groundY + r.Df * sc, footTopY = baseY - tfp;
    // muka tanah + arsir
    ops.push({ t: 'line', x1: x0 - 26, y1: groundY, x2: x0 + Lp + 26, y2: groundY, lw: 1 });
    for (var gx = x0 - 20; gx < x0 + Lp + 26; gx += 10) ops.push({ t: 'line', x1: gx, y1: groundY, x2: gx - 4, y2: groundY - 4, lw: 0.4, g: 0.5 });
    // tapak + kolom
    ops.push({ t: 'rect', x: x0, y: footTopY, w: Lp, h: tfp, lw: 1.2 });
    ops.push({ t: 'rect', x: cxp - c1p / 2, y: topY, w: c1p, h: footTopY - topY, lw: 0.9, g: 0.3 });
    // tegangan tanah (panah ke atas, trapesium)
    var qLm = (r.qc.mp + r.qc.mm) / 2, qRm = (r.qc.pp + r.qc.pm) / 2, qref = Math.max(r.qmax, 1e-6);
    for (var k = 0; k <= 7; k++) {
      var fx = k / 7, x = x0 + Lp * fx, q = Math.max(0, qLm + (qRm - qLm) * fx);
      var alen = 5 + 16 * q / qref;
      F.arrow(ops, x, baseY + 5 + alen, x, baseY + 5, { lw: 0.5, g: 0.35 });
    }
    // dimensi
    F.dimV(ops, groundY, baseY, x0 - 14, 'Df ' + numR(r.Df, 2) + 'm');
    F.dimV(ops, footTopY, baseY, x0 + Lp + 14, 'tf ' + numR(r.tf * 1000, 0));
    F.dimH(ops, x0, x0 + Lp, baseY + 5 + 22, 'L ' + numR(r.L, 2) + 'm');
    F.dimH(ops, cxp - c1p / 2, cxp + c1p / 2, topY - 3, 'c1 ' + numR(r.c1 * 1000, 0));
    ops.push({ t: 'text', x: 264, y: baseY + 5 + 40, s: 'Gbr. 2  Potongan tapak - tebal ' + numR(r.tf * 1000, 0) + ' mm, kedalaman Df ' + numR(r.Df, 2) + ' m', size: 7, align: 'c' });
    return { fig: { h: Math.ceil((baseY + 52) / 11.5), ops: ops, alt: 'Gbr. 2 Potongan tapak - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('DESAIN PONDASI TAPAK (SPREAD FOOTING)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019 / SNI 8460   ' + APP_VER, dt));
    L.push('');
    L.push(' INPUT'); L.push(ruleR('-'));
    L.push(rowR('P / LF', numR(r.P, 0) + ' kN / ' + numR(r.LF, 2)));
    L.push(rowR('Mx / My', numR(r.Mx, 1) + ' / ' + numR(r.My, 1) + ' kNm'));
    L.push(rowR('Hx / Hy', numR(r.Hx, 1) + ' / ' + numR(r.Hy, 1) + ' kN'));
    L.push(rowR('Tapak L x B x tf', numR(r.L, 2) + ' x ' + numR(r.B, 2) + ' x ' + numR(r.tf * 1000, 0) + 'mm'));
    L.push(rowR('Df / kolom c1 x c2', numR(r.Df, 2) + 'm / ' + numR(r.c1 * 1000, 0) + ' x ' + numR(r.c2 * 1000, 0) + 'mm'));
    L.push(rowR("f'c / fy", numR(r.fc, 0) + ' / ' + numR(r.fy, 0) + ' MPa'));
    L.push(rowR('qa / mu', numR(r.qa, 0) + ' kPa / ' + numR(r.mu, 2)));
    L.push(rowR('Selimut / Dtul', numR(r.cc, 0) + ' mm / D' + r.db));
    L.push('');
    L.push(figPlan(r));
    L.push('');
    L.push(figSection(r));
    L.push('');
    L.push(' STABILITAS (beban layan)'); L.push(ruleR('.'));
    L.push(rowR('N total di dasar', numR(r.N, 0) + ' kN'));
    L.push(rowR('ex / ey', numR(r.ex, 3) + ' / ' + numR(r.ey, 3) + ' m'));
    L.push(rowR('Kern (<=1/6)', numR(r.kern, 3) + (r.uplift ? ' UPLIFT' : ' OK')));
    L.push(rowR('qmax / qmin', numR(r.qmax, 1) + ' / ' + numR(r.qmin, 1) + ' kPa'));
    L.push(rowR('SF daya dukung (qa/qmax)', numR(r.SFbear, 2) + (r.SFbear >= 1 ? ' OK' : ' NG')));
    L.push(rowR('SF guling (>=1.5)', (isFinite(r.SFot) ? numR(r.SFot, 2) : 'inf') + (r.SFot >= 1.5 ? ' OK' : ' NG')));
    L.push(rowR('SF geser (>=1.5)', (isFinite(r.SFslide) ? numR(r.SFslide, 2) : 'inf') + (r.SFslide >= 1.5 ? ' OK' : ' NG')));
    if (r.desOk) {
      L.push('');
      L.push(' STRUKTUR (ultimit, qu=' + numR(r.quavg, 0) + ' kPa)'); L.push(ruleR('.'));
      L.push(rowR('LENTUR arah L: Mu', numR(r.flexL.Mu, 1) + ' kNm/m'));
      L.push(rowR('  >> D' + r.db + '-' + r.flexL.s, 'As ' + numR(r.flexL.AsReq, 0) + ' mm2/m' + (r.flexL.govMin ? ' (Asmin)' : '')));
      L.push(rowR('LENTUR arah B: Mu', numR(r.flexB.Mu, 1) + ' kNm/m'));
      L.push(rowR('  >> D' + r.db + '-' + r.flexB.s, 'As ' + numR(r.flexB.AsReq, 0) + ' mm2/m' + (r.flexB.govMin ? ' (Asmin)' : '')));
      L.push(rowR('GESER 1-arah L: Vu/phiVc', numR(r.flexL.Vu, 1) + '/' + numR(r.phiVc1L, 1) + ' D/C ' + numR(r.dc1L, 2)));
      L.push(rowR('GESER 1-arah B: Vu/phiVc', numR(r.flexB.Vu, 1) + '/' + numR(r.phiVc1B, 1) + ' D/C ' + numR(r.dc1B, 2)));
      L.push(rowR('PONS b0 / d', numR(r.b0, 0) + ' / ' + numR(r.davg, 0) + ' mm'));
      L.push(rowR('PONS Vu/phiVc', numR(r.Vup, 0) + '/' + numR(r.phiVcp, 0) + ' kN D/C ' + numR(r.dcPunch, 2)));
    }
    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('.'));
      r.warn.forEach(function (w) { L.push(rowR('!', w.replace(/[^\x20-\x7E]/g, '?').slice(0, 58))); });
    }
    L.push(''); L.push(' ' + rep('=', RW));
    L.push(centerR('Verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L;
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi input dulu', 'bad'); return; }
    var lines = buildReport(null, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'PondasiTapak_' + numR(r.L, 1) + 'x' + numR(r.B, 1) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ================= KONTRAK MODULE ================= */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Desain Pondasi Tapak', category: 'Beton Bertulang', needsCanvas: false, needsRenderer: true },
    mount: function (container, runtime) { state = { UI: runtime.UI, runtime: runtime }; render(container); },
    unmount: function () {
      // Pulihkan display kanvas WebGL bersama (bisa 'none' bila ditinggal di mode denah)
      // agar tool 3D berikutnya yang memakai renderer singleton ini tidak ikut tersembunyi.
      if (state.R && state.R.canvas) state.R.canvas.style.display = 'block';
      if (state.R) { state.R.stop(); state.R.unmount(); }
      if (state.sec) state.sec.destroy();
      if (state.controls) state.controls.dispose();
      if (state.themeObs) state.themeObs.disconnect();
      if (state.scene) state.UI.disposeObject(state.scene);
      state = {};
    }
  };
})();
