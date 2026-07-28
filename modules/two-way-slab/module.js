/* ============================================================
   Civil Tools — modules/two-way-slab/module.js  (Tier 2, kanvas 2D)
   PELAT DUA ARAH — METODE JALUR SILANG (Grashof–Marcus) + SNI 2847:2019
   Pelat tertumpu 4 sisi dengan kondisi penjepitan per arah.

   METODE:
   - Beban dibagi ke dua arah lewat kompatibilitas lendutan pusat (jalur silang):
       wx = w·Sy/(Sx+Sy) ; wy = w·Sx/(Sx+Sy) ;  S = k·L⁴
       k = koef. lendutan pusat: sendi-sendi 5/384, jepit-jepit 1/384,
           jepit-sendi 1/192 (I bruto sama dua arah → tereliminasi).
   - Momen jalur (per meter, sesuai kondisi ujung):
       SS : M+ = wL²/8              ; M− = 0
       FF : M+ = wL²/24             ; M− = wL²/12
       FP : M+ = 9wL²/128           ; M− = wL²/8  (ujung jepit)
     Desain pakai wu (1,2D+1,6L); lendutan pakai w layan.
   - Penulangan 2 arah tiap momen kritis, spasi kelipatan 25 mm ≤ min(2h;450).
   - Lendutan maksimum dengan MOMEN INERSIA EFEKTIF (retak) Branson
     Ps. 24.2.3.5: Ie = (Mcr/Ma)³·Ig + [1−(Mcr/Ma)³]·Icr ≤ Ig ;
     δ = k·w·L⁴/(Ec·Ie), Ec = 4700√f'c.

   Syarat: Ly/Lx ≤ 2 (di atas itu → pelat satu arah). Metode jalur silang
   bersifat pendekatan (mengabaikan puntir pelat, konservatif untuk momen
   lapangan). Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'two-way-slab';
  var GAMMA_C = 24, ES = 200000;
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  function beta1(fc) { return fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7); }
  function rhoTemp(fy) { return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014); }
  var KDEF = { ss: 5 / 384, ff: 1 / 384, fp: 1 / 192 };

  function designAsPerM(Mu, d, fc, fy, db, h) {
    var o = { Mu: Mu, As: 0, tc: true, infeasible: false, et: Infinity };
    var b = 1000, phi = 0.9;
    if (Mu > 0.005 && d > 0) {
      var Rn = Mu * 1e6 / (phi * b * d * d);
      var disc = 1 - 2 * Rn / (0.85 * fc);
      if (disc < 0) { o.infeasible = true; disc = 0; }
      var rho = (0.85 * fc / fy) * (1 - Math.sqrt(disc));
      o.As = rho * b * d;
      var a = o.As * fy / (0.85 * fc * b), c = a / beta1(fc);
      o.et = c > 0 ? 0.003 * (d - c) / c : Infinity;
      o.tc = o.et >= 0.005;
    }
    o.AsMin = rhoTemp(fy) * 1000 * h;
    o.AsReq = Math.max(o.As, o.AsMin);
    o.govMin = o.AsReq > o.As + 1e-6;
    var Ab = Math.PI / 4 * db * db;
    var sTeo = 1000 * Ab / o.AsReq;
    var sMaxAbs = Math.min(2 * h, 450);
    var s = Math.floor(sTeo / 25) * 25;
    var sMax = Math.floor(sMaxAbs / 25) * 25;
    if (s > sMax) s = sMax;
    if (s < 50) s = 50;
    o.s = s; o.sMax = sMaxAbs; o.db = db;
    o.AsProv = 1000 * Ab / s;
    return o;
  }

  // momen jalur per kondisi ujung: {Mpos, Mneg} koefisien × w × L²
  function stripMoments(cond, w, Lm) {
    var wl2 = w * Lm * Lm;
    if (cond === 'ff') return { Mpos: wl2 / 24, Mneg: wl2 / 12 };
    if (cond === 'fp') return { Mpos: 9 * wl2 / 128, Mneg: wl2 / 8 };
    return { Mpos: wl2 / 8, Mneg: 0 };
  }

  /* Icr penampang retak (transformasi) per meter, b=1000 */
  function Icr(As, d, fc) {
    var Ec = 4700 * Math.sqrt(fc), n = Math.max(1, ES / Ec), b = 1000;
    var rn = n * As / (b * d);
    var kk = Math.sqrt(rn * rn + 2 * rn) - rn;
    var kd = kk * d;
    return b * kd * kd * kd / 3 + n * As * (d - kd) * (d - kd);
  }

  function effI(Ma, Mpos, As, d, fc, h) {
    var Ig = 1000 * h * h * h / 12;
    var fr = 0.62 * Math.sqrt(fc), yt = h / 2;
    var Mcr = fr * Ig / yt / 1e6;                 // kN·m/m
    var o = { Ig: Ig, Mcr: Mcr, Ma: Ma };
    if (Ma <= Mcr || As <= 0) { o.Ie = Ig; o.Icr = Ig; o.cracked = false; return o; }
    var icr = Icr(As, d, fc);
    var ratio = Math.pow(Mcr / Ma, 3);
    o.Icr = icr;
    o.Ie = Math.min(Ig, ratio * Ig + (1 - ratio) * icr);
    o.cracked = true;
    return o;
  }

  /* ================= COMPUTE ================= */
  function compute(v) {
    var r = { warn: [], valid: false };
    var Lx = num(v.Lx), Ly = num(v.Ly), h = num(v.h);
    var fc = num(v.fc), fy = num(v.fy);
    var qDL = num(v.qDL), qLL = num(v.qLL);
    var cc = num(v.cc), db = num(v.db);
    var condX = v.condX || 'ff', condY = v.condY || 'ff';
    if (!(Lx > 0) || !(Ly > 0) || !(h > 0) || !(fc > 0) || !(fy > 0)) return r;
    if (Ly < Lx) { var t = Lx; Lx = Ly; Ly = t; t = condX; condX = condY; condY = t; }  // Lx = pendek
    r.Lx = Lx; r.Ly = Ly; r.h = h; r.fc = fc; r.fy = fy; r.cc = cc; r.db = db;
    r.condX = condX; r.condY = condY; r.qDL = qDL; r.qLL = qLL;

    r.ratio = Ly / Lx;
    if (r.ratio > 2) r.warn.push('Ly/Lx = ' + r.ratio.toFixed(2) + ' > 2 — pelat berperilaku SATU arah; gunakan tool Balok/Pelat Menerus.');

    r.qsw = GAMMA_C * h / 1000;
    r.qD = r.qsw + qDL; r.qL = qLL;
    r.wu = Math.max(1.4 * r.qD, 1.2 * r.qD + 1.6 * r.qL);
    r.gov14 = 1.4 * r.qD >= 1.2 * r.qD + 1.6 * r.qL;
    r.wSvc = r.qD + r.qL;

    // pembagian beban (jalur silang) — I bruto sama → pakai k·L⁴
    var kx = KDEF[condX], ky = KDEF[condY];
    var Sx = kx * Math.pow(Lx, 4), Sy = ky * Math.pow(Ly, 4);
    r.wux = r.wu * Sy / (Sx + Sy);       // ke jalur arah-x (bentang Lx)
    r.wuy = r.wu * Sx / (Sx + Sy);
    r.wsx = r.wSvc * Sy / (Sx + Sy);
    r.wsy = r.wSvc * Sx / (Sx + Sy);
    r.shareX = 100 * Sy / (Sx + Sy);

    // momen jalur (ultimit)
    r.mX = stripMoments(condX, r.wux, Lx);
    r.mY = stripMoments(condY, r.wuy, Ly);
    // momen layan lapangan (untuk Ma lendutan)
    r.mXs = stripMoments(condX, r.wsx, Lx);
    r.mYs = stripMoments(condY, r.wsy, Ly);

    // tinggi efektif: arah-x (bentang pendek) lapis luar → d lebih besar
    var dx = h - cc - db / 2;
    var dy = h - cc - 1.5 * db;
    r.dx = dx; r.dy = dy;
    if (!(dx > 0) || !(dy > 0)) { r.warn.push('Tinggi efektif ≤ 0 — pertebal pelat / kurangi selimut.'); r.valid = true; return r; }

    // penulangan — jalur TENGAH (momen penuh) & jalur TEPI/kolom (M/3)
    // distribusi lebar ACI 314R-16 Ps. 7.9.2: separuh tengah lebar = M penuh,
    // dua seperempat tepi = M/3 (lihat Gbr. 7.9.2b/c).
    r.asXpos = designAsPerM(r.mX.Mpos, dx, fc, fy, db, h);
    r.asXneg = designAsPerM(r.mX.Mneg, dx, fc, fy, db, h);
    r.asYpos = designAsPerM(r.mY.Mpos, dy, fc, fy, db, h);
    r.asYneg = designAsPerM(r.mY.Mneg, dy, fc, fy, db, h);
    r.asXposC = designAsPerM(r.mX.Mpos / 3, dx, fc, fy, db, h);
    r.asXnegC = designAsPerM(r.mX.Mneg / 3, dx, fc, fy, db, h);
    r.asYposC = designAsPerM(r.mY.Mpos / 3, dy, fc, fy, db, h);
    r.asYnegC = designAsPerM(r.mY.Mneg / 3, dy, fc, fy, db, h);
    r.anyInfeasible = [r.asXpos, r.asXneg, r.asYpos, r.asYneg].some(function (a) { return a.infeasible; });

    // lendutan dengan Ie (retak) — jalur lapangan tiap arah
    r.Ec = 4700 * Math.sqrt(fc);
    r.ieX = effI(r.mXs.Mpos, r.mXs.Mpos, r.asXpos.AsProv, dx, fc, h);
    r.ieY = effI(r.mYs.Mpos, r.mYs.Mpos, r.asYpos.AsProv, dy, fc, h);
    // δ = k·w·L⁴/(Ec·Ie) ; w kN/m² · 1m = N/mm, L mm, Ec MPa, Ie mm⁴ → mm
    r.dX = kx * r.wsx * Math.pow(Lx * 1000, 4) / (r.Ec * r.ieX.Ie);
    r.dY = ky * r.wsy * Math.pow(Ly * 1000, 4) / (r.Ec * r.ieY.Ie);
    r.dMax = Math.max(r.dX, r.dY);
    r.dGovArah = r.dX >= r.dY ? 'x (pendek)' : 'y (panjang)';
    r.limit240 = Lx * 1000 / 240;
    r.limit360 = Lx * 1000 / 360;

    r.valid = true;
    return r;
  }

  /* ================= KANVAS ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // geometri denah: panel Lx (horizontal) × Ly (vertikal), tengah kanvas
  function planGeom(w, h, r, padTop, padBot) {
    var padX = 64;
    var sc = Math.min((w - 2 * padX) / r.Lx, (h - padTop - padBot) / r.Ly);
    var Lp = r.Lx * sc, Bp = r.Ly * sc;
    return { sc: sc, Lp: Lp, Bp: Bp, x0: (w - Lp) / 2, y0: padTop + (h - padTop - padBot - Bp) / 2 };
  }
  // momen bertanda sepanjang bentang (t 0..1): + lapangan (sagging), − tumpuan (hogging)
  function bmdSigned(t, cond, Mpos, Mneg) {
    var Ml = (cond === 'ss') ? 0 : Mneg, Mr = (cond === 'ff') ? Mneg : 0;
    var yL = -Ml, yR = -Mr, yM = Mpos;
    var A = yL, B = 4 * yM - 3 * yL - yR, C = 2 * yL + 2 * yR - 4 * yM;
    return A + B * t + C * t * t;
  }
  // distribusi selebar (ACI 314R 7.9.2): separuh tengah = penuh, dua seperempat tepi = 1/3
  function bandFactor(u) { return (u >= 0.25 && u <= 0.75) ? 1 : (1 / 3); }
  function momColor(v, vmax) {
    var t = vmax > 1e-9 ? v / vmax : 0; t = Math.max(-1, Math.min(1, t));
    return (t >= 0) ? 'rgba(242,143,59,' + (0.10 + 0.60 * t).toFixed(3) + ')'
                    : 'rgba(53,120,240,' + (0.10 + 0.60 * (-t)).toFixed(3) + ')';
  }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint'); ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('Masukkan dimensi & beban untuk melihat pelat.', w / 2, h / 2); return;
    }
    if (state.viewMode === 'mx') drawMomentPlan(ctx, w, h, r, 'x');
    else if (state.viewMode === 'my') drawMomentPlan(ctx, w, h, r, 'y');
    else drawRebarPlan(ctx, w, h, r);
  }

  /* ---------- Denah informasi tulangan (jalur tengah & tepi) ---------- */
  function drawRebarPlan(ctx, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), sky = css('--sky') || '#30bced', line = css('--line');
    var g = planGeom(w, h, r, 30, 66), x0 = g.x0, y0 = g.y0, Lp = g.Lp, Bp = g.Bp;

    ctx.fillStyle = 'rgba(120,140,90,0.05)'; ctx.fillRect(x0, y0, Lp, Bp);

    // batang representatif (rapat di jalur tengah, jarang di jalur tepi)
    function bandLines(horiz, sMid, sCol, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
      [[0, 0.25, sCol], [0.25, 0.75, sMid], [0.75, 1, sCol]].forEach(function (bd) {
        var lenM = (horiz ? r.Ly : r.Lx) * (bd[1] - bd[0]);
        var n = Math.min(70, Math.max(1, Math.floor(lenM / (bd[2] / 1000))));
        for (var i = 1; i <= n; i++) {
          var f = bd[0] + (i - 0.5) / n * (bd[1] - bd[0]);
          ctx.beginPath();
          if (horiz) { ctx.moveTo(x0 + 3, y0 + f * Bp); ctx.lineTo(x0 + Lp - 3, y0 + f * Bp); }
          else { ctx.moveTo(x0 + f * Lp, y0 + 3); ctx.lineTo(x0 + f * Lp, y0 + Bp - 3); }
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
    }
    bandLines(true, r.asXpos.s, r.asXposC.s, amber);   // arah x = garis horizontal
    bandLines(false, r.asYpos.s, r.asYposC.s, sky);    // arah y = garis vertikal

    // batas jalur tengah/tepi (ℓ/4)
    ctx.strokeStyle = faint; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    [0.25, 0.75].forEach(function (f) {
      ctx.beginPath(); ctx.moveTo(x0, y0 + f * Bp); ctx.lineTo(x0 + Lp, y0 + f * Bp); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + f * Lp, y0); ctx.lineTo(x0 + f * Lp, y0 + Bp); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, Lp, Bp);

    // dimensi
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('Lx ' + r.Lx.toFixed(2) + ' m (ℓ/4 · ℓ/2 · ℓ/4)', x0 + Lp / 2, y0 + Bp + 14);
    ctx.save(); ctx.translate(x0 - 16, y0 + Bp / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Ly ' + r.Ly.toFixed(2) + ' m', 0, 0); ctx.restore();

    // legenda tulangan
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = amber;
    ctx.fillText('Arah x  tengah D' + r.db + '-' + r.asXpos.s + '  ·  tepi D' + r.db + '-' + r.asXposC.s, x0 + Lp / 2, y0 + Bp + 32);
    ctx.fillStyle = sky;
    ctx.fillText('Arah y  tengah D' + r.db + '-' + r.asYpos.s + '  ·  tepi D' + r.db + '-' + r.asYposC.s, x0 + Lp / 2, y0 + Bp + 46);
    ctx.fillStyle = faint; ctx.textAlign = 'center'; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('Denah tulangan — jalur tengah (rapat) & tepi (M/3)', w / 2, 18);
  }

  /* ---------- Denah diagram momen Mx / My (variasi sepanjang bentang & selebar) ---------- */
  function drawMomentPlan(ctx, w, h, r, dir) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var accent = dir === 'x' ? css('--amber') : (css('--sky') || '#30bced');
    var cond = dir === 'x' ? r.condX : r.condY;
    var Mpos = dir === 'x' ? r.mX.Mpos : r.mY.Mpos;
    var Mneg = dir === 'x' ? r.mX.Mneg : r.mY.Mneg;
    var vmax = Math.max(Mpos, Mneg, 1e-6);
    var g = planGeom(w, h, r, 30, 60), x0 = g.x0, y0 = g.y0, Lp = g.Lp, Bp = g.Bp;

    // heatmap M(x,y)
    var NX = 50, NY = 50, cw = Lp / NX, ch = Bp / NY;
    for (var i = 0; i < NX; i++) for (var j = 0; j < NY; j++) {
      var ux = (i + 0.5) / NX, uy = (j + 0.5) / NY;
      var tSpan = dir === 'x' ? ux : uy;     // fraksi sepanjang bentang
      var uBand = dir === 'x' ? uy : ux;     // fraksi sepanjang lebar
      var v = bmdSigned(tSpan, cond, Mpos, Mneg) * bandFactor(uBand);
      ctx.fillStyle = momColor(v, vmax);
      ctx.fillRect(x0 + i * cw, y0 + j * ch, cw + 0.7, ch + 0.7);
    }
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, Lp, Bp);

    // batas jalur tepi/tengah (selebar) — ℓ/4
    ctx.strokeStyle = faint; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    [0.25, 0.75].forEach(function (f) {
      if (dir === 'x') { ctx.beginPath(); ctx.moveTo(x0, y0 + f * Bp); ctx.lineTo(x0 + Lp, y0 + f * Bp); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x0 + f * Lp, y0); ctx.lineTo(x0 + f * Lp, y0 + Bp); ctx.stroke(); }
    });
    ctx.setLineDash([]);

    // label nilai momen (penuh di tengah, /3 di tepi)
    ctx.font = '9px "JetBrains Mono", monospace';
    function lab(px, py, s, col) { ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(s, px, py); }
    // koordinat span-tengah & tepi-tumpuan pada bidang denah
    var midSpanX = dir === 'x' ? x0 + Lp / 2 : x0 + Lp * 0.5;
    var midSpanY = dir === 'x' ? y0 + Bp * 0.5 : y0 + Bp * 0.5;
    var edgeMidX = dir === 'x' ? x0 + Lp / 2 : x0 + Lp * 0.125;
    var edgeMidY = dir === 'x' ? y0 + Bp * 0.125 : y0 + Bp * 0.5;
    // lapangan (M+)
    lab(midSpanX, midSpanY + 3, 'M+ ' + Mpos.toFixed(1), accent);
    lab(edgeMidX, edgeMidY + 3, '+' + (Mpos / 3).toFixed(1), accent);
    // tumpuan (M−) pada satu ujung bentang bila ada
    if (Mneg > 0.005) {
      var supX = dir === 'x' ? x0 + Lp * 0.5 : x0 + Lp * 0.5;
      var supPos = dir === 'x' ? { x: x0 + 30, y: y0 + Bp * 0.5 } : { x: x0 + Lp * 0.5, y: y0 + 16 };
      var supEdge = dir === 'x' ? { x: x0 + 30, y: y0 + Bp * 0.125 } : { x: x0 + Lp * 0.125, y: y0 + 16 };
      lab(supPos.x, supPos.y - 6, 'M- ' + Mneg.toFixed(1), '#3573f2');
      lab(supEdge.x, supEdge.y - 6, '-' + (Mneg / 3).toFixed(1), '#3573f2');
    }

    // dimensi
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    var spanLbl = dir === 'x' ? 'ℓa=Lx ' + r.Lx.toFixed(2) : 'Lx ' + r.Lx.toFixed(2);
    ctx.fillText(spanLbl + ' m', x0 + Lp / 2, y0 + Bp + 14);
    ctx.save(); ctx.translate(x0 - 16, y0 + Bp / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText((dir === 'x' ? 'ℓb=Ly ' : 'Ly ') + r.Ly.toFixed(2) + ' m', 0, 0); ctx.restore();

    // legenda warna
    ctx.textAlign = 'left'; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#3573f2'; ctx.fillRect(x0, y0 + Bp + 26, 12, 8);
    ctx.fillStyle = dim; ctx.fillText('M− tumpuan (hogging)', x0 + 16, y0 + Bp + 33);
    ctx.fillStyle = accent; ctx.fillRect(x0 + 170, y0 + Bp + 26, 12, 8);
    ctx.fillStyle = dim; ctx.fillText('M+ lapangan (sagging) · tengah=penuh, tepi=⅓', x0 + 186, y0 + Bp + 33);

    // judul
    ctx.fillStyle = faint; ctx.textAlign = 'center'; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('Denah momen M' + dir + ' — variasi sepanjang bentang & selebar (ACI 314R Gbr. 7.9.2' + (dir === 'x' ? 'b' : 'c') + ')', w / 2, 18);

    // hover: nilai M di kursor
    if (state.mouse) {
      var mx = state.mouse.x, my = state.mouse.y;
      if (mx > x0 && mx < x0 + Lp && my > y0 && my < y0 + Bp) {
        var fx = (mx - x0) / Lp, fy = (my - y0) / Bp;
        var tS = dir === 'x' ? fx : fy, uB = dir === 'x' ? fy : fx;
        var vv = bmdSigned(tS, cond, Mpos, Mneg) * bandFactor(uB);
        state.UI.canvasTip(ctx, { mx: mx, my: my, w: w, h: h, text: 'M' + dir + ' ' + vv.toFixed(1) + ' kN·m/m' });
      }
    }
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('tws-style')) return;
    var s = document.createElement('style'); s.id = 'tws-style';
    s.textContent =
      '.tws-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.tws-canvas{position:relative;flex:1 1 50%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.tws-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}' +
      '.tws-viewseg{position:absolute;right:12px;top:10px;display:flex;z-index:4;border:1px solid var(--line);border-radius:8px;overflow:hidden}' +
      '.tws-viewseg button{background:var(--panel);color:var(--ink-dim);border:0;padding:5px 12px;font:600 12px "Space Grotesk",sans-serif;cursor:pointer}' +
      '.tws-viewseg button.active{background:var(--amber);color:var(--bg)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');
    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Pelat Dua Arah'));
    panel.appendChild(UI.el('div', 'sub', 'Penulangan 2 arah metode jalur silang + lendutan dengan momen inersia efektif (retak) — SNI 2847:2019.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'tws-work');
    var canvasHost = UI.el('div', 'tws-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Denah pelat');
    var results = UI.el('div', 'tws-res');
    work.appendChild(canvasHost); work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var condOpts = [{ value: 'ss', label: 'Sendi–Sendi' }, { value: 'ff', label: 'Jepit–Jepit' }, { value: 'fp', label: 'Jepit–Sendi' }];
    var schema = [
      { type: 'group', label: 'Geometri' },
      { type: 'number', id: 'Lx', label: 'Lx — bentang pendek', unit: 'm', value: 4, min: 1, step: 0.1 },
      { type: 'number', id: 'Ly', label: 'Ly — bentang panjang', unit: 'm', value: 5, min: 1, step: 0.1 },
      { type: 'number', id: 'h', label: 'h — tebal pelat', unit: 'mm', value: 140, min: 80, step: 10 },
      { type: 'group', label: 'Kondisi penjepitan' },
      { type: 'select', id: 'condX', label: 'Tumpuan arah Lx (pendek)', value: 'ff', options: condOpts },
      { type: 'select', id: 'condY', label: 'Tumpuan arah Ly (panjang)', value: 'ff', options: condOpts },
      { type: 'group', label: 'Beban (belum terfaktor)' },
      { type: 'number', id: 'qDL', label: 'qD — mati tambahan (SDL)', unit: 'kN/m²', value: 1.2, min: 0, step: 0.1, hint: 'Berat sendiri pelat dihitung otomatis (γc 24).' },
      { type: 'number', id: 'qLL', label: 'qL — beban hidup', unit: 'kN/m²', value: 2.5, min: 0, step: 0.1 },
      { type: 'group', label: 'Material & tulangan' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tulangan', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'cc', label: 'Selimut bersih', unit: 'mm', value: 20, min: 15, step: 5 },
      { type: 'select', id: 'db', label: 'Ø tulangan', value: 10, options: [8, 10, 13, 16].map(function (d) { return { value: d, label: 'D' + d }; }) }
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

    // toggle denah: Rebar / Mx / My (tampak atas, ala ACI 314R Gbr. 7.9.2)
    state.viewMode = 'rebar';
    var seg = UI.el('div', 'tws-viewseg');
    var modes = [['rebar', 'Rebar'], ['mx', 'Mx'], ['my', 'My']];
    var vbtns = modes.map(function (m) {
      var b = UI.el('button', m[0] === state.viewMode ? 'active' : null, m[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.viewMode = m[0];
        vbtns.forEach(function (bb, i) { bb.classList.toggle('active', modes[i][0] === m[0]); });
        if (state.cv) state.cv.redraw();
      });
      seg.appendChild(b); return b;
    });
    canvasHost.appendChild(seg);

    if (state.canvas2d) {
      state.cv = state.canvas2d.create(canvasHost, drawScene);
      state.onMove = function (e) {
        var rect = state.cv.canvas.getBoundingClientRect();
        state.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }; state.cv.redraw();
      };
      state.onLeave = function () { state.mouse = null; state.cv.redraw(); };
      state.cv.canvas.addEventListener('mousemove', state.onMove);
      state.cv.canvas.addEventListener('mouseleave', state.onLeave);
    }
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';
    if (!r.valid) {
      state.cap.set('Denah pelat');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri dan beban untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set('Ly/Lx ' + UI.fmt(r.ratio, 2) + ' · wu ' + UI.fmt(r.wu, 1) + ' kN/m² · δ ' + UI.fmt(r.dMax, 2) + ' mm');

    results.appendChild(UI.heroRow([
      { label: 'δ maksimum (Ie retak)', value: UI.fmt(r.dMax, 2), unit: 'mm', tone: r.dMax <= r.limit240 ? 'ok' : 'bad' },
      { label: 'wu terfaktor', value: UI.fmt(r.wu, 2), unit: 'kN/m²' },
      { label: 'Ly / Lx', value: UI.fmt(r.ratio, 2), unit: r.ratio <= 2 ? '2-arah' : '1-arah', tone: r.ratio <= 2 ? 'ok' : 'bad' }
    ]));

    results.appendChild(UI.rhead('Beban & pembagian jalur'));
    results.appendChild(UI.kv('Berat sendiri (γc 24)', UI.fmt(r.qsw, 2) + ' kN/m²'));
    results.appendChild(UI.kv('qD total / qL', UI.fmt(r.qD, 2) + ' / ' + UI.fmt(r.qL, 2) + ' kN/m²'));
    results.appendChild(UI.kv('wu = ' + (r.gov14 ? '1,4D' : '1,2D+1,6L'), UI.fmt(r.wu, 2) + ' kN/m²'));
    results.appendChild(UI.kv('Pembagian beban arah x / y', UI.fmt(r.shareX, 0) + '% / ' + UI.fmt(100 - r.shareX, 0) + '%'));

    results.appendChild(UI.rhead('Momen jalur (per meter) & tulangan — jalur tengah / tepi (ACI 314R 7.9.2)'));
    function rowAs(lbl, M, as, asC) {
      if (!(M > 0.005)) { results.appendChild(UI.kv(lbl, '— (tumpuan sederhana)')); return; }
      var tone = as.infeasible ? 'bad' : (as.tc ? 'ok' : '');
      results.appendChild(UI.kv(lbl + ' — Mu ' + UI.fmt(M, 1) + ' kN·m/m',
        'tengah D' + r.db + '-' + as.s + ' · tepi D' + r.db + '-' + asC.s +
        (as.govMin ? ' (As,min)' : ''), tone));
    }
    rowAs('M+ lapangan arah x (d ' + UI.fmt(r.dx, 0) + ')', r.mX.Mpos, r.asXpos, r.asXposC);
    rowAs('M− tumpuan arah x', r.mX.Mneg, r.asXneg, r.asXnegC);
    rowAs('M+ lapangan arah y (d ' + UI.fmt(r.dy, 0) + ')', r.mY.Mpos, r.asYpos, r.asYposC);
    rowAs('M− tumpuan arah y', r.mY.Mneg, r.asYneg, r.asYnegC);
    results.appendChild(UI.kv('As,min susut-suhu / spasi maks', UI.fmt(r.asXpos.AsMin, 0) + ' mm²/m · ' + UI.fmt(r.asXpos.sMax, 0) + ' mm'));
    results.appendChild(UI.kv('Jalur tengah = lebar ℓ/2 (M penuh) · tepi = 2×ℓ/4 (M/3)', 'lihat denah Rebar / Mx / My'));

    results.appendChild(UI.rhead('Lendutan seketika — momen inersia efektif (Ps. 24.2.3.5)'));
    results.appendChild(UI.kv('Ec / Ig', UI.fmt(r.Ec, 0) + ' MPa / ' + UI.fmt(r.ieX.Ig / 1e6, 1) + '·10⁶ mm⁴/m'));
    results.appendChild(UI.kv('Mcr (retak) arah x', UI.fmt(r.ieX.Mcr, 1) + ' kN·m/m · Ma ' + UI.fmt(r.ieX.Ma, 1) + (r.ieX.cracked ? ' → retak' : ' → utuh')));
    results.appendChild(UI.kv('Ie / Ig arah x', UI.fmt(100 * r.ieX.Ie / r.ieX.Ig, 0) + '%'));
    results.appendChild(UI.kv('δ arah x / y', UI.fmt(r.dX, 2) + ' / ' + UI.fmt(r.dY, 2) + ' mm'));
    results.appendChild(UI.kv('δ maksimum (arah ' + r.dGovArah + ')', UI.fmt(r.dMax, 2) + ' mm'));
    results.appendChild(UI.kv('Batas L/240 / L/360', UI.fmt(r.limit240, 2) + ' / ' + UI.fmt(r.limit360, 2) + ' mm',
      r.dMax <= r.limit240 ? 'ok' : 'bad'));

    if (r.warn.length) results.appendChild(UI.note('Peringatan',
      '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    results.appendChild(UI.note('Metode & asumsi',
      'Jalur silang (Grashof–Marcus): beban dibagi dua arah lewat kompatibilitas lendutan pusat, momen jalur per kondisi ujung. ' +
      'Distribusi momen selebar penampang kritis mengikuti ACI 314R-16 Ps. 7.9.2 (Gbr. 7.9.2b/c): momen penuh pada jalur tengah selebar ℓ/2, ' +
      'direduksi menjadi M/3 pada dua jalur tepi selebar ℓ/4 — lihat toggle denah <b>Rebar / Mx / My</b>. ' +
      'Pendekatan mengabaikan puntir pelat (konservatif untuk momen lapangan). Lendutan seketika memakai Ie retak (Branson); ' +
      'kalikan faktor λΔ untuk lendutan jangka panjang (rangkak-susut, Ps. 24.2.4). Spasi tulangan kelipatan 25 mm ≤ min(2h; 450). ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.6.0', RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', vv = ' ' + value;
    var d = RW - l.length - vv.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + vv;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  var CN = { ss: 'Sendi-Sendi', ff: 'Jepit-Jepit', fp: 'Jepit-Sendi' };

  function figPlan(r) {
    var ops = [];
    var maxW = 190, x0 = 160, y0 = 26;
    var sc = Math.min(maxW / r.Lx, 130 / r.Ly);
    var Lp = r.Lx * sc, Bp = r.Ly * sc;
    ops.push({ t: 'rect', x: x0, y: y0, w: Lp, h: Bp, lw: 1.3 });
    function hatch(x1, y1, x2, y2) {
      var n = 10, dx = (x2 - x1) / n, dy = (y2 - y1) / n, len = 6;
      var nx = (y2 - y1), ny = -(x2 - x1), nl = Math.hypot(nx, ny) || 1; nx = nx / nl * len; ny = ny / nl * len;
      for (var i = 0; i <= n; i++) ops.push({ t: 'line', x1: x1 + dx * i, y1: y1 + dy * i, x2: x1 + dx * i - nx, y2: y1 + dy * i - ny, lw: 0.5, g: 0.4 });
    }
    if (r.condX === 'ff' || r.condX === 'fp') hatch(x0, y0, x0, y0 + Bp);
    if (r.condX === 'ff') hatch(x0 + Lp, y0, x0 + Lp, y0 + Bp);
    if (r.condY === 'ff' || r.condY === 'fp') hatch(x0, y0, x0 + Lp, y0);
    if (r.condY === 'ff') hatch(x0, y0 + Bp, x0 + Lp, y0 + Bp);
    // batas jalur tengah/tepi (l/4) — ACI 314R 7.9.2
    [0.25, 0.75].forEach(function (f) {
      ops.push({ t: 'line', x1: x0, y1: y0 + f * Bp, x2: x0 + Lp, y2: y0 + f * Bp, lw: 0.4, g: 0.55, dash: [3, 2] });
      ops.push({ t: 'line', x1: x0 + f * Lp, y1: y0, x2: x0 + f * Lp, y2: y0 + Bp, lw: 0.4, g: 0.55, dash: [3, 2] });
    });
    ops.push({ t: 'text', x: x0 + Lp / 2, y: y0 + Bp + 12, s: 'Lx=' + numR(r.Lx, 2) + 'm (l/4 . l/2 . l/4)', size: 6.5, align: 'c' });
    ops.push({ t: 'text', x: x0 - 6, y: y0 + Bp / 2, s: 'Ly=' + numR(r.Ly, 2) + 'm', size: 6.5, align: 'r' });
    ops.push({ t: 'text', x: x0 + Lp / 2, y: y0 + Bp / 2 - 3, s: 'x tengah D' + r.db + '-' + r.asXpos.s + ' tepi -' + r.asXposC.s, size: 5.5, align: 'c' });
    ops.push({ t: 'text', x: x0 + Lp / 2, y: y0 + Bp / 2 + 6, s: 'y tengah D' + r.db + '-' + r.asYpos.s + ' tepi -' + r.asYposC.s, size: 5.5, align: 'c' });
    ops.push({ t: 'text', x: 264, y: y0 + Bp + 26, s: 'Gbr. 1  Denah pelat 2 arah (jalur tengah/tepi) - dmaks ' + numR(r.dMax, 2) + ' mm', size: 7, align: 'c' });
    return { fig: { h: Math.ceil((Bp + 42) / 11.5), ops: ops, alt: 'Gbr. 1 Denah pelat 2 arah - lihat versi PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('PELAT DUA ARAH - JALUR SILANG'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019   ' + APP_VER, dt));
    L.push('');
    L.push(' INPUT'); L.push(ruleR('-'));
    L.push(rowR('Lx x Ly', numR(r.Lx, 2) + ' x ' + numR(r.Ly, 2) + ' m (Ly/Lx ' + numR(r.ratio, 2) + ')'));
    L.push(rowR('Tebal h', numR(r.h, 0) + ' mm'));
    L.push(rowR('Tumpuan arah Lx / Ly', CN[r.condX] + ' / ' + CN[r.condY]));
    L.push(rowR("f'c / fy", numR(r.fc, 0) + ' / ' + numR(r.fy, 0) + ' MPa'));
    L.push(rowR('qD / qL', numR(r.qD, 2) + ' / ' + numR(r.qL, 2) + ' kN/m2'));
    L.push(rowR('Selimut / D', numR(r.cc, 0) + ' mm / D' + r.db));
    L.push('');
    L.push(figPlan(r));
    L.push('');
    L.push(' BEBAN & PEMBAGIAN'); L.push(ruleR('.'));
    L.push(rowR('wu (' + (r.gov14 ? '1.4D' : '1.2D+1.6L') + ')', numR(r.wu, 2) + ' kN/m2'));
    L.push(rowR('Bagi arah x / y', numR(r.shareX, 0) + '% / ' + numR(100 - r.shareX, 0) + '%'));
    L.push('');
    L.push(' MOMEN & TULANGAN (per meter) - ACI 314R 7.9.2'); L.push(ruleR('.'));
    L.push(' jalur tengah = lebar l/2 (M penuh); jalur tepi = 2x l/4 (M/3)');
    function rl(lbl, M, as, asC) {
      if (!(M > 0.005)) { L.push(rowR(lbl, '- (sederhana)')); return; }
      L.push(rowR(lbl, numR(M, 1) + ' kNm/m'));
      L.push(rowR('  >> tengah D' + r.db + '-' + as.s + ' | tepi D' + r.db + '-' + asC.s,
        'As ' + numR(as.AsReq, 0) + ' mm2/m' + (as.govMin ? ' (Asmin)' : '')));
    }
    rl('M+ lapangan x', r.mX.Mpos, r.asXpos, r.asXposC);
    rl('M- tumpuan x', r.mX.Mneg, r.asXneg, r.asXnegC);
    rl('M+ lapangan y', r.mY.Mpos, r.asYpos, r.asYposC);
    rl('M- tumpuan y', r.mY.Mneg, r.asYneg, r.asYnegC);
    L.push('');
    L.push(' LENDUTAN (Ie retak, Branson)'); L.push(ruleR('.'));
    L.push(rowR('Ec', numR(r.Ec, 0) + ' MPa'));
    L.push(rowR('Ie/Ig arah x', numR(100 * r.ieX.Ie / r.ieX.Ig, 0) + '% ' + (r.ieX.cracked ? '(retak)' : '(utuh)')));
    L.push(rowR('delta x / y', numR(r.dX, 2) + ' / ' + numR(r.dY, 2) + ' mm'));
    L.push(rowR('delta maks', numR(r.dMax, 2) + ' mm'));
    L.push(rowR('Batas L/240', numR(r.limit240, 2) + ' mm' + (r.dMax <= r.limit240 ? ' OK' : ' NG')));
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
    var lines = buildReport(r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'PelatDuaArah_' + numR(r.Lx, 1) + 'x' + numR(r.Ly, 1) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ================= KONTRAK MODULE ================= */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Pelat Dua Arah', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },
    mount: function (container, runtime) { state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null }; render(container); },
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
