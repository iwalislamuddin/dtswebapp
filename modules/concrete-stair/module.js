/* ============================================================
   Civil Tools — modules/concrete-stair/module.js  (Tier 2, kanvas 2D)
   DESAIN TANGGA BETON BERTULANG — MODEL RANGKA BIDANG (MATRIX STIFFNESS)
   SNI 2847:2019.

   Pemodelan (sesuai sketsa): tangga = rangka bidang menerus 4 simpul / 3 batang.
       N0 (0,0)  = tumpuan A (bawah)
       N1 (L1,0) = kaki flight (kink bawah)          [ada bila L1>0]
       N2 (L1+L2, H) = kepala flight (kink atas)
       N3 (L1+L2+L3, H) = tumpuan B (atas)           [ada bila L3>0]
     Batang: landing bawah (horizontal L1), flight (miring L2/H),
             landing atas (horizontal L3). Batang panjang-nol dilewati.

   METODE: DIREK-KEKAKUAN rangka bidang, elemen aksial+lentur (6 DOF/elemen),
     ≤4 simpul × 3 DOF (u,v,θ). Penampang BETON persegi per 1 m lebar:
     A=1000·tw, I=1000·tw³/12, E=4700√f'c. Beban bentang → gaya ujung terjepit
     (FEF) → beban simpul ekuivalen. Satu formulasi menangani flight miring,
     kink, gaya aksial (thrust), dan sembarang tumpuan.

   BEBAN (vertikal ke bawah, per 1 m lebar):
     - Flight: berat waist γc·tw (sepanjang batang) + anak tangga γc·(R/2)·cosθ
       + SDL·cosθ + LL·cosθ  (q per proyeksi horizontal → ×cosθ per panjang batang).
     - Landing: γc·tw + SDL (+LL). Desain wu=maks(1,4D;1,2D+1,6L); lendutan w layan.

   Analisis dijalankan 3×: ULTIMIT (gaya desain) + LAYAN dgn Ig (lendutan utuh) +
   LAYAN dgn Ie retak Branson (lendutan retak). Gaya dalam tak bergantung besar EI
   (penampang seragam). Penulangan lentur M+ (bawah) & M− (tumpuan/kink) per meter,
   tulangan bagi susut-suhu; cek geser pelat φVc; lendutan vs L/360 & L/250.

   Konvensi: aksial tarik (+), momen sagging (+). Alat bantu analisis+desain elastis;
   verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'concrete-stair';
  var GAMMA_C = 24, ES = 200000, EPS = 1e-6, NSEG = 24;
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function beta1(fc) { return fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7); }
  function rhoTemp(fy) { return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014); }
  function extAbs(arr) { var m = 0; for (var i = 0; i < arr.length; i++) if (Math.abs(arr[i]) > Math.abs(m)) m = arr[i]; return m; }

  /* ============== ALJABAR MATRIKS ============== */
  function matZ(n, m) { var A = []; for (var i = 0; i < n; i++) A.push(new Array(m).fill(0)); return A; }
  function matMul(A, B) {
    var n = A.length, k = B.length, m = B[0].length, C = matZ(n, m);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) { var s = 0; for (var p = 0; p < k; p++) s += A[i][p] * B[p][j]; C[i][j] = s; }
    return C;
  }
  function matT(A) { var n = A.length, m = A[0].length, C = matZ(m, n); for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) C[j][i] = A[i][j]; return C; }
  function solve(K, b) {
    var n = b.length, A = K.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      var tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      var d = A[c][c];
      for (var j = c; j <= n; j++) A[c][j] /= d;
      for (r = 0; r < n; r++) { if (r === c) continue; var f = A[r][c]; if (f === 0) continue; for (j = c; j <= n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(function (r) { return r[n]; });
  }
  /* ============== ELEMEN RANGKA BIDANG ============== */
  function kLocal(EA, EI, L) {
    var a = EA / L, c1 = 12 * EI / (L * L * L), c2 = 6 * EI / (L * L), c3 = 4 * EI / L, c4 = 2 * EI / L;
    return [[a, 0, 0, -a, 0, 0], [0, c1, c2, 0, -c1, c2], [0, c2, c3, 0, -c2, c4],
      [-a, 0, 0, a, 0, 0], [0, -c1, -c2, 0, c1, -c2], [0, c2, c4, 0, -c2, c3]];
  }
  function transform(cx, cy) {
    var T = matZ(6, 6), R = [[cx, cy, 0], [-cy, cx, 0], [0, 0, 1]];
    for (var b = 0; b < 2; b++) for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) T[b * 3 + i][b * 3 + j] = R[i][j];
    return T;
  }
  // FEF lokal untuk merata aksial wx & lintang wy (N/mm). {f}=[k]{d}+{ff}.
  function fefLocal(wx, wy, L) {
    return [-wx * L / 2, -wy * L / 2, -wy * L * L / 12, -wx * L / 2, -wy * L / 2, wy * L * L / 12];
  }

  /* Icr / Ie Branson (b=1000) */
  function Icr(As, d, fc) {
    var Ec = 4700 * Math.sqrt(fc), n = Math.max(1, ES / Ec), b = 1000;
    var rn = n * As / (b * d), kk = Math.sqrt(rn * rn + 2 * rn) - rn, kd = kk * d;
    return b * kd * kd * kd / 3 + n * As * (d - kd) * (d - kd);
  }
  function effI(Ma, As, d, fc, h) {
    var Ig = 1000 * h * h * h / 12, fr = 0.62 * Math.sqrt(fc), yt = h / 2;
    var Mcr = fr * Ig / yt / 1e6, o = { Ig: Ig, Mcr: Mcr, Ma: Ma };
    if (Ma <= Mcr || As <= 0) { o.Ie = Ig; o.Icr = Ig; o.cracked = false; return o; }
    var icr = Icr(As, d, fc), ratio = Math.pow(Mcr / Ma, 3);
    o.Icr = icr; o.Ie = Math.min(Ig, ratio * Ig + (1 - ratio) * icr); o.cracked = true;
    return o;
  }

  /* ---------- desain As per meter (b=1000) ---------- */
  function designAs(Mu, d, fc, fy, db, h, smaxAbs) {
    var o = { Mu: Mu, As: 0, tc: true, infeasible: false, et: Infinity };
    var b = 1000, phi = 0.9;
    if (Mu > 0.005 && d > 0) {
      var Rn = Mu * 1e6 / (phi * b * d * d), disc = 1 - 2 * Rn / (0.85 * fc);
      if (disc < 0) { o.infeasible = true; disc = 0; }
      var rho = (0.85 * fc / fy) * (1 - Math.sqrt(disc));
      o.As = rho * b * d;
      var a = o.As * fy / (0.85 * fc * b), c = a / beta1(fc);
      o.et = c > 0 ? 0.003 * (d - c) / c : Infinity; o.tc = o.et >= 0.005;
    }
    o.AsMin = rhoTemp(fy) * 1000 * h; o.AsReq = Math.max(o.As, o.AsMin); o.govMin = o.AsReq > o.As + 1e-6;
    var Ab = Math.PI / 4 * db * db, sTeo = 1000 * Ab / o.AsReq;
    var s = Math.floor(sTeo / 25) * 25, sMax = Math.floor(smaxAbs / 25) * 25;
    if (s > sMax) s = sMax; if (s < 50) s = 50;
    o.s = s; o.sMax = smaxAbs; o.db = db; o.AsProv = 1000 * Ab / s;
    return o;
  }

  /* ================= COMPUTE ================= */
  function compute(v) {
    var r = { warn: [], valid: false };
    var L1 = num(v.L1), L2 = num(v.L2), L3 = num(v.L3), H = num(v.H);
    var R = num(v.R), tw = num(v.tw), fc = num(v.fc), fy = num(v.fy);
    var SDL = num(v.SDL), LL = num(v.LL), cc = num(v.cc), db = num(v.db);
    var supA = v.supA || 'sendi', supB = v.supB || 'rol';
    if (!(L2 > 0) || !(H > 0) || !(tw > 0) || !(fc > 0) || !(fy > 0) || !(R > 0)) return r;
    if (L1 < 0) L1 = 0; if (L3 < 0) L3 = 0;

    // geometri anak tangga (flight)
    var Nrise = Math.max(1, Math.round(H * 1000 / R));
    var Ract = H * 1000 / Nrise;
    var Ntread = Math.max(1, Nrise);              // injakan pada proyeksi L2
    var Tgo = L2 * 1000 / Ntread;                  // going aktual (mm)
    var theta = Math.atan2(H, L2), thetaDeg = theta * 180 / Math.PI;
    var cosT = L2 / Math.hypot(L2, H);

    r.L1 = L1; r.L2 = L2; r.L3 = L3; r.H = H; r.Ract = Ract; r.Tgo = Tgo;
    r.Nrise = Nrise; r.Ntread = Ntread; r.theta = theta; r.thetaDeg = thetaDeg; r.cosT = cosT;
    r.tw = tw; r.fc = fc; r.fy = fy; r.cc = cc; r.db = db; r.SDL = SDL; r.LL = LL;
    r.supA = supA; r.supB = supB;
    r.Ltot = L1 + L2 + L3;

    // ---- simpul (mm) ----
    var pts = [[0, 0]];
    if (L1 > 1e-6) pts.push([L1 * 1000, 0]);
    pts.push([(L1 + L2) * 1000, H * 1000]);
    if (L3 > 1e-6) pts.push([(L1 + L2 + L3) * 1000, H * 1000]);
    var nN = pts.length, idxA = 0, idxB = nN - 1;
    r.nodes = pts; r.idxA = idxA; r.idxB = idxB;

    // ---- elemen ----
    var Ec = 4700 * Math.sqrt(fc); r.Ec = Ec;
    var b = 1000, Ag = b * tw, Ig = b * tw * tw * tw / 12;
    r.Ag = Ag; r.Ig = Ig;
    var wLine = GAMMA_C * (tw / 1000);             // berat sendiri per panjang batang (kN/m)

    var elems = [];
    for (var i = 0; i < nN - 1; i++) {
      var xi = pts[i], xj = pts[i + 1];
      var dx = xj[0] - xi[0], dy = xj[1] - xi[1], L = Math.hypot(dx, dy);
      var kind = Math.abs(dy) < 1e-6 ? 'land' : 'flight';
      // beban vertikal mati & hidup per panjang batang (kN/m, per 1 m lebar)
      var wD, wL;
      if (kind === 'flight') {
        wD = wLine + (GAMMA_C * (Ract / 1000) / 2) * cosT + SDL * cosT;   // waist + anak tangga + SDL
        wL = LL * cosT;
      } else {
        wD = wLine + SDL; wL = LL;
      }
      elems.push({ ni: i, nj: i + 1, L: L, cx: dx / L, cy: dy / L, kind: kind, wD: wD, wL: wL });
    }
    r.elems = elems;
    r.flight = elems.filter(function (e) { return e.kind === 'flight'; })[0];
    // rangkuman beban untuk panel
    r.wD_fl = r.flight.wD; r.wL_fl = r.flight.wL;
    var land = elems.filter(function (e) { return e.kind === 'land'; })[0];
    r.wD_la = land ? land.wD : null;
    r.gWaist = wLine; r.gSteps = (GAMMA_C * (Ract / 1000) / 2) * cosT;

    // ---- solver rangka: mode 'u'|'s', Ival = momen inersia efektif (mm⁴) ----
    var ND = nN * 3;
    function supDofs(idx, type) {
      var o = [idx * 3 + 1];                       // v selalu (rol)
      if (type === 'sendi' || type === 'jepit') o.push(idx * 3 + 0);
      if (type === 'jepit') o.push(idx * 3 + 2);
      return o;
    }
    function solveFrame(mode, Ival) {
      var K = matZ(ND, ND), F = new Array(ND).fill(0);
      elems.forEach(function (e) {
        var wv = (mode === 'u') ? Math.max(1.4 * e.wD, 1.2 * e.wD + 1.6 * e.wL) : (e.wD + e.wL);
        e['wv_' + mode] = wv;
        var wx = -wv * e.cy, wy = -wv * e.cx;      // vertikal (0,−wv) → lokal
        var EA = Ec * Ag, EI = Ec * Ival;
        var kl = kLocal(EA, EI, e.L), T = transform(e.cx, e.cy);
        var kg = matMul(matMul(matT(T), kl), T);
        var ff = fefLocal(wx, wy, e.L);
        var ffg = matMul(matT(T), ff.map(function (x) { return [x]; }));
        var map = [e.ni * 3, e.ni * 3 + 1, e.ni * 3 + 2, e.nj * 3, e.nj * 3 + 1, e.nj * 3 + 2];
        e._kl = kl; e._T = T; e._ff = ff; e._wx = wx; e._wy = wy;
        for (var a2 = 0; a2 < 6; a2++) { F[map[a2]] -= ffg[a2][0]; for (var b2 = 0; b2 < 6; b2++) K[map[a2]][map[b2]] += kg[a2][b2]; }
      });
      var isFixed = new Array(ND).fill(false);
      supDofs(idxA, supA).concat(supDofs(idxB, supB)).forEach(function (d) { isFixed[d] = true; });
      var free = []; for (var q = 0; q < ND; q++) if (!isFixed[q]) free.push(q);
      var nf = free.length, Kr = matZ(nf, nf), Fr = new Array(nf);
      for (q = 0; q < nf; q++) { Fr[q] = F[free[q]]; for (var j = 0; j < nf; j++) Kr[q][j] = K[free[q]][free[j]]; }
      var dr = solve(Kr, Fr);
      if (!dr) return null;
      var D = new Array(ND).fill(0); for (q = 0; q < nf; q++) D[free[q]] = dr[q];
      // gaya ujung & diagram
      var out = { D: D, elems: [], maxM: 0, maxV: 0, maxN: 0 };
      elems.forEach(function (e) {
        var map = [e.ni * 3, e.ni * 3 + 1, e.ni * 3 + 2, e.nj * 3, e.nj * 3 + 1, e.nj * 3 + 2];
        var de = map.map(function (m) { return [D[m]]; });
        var dloc = matMul(e._T, de);
        var fl = matMul(e._kl, dloc);
        var fLocal = fl.map(function (row, k) { return row[0] + e._ff[k]; });
        var xs = [], Ns = [], Vs = [], Ms = [];
        for (var s = 0; s <= NSEG; s++) {
          var x = e.L * s / NSEG; xs.push(x);
          var Wx = e._wx * x, Wy = e._wy * x;
          var Nv = -(fLocal[0] + Wx), Vv = -(fLocal[1] + Wy);
          var Mv = -fLocal[2] + fLocal[1] * x + e._wy * x * x / 2;
          Ns.push(Nv); Vs.push(Vv); Ms.push(Mv);
          if (Math.abs(Nv) > Math.abs(out.maxN)) out.maxN = Nv;
          if (Math.abs(Vv) > Math.abs(out.maxV)) out.maxV = Vv;
          if (Math.abs(Mv) > Math.abs(out.maxM)) out.maxM = Mv;
        }
        out.elems.push({ ref: e, xs: xs, Ns: Ns, Vs: Vs, Ms: Ms, fLocal: fLocal, dloc: dloc.map(function (x) { return x[0]; }),
          Mmax: extAbs(Ms) / 1e6, Vmax: extAbs(Vs) / 1e3, Nmax: extAbs(Ns) / 1e3 });
      });
      return out;
    }

    // ---- ULTIMIT (gaya desain) ----
    var U = solveFrame('u', Ig);
    if (!U) { r.warn.push('Struktur tidak stabil (mekanisme) — periksa tumpuan.'); r.valid = true; r.unstable = true; return r; }
    r.U = U;
    r.Mmax = U.maxM / 1e6; r.Vmax = U.maxV / 1e3; r.Nmax = U.maxN / 1e3;

    // momen ekstrem global (sagging + / hogging −)
    var Mpos = 0, Mneg = 0, xMpos = 0, xMposGlob = 0;
    U.elems.forEach(function (ed) {
      var e = ed.ref;
      ed.Ms.forEach(function (Mv, k) {
        var M = Mv / 1e6;
        if (M > Mpos) { Mpos = M; }
        if (M < Mneg) Mneg = M;
      });
    });
    r.Mpos = Mpos; r.Mneg = Math.abs(Mneg);

    // ---- LAYAN (Ig) → lendutan utuh + Ma ----
    var Sg = solveFrame('s', Ig); r.Sg = Sg;
    var MsPos = 0; Sg.elems.forEach(function (ed) { ed.Ms.forEach(function (Mv) { if (Mv / 1e6 > MsPos) MsPos = Mv / 1e6; }); });
    r.MsPos = MsPos;
    r.ie = effI(MsPos, null, tw - cc - db / 2, fc, tw);   // As provisional dulu; diperbarui di bawah

    // ---- penulangan (butuh d) ----
    var d = tw - cc - db / 2; r.d = d;
    if (!(d > 0)) { r.warn.push('Tinggi efektif d ≤ 0 — pertebal waist / kurangi selimut.'); r.valid = true; return r; }
    var smMain = Math.min(3 * tw, 450), smDist = Math.min(5 * tw, 450);
    r.asPos = designAs(Mpos, d, fc, fy, db, tw, smMain);
    r.asNeg = designAs(r.Mneg, d, fc, fy, db, tw, smMain);
    r.dbDist = 10; r.asDist = designAs(0, d, fc, fy, r.dbDist, tw, smDist);
    r.infeasible = r.asPos.infeasible || r.asNeg.infeasible;

    // Ie retak final (pakai As terpasang lapangan)
    r.ie = effI(MsPos, r.asPos.AsProv, d, fc, tw);

    // ---- geser pelat ----
    r.phiVc = 0.75 * 0.17 * Math.sqrt(fc) * 1000 * d / 1000;
    r.dcrVc = Math.abs(r.Vmax) / r.phiVc;

    // ---- lendutan vertikal (utuh Ig & retak Ie) ----
    function maxVertDefl(sol) {
      var dm = 0, xg = 0;
      sol.elems.forEach(function (ed) {
        var e = ed.ref, dl = ed.dloc;
        for (var s = 0; s <= 20; s++) {
          var t = s / 20;
          var ua = (1 - t) * dl[0] + t * dl[3];
          var vv = (1 - 3 * t * t + 2 * t * t * t) * dl[1] + e.L * (t - 2 * t * t + t * t * t) * dl[2] +
            (3 * t * t - 2 * t * t * t) * dl[4] + e.L * (-t * t + t * t * t) * dl[5];
          var gy = ua * e.cy + vv * e.cx;          // komponen vertikal global (mm)
          if (Math.abs(gy) > Math.abs(dm)) { dm = gy; xg = (e.ni === 0 ? 0 : (r.nodes[e.ni][0])) / 1000 + t * (e.cx * e.L) / 1000; }
        }
      });
      return { d: Math.abs(dm), x: xg };
    }
    r.dUncr = maxVertDefl(Sg).d;
    var Se = solveFrame('s', r.ie.Ie); r.Se = Se;
    var dc = maxVertDefl(Se); r.dCr = dc.d; r.xdef = dc.x;
    r.limit360 = r.Ltot * 1000 / 360; r.limit250 = r.Ltot * 1000 / 250;
    r.defOk = r.dCr <= r.limit360;

    // ---- reaksi & keseimbangan ----
    function reaction(sol, elemIdx, endIsI) {
      var ed = sol.elems[elemIdx], e = ed.ref;
      var fg = matMul(matT(e._T), ed.fLocal.map(function (x) { return [x]; }));
      var o = endIsI ? 0 : 3;
      return { Rx: fg[o][0] / 1e3, Ry: fg[o + 1][0] / 1e3, M: fg[o + 2][0] / 1e6 };
    }
    r.RA = reaction(U, 0, true);                    // node A = i-end elemen 0
    r.RB = reaction(U, U.elems.length - 1, false);  // node B = j-end elemen terakhir
    var Wg = 0; elems.forEach(function (e) { Wg += e['wv_u'] * e.L / 1000; });   // ΣwuL (kN)
    r.Wu = Wg; r.sumRy = r.RA.Ry + r.RB.Ry; r.sumRx = r.RA.Rx + r.RB.Rx;

    r.valid = true;
    return r;
  }

  /* ================= KANVAS ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // transform model(mm)→layar berdasar bbox simpul + margin
  function viewMap(w, h, r, padL, padR, padT, padB) {
    var xs = r.nodes.map(function (p) { return p[0]; }), ys = r.nodes.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var mW = Math.max(1, maxX - minX), mH = Math.max(1, maxY - minY);
    var mgx = 0.16 * mW + 200, mgy = 0.35 * mH + 400;
    var x0 = minX - mgx, x1 = maxX + mgx, y0 = minY - mgy, y1 = maxY + mgy;
    var sc = Math.min((w - padL - padR) / (x1 - x0), (h - padT - padB) / (y1 - y0));
    var offX = padL + ((w - padL - padR) - sc * (x1 - x0)) / 2;
    var offY = padT + ((h - padT - padB) - sc * (y1 - y0)) / 2;
    return {
      sc: sc,
      X: function (xm) { return offX + (xm - x0) * sc; },
      Y: function (ym) { return h - padB - (ym - y0) * sc - (offY - padT); }
    };
  }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid || r.unstable) {
      ctx.fillStyle = css('--ink-faint'); ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(r && r.unstable ? 'Struktur tidak stabil — periksa tumpuan.' : 'Masukkan dimensi & beban untuk melihat tangga.', w / 2, h / 2); return;
    }
    var view = state.viewMode;
    if (view === 'sec') drawSection(ctx, w, h, r);
    else if (view === 'D') drawDeform(ctx, w, h, r);
    else drawDiagram(ctx, w, h, r, view);
  }

  function drawSupport(ctx, x, y, type, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    if (type === 'jepit') {
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.stroke();
      for (var k = -12; k < 12; k += 5) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k - 5, y + 6); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 13); ctx.lineTo(x + 8, y + 13); ctx.closePath(); ctx.stroke();
      if (type === 'rol') { ctx.beginPath(); ctx.arc(x - 4, y + 17, 2.4, 0, 2 * Math.PI); ctx.arc(x + 4, y + 17, 2.4, 0, 2 * Math.PI); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x - 11, y + 16); ctx.lineTo(x + 11, y + 16); ctx.stroke(); for (var j = -9; j < 11; j += 5) { ctx.beginPath(); ctx.moveTo(x + j, y + 16); ctx.lineTo(x + j - 4, y + 21); ctx.stroke(); } }
    }
  }

  function drawFrame(ctx, r, m, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    r.elems.forEach(function (e) {
      var A = r.nodes[e.ni], B = r.nodes[e.nj];
      ctx.beginPath(); ctx.moveTo(m.X(A[0]), m.Y(A[1])); ctx.lineTo(m.X(B[0]), m.Y(B[1])); ctx.stroke();
    });
  }

  /* ---------- Potongan: model + anak tangga + tulangan ---------- */
  function drawSection(ctx, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint'), amber = css('--amber'), sky = css('--sky') || '#30bced';
    var m = viewMap(w, h, r, 52, 46, 40, 50);
    // isi tebal batang (offset tegak lurus tw)
    var twM = r.tw;
    r.elems.forEach(function (e) {
      var A = r.nodes[e.ni], B = r.nodes[e.nj];
      var nx = e.cy, ny = -e.cx;                    // normal (arah bawah struktur)
      // sisi bawah = geser sepanjang normal ke bawah (global −y)
      var sgn = ny < 0 ? 1 : -1;
      var ox = nx * twM * sgn, oy = ny * twM * sgn;
      ctx.fillStyle = 'rgba(120,140,90,0.07)';
      ctx.beginPath();
      ctx.moveTo(m.X(A[0]), m.Y(A[1])); ctx.lineTo(m.X(B[0]), m.Y(B[1]));
      ctx.lineTo(m.X(B[0] + ox), m.Y(B[1] + oy)); ctx.lineTo(m.X(A[0] + ox), m.Y(A[1] + oy));
      ctx.closePath(); ctx.fill();
    });
    // anak tangga (sawtooth) pada flight
    var fl = r.elems.filter(function (e) { return e.kind === 'flight'; })[0];
    if (fl) {
      var A = r.nodes[fl.ni], stepX = r.Tgo, stepY = r.Ract;
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath();
      var cx = A[0], cy = A[1]; ctx.moveTo(m.X(cx), m.Y(cy));
      for (var s = 0; s < r.Ntread; s++) { cy += stepY; ctx.lineTo(m.X(cx), m.Y(cy)); cx += stepX; ctx.lineTo(m.X(cx), m.Y(cy)); }
      ctx.stroke();
    }
    // garis tengah rangka + tumpuan
    drawFrame(ctx, r, m, dim, 2.4);
    drawSupport(ctx, m.X(r.nodes[r.idxA][0]), m.Y(r.nodes[r.idxA][1]), r.supA, dim);
    drawSupport(ctx, m.X(r.nodes[r.idxB][0]), m.Y(r.nodes[r.idxB][1]), r.supB, dim);
    // tulangan bawah (mengikuti soffit) — offset normal ke bawah dari garis tengah
    ctx.strokeStyle = amber; ctx.lineWidth = 1.7; ctx.globalAlpha = 0.9; ctx.beginPath();
    r.elems.forEach(function (e, k) {
      var A = r.nodes[e.ni], B = r.nodes[e.nj];
      var nx = e.cy, ny = -e.cx, sgn = ny < 0 ? 1 : -1;
      var off = (r.tw - r.cc); var ox = nx * off * sgn, oy = ny * off * sgn;
      if (k === 0) ctx.moveTo(m.X(A[0] + ox), m.Y(A[1] + oy));
      ctx.lineTo(m.X(B[0] + ox), m.Y(B[1] + oy));
    });
    ctx.stroke(); ctx.globalAlpha = 1;
    // dimensi
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    function dimLabel(txt, A, B, up) { var mxp = (m.X(A[0]) + m.X(B[0])) / 2, myp = (m.Y(A[1]) + m.Y(B[1])) / 2; ctx.fillText(txt, mxp, myp + (up ? -8 : 16)); }
    if (r.L1 > 1e-6) dimLabel('L₁ ' + r.L1.toFixed(2), r.nodes[0], r.nodes[1], false);
    dimLabel('L₂ ' + r.L2.toFixed(2) + '  (θ ' + r.thetaDeg.toFixed(1) + '°)', r.flight ? r.nodes[r.flight.ni] : r.nodes[0], r.flight ? r.nodes[r.flight.nj] : r.nodes[1], true);
    if (r.L3 > 1e-6) dimLabel('L₃ ' + r.L3.toFixed(2), r.nodes[r.idxB - 1], r.nodes[r.idxB], false);
    ctx.save(); ctx.translate(m.X(0) - 22, (m.Y(0) + m.Y(r.H * 1000)) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('H ' + r.H.toFixed(2) + ' m', 0, 0); ctx.restore();
    ctx.fillStyle = amber; ctx.textAlign = 'center'; ctx.fillText('Tul. bawah D' + r.db + '-' + r.asPos.s, w / 2, h - 28);
    ctx.fillStyle = faint; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('Model rangka bidang — waist ' + r.tw + ' mm · ' + r.Ntread + ' injakan · tumpuan ' + r.supA + '–' + r.supB, w / 2, 16);
  }

  /* ---------- Diagram M/V/N (ordinat tegak lurus batang) ---------- */
  function drawDiagram(ctx, w, h, r, view) {
    var dim = css('--ink-dim'), faint = css('--ink-faint'), amber = css('--amber'), blue = css('--sky') || '#30bced', ok = css('--ok') || '#88b08a';
    var m = viewMap(w, h, r, 56, 50, 46, 54);
    drawFrame(ctx, r, m, dim, 2.4);
    drawSupport(ctx, m.X(r.nodes[r.idxA][0]), m.Y(r.nodes[r.idxA][1]), r.supA, dim);
    drawSupport(ctx, m.X(r.nodes[r.idxB][0]), m.Y(r.nodes[r.idxB][1]), r.supB, dim);

    var sol = r.U, key = view === 'M' ? 'Ms' : (view === 'V' ? 'Vs' : 'Ns');
    var conv = view === 'M' ? 1e6 : 1e3, color = view === 'M' ? amber : (view === 'V' ? blue : ok);
    var gmax = 1e-9; sol.elems.forEach(function (ed) { ed[key].forEach(function (val) { gmax = Math.max(gmax, Math.abs(val)); }); });
    gmax /= conv;
    var ampPx = Math.min(90, Math.max(24, 0.32 * Math.min(r.Ltot, r.H + 0.5) * 1000 * m.sc));

    sol.elems.forEach(function (ed) {
      var e = ed.ref, A = r.nodes[e.ni], B = r.nodes[e.nj];
      var dx = B[0] - A[0], dy = B[1] - A[1];
      var nx = -dy / e.L, ny = dx / e.L;            // normal satuan (model)
      var base = [], poly = [];
      for (var i = 0; i < ed.xs.length; i++) {
        var px = A[0] + dx * (ed.xs[i] / e.L), py = A[1] + dy * (ed.xs[i] / e.L);
        base.push([m.X(px), m.Y(py)]);
        var val = ed[key][i] / conv, off = (val / gmax) * ampPx;
        var sgn = view === 'M' ? -1 : 1;            // M digambar di sisi tarik
        poly.push([m.X(px) + sgn * off * nx, m.Y(py) - sgn * off * ny]);
      }
      ctx.beginPath(); ctx.moveTo(base[0][0], base[0][1]);
      for (i = 0; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.lineTo(base[base.length - 1][0], base[base.length - 1][1]); ctx.closePath();
      ctx.globalAlpha = 0.15; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]);
      for (i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
      var ei = 0, ev = 0; for (i = 0; i < ed[key].length; i++) if (Math.abs(ed[key][i]) > Math.abs(ev)) { ev = ed[key][i]; ei = i; }
      if (Math.abs(ev / conv) > 1e-3) {
        ctx.fillStyle = color; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText((ev / conv).toFixed(1), poly[ei][0], poly[ei][1] + (poly[ei][1] < base[ei][1] ? -4 : 11));
      }
    });
    ctx.fillStyle = faint; ctx.font = '11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    var titles = { M: 'Momen lentur M (kN·m/m) — digambar di sisi TARIK', V: 'Gaya lintang V (kN/m)', N: 'Gaya aksial N (kN/m) — tekan (−)/tarik (+)' };
    ctx.fillText(titles[view], w / 2, 16);
  }

  /* ---------- Deformasi (Hermite) ---------- */
  function drawDeform(ctx, w, h, r) {
    var faint = css('--ink-faint'), dim = css('--ink-dim'), amber = css('--amber');
    var m = viewMap(w, h, r, 56, 50, 46, 54);
    drawFrame(ctx, r, m, faint, 1.6);
    var sol = r.Se || r.Sg;
    var dmax = 1e-9; sol.D.forEach(function (d, i) { if (i % 3 !== 2) dmax = Math.max(dmax, Math.abs(d)); });
    var pct = (state.deformPct != null ? state.deformPct : 4) / 100;
    var target = pct * Math.min(r.Ltot, r.H + 0.5) * 1000, mag = dmax > EPS ? target / dmax : 0;
    if (state.defSlider) state.defSlider.setReadout('×' + (mag >= 10 ? Math.round(mag) : mag.toFixed(1)));
    ctx.strokeStyle = amber; ctx.lineWidth = 2;
    sol.elems.forEach(function (ed) {
      var e = ed.ref, A = r.nodes[e.ni], B = r.nodes[e.nj], dl = ed.dloc;
      ctx.beginPath();
      for (var s = 0; s <= 20; s++) {
        var t = s / 20;
        var ua = (1 - t) * dl[0] + t * dl[3];
        var vv = (1 - 3 * t * t + 2 * t * t * t) * dl[1] + e.L * (t - 2 * t * t + t * t * t) * dl[2] + (3 * t * t - 2 * t * t * t) * dl[4] + e.L * (-t * t + t * t * t) * dl[5];
        var gx = ua * e.cx - vv * e.cy, gy = ua * e.cy + vv * e.cx;
        var px = A[0] + (B[0] - A[0]) * t + gx * mag, py = A[1] + (B[1] - A[1]) * t + gy * mag;
        if (s === 0) ctx.moveTo(m.X(px), m.Y(py)); else ctx.lineTo(m.X(px), m.Y(py));
      }
      ctx.stroke();
    });
    drawSupport(ctx, m.X(r.nodes[r.idxA][0]), m.Y(r.nodes[r.idxA][1]), r.supA, dim);
    drawSupport(ctx, m.X(r.nodes[r.idxB][0]), m.Y(r.nodes[r.idxB][1]), r.supB, dim);
    ctx.fillStyle = dim; ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('δretak ' + r.dCr.toFixed(2) + ' mm  ·  δutuh ' + r.dUncr.toFixed(2) + ' mm  ·  batas L/360 ' + r.limit360.toFixed(2) + ' mm', w / 2, h - 16);
    ctx.fillStyle = faint; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('Bentuk lendutan seketika (beban layan, penampang retak Ie · diperbesar)', w / 2, 16);
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('cst-style')) return;
    var s = document.createElement('style'); s.id = 'cst-style';
    s.textContent =
      '.cst-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.cst-canvas{position:relative;flex:1 1 52%;min-height:280px;border-bottom:1px solid var(--line);background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.cst-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}' +
      '.cst-viewseg{position:absolute;right:12px;top:10px;display:flex;z-index:4;border:1px solid var(--line);border-radius:8px;overflow:hidden}' +
      '.cst-viewseg button{background:var(--panel);color:var(--ink-dim);border:0;padding:5px 11px;font:600 12px "Space Grotesk",sans-serif;cursor:pointer}' +
      '.cst-viewseg button.active{background:var(--amber);color:var(--bg)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');
    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Desain Tangga Beton'));
    panel.appendChild(UI.el('div', 'sub', 'Tangga beton bertulang dimodelkan sebagai rangka bidang (landing–flight–landing) — metode matriks kekakuan. Penulangan lentur & cek lendutan utuh/retak, SNI 2847:2019.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'cst-work');
    var canvasHost = UI.el('div', 'cst-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Model tangga');
    var results = UI.el('div', 'cst-res');
    work.appendChild(canvasHost); work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var supOpts = [{ value: 'sendi', label: 'Sendi' }, { value: 'rol', label: 'Rol' }, { value: 'jepit', label: 'Jepit' }];
    var schema = [
      { type: 'group', label: 'Geometri (sesuai sketsa)' },
      { type: 'number', id: 'L1', label: 'L₁ — bordes bawah', unit: 'm', value: 1.2, min: 0, step: 0.1, hint: 'Panjang datar bordes bawah (0 = tanpa bordes bawah, tumpuan langsung di kaki flight).' },
      { type: 'number', id: 'L2', label: 'L₂ — flight (proyeksi horizontal)', unit: 'm', value: 2.52, min: 0.3, step: 0.1 },
      { type: 'number', id: 'L3', label: 'L₃ — bordes atas', unit: 'm', value: 1.2, min: 0, step: 0.1, hint: '0 = tanpa bordes atas.' },
      { type: 'number', id: 'H', label: 'H — beda tinggi flight (rise)', unit: 'm', value: 1.8, min: 0.3, step: 0.05 },
      { type: 'number', id: 'R', label: 'R — tinggi injakan (riser)', unit: 'mm', value: 175, min: 100, max: 220, step: 5, hint: 'Untuk berat anak tangga & jumlah injakan; going dihitung dari L₂.' },
      { type: 'number', id: 'tw', label: 'tw — tebal pelat (waist)', unit: 'mm', value: 150, min: 100, step: 10 },
      { type: 'group', label: 'Tumpuan' },
      { type: 'select', id: 'supA', label: 'Tumpuan A (bawah)', value: 'sendi', options: supOpts },
      { type: 'select', id: 'supB', label: 'Tumpuan B (atas)', value: 'rol', options: supOpts },
      { type: 'group', label: 'Beban (belum terfaktor)' },
      { type: 'number', id: 'SDL', label: 'qD — mati tambahan (finishing)', unit: 'kN/m²', value: 1.5, min: 0, step: 0.1, hint: 'Spesi, keramik, railing. Berat sendiri pelat & anak tangga otomatis (γc 24).' },
      { type: 'number', id: 'LL', label: 'qL — beban hidup', unit: 'kN/m²', value: 3.0, min: 0, step: 0.1, hint: 'SNI 1727: hunian 1,92 · umum/komersial 4,79 kN/m².' },
      { type: 'group', label: 'Material & tulangan' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tulangan', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'cc', label: 'Selimut bersih', unit: 'mm', value: 20, min: 15, step: 5 },
      { type: 'select', id: 'db', label: 'Ø tulangan utama', value: 13, options: [10, 13, 16].map(function (dd) { return { value: dd, label: 'D' + dd }; }) }
    ];
    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); }, ID);
    state.form = form; state.results = results;

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    state.viewMode = 'sec';
    var seg = UI.el('div', 'cst-viewseg');
    var modes = [['sec', 'Model'], ['M', 'Momen'], ['V', 'Geser'], ['N', 'Aksial'], ['D', 'Lendutan']];
    var vbtns = modes.map(function (mm) {
      var bt = UI.el('button', mm[0] === state.viewMode ? 'active' : null, mm[1]);
      bt.type = 'button';
      bt.addEventListener('click', function () {
        state.viewMode = mm[0];
        vbtns.forEach(function (bb, i) { bb.classList.toggle('active', modes[i][0] === mm[0]); });
        if (state.defSlider) state.defSlider.show(mm[0] === 'D');
        if (state.cv) state.cv.redraw();
      });
      seg.appendChild(bt); return bt;
    });
    canvasHost.appendChild(seg);

    // ---- slider skala deformasi (tampil hanya di mode Lendutan) ----
    state.deformPct = 4;
    state.defSlider = UI.deformSlider(canvasHost, { value: state.deformPct, onInput: function (v) {
      state.deformPct = v; if (state.cv) state.cv.redraw();
    } });
    state.defSlider.show(state.viewMode === 'D');

    if (state.canvas2d) state.cv = state.canvas2d.create(canvasHost, drawScene);
    update(form.getValues(), results);
  }

  var CN = { sendi: 'Sendi', rol: 'Rol', jepit: 'Jepit' };

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';
    if (!r.valid) {
      state.cap.set('Model tangga');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri dan beban untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }
    if (r.unstable) {
      state.cap.set('Struktur tidak stabil');
      results.appendChild(UI.note('Struktur tidak stabil', 'Kombinasi tumpuan menghasilkan mekanisme. Pakai minimal satu tumpuan sendi/jepit + satu rol.'));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set('L ' + UI.fmt(r.Ltot, 2) + ' m · θ ' + UI.fmt(r.thetaDeg, 1) + '° · M ' + UI.fmt(Math.abs(r.Mmax), 1) + ' · N ' + UI.fmt(Math.abs(r.Nmax), 1) + ' · δ ' + UI.fmt(r.dCr, 2) + ' mm');

    results.appendChild(UI.heroRow([
      { label: 'δ retak (Ie)', value: UI.fmt(r.dCr, 2), unit: 'mm', tone: r.defOk ? 'ok' : 'bad' },
      { label: 'M+ / M−', value: UI.fmt(r.Mpos, 1) + ' / ' + UI.fmt(r.Mneg, 1), unit: 'kN·m/m' },
      { label: 'Geser D/C', value: UI.fmt(r.dcrVc, 2), unit: r.dcrVc <= 1 ? 'OK' : 'NG', tone: r.dcrVc <= 1 ? 'ok' : 'bad' }
    ]));

    results.appendChild(UI.rhead('Geometri & model rangka'));
    results.appendChild(UI.kv('Bentang L₁ / L₂ / L₃', UI.fmt(r.L1, 2) + ' / ' + UI.fmt(r.L2, 2) + ' / ' + UI.fmt(r.L3, 2) + ' m'));
    results.appendChild(UI.kv('Jumlah simpul / batang', r.nodes.length + ' / ' + r.elems.length));
    results.appendChild(UI.kv('Riser / injakan (R aktual)', r.Nrise + ' / ' + r.Ntread + ' (' + UI.fmt(r.Ract, 0) + ' mm) · going ' + UI.fmt(r.Tgo, 0) + ' mm'));
    results.appendChild(UI.kv('Sudut flight θ', UI.fmt(r.thetaDeg, 1) + '° (cos θ ' + UI.fmt(r.cosT, 3) + ')'));
    results.appendChild(UI.kv('Tumpuan A / B', CN[r.supA] + ' / ' + CN[r.supB]));
    results.appendChild(UI.kv('Beban mati flight (per panjang batang)', UI.fmt(r.wD_fl, 2) + ' kN/m · hidup ' + UI.fmt(r.wL_fl, 2)));
    if (r.wD_la != null) results.appendChild(UI.kv('Beban mati bordes', UI.fmt(r.wD_la, 2) + ' kN/m'));

    results.appendChild(UI.rhead('Gaya dalam (metode matriks kekakuan)'));
    results.appendChild(UI.kv('Reaksi A — H / V' + (r.supA === 'jepit' ? ' / M' : ''),
      UI.fmt(r.RA.Rx, 1) + ' / ' + UI.fmt(r.RA.Ry, 1) + (r.supA === 'jepit' ? ' / ' + UI.fmt(r.RA.M, 1) : '') + ' kN'));
    results.appendChild(UI.kv('Reaksi B — H / V' + (r.supB === 'jepit' ? ' / M' : ''),
      UI.fmt(r.RB.Rx, 1) + ' / ' + UI.fmt(r.RB.Ry, 1) + (r.supB === 'jepit' ? ' / ' + UI.fmt(r.RB.M, 1) : '') + ' kN'));
    results.appendChild(UI.kv('ΣV reaksi vs beban ultimit', UI.fmt(r.sumRy, 1) + ' / ' + UI.fmt(r.Wu, 1) + ' kN', Math.abs(r.sumRy - r.Wu) < 0.5 ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Momen maks M+ / M−', UI.fmt(r.Mpos, 2) + ' / ' + UI.fmt(r.Mneg, 2) + ' kN·m/m'));
    results.appendChild(UI.kv('Geser maks / Aksial maks', UI.fmt(Math.abs(r.Vmax), 2) + ' kN/m · ' + UI.fmt(Math.abs(r.Nmax), 2) + ' kN/m (' + (r.Nmax < 0 ? 'tekan' : 'tarik') + ')'));

    results.appendChild(UI.rhead('Gaya dalam per batang'));
    r.U.elems.forEach(function (ed, k) {
      var e = ed.ref, nm = e.kind === 'flight' ? 'Flight (miring)' : ('Bordes ' + (k === 0 ? 'bawah' : 'atas'));
      results.appendChild(UI.kv(nm + ' — |M|/|V|/|N|', UI.fmt(Math.abs(ed.Mmax), 2) + ' · ' + UI.fmt(Math.abs(ed.Vmax), 2) + ' · ' + UI.fmt(Math.abs(ed.Nmax), 2) + ' kN·m,kN'));
    });

    results.appendChild(UI.rhead('Penulangan (SNI 2847:2019) — d ' + UI.fmt(r.d, 0) + ' mm'));
    function rowAs(lbl, M, as) {
      if (!(M > 0.02)) { results.appendChild(UI.kv(lbl, '— (tidak perlu)')); return; }
      var tone = as.infeasible ? 'bad' : (as.tc ? 'ok' : '');
      results.appendChild(UI.kv(lbl + ' — Mu ' + UI.fmt(M, 1), 'D' + r.db + '-' + as.s + ' (As ' + UI.fmt(as.AsReq, 0) + ' mm²/m' + (as.govMin ? ', As,min' : '') + ')', tone));
    }
    rowAs('Utama bawah (M+ lapangan)', r.Mpos, r.asPos);
    rowAs('Atas (M− tumpuan/kink)', r.Mneg, r.asNeg);
    results.appendChild(UI.kv('Tulangan bagi (susut-suhu)', 'D' + r.dbDist + '-' + r.asDist.s + ' (As,min ' + UI.fmt(r.asDist.AsReq, 0) + ' mm²/m)'));
    results.appendChild(UI.kv('Geser φVc / Vu', UI.fmt(r.phiVc, 1) + ' / ' + UI.fmt(Math.abs(r.Vmax), 1) + ' kN/m', r.dcrVc <= 1 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Lendutan seketika (beban layan)'));
    results.appendChild(UI.kv('Ec / Ig', UI.fmt(r.Ec, 0) + ' MPa / ' + UI.fmt(r.ie.Ig / 1e6, 1) + '·10⁶ mm⁴/m'));
    results.appendChild(UI.kv('Mcr / Ma lapangan', UI.fmt(r.ie.Mcr, 1) + ' / ' + UI.fmt(r.MsPos, 1) + ' kN·m/m ' + (r.ie.cracked ? '→ retak' : '→ utuh')));
    results.appendChild(UI.kv('Ie / Ig', UI.fmt(100 * r.ie.Ie / r.ie.Ig, 0) + '%'));
    results.appendChild(UI.kv('δ penampang utuh (Ig)', UI.fmt(r.dUncr, 2) + ' mm'));
    results.appendChild(UI.kv('δ penampang retak (Ie)', UI.fmt(r.dCr, 2) + ' mm'));
    results.appendChild(UI.kv('Batas L/360 / L/250', UI.fmt(r.limit360, 2) + ' / ' + UI.fmt(r.limit250, 2) + ' mm', r.defOk ? 'ok' : 'bad'));

    if (r.warn.length) results.appendChild(UI.note('Peringatan', '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    results.appendChild(UI.note('Metode & asumsi',
      'Tangga dimodelkan sebagai <b>rangka bidang menerus</b> (landing–flight–landing) diselesaikan dengan <b>metode matriks kekakuan</b> (elemen aksial+lentur, ≤4 simpul × 3 DOF). Penampang beton persegi per 1 m lebar (I bruto; Ec=4700√f\'c). ' +
      'Beban flight per proyeksi horizontal diuraikan ke komponen sepanjang & tegak-lurus batang miring — sehingga <b>gaya aksial (thrust)</b> dan momen di kink terhitung otomatis. ' +
      'Gaya desain dari kombinasi ultimit; lendutan seketika dari analisis layan dengan penampang utuh (Ig) dan efektif retak (Ie Branson, Ps. 24.2.3.5) — dibanding batas L/360 & L/250 (L = bentang horizontal A–B). ' +
      'Penulangan lentur; gaya aksial pelat umumnya kecil (cek bila signifikan). Spasi tulangan kelipatan 25 mm. Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.7.1', RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) { value = '' + value; var l = label + ' ', vv = ' ' + value; var d = RW - l.length - vv.length; if (d < 2) d = 2; return ' ' + l + rep('.', d) + vv; }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }

  function figModel(r) {
    var ops = [], maxW = 230, maxH = 120, x0 = 140, y0 = 18;
    var xs = r.nodes.map(function (p) { return p[0]; }), ys = r.nodes.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var sc = Math.min(maxW / Math.max(1, maxX - minX), maxH / Math.max(1, (maxY - minY) + r.tw));
    var yBase = y0 + maxH;
    function X(xm) { return x0 + (xm - minX) * sc; }
    function Y(ym) { return yBase - (ym - minY) * sc; }
    // batang
    r.elems.forEach(function (e) { var A = r.nodes[e.ni], B = r.nodes[e.nj]; ops.push({ t: 'line', x1: X(A[0]), y1: Y(A[1]), x2: X(B[0]), y2: Y(B[1]), lw: 1.2 }); });
    // anak tangga
    var fl = r.elems.filter(function (e) { return e.kind === 'flight'; })[0];
    if (fl) {
      var A = r.nodes[fl.ni], cx = A[0], cy = A[1], pts = [[X(cx), Y(cy)]];
      for (var s = 0; s < r.Ntread; s++) { cy += r.Ract; pts.push([X(cx), Y(cy)]); cx += r.Tgo; pts.push([X(cx), Y(cy)]); }
      ops.push({ t: 'poly', pts: pts, lw: 0.7, g: 0.35 });
    }
    ops.push({ t: 'text', x: x0 + maxW / 2, y: yBase + 12, s: 'L1 ' + numR(r.L1, 2) + ' + L2 ' + numR(r.L2, 2) + ' + L3 ' + numR(r.L3, 2) + ' m ; H ' + numR(r.H, 2) + ' m', size: 6.5, align: 'c' });
    ops.push({ t: 'text', x: x0 + maxW / 2, y: yBase + 22, s: 'Gbr. 1  Model rangka tangga (theta ' + numR(r.thetaDeg, 1) + ' deg) - bawah D' + r.db + '-' + r.asPos.s, size: 7, align: 'c' });
    return { fig: { h: Math.ceil((maxH + 30) / 11.5), ops: ops, alt: 'Gbr. 1 Model rangka tangga - lihat PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW)); L.push(centerR('EDFS CIVIL TOOLS')); L.push(centerR('DESAIN TANGGA BETON - RANGKA BIDANG (MATRIX STIFFNESS)')); L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019   ' + APP_VER, dt)); L.push('');
    L.push(' INPUT'); L.push(ruleR('-'));
    L.push(rowR('L1 / L2 / L3', numR(r.L1, 2) + ' / ' + numR(r.L2, 2) + ' / ' + numR(r.L3, 2) + ' m'));
    L.push(rowR('Rise H / riser R', numR(r.H, 2) + ' m / ' + numR(r.Ract, 0) + ' mm'));
    L.push(rowR('Waist tw', numR(r.tw, 0) + ' mm'));
    L.push(rowR('Tumpuan A / B', CN[r.supA] + ' / ' + CN[r.supB]));
    L.push(rowR("f'c / fy", numR(r.fc, 0) + ' / ' + numR(r.fy, 0) + ' MPa'));
    L.push(rowR('SDL / LL', numR(r.SDL, 2) + ' / ' + numR(r.LL, 2) + ' kN/m2'));
    L.push(''); L.push(figModel(r)); L.push('');
    L.push(' GAYA DALAM (matriks kekakuan)'); L.push(ruleR('.'));
    L.push(rowR('Reaksi A H/V', numR(r.RA.Rx, 1) + ' / ' + numR(r.RA.Ry, 1) + ' kN' + (r.supA === 'jepit' ? ' M ' + numR(r.RA.M, 1) : '')));
    L.push(rowR('Reaksi B H/V', numR(r.RB.Rx, 1) + ' / ' + numR(r.RB.Ry, 1) + ' kN' + (r.supB === 'jepit' ? ' M ' + numR(r.RB.M, 1) : '')));
    L.push(rowR('M+ / M- maks', numR(r.Mpos, 2) + ' / ' + numR(r.Mneg, 2) + ' kNm/m'));
    L.push(rowR('V maks / N maks', numR(Math.abs(r.Vmax), 2) + ' / ' + numR(Math.abs(r.Nmax), 2) + ' kN/m'));
    L.push('');
    L.push(' PENULANGAN (d ' + numR(r.d, 0) + ' mm)'); L.push(ruleR('.'));
    L.push(rowR('Utama bawah (M+)', 'D' + r.db + '-' + r.asPos.s + ' | As ' + numR(r.asPos.AsReq, 0) + ' mm2/m' + (r.asPos.govMin ? ' (Asmin)' : '')));
    if (r.Mneg > 0.02) L.push(rowR('Atas (M-)', 'D' + r.db + '-' + r.asNeg.s + ' | As ' + numR(r.asNeg.AsReq, 0) + ' mm2/m'));
    L.push(rowR('Tulangan bagi', 'D' + r.dbDist + '-' + r.asDist.s + ' | Asmin ' + numR(r.asDist.AsReq, 0) + ' mm2/m'));
    L.push(rowR('Geser phiVc / Vu', numR(r.phiVc, 1) + ' / ' + numR(Math.abs(r.Vmax), 1) + ' kN/m' + (r.dcrVc <= 1 ? ' OK' : ' NG')));
    L.push('');
    L.push(' LENDUTAN SEKETIKA (layan)'); L.push(ruleR('.'));
    L.push(rowR('Ec', numR(r.Ec, 0) + ' MPa'));
    L.push(rowR('Ie/Ig', numR(100 * r.ie.Ie / r.ie.Ig, 0) + '% ' + (r.ie.cracked ? '(retak)' : '(utuh)')));
    L.push(rowR('delta utuh (Ig)', numR(r.dUncr, 2) + ' mm'));
    L.push(rowR('delta retak (Ie)', numR(r.dCr, 2) + ' mm'));
    L.push(rowR('Batas L/360', numR(r.limit360, 2) + ' mm' + (r.defOk ? ' OK' : ' NG')));
    L.push(''); L.push(' ' + rep('=', RW)); L.push(centerR('Verifikasi oleh insinyur penanggung jawab.')); L.push(' ' + rep('=', RW));
    return L;
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid || r.unstable) { UI.toast('Lengkapi input / struktur stabil dulu', 'bad'); return; }
    var lines = buildReport(r);
    var dd = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = dd.getFullYear() + p(dd.getMonth() + 1) + p(dd.getDate());
    var base = 'TanggaBeton_L' + numR(r.Ltot, 1) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ================= KONTRAK MODULE ================= */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Desain Tangga Beton', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },
    mount: function (container, runtime) { state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null }; render(container); },
    unmount: function () { if (state.cv) state.cv.destroy(); state = {}; }
  };
})();
