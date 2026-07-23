/* ============================================================
   Civil Tools — modules/base-plate/module.js  (Tier 2, kanvas 2D)
   Desain Base Plate & Anchor Rod — sistem tumpuan kolom baja.
   Referensi utama: AISC Design Guide 1 — Base Plate and Anchor Rod
   Design (2nd Ed.), diselaraskan dengan AISC 360-22 & ACI 318-19.

   Cakupan (satu sistem, LRFD/DFBK):
   - Tumpu beton (AISC 360-22 Ps. J8 / ACI 318-19 Ps. 22.8):
       Pp = 0,85·f'c·A1·√(A2/A1),  √(A2/A1) ≤ 2,  φc = 0,65
       fp(max) = φc·0,85·f'c·√(A2/A1)
   - Eksentrisitas e = Mu/Pu → 3 rezim (Drake & Elkin 1999):
       Konsentrik (Mu=0) · Momen kecil (e ≤ ecrit) · Momen besar (e > ecrit)
       ecrit = N/2 − Pu/(2·qmax),  qmax = fp(max)·B
   - Panjang tumpu Y & gaya tarik angkur T:
       kecil : Y = N − 2e,  fp = Pu/(B·Y),  T = 0
       besar : Y = (f+N/2) − √[(f+N/2)² − 2Pu(e+f)/qmax],  T = qmax·Y − Pu
   - Tebal pelat (leleh lentur, φb = 0,90), garis leleh kantilever:
       m = (N−0,95d)/2, n = (B−0,80bf)/2 (W); HSS persegi 0,95·sisi; bulat 0,80·D
       λn' = λ·√(d·bf)/4 (hanya konsentrik)
       tp,req = √(4·Mpl/(φb·Fy)),  Mpl per satuan lebar (sisi tumpu & sisi tarik)
   - Baja angkur tarik (AISC 360-22 Ps. J3): φRn = φ·Fnt·Ab, Fnt = 0,75·Fu, φ=0,75
   - Geser dasar: gesekan μ·Pu (μ=0,55 grout / 0,70 beton) ≤ 0,2·f'c·A1

   TIDAK termasuk (pakai tool lain / verifikasi terpisah):
   - Kuat cabut/breakout/pryout BETON angkur → gunakan tool "Anchor Bolt Group"
     (ACI 318-19 Ch.17) dengan T hasil tool ini sebagai demand tarik.
   - Desain shear lug detail, prying action, las pelat-kolom, angkur pos-pasang,
     confinement geser, distribusi tegangan tumpu segitiga (Lampiran B DG1).
   Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'base-plate';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  /* ---------- mutu angkur ASTM F1554 (MPa) ---------- */
  var MAT = {
    g36:  { label: 'F1554 Gr.36',  Fu: 400, Fy: 248 },
    g55:  { label: 'F1554 Gr.55',  Fu: 517, Fy: 380 },
    g105: { label: 'F1554 Gr.105', Fu: 862, Fy: 724 },
    custom: { label: 'Kustom', Fu: 400, Fy: 248 }
  };

  var PHI_C = 0.65;   // tumpu beton (ACI 318-19 / AISC J8)
  var PHI_B = 0.90;   // leleh lentur pelat
  var PHI_T = 0.75;   // tarik baut/angkur (AISC J3)
  var PHI_V = 0.75;   // geser-friksi (ACI)

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };

    // -- kolom --
    var colType = v.colType || 'w';                 // 'w' | 'hssr' | 'hssc'
    var d = num(v.d), bf = num(v.bf), tf = num(v.tf);
    if (colType === 'hssc') bf = d;                 // bulat: lebar = diameter

    // -- pelat --
    var N = num(v.N), B = num(v.B), Fy = num(v.Fy), tp = num(v.tp);

    // -- beton --
    var fc = num(v.fc);
    var a2a1 = Math.max(1, num(v.a2a1));

    // -- beban terfaktor --
    var Pu = num(v.Pu);                              // kN (tekan +)
    var Mu = Math.abs(num(v.Mu));                    // kN·m
    var Pu_N = Pu * 1000, Mu_Nmm = Mu * 1e6;

    // -- angkur --
    var mat = v.mat || 'g36'; var M = MAT[mat];
    var Fu = (mat === 'custom') ? num(v.Fu) : M.Fu;
    var db = num(v.db), nT = Math.max(1, Math.round(num(v.nT)));
    var aEdge = num(v.aEdge);                        // jarak tepi pelat → sumbu angkur (mm)

    // -- geser --
    var Vu = num(v.Vu); var surf = v.surf || 'grout';

    r.colType = colType; r.d = d; r.bf = bf; r.tf = tf;
    r.N = N; r.B = B; r.Fy = Fy; r.tp = tp;
    r.fc = fc; r.a2a1 = a2a1; r.Pu = Pu; r.Mu = Mu;
    r.mat = mat; r.matLabel = M.label; r.Fu = Fu; r.db = db; r.nT = nT; r.aEdge = aEdge;
    r.Vu = Vu; r.surf = surf;

    if (N <= 0 || B <= 0 || fc <= 0 || Fy <= 0) { r.warn.push('Lengkapi dimensi pelat, f\'c, dan Fy.'); return r; }

    // -- tumpu beton --
    var sqrtR = Math.min(Math.sqrt(a2a1), 2);
    var A1 = B * N;                                  // mm²
    var fpMax = PHI_C * 0.85 * fc * sqrtR;           // MPa (sudah × φc)
    var phiPp = fpMax * A1 / 1000;                   // kN (φc·Pp)
    var A1req = fpMax > 0 ? Pu_N / fpMax : 0;        // mm² (konsentrik)
    r.sqrtR = sqrtR; r.A1 = A1; r.fpMax = fpMax; r.phiPp = phiPp; r.A1req = A1req;

    var qmax = fpMax * B;                            // N/mm
    var e = Pu_N > 0 ? Mu_Nmm / Pu_N : Infinity;     // mm
    var ecrit = N / 2 - Pu_N / (2 * qmax);           // mm
    r.qmax = qmax; r.e = e; r.ecrit = ecrit;

    // -- rezim & panjang tumpu Y, gaya tarik angkur T --
    var f = N / 2 - aEdge;                            // jarak CL pelat → sumbu angkur tarik
    r.f = f;
    var mode, Y = 0, fp = 0, T_N = 0, noSol = false;

    if (Pu_N <= 0) {
      r.warn.push('Pu ≤ 0 (uplift murni) belum ditangani tool ini — masukkan Pu tekan; angkur tarik penuh dicek di tool Anchor Bolt Group.');
      return r;
    }

    if (Mu <= 0 || e <= ecrit + 1e-6) {
      mode = (Mu <= 0) ? 'concentric' : 'small';
      Y = Math.min(N, N - 2 * e);
      if (Y <= 0) { r.warn.push('Panjang tumpu Y ≤ 0 — eksentrisitas melebihi pelat; perbesar N.'); Y = 0; }
      fp = Y > 0 ? Pu_N / (B * Y) : Infinity;        // MPa
      T_N = 0;
    } else {
      mode = 'large';
      var half = f + N / 2;
      var disc = half * half - 2 * Pu_N * (e + f) / qmax;
      if (disc < 0) { noSol = true; r.warn.push('Tidak ada solusi nyata untuk Y (Pers. 3.4.4 tak terpenuhi) — pelat terlalu kecil, perbesar N/B.'); }
      else {
        Y = half - Math.sqrt(disc);
        T_N = qmax * Y - Pu_N;
        fp = fpMax;
        if (Y > N) r.warn.push('Y = ' + Y.toFixed(0) + ' mm > N — tepi tekan lebih dari panjang pelat; perbesar N.');
        if (aEdge <= 0) r.warn.push('Jarak tepi angkur aEdge = 0 — isi posisi angkur tarik agar f benar.');
      }
    }
    r.mode = mode; r.Y = Y; r.fp = fp; r.T = T_N; r.noSol = noSol;

    // -- garis leleh kantilever m, n, λn' --
    var m, n;
    if (colType === 'hssc') { m = (N - 0.80 * d) / 2; n = (B - 0.80 * d) / 2; }
    else if (colType === 'hssr') { m = (N - 0.95 * d) / 2; n = (B - 0.95 * bf) / 2; }
    else { m = (N - 0.95 * d) / 2; n = (B - 0.80 * bf) / 2; }
    m = Math.max(0, m); n = Math.max(0, n);

    var lam = 1, lamN = 0, X = 0;
    if (colType === 'w' && d > 0 && bf > 0) {
      var Pp = phiPp / PHI_C;                         // Pp murni (kN)
      X = (Pp > 0) ? (4 * d * bf / Math.pow(d + bf, 2)) * (Pu / Pp) : 0;
      X = Math.min(X, 1);
      if (v.lamExact !== '0') {
        var den = 1 + Math.sqrt(Math.max(0, 1 - X));
        lam = den > 0 ? Math.min(1, 2 * Math.sqrt(X) / den) : 1;
      }
      lamN = lam * Math.sqrt(d * bf) / 4;
    }
    r.m = m; r.n = n; r.lam = lam; r.lamN = lamN; r.X = X;

    // -- tebal pelat perlu (sisi tumpu) --
    function tpFor(c) {
      if (c <= 0 || !isFinite(fp)) return 0;
      var Mpl = (Y >= c) ? fp * c * c / 2 : fp * Y * (c - Y / 2);
      Mpl = Math.max(0, Mpl);
      return Math.sqrt(4 * Mpl / (PHI_B * Fy));       // mm
    }
    var tpM = tpFor(m), tpN = tpFor(n);
    var tpLam = (mode === 'concentric') ? tpFor(lamN) : 0;
    var tpBrg = Math.max(tpM, tpN, tpLam);

    // -- tebal pelat perlu (sisi tarik, momen besar) --
    var x = 0, tpTens = 0;
    if (T_N > 0) {
      x = Math.max(0, f - d / 2 + tf / 2);            // Pers. 3.4.6
      var MplT = (T_N / B) * x;                        // N·mm/mm
      tpTens = Math.sqrt(4 * MplT / (PHI_B * Fy));
    }
    r.x = x; r.tpM = tpM; r.tpN = tpN; r.tpLam = tpLam; r.tpBrg = tpBrg; r.tpTens = tpTens;
    var tpReq = Math.max(tpBrg, tpTens);
    r.tpReq = tpReq;
    r.dcPlate = tp > 0 ? tpReq / tp : Infinity;

    // -- bearing D/C --
    r.dcBrg = fpMax > 0 && isFinite(fp) ? fp / fpMax : Infinity;

    // -- baja angkur tarik --
    var Ab = Math.PI * db * db / 4;
    var Fnt = 0.75 * Fu;
    var phiRnRod = PHI_T * Fnt * Ab / 1000;            // kN per angkur
    r.Ab = Ab; r.Fnt = Fnt; r.phiRnRod = phiRnRod;
    r.Trod = T_N > 0 ? (T_N / nT) / 1000 : 0;          // kN per angkur
    r.dcTens = (T_N > 0) ? (phiRnRod > 0 ? r.Trod / phiRnRod : Infinity) : 0;

    // -- geser dasar (gesekan) --
    var mu = (surf === 'concrete') ? 0.70 : 0.55;
    var Vf1 = mu * Pu;                                 // kN
    var Vf2 = 0.2 * fc * A1 / 1000;                    // kN (batas 0,2 f'c A1)
    var phiVn = PHI_V * Math.min(Vf1, Vf2);
    r.mu = mu; r.phiVn = phiVn;
    r.dcShear = (Vu > 0) ? (phiVn > 0 ? Vu / phiVn : Infinity) : 0;
    r.shearGov = Vf1 <= Vf2 ? 'gesekan μ·Pu' : 'batas 0,2·f\'c·A1';

    // -- govern --
    var checks = [
      { key: 'tumpu beton', dc: r.dcBrg },
      { key: 'tebal pelat', dc: r.dcPlate },
      { key: 'tarik angkur', dc: r.dcTens },
      { key: 'geser dasar', dc: r.dcShear }
    ];
    var gov = checks[0];
    checks.forEach(function (c) { if (c.dc > gov.dc) gov = c; });
    r.gov = gov.key; r.govDC = gov.dc;
    r.feasible = !noSol && Y > 0 && Y <= N * 1.001;
    r.valid = true;

    // -- catatan --
    if (m <= 0 && n <= 0) r.warn.push('m dan n ≤ 0 — pelat lebih kecil dari jejak kolom; perbesar N/B.');
    if (N < d) r.warn.push('N = ' + N + ' mm < d = ' + d + ' mm — kolom tidak muat pada panjang pelat.');
    if (B < bf) r.warn.push('B = ' + B + ' mm < bf/lebar = ' + bf + ' mm — kolom tidak muat pada lebar pelat.');
    if (mode === 'small') r.warn.push('e = ' + e.toFixed(0) + ' mm ≤ ecrit = ' + ecrit.toFixed(0) + ' mm → momen KECIL: tumpu menahan sendiri, angkur tidak tarik.');
    if (mode === 'large' && !noSol) r.warn.push('e = ' + e.toFixed(0) + ' mm > ecrit = ' + ecrit.toFixed(0) + ' mm → momen BESAR: angkur menahan tarik T = ' + (T_N / 1000).toFixed(1) + ' kN.');
    if (r.dcBrg > 1 && isFinite(r.dcBrg)) r.warn.push('D/C tumpu = ' + r.dcBrg.toFixed(2) + ' > 1 — tegangan tumpu > fp(max); perbesar pelat atau naikkan f\'c / A2.');
    if (r.dcPlate > 1 && isFinite(r.dcPlate)) r.warn.push('tp,req = ' + tpReq.toFixed(1) + ' mm > tp = ' + tp + ' mm — pertebal pelat.');
    if (T_N > 0 && r.dcTens > 1) r.warn.push('D/C tarik angkur = ' + r.dcTens.toFixed(2) + ' > 1 — perbesar diameter/jumlah angkur atau naikkan mutu.');
    if (Vu > 0 && r.dcShear > 1) r.warn.push('D/C geser gesekan = ' + r.dcShear.toFixed(2) + ' > 1 — tambah shear lug atau andalkan geser angkur (cek di tool Anchor Bolt Group).');
    if (T_N > 0) r.warn.push('Cek kuat BETON angkur (cabut/breakout/pryout) di tool "Anchor Bolt Group" (ACI 318-19 Ch.17) memakai T = ' + (T_N / 1000).toFixed(1) + ' kN' + (Vu > 0 ? ' & Vu = ' + Vu.toFixed(1) + ' kN.' : '.'));

    return r;
  }

  /* ============================================================
     KANVAS — kiri: elevasi (blok tumpu + tarik angkur); kanan: denah
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat base plate.', w / 2, h / 2);
      return;
    }
    var line = css('--line');
    var splitX = Math.max(240, w * 0.56);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(splitX, 8); ctx.lineTo(splitX, h - 8); ctx.stroke();

    drawElev(ctx, 0, 0, splitX, h, r);
    drawPlan(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: 34,
        text: r.mode + ' · Y=' + (r.Y > 0 ? r.Y.toFixed(0) : '—') + 'mm · D/C ' + (isFinite(r.govDC) ? r.govDC.toFixed(2) : '—') + ' (' + r.gov + ')'
      });
    }
  }

  // Elevasi menurut panjang N: pelat, kolom, blok tumpu (panjang Y di tepi tekan),
  // angkur tarik di sisi berlawanan, panah Pu (offset e), dimensi N/e/Y.
  function drawElev(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber'), line = css('--line');
    var bad = css('--bad') || '#e5694f', sky = css('--sky') || '#30bced', sage = css('--sage') || dim;
    var padT = 50, padB = 58, padL = 30, padR = 30;
    var availW = W - padL - padR, availH = H - padT - padB;
    if (availW < 60 || availH < 60) return;

    var N = r.N;
    var sc = availW / N;                              // mm → px (sumbu panjang)
    var plateH = Math.max(8, Math.min(availH * 0.10, 16));
    var cx = x0 + padL, baseY = y0 + padT + availH * 0.55;   // sisi atas pelat
    function px(mm) { return cx + mm * sc; }          // mm dari tepi kiri (0..N)

    // -- pelat --
    ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
    ctx.fillRect(px(0), baseY, N * sc, plateH);
    ctx.globalAlpha = 1;

    // -- kolom stub (di tengah) --
    var colW = r.d * sc, colX = px(N / 2 - r.d / 2), colTop = baseY - Math.min(availH * 0.42, 90);
    ctx.strokeStyle = dim; ctx.lineWidth = 1.4;
    ctx.strokeRect(colX, colTop, colW, baseY - colTop);
    // sayap (garis dalam) untuk kesan profil
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(colX + colW * 0.5, colTop); ctx.lineTo(colX + colW * 0.5, baseY); ctx.stroke();

    // -- blok tumpu beton (tepi tekan = kanan) panjang Y --
    var Y = Math.max(0, Math.min(r.Y, N));
    if (Y > 0) {
      var yStart = px(N - Y), yEnd = px(N);
      var blockH = Math.max(10, Math.min(availH * 0.30, 46));
      var by = baseY + plateH;
      // gradient blok
      ctx.fillStyle = amber; ctx.globalAlpha = 0.28;
      ctx.fillRect(yStart, by, yEnd - yStart, blockH);
      ctx.globalAlpha = 1;
      // arsir tekanan (batang vertikal makin rapat)
      ctx.strokeStyle = amber; ctx.lineWidth = 1;
      var nb = Math.max(3, Math.floor((yEnd - yStart) / 10));
      for (var i = 0; i <= nb; i++) {
        var xx = yStart + (yEnd - yStart) * i / nb;
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(xx, by); ctx.lineTo(xx, by + blockH); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = amber; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('fp ' + (isFinite(r.fp) ? r.fp.toFixed(2) : '—') + ' MPa', (yStart + yEnd) / 2, by + blockH + 12);
      // dimensi Y
      dim1(ctx, yStart, yEnd, by + blockH + 20, 'Y=' + r.Y.toFixed(0), sky);
    }

    // -- angkur tarik (sisi kiri) --
    if (r.T > 0) {
      var ax = px(r.aEdge);
      var abot = baseY + plateH + Math.min(availH * 0.34, 50);
      ctx.strokeStyle = bad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, baseY + plateH); ctx.lineTo(ax, abot); ctx.stroke();
      // panah tarik ke atas
      ctx.beginPath(); ctx.moveTo(ax - 4, baseY + plateH + 10); ctx.lineTo(ax, baseY + plateH); ctx.lineTo(ax + 4, baseY + plateH + 10); ctx.stroke();
      ctx.fillStyle = bad; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('T ' + (r.T / 1000).toFixed(0) + 'kN', ax, abot + 12);
    }

    // -- gaya Pu (offset e ke sisi tekan) --
    var loadX = px(Math.min(N, Math.max(0, N / 2 + r.e)));
    if (isFinite(loadX)) {
      var pTop = colTop - 26;
      ctx.strokeStyle = ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(loadX, pTop); ctx.lineTo(loadX, colTop - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(loadX - 5, colTop - 11); ctx.lineTo(loadX, colTop - 4); ctx.lineTo(loadX + 5, colTop - 11); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('Pu ' + r.Pu.toFixed(0) + 'kN', loadX + 7, pTop + 8);
      if (r.Mu > 0) ctx.fillText('Mu ' + r.Mu.toFixed(0) + 'kNm', loadX + 7, pTop + 20);
      // garis CL kolom
      ctx.strokeStyle = line; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px(N / 2), colTop); ctx.lineTo(px(N / 2), baseY + plateH + 4); ctx.stroke();
      ctx.setLineDash([]);
      // dimensi e (CL → load)
      if (Math.abs(r.e) > 1) dim1(ctx, px(N / 2), loadX, colTop - 4, 'e=' + r.e.toFixed(0), sage);
    }

    // -- dimensi N (bawah pelat) --
    dim1(ctx, px(0), px(N), y0 + H - 30, 'N=' + N.toFixed(0), dim);

    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Elevasi (sumbu-N) · tepi tekan →', x0 + padL, y0 + H - 12);
  }

  // garis dimensi horizontal dengan label di tengah
  function dim1(ctx, xa, xb, y, label, color) {
    if (xb < xa) { var t = xa; xa = xb; xb = t; }
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xa, y - 3); ctx.lineTo(xa, y + 3); ctx.moveTo(xb, y - 3); ctx.lineTo(xb, y + 3); ctx.stroke();
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, (xa + xb) / 2, y - 4);
  }

  // Denah: pelat B×N, jejak kolom, angkur (2 muka), dimensi
  function drawPlan(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber'), line = css('--line'), bad = css('--bad') || '#e5694f';
    var padT = 48, padB = 34, padL = 34, padR = 34;
    var availW = W - padL - padR, availH = H - padT - padB;
    if (availW < 50 || availH < 50) return;

    var N = r.N, B = r.B;
    var sc = Math.min(availW / B, availH / N);        // B horizontal, N vertikal
    var pw = B * sc, ph = N * sc;
    var ox = x0 + padL + (availW - pw) / 2, oy = y0 + padT + (availH - ph) / 2;

    // pelat
    ctx.fillStyle = line; ctx.globalAlpha = 0.22; ctx.fillRect(ox, oy, pw, ph); ctx.globalAlpha = 1;
    ctx.strokeStyle = dim; ctx.lineWidth = 1.2; ctx.strokeRect(ox, oy, pw, ph);

    // jejak kolom (di tengah)
    var cwB = r.bf * sc, cwN = r.d * sc;
    var cxp = ox + pw / 2, cyp = oy + ph / 2;
    if (r.colType === 'hssc') {
      ctx.beginPath(); ctx.arc(cxp, cyp, r.d * sc / 2, 0, Math.PI * 2);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
    } else {
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
      ctx.strokeRect(cxp - cwB / 2, cyp - cwN / 2, cwB, cwN);
      if (r.colType === 'w') {
        // web
        ctx.strokeStyle = line; ctx.beginPath();
        ctx.moveTo(cxp - cwB / 2, cyp - cwN / 2 + 3); ctx.lineTo(cxp + cwB / 2, cyp - cwN / 2 + 3);
        ctx.moveTo(cxp - cwB / 2, cyp + cwN / 2 - 3); ctx.lineTo(cxp + cwB / 2, cyp + cwN / 2 - 3);
        ctx.moveTo(cxp, cyp - cwN / 2); ctx.lineTo(cxp, cyp + cwN / 2);
        ctx.stroke();
      }
    }

    // angkur: nT per muka pada dua tepi (atas=tarik jika momen besar, bawah=tekan)
    var aE = r.aEdge > 0 ? r.aEdge : N * 0.08;
    var rowTop = oy + aE * sc, rowBot = oy + ph - aE * sc;
    var gageB = Math.min(pw * 0.55, r.bf * sc * 0.9);
    var rad = Math.max(2.5, Math.min(5, r.db * sc / 2 || 4));
    for (var f2 = 0; f2 < 2; f2++) {
      var ry = f2 === 0 ? rowTop : rowBot;
      var tension = (r.T > 0 && f2 === 0);
      for (var j = 0; j < r.nT; j++) {
        var frac = r.nT === 1 ? 0.5 : j / (r.nT - 1);
        var axp = ox + pw / 2 - gageB / 2 + gageB * frac;
        ctx.beginPath(); ctx.arc(axp, ry, rad, 0, Math.PI * 2);
        ctx.fillStyle = tension ? bad : amber; ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    if (r.T > 0) {
      ctx.fillStyle = bad; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('tarik', ox + pw / 2, rowTop - 7);
    }

    // dimensi B (bawah) & N (kanan)
    dim1(ctx, ox, ox + pw, oy + ph + 16, 'B=' + B.toFixed(0), css('--sky') || '#30bced');
    ctx.save();
    ctx.strokeStyle = css('--sky') || '#30bced'; ctx.fillStyle = css('--sky') || '#30bced'; ctx.lineWidth = 1;
    var dxr = ox + pw + 16;
    ctx.beginPath(); ctx.moveTo(dxr, oy); ctx.lineTo(dxr, oy + ph);
    ctx.moveTo(dxr - 3, oy); ctx.lineTo(dxr + 3, oy); ctx.moveTo(dxr - 3, oy + ph); ctx.lineTo(dxr + 3, oy + ph); ctx.stroke();
    ctx.translate(dxr + 4, oy + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('N=' + N.toFixed(0), 0, 0);
    ctx.restore();

    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('Denah · ' + r.nT + ' angkur/muka', x0 + W / 2, y0 + H - 12);
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('bp-style')) return;
    var s = document.createElement('style');
    s.id = 'bp-style';
    s.textContent =
      '.bp-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.bp-canvas{position:relative;flex:1 1 46%;min-height:240px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.bp-res{flex:1 1 54%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Base Plate & Anchor Rod'));
    panel.appendChild(UI.el('div', 'sub', 'Desain pelat landas kolom baja + angkur satu sistem: tumpu beton, ' +
      'tebal pelat (leleh lentur), gaya tarik angkur akibat momen, dan geser dasar — metode AISC Design Guide 1, ' +
      'diselaraskan AISC 360-22 & ACI 318-19 (DFBK). e = Mu/Pu menentukan rezim konsentrik / momen kecil / momen besar.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Kolom' },
      { type: 'select', id: 'colType', label: 'Tipe penampang', value: 'w', options: [
        { value: 'w', label: 'Profil-I / WF (W-shape)' },
        { value: 'hssr', label: 'HSS persegi (kotak)' },
        { value: 'hssc', label: 'HSS bulat / pipa' } ] },
      { type: 'number', id: 'd', label: 'Tinggi d (atau ⌀)', unit: 'mm', value: 300, min: 50, step: 5, hint: 'W/HSS persegi: tinggi penampang searah momen. HSS bulat: diameter luar.' },
      { type: 'number', id: 'bf', label: 'Lebar bf / sisi', unit: 'mm', value: 300, min: 50, step: 5, hint: 'W: lebar sayap. HSS persegi: lebar. (Diabaikan untuk pipa.)' },
      { type: 'number', id: 'tf', label: 'Tebal sayap tf', unit: 'mm', value: 15, min: 0, step: 1, hint: 'Untuk lengan tarik x (momen besar). Boleh 0 (konservatif).' },

      { type: 'group', label: 'Pelat Landas' },
      { type: 'number', id: 'N', label: 'Panjang N (searah momen)', unit: 'mm', value: 500, min: 50, step: 10 },
      { type: 'number', id: 'B', label: 'Lebar B', unit: 'mm', value: 500, min: 50, step: 10 },
      { type: 'number', id: 'tp', label: 'Tebal pelat tp (coba)', unit: 'mm', value: 32, min: 5, step: 1, hint: 'Tebal terpasang untuk dibandingkan dengan tp,perlu.' },
      { type: 'number', id: 'Fy', label: 'Fy pelat', unit: 'MPa', value: 250, min: 200, step: 10, hint: 'BJ37/A36 ≈ 250 MPa, A572 Gr.50 ≈ 345 MPa.' },
      { type: 'segment', id: 'lamExact', label: 'Faktor λ (konsentrik)', value: '1', options: [
        { value: '1', label: 'λ eksak' }, { value: '0', label: 'λ = 1 (konservatif)' } ] },

      { type: 'group', label: 'Beton Tumpuan' },
      { type: 'number', id: 'fc', label: "f'c beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'a2a1', label: 'Rasio A2/A1', value: 1, min: 1, max: 16, step: 0.5, hint: 'Pengekangan beton (pier lebih besar dari pelat). √(A2/A1) dibatasi 2. Konservatif = 1.' },

      { type: 'group', label: 'Beban Terfaktor (DFBK)' },
      { type: 'number', id: 'Pu', label: 'Aksial tekan Pu', unit: 'kN', value: 1200, min: 0, step: 10 },
      { type: 'number', id: 'Mu', label: 'Momen Mu', unit: 'kN·m', value: 150, min: 0, step: 5, hint: '0 = konsentrik. Momen lentur sumbu kuat pada dasar kolom.' },
      { type: 'number', id: 'Vu', label: 'Geser dasar Vu', unit: 'kN', value: 0, min: 0, step: 5, hint: '0 = tanpa geser. Ditahan gesekan; bila kurang → shear lug/geser angkur.' },
      { type: 'segment', id: 'surf', label: 'Permukaan geser', value: 'grout', options: [
        { value: 'grout', label: 'Grout (μ=0,55)' }, { value: 'concrete', label: 'Beton (μ=0,70)' } ] },

      { type: 'group', label: 'Angkur (Anchor Rod)' },
      { type: 'select', id: 'mat', label: 'Mutu angkur', value: 'g36', options: [
        { value: 'g36', label: 'ASTM F1554 Gr.36 (Fu 400)' },
        { value: 'g55', label: 'ASTM F1554 Gr.55 (Fu 517)' },
        { value: 'g105', label: 'ASTM F1554 Gr.105 (Fu 862)' },
        { value: 'custom', label: 'Kustom (isi Fu)' } ] },
      { type: 'number', id: 'Fu', label: 'Fu kustom', unit: 'MPa', value: 400, min: 200, step: 10, hint: 'Dipakai hanya bila mutu = Kustom.' },
      { type: 'number', id: 'db', label: 'Diameter angkur db', unit: 'mm', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'nT', label: 'Jumlah angkur / muka tarik', value: 2, min: 1, step: 1, hint: 'Angkur yang menahan tarik pada satu sisi (momen besar).' },
      { type: 'number', id: 'aEdge', label: 'Jarak tepi angkur', unit: 'mm', value: 50, min: 0, step: 5, hint: 'Dari tepi pelat ke sumbu baris angkur. f = N/2 − jarak ini.' }
    ];

    var results = UI.el('div', 'bp-res');
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

    var work = UI.el('div', 'bp-work');
    var canvasHost = UI.el('div', 'bp-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Base plate');
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
  var MODE_LABEL = { concentric: 'Konsentrik', small: 'Momen kecil', large: 'Momen besar' };

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';
    if (!r.valid) {
      results.appendChild(UI.note('Input belum lengkap',
        r.warn.length ? r.warn.join(' ') : 'Isi dimensi pelat, beton, beban, dan angkur.'));
      if (state.cap) state.cap.set('Base plate');
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set(MODE_LABEL[r.mode] + ' · e=' + r.e.toFixed(0) + 'mm · D/C ' +
      (isFinite(r.govDC) ? r.govDC.toFixed(2) : '—') + ' (' + r.gov + ')');

    var okGov = r.feasible && r.govDC <= 1;
    results.appendChild(UI.heroRow([
      { label: r.feasible ? 'D/C menentukan (' + r.gov + ')' : 'Status',
        value: r.feasible ? (isFinite(r.govDC) ? UI.fmt(r.govDC, 2) : '—') : 'Pelat kurang',
        unit: okGov ? 'OK' : 'NG', tone: okGov ? 'ok' : 'bad' },
      { label: 'Tebal pelat perlu tp', value: r.feasible ? UI.fmt(r.tpReq, 1) : '—', unit: 'mm' },
      (r.T > 0
        ? { label: 'Tarik angkur T (total)', value: UI.fmt(r.T / 1000, 1), unit: 'kN' }
        : { label: 'Panjang tumpu Y', value: UI.fmt(r.Y, 0), unit: 'mm' })
    ]));

    results.appendChild(UI.rhead('Rezim & tumpu beton'));
    results.appendChild(UI.kv('Rezim (e vs ecrit)', MODE_LABEL[r.mode] + ' · e=' + r.e.toFixed(0) + ' / ecrit=' + r.ecrit.toFixed(0) + ' mm'));
    results.appendChild(UI.kv('fp(max) = φc·0,85·f\'c·√(A2/A1)', UI.fmt(r.fpMax, 2) + ' MPa (φc=0,65, √=' + r.sqrtR.toFixed(2) + ')'));
    results.appendChild(UI.kv('φc·Pp (kapasitas tumpu penuh)', UI.fmt(r.phiPp, 0) + ' kN'));
    results.appendChild(UI.kv('Tegangan tumpu fp', (isFinite(r.fp) ? UI.fmt(r.fp, 2) : '—') + ' MPa'));
    results.appendChild(UI.kv('Panjang tumpu Y', UI.fmt(r.Y, 0) + ' mm' + (r.mode === 'concentric' ? ' (= N, seragam)' : '')));
    results.appendChild(UI.kv('D/C tumpu = fp/fp(max)', isFinite(r.dcBrg) ? UI.fmt(r.dcBrg, 2) : '—', r.dcBrg <= 1 ? 'ok' : 'bad'));
    if (r.mode === 'concentric') results.appendChild(UI.kv('A1,perlu (info)', UI.fmt(r.A1req, 0) + ' mm² (terpasang ' + UI.fmt(r.A1, 0) + ')'));

    results.appendChild(UI.rhead('Tebal pelat (leleh lentur, φb=0,90)'));
    results.appendChild(UI.kv('m / n (kantilever)', UI.fmt(r.m, 1) + ' / ' + UI.fmt(r.n, 1) + ' mm'));
    if (r.mode === 'concentric') results.appendChild(UI.kv('λ · λn\'', UI.fmt(r.lam, 2) + ' · ' + UI.fmt(r.lamN, 1) + ' mm'));
    results.appendChild(UI.kv('tp,perlu sisi tumpu', UI.fmt(r.tpBrg, 1) + ' mm'));
    if (r.T > 0) {
      results.appendChild(UI.kv('lengan x sisi tarik', UI.fmt(r.x, 1) + ' mm'));
      results.appendChild(UI.kv('tp,perlu sisi tarik', UI.fmt(r.tpTens, 1) + ' mm'));
    }
    results.appendChild(UI.kv('tp,perlu (menentukan)', UI.fmt(r.tpReq, 1) + ' mm'));
    results.appendChild(UI.kv('D/C tebal = tp,perlu/tp', isFinite(r.dcPlate) ? UI.fmt(r.dcPlate, 2) : '—', r.dcPlate <= 1 ? 'ok' : 'bad'));

    if (r.T > 0) {
      results.appendChild(UI.rhead('Baja angkur tarik (AISC J3)'));
      results.appendChild(UI.kv('Mutu · Fnt=0,75Fu', r.matLabel + ' · ' + UI.fmt(r.Fnt, 0) + ' MPa'));
      results.appendChild(UI.kv('Tarik total / per angkur', UI.fmt(r.T / 1000, 1) + ' / ' + UI.fmt(r.Trod, 1) + ' kN (' + r.nT + ' angkur)'));
      results.appendChild(UI.kv('φRn per angkur (⌀' + r.db + ')', UI.fmt(r.phiRnRod, 1) + ' kN'));
      results.appendChild(UI.kv('D/C tarik angkur', UI.fmt(r.dcTens, 2), r.dcTens <= 1 ? 'ok' : 'bad'));
    }

    if (r.Vu > 0) {
      results.appendChild(UI.rhead('Geser dasar — gesekan'));
      results.appendChild(UI.kv('μ (' + (r.surf === 'concrete' ? 'beton' : 'grout') + ')', UI.fmt(r.mu, 2)));
      results.appendChild(UI.kv('φVn gesekan (' + r.shearGov + ')', UI.fmt(r.phiVn, 1) + ' kN'));
      results.appendChild(UI.kv('D/C geser = Vu/φVn', UI.fmt(r.dcShear, 2), r.dcShear <= 1 ? 'ok' : 'bad'));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'AISC <b>Design Guide 1</b> (2nd Ed.) — metode Drake & Elkin (beban terfaktor langsung, tegangan tumpu seragam). ' +
      'Tumpu beton per <b>AISC 360-22 J8 / ACI 318-19 Ps. 22.8</b> (φc=0,65, √(A2/A1)≤2); leleh lentur pelat φb=0,90; ' +
      'baja angkur <b>AISC 360-22 J3</b> (Fnt=0,75Fu, φ=0,75). <b>TIDAK termasuk</b>: kuat beton angkur ' +
      '(cabut/breakout/pryout — pakai tool Anchor Bolt Group, ACI 318-19 Ch.17), shear lug detail, prying action, ' +
      'las pelat-kolom, distribusi tumpu segitiga. Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.5.0', RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', vv = ' ' + value;
    var dd = RW - l.length - vv.length; if (dd < 2) dd = 2;
    return ' ' + l + rep('.', dd) + vv;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n) || !isFinite(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-')
      .replace(/φ/g, 'phi').replace(/λ/g, 'lambda').replace(/√/g, 'sqrt').replace(/Σ/g, 'sum')
      .replace(/'/g, "'").replace(/[^\x20-\x7E]/g, '?');
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

  // Gbr. 1 — elevasi base plate: blok tumpu Y, angkur tarik T, beban Pu & Mu
  function figBasePlate(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var sc = Math.min(260 / r.N, 0.8);
    var cx = 240, yP = 108, tPl = Math.max(5, Math.min(10, r.tp * sc));
    var xL = cx - r.N * sc / 2, xR = cx + r.N * sc / 2;
    // beton/pedestal
    ops.push({ t: 'rect', x: xL - 30, y: yP + tPl, w: r.N * sc + 60, h: 42, lw: 0.9 });
    for (var i = 0; i < 10; i++) {
      var xh = xL - 30 + (r.N * sc + 60) * i / 9;
      ops.push({ t: 'line', x1: xh, y1: yP + tPl + 42, x2: xh - 8, y2: yP + tPl + 34, lw: 0.3, g: 0.75 });
    }
    ops.push({ t: 'text', x: xL - 26, y: yP + tPl + 14, s: "f'c=" + numR(r.fc, 0), size: 6, g: 0.4 });
    // pelat & kolom
    ops.push({ t: 'rect', x: xL, y: yP, w: r.N * sc, h: tPl, fill: true, g: 0.6 });
    ops.push({ t: 'rect', x: xL, y: yP, w: r.N * sc, h: tPl, lw: 0.9 });
    var dc = Math.max(20, (r.d || r.N * 0.4) * sc);
    ops.push({ t: 'rect', x: cx - dc / 2, y: yP - 44, w: dc, h: 44, lw: 1 });
    // beban Pu & Mu
    F.arrow(ops, cx, yP - 74, cx, yP - 50, { lw: 1.3 });
    ops.push({ t: 'text', x: cx + 6, y: yP - 62, s: 'Pu=' + numR(r.Pu, 0) + ' kN', size: 6.5 });
    if (r.Mu > 0) {
      F.arrow(ops, cx - dc / 2 - 26, yP - 30, cx - dc / 2 - 4, yP - 30, { lw: 1 });
      F.arrow(ops, cx + dc / 2 + 26, yP - 14, cx + dc / 2 + 4, yP - 14, { lw: 1 });
      ops.push({ t: 'text', x: cx + dc / 2 + 8, y: yP - 34, s: 'Mu=' + numR(r.Mu, 0) + ' kNm', size: 6.5 });
    }
    // blok tumpu Y (sisi tekan = kanan) — panah ke atas
    if (r.Y > 0) {
      var Ys = Math.min(r.Y, r.N) * sc;
      var hB = Math.max(12, Math.min(26, r.fp * 2));
      ops.push({ t: 'rect', x: xR - Ys, y: yP + tPl, w: Ys, h: hB, fill: true, g: 0.82 });
      ops.push({ t: 'rect', x: xR - Ys, y: yP + tPl, w: Ys, h: hB, lw: 0.6, g: 0.35 });
      for (var k = 0; k <= 3; k++)
        F.arrow(ops, xR - Ys + Ys * k / 3, yP + tPl + hB + 8, xR - Ys + Ys * k / 3, yP + tPl + 2, { lw: 0.6, g: 0.3 });
      ops.push({ t: 'text', x: xR - Ys / 2, y: yP + tPl + hB + 18, s: 'fp=' + numR(r.fp, 2) + ' MPa', size: 6, align: 'c', g: 0.25 });
      F.dimH(ops, xR - Ys, xR, yP + tPl + hB + 26, 'Y=' + numR(r.Y, 0));
    }
    // angkur tarik (sisi kiri, aEdge dari tepi)
    if (r.aEdge > 0) {
      var xRod = xL + r.aEdge * sc;
      ops.push({ t: 'line', x1: xRod, y1: yP - 8, x2: xRod, y2: yP + tPl + 38, lw: 1.4, g: 0.3 });
      if (r.T > 0) {
        F.arrow(ops, xRod, yP + tPl + 16, xRod, yP + tPl + 38, { lw: 1 });
        ops.push({ t: 'text', x: xRod - 5, y: yP + tPl + 34, s: 'T=' + numR(r.T / 1000, 1) + ' kN', size: 6, align: 'r' });
      }
      ops.push({ t: 'text', x: xRod, y: yP - 12, s: r.nT + ' angkur ' + numR(r.db, 0) + ' mm', size: 5.5, align: 'c', g: 0.35 });
    }
    // dimensi N
    F.dimH(ops, xL, xR, yP + tPl + 56, 'N = ' + numR(r.N, 0) + ' mm (B = ' + numR(r.B, 0) + ')');
    var yCap = yP + tPl + 74;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Elevasi base plate - rezim ' + tolatin(MODE_LABEL[r.mode]) +
      ', e=' + numR(r.e, 0) + ' mm, tp perlu ' + numR(r.tpReq, 1) + ' mm', size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Elevasi base plate & blok tumpu - lihat versi PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
    var CT = { w: 'W-shape', hssr: 'HSS persegi', hssc: 'HSS bulat' };
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('BASE PLATE & ANCHOR ROD (AISC Design Guide 1)'));
    L.push(centerR('AISC 360-22 / ACI 318-19 - DFBK'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Rezim: ' + MODE_LABEL[r.mode], dt));
    L.push('');
    L.push(' KOLOM & PELAT'); L.push(ruleR('-'));
    L.push(rowR('Kolom', (CT[r.colType] || r.colType) + '  d=' + numR(r.d, 0) + ' bf=' + numR(r.bf, 0) + ' tf=' + numR(r.tf, 0) + ' mm'));
    L.push(rowR('Pelat N x B x tp', numR(r.N, 0) + ' x ' + numR(r.B, 0) + ' x ' + numR(r.tp, 0) + ' mm'));
    L.push(rowR('Fy pelat', numR(r.Fy, 0) + ' MPa'));
    L.push(rowR("f'c / A2:A1", numR(r.fc, 0) + ' MPa / ' + numR(r.a2a1, 2)));
    L.push('');
    L.push(' BEBAN TERFAKTOR'); L.push(ruleR('-'));
    L.push(rowR('Pu / Mu', numR(r.Pu, 1) + ' kN / ' + numR(r.Mu, 1) + ' kNm'));
    L.push(rowR('e = Mu/Pu / ecrit', numR(r.e, 0) + ' / ' + numR(r.ecrit, 0) + ' mm'));
    if (r.Vu > 0) L.push(rowR('Vu (geser dasar)', numR(r.Vu, 1) + ' kN'));
    L.push('');
    L.push(figBasePlate(r));
    L.push('');
    L.push(' TUMPU BETON (AISC J8 / ACI 22.8)'); L.push(ruleR('='));
    L.push(rowR('fp(max)=phic*0.85*fc*sqrt(A2/A1)', numR(r.fpMax, 2) + ' MPa'));
    L.push(rowR('phic*Pp', numR(r.phiPp, 0) + ' kN'));
    L.push(rowR('Panjang tumpu Y', numR(r.Y, 0) + ' mm'));
    L.push(rowR('Tegangan tumpu fp', numR(r.fp, 2) + ' MPa'));
    L.push(rowR('>> D/C tumpu', numR(r.dcBrg, 2) + (r.dcBrg <= 1 ? ' OK' : ' NG')));
    L.push('');
    L.push(' TEBAL PELAT (leleh lentur, phib=0.90)'); L.push(ruleR('='));
    L.push(rowR('m / n', numR(r.m, 1) + ' / ' + numR(r.n, 1) + ' mm'));
    if (r.mode === 'concentric') L.push(rowR('lambda / lambda*n\'', numR(r.lam, 2) + ' / ' + numR(r.lamN, 1) + ' mm'));
    L.push(rowR('tp,perlu sisi tumpu', numR(r.tpBrg, 1) + ' mm'));
    if (r.T > 0) {
      L.push(rowR('lengan x / tp,perlu tarik', numR(r.x, 1) + ' / ' + numR(r.tpTens, 1) + ' mm'));
    }
    L.push(rowR('tp,perlu (menentukan)', numR(r.tpReq, 1) + ' mm'));
    L.push(rowR('>> D/C tebal', numR(r.dcPlate, 2) + (r.dcPlate <= 1 ? ' OK' : ' NG')));
    if (r.T > 0) {
      L.push('');
      L.push(' BAJA ANGKUR TARIK (AISC J3)'); L.push(ruleR('='));
      L.push(rowR('Mutu / Fnt=0.75Fu', tolatin(r.matLabel) + ' / ' + numR(r.Fnt, 0) + ' MPa'));
      L.push(rowR('Tarik total T', numR(r.T / 1000, 1) + ' kN (' + r.nT + ' angkur/muka)'));
      L.push(rowR('T per angkur / phiRn', numR(r.Trod, 1) + ' / ' + numR(r.phiRnRod, 1) + ' kN'));
      L.push(rowR('>> D/C tarik angkur', numR(r.dcTens, 2) + (r.dcTens <= 1 ? ' OK' : ' NG')));
    }
    if (r.Vu > 0) {
      L.push('');
      L.push(' GESER DASAR (gesekan)'); L.push(ruleR('-'));
      L.push(rowR('mu / phiVn', numR(r.mu, 2) + ' / ' + numR(r.phiVn, 1) + ' kN'));
      L.push(rowR('>> D/C geser', numR(r.dcShear, 2) + (r.dcShear <= 1 ? ' OK' : ' NG')));
    }
    L.push(ruleR('='));
    L.push(rowR('>> D/C MENENTUKAN (' + tolatin(r.gov) + ')', numR(r.govDC, 2) + (r.feasible && r.govDC <= 1 ? ' OK' : ' NG')));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' AISC Design Guide 1 (Drake & Elkin). BELUM: kuat beton');
    L.push(' angkur (breakout/cabut/pryout -> tool Anchor Bolt Group),');
    L.push(' shear lug, prying, las pelat-kolom.');
    L.push(' Verifikasi oleh insinyur penanggung jawab.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(' ' + rep('=', RW));
    return L.map(function (x) { return typeof x === 'string' ? tolatin(x) : x; });
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi input dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Base-Plate_' + r.N + 'x' + r.B + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Base Plate & Anchor Rod', category: 'Sambungan', needsCanvas: true, needsRenderer: false },

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
