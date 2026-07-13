/* ============================================================
   Civil Tools — modules/column-pm/module.js  (Tier 2, kanvas 2D)
   Diagram Interaksi P–M Kolom Beton Bertulang Persegi — SNI 2847:2019.

   Metode (kompatibilitas regangan, blok tegangan persegi ekuivalen):
   - Sapuan sumbu netral c → tiap titik: a = β1·c ≤ h, Cc = 0,85·f'c·a·b,
     regangan baja per baris εsi = 0,003·(c−di)/c, fsi = ±fy klem elastis,
     baris dalam blok tekan dikurangi beton terdesak (fsi − 0,85f'c).
     Pn = Cc + Σ Asi·fsi,eff ;  Mn = Cc·(h/2 − a/2) + Σ Asi·fsi,eff·(h/2 − di)
   - φ dari regangan tarik terluar εt (Tabel 21.2.2): terkendali tekan
     εt ≤ εty → 0,65 (sengkang ikat) / 0,75 (spiral); terkendali tarik
     εt ≥ εty + 0,003 → 0,90; transisi linear.
   - Batas aksial (22.4.2): Po = 0,85f'c(Ag−Ast) + fy·Ast;
     Pn,maks = 0,80·Po (ikat) / 0,85·Po (spiral) — plafon φPn.
   - Tarik murni: Pnt = −fy·Ast (φ = 0,90).
   - Lentur UNIAKSIAL terhadap sumbu-X (tekan di tepi atas tinggi h).
   - Tulangan: nx batang per muka lebar b (baris atas & bawah) + (ny−2)
     baris antara berisi 2 batang (muka samping) — pola keliling simetris.
   - D/C titik beban (Pu, Mu): rasio radial dari titik asal terhadap kurva
     desain (eksentrisitas konstan e = Mu/Pu).

   TIDAK termasuk: lentur BIAKSIAL, kelangsingan/orde-2 (momen perbesaran),
   pengekangan/daktilitas gempa (Ps. 18), penampang bundar/L/T, tulangan
   tak-simetris. Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'column-pm';
  var state = {};
  var ES = 200000, ECU = 0.003;

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  /* ============================================================
     KALKULASI
     ============================================================ */
  function beta1Of(fc) {
    if (fc <= 28) return 0.85;
    return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
  }

  // susunan baris tulangan: {d: kedalaman dari serat tekan, As: luas}
  function barRows(h, dp, nx, ny, Abar) {
    var rows = [];
    nx = Math.max(2, Math.round(nx));
    ny = Math.max(2, Math.round(ny));
    rows.push({ d: dp, n: nx });
    for (var i = 1; i < ny - 1; i++) {
      rows.push({ d: dp + (h - 2 * dp) * i / (ny - 1), n: 2 });
    }
    rows.push({ d: h - dp, n: nx });
    rows.forEach(function (r) { r.As = r.n * Abar; });
    return rows;
  }

  // satu titik kurva utk sumbu netral c (satuan N, mm)
  function pointAt(c, geo) {
    var a = Math.min(geo.beta1 * c, geo.h);
    var Cc = 0.85 * geo.fc * a * geo.b;
    var Pn = Cc, Mn = Cc * (geo.h / 2 - a / 2);
    geo.rows.forEach(function (row) {
      var eps = ECU * (c - row.d) / c;
      var fs = Math.max(-geo.fy, Math.min(geo.fy, eps * ES));
      var fsEff = (row.d <= a) ? fs - 0.85 * geo.fc : fs;   // koreksi beton terdesak
      Pn += row.As * fsEff;
      Mn += row.As * fsEff * (geo.h / 2 - row.d);
    });
    var dt = geo.h - geo.dp;
    var epsT = ECU * (dt - c) / c;                          // + = tarik
    return { c: c, Pn: Pn, Mn: Mn, epsT: epsT };
  }

  function phiOf(epsT, ety, tie) {
    var lo = tie === 'spiral' ? 0.75 : 0.65;
    if (epsT <= ety) return lo;
    if (epsT >= ety + 0.003) return 0.9;
    return lo + (0.9 - lo) * (epsT - ety) / 0.003;
  }

  function compute(v) {
    var r = { valid: false, warn: [] };
    var b = num(v.b), h = num(v.h), dp = num(v.dp);
    var fc = num(v.fc), fy = num(v.fy);
    var db = num(v.db), nx = Math.max(2, Math.round(num(v.nx))), ny = Math.max(2, Math.round(num(v.ny)));
    var tie = v.tie || 'tie';
    var Pu = num(v.Pu), Mu = num(v.Mu);

    r.b = b; r.h = h; r.dp = dp; r.fc = fc; r.fy = fy; r.db = db;
    r.nx = nx; r.ny = ny; r.tie = tie; r.Pu = Pu; r.Mu = Mu;

    if (b <= 0 || h <= 0 || fc <= 0 || fy <= 0 || db <= 0 || dp <= 0 || dp >= h / 2) {
      r.warn.push('Lengkapi dimensi, material, dan d\' (0 < d\' < h/2).');
      return r;
    }

    var Abar = Math.PI * db * db / 4;
    var rows = barRows(h, dp, nx, ny, Abar);
    var nBars = 2 * nx + 2 * (ny - 2);
    var Ast = nBars * Abar;
    var Ag = b * h;
    var rho = Ast / Ag;
    var beta1 = beta1Of(fc);
    var ety = fy / ES;
    r.Abar = Abar; r.nBars = nBars; r.Ast = Ast; r.Ag = Ag; r.rho = rho;
    r.beta1 = beta1; r.ety = ety; r.rows = rows;

    var geo = { b: b, h: h, dp: dp, fc: fc, fy: fy, beta1: beta1, rows: rows };

    /* --- titik acuan --- */
    var Po = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1000;                 // kN
    var alphaMax = tie === 'spiral' ? 0.85 : 0.80;
    var PnMax = alphaMax * Po;
    var phiC = tie === 'spiral' ? 0.75 : 0.65;
    r.Po = Po; r.PnMax = PnMax; r.phiPnMax = phiC * PnMax; r.alphaMax = alphaMax; r.phiC = phiC;
    var Pnt = -fy * Ast / 1000;                                          // kN (tarik murni)
    r.Pnt = Pnt; r.phiPnt = 0.9 * Pnt;

    var dt = h - dp;
    var cBal = ECU / (ECU + ety) * dt;
    r.cBal = cBal;

    /* --- sapuan kurva --- */
    var nom = [], des = [];
    // tarik murni → titik awal
    nom.push({ Mn: 0, Pn: Pnt, c: 0, epsT: Infinity, phi: 0.9 });
    des.push({ M: 0, P: 0.9 * Pnt });
    var cMin = 0.05 * dt, cMax = 3 * h, N = 160;
    for (var i = 0; i <= N; i++) {
      var c = cMin * Math.pow(cMax / cMin, i / N);                       // log spacing
      var p = pointAt(c, geo);
      var Mn = p.Mn / 1e6, Pn = p.Pn / 1000;                             // kN·m, kN
      if (Mn < 0) Mn = 0;                                                // ujung tekan penuh
      var phi = phiOf(p.epsT, ety, tie);
      nom.push({ Mn: Mn, Pn: Pn, c: c, epsT: p.epsT, phi: phi });
      var Pd = Math.min(phi * Pn, phiC * PnMax);                         // plafon aksial
      des.push({ M: phi * Mn, P: Pd });
    }
    // titik tekan murni
    nom.push({ Mn: 0, Pn: Po, c: Infinity, epsT: -ECU, phi: phiC });
    des.push({ M: 0, P: phiC * PnMax });
    r.nom = nom; r.des = des;

    // titik balanced & lentur murni (Pn≈0)
    var pb = pointAt(cBal, geo);
    r.Mbal = pb.Mn / 1e6; r.Pbal = pb.Pn / 1000;
    // cari M saat P=0 di kurva nominal (interpolasi)
    var M0 = 0;
    for (var j = 1; j < nom.length; j++) {
      if (nom[j - 1].Pn <= 0 && nom[j].Pn > 0) {
        var t = (0 - nom[j - 1].Pn) / (nom[j].Pn - nom[j - 1].Pn);
        M0 = nom[j - 1].Mn + t * (nom[j].Mn - nom[j - 1].Mn);
        break;
      }
    }
    r.M0 = M0;

    /* --- D/C radial (eksentrisitas konstan) --- */
    var dc = null;
    if (Pu > 0 || Mu > 0) {
      var angD = Math.atan2(Pu, Mu);                    // demand
      var rD = Math.sqrt(Pu * Pu + Mu * Mu);
      // telusuri kurva desain cari segmen yang memuat sudut demand
      var best = null;
      for (var k = 1; k < des.length; k++) {
        var a1 = Math.atan2(des[k - 1].P, des[k - 1].M);
        var a2 = Math.atan2(des[k].P, des[k].M);
        if ((a1 - angD) * (a2 - angD) <= 0 && Math.abs(a1 - a2) < 1) {
          var tt = Math.abs(a2 - a1) < 1e-12 ? 0 : (angD - a1) / (a2 - a1);
          var Mi = des[k - 1].M + tt * (des[k].M - des[k - 1].M);
          var Pi = des[k - 1].P + tt * (des[k].P - des[k - 1].P);
          var rC = Math.sqrt(Mi * Mi + Pi * Pi);
          if (rC > 0) best = { M: Mi, P: Pi, rC: rC };
        }
      }
      if (best) dc = rD / best.rC;
      else if (Mu === 0 && Pu > 0) dc = Pu / (phiC * PnMax);
      r.capPoint = best;
    }
    r.dc = dc;
    r.valid = true;

    /* --- peringatan --- */
    if (rho < 0.01) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% < 1% (SNI 2847 Ps. 10.6.1.1) — tambah tulangan.');
    if (rho > 0.08) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% > 8% — melampaui batas maksimum.');
    else if (rho > 0.04) r.warn.push('ρg = ' + (rho * 100).toFixed(2) + '% > 4% — sulit dilaksanakan di sambungan lewatan (praktik).');
    var clear = (b - 2 * dp) / Math.max(1, nx - 1) - db;
    if (nx > 1 && clear < Math.max(40, 1.5 * db))
      r.warn.push('Spasi bersih antar batang muka lebar ≈ ' + clear.toFixed(0) + ' mm < maks(40, 1,5db) (Ps. 25.2.3) — kurangi jumlah/perbesar b.');
    if (dc != null && dc > 1) r.warn.push('D/C = ' + dc.toFixed(2) + ' > 1 — titik beban di LUAR kurva desain.');
    r.warn.push('Kelangsingan/momen orde-2 TIDAK diperhitungkan — Mu harus sudah termasuk pembesaran momen bila kolom langsing (Ps. 6.6.4).');

    return r;
  }

  /* ============================================================
     KANVAS — kiri: penampang; kanan: diagram P–M
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat diagram P–M.', w / 2, h / 2);
      return;
    }
    var line = css('--line');
    var splitX = Math.max(190, w * 0.32);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(splitX, 8); ctx.lineTo(splitX, h - 8); ctx.stroke();

    drawSection(ctx, 0, 0, splitX, h, r);
    drawPM(ctx, splitX, 0, w - splitX, h, r);
  }

  function drawSection(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber'), line = css('--line');
    var padT = 46, padB = 34;
    var availW = W - 46, availH = H - padT - padB;
    var sc = Math.min(availW / r.b, availH / r.h);
    if (sc <= 0) return;
    var bw = r.b * sc, bh = r.h * sc;
    var cx = x0 + W / 2, cy = y0 + padT + availH / 2;
    var px = cx - bw / 2, py = cy - bh / 2;

    ctx.fillStyle = line; ctx.globalAlpha = 0.3;
    ctx.fillRect(px, py, bw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = dim; ctx.lineWidth = 1.3;
    ctx.strokeRect(px, py, bw, bh);
    // sengkang
    var off = Math.max(3, (r.dp - r.db / 2) * sc * 0.55);
    ctx.strokeStyle = dim; ctx.globalAlpha = 0.5;
    ctx.strokeRect(px + off, py + off, bw - 2 * off, bh - 2 * off);
    ctx.globalAlpha = 1;

    // batang: baris atas/bawah nx; baris antara 2 batang
    var rBar = Math.max(2.5, r.db * sc / 2);
    ctx.fillStyle = amber;
    r.rows.forEach(function (row) {
      var y = py + row.d * sc;
      if (row.n >= 2 && (row.d === r.dp || Math.abs(row.d - (r.h - r.dp)) < 1e-6)) {
        for (var i = 0; i < row.n; i++) {
          var x = px + r.dp * sc + (bw - 2 * r.dp * sc) * (row.n === 1 ? 0.5 : i / (row.n - 1));
          ctx.beginPath(); ctx.arc(x, y, rBar, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        [px + r.dp * sc, px + bw - r.dp * sc].forEach(function (x) {
          ctx.beginPath(); ctx.arc(x, y, rBar, 0, Math.PI * 2); ctx.fill();
        });
      }
    });

    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('b=' + r.b, cx, py + bh + 14);
    ctx.save();
    ctx.translate(px - 8, cy); ctx.rotate(-Math.PI / 2);
    ctx.fillText('h=' + r.h, 0, 0);
    ctx.restore();
    ctx.fillText(r.nBars + 'D' + r.db + ' · ρ ' + (r.rho * 100).toFixed(2) + '%', cx, y0 + H - 12);
  }

  function drawPM(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', line = css('--line'), bad = css('--bad') || '#e5694f';
    var padT = 44, padB = 34, padL = 64, padR = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    if (plotW < 80 || plotH < 80) return;

    var Mmax = 1, Pmax = 1, Pmin = 0;
    r.nom.forEach(function (p) { Mmax = Math.max(Mmax, p.Mn); Pmax = Math.max(Pmax, p.Pn); Pmin = Math.min(Pmin, p.Pn); });
    Mmax = Math.max(Mmax, r.Mu) * 1.12;
    Pmax = Math.max(Pmax, r.Pu) * 1.1;
    Pmin *= 1.15;

    var xOf = function (M) { return x0 + padL + M / Mmax * plotW; };
    var yOf = function (P) { return y0 + padT + (Pmax - P) / (Pmax - Pmin) * plotH; };

    // sumbu
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + padL, yOf(0)); ctx.lineTo(x0 + W - padR, yOf(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + padL, y0 + padT); ctx.lineTo(x0 + padL, y0 + H - padB); ctx.stroke();
    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('M (kN·m)', x0 + W - padR - 56, yOf(0) - 6);
    ctx.save(); ctx.translate(x0 + padL + 10, y0 + padT + 8); ctx.fillText('P (kN)', 0, 0); ctx.restore();
    // ticks kasar
    ctx.textAlign = 'right';
    [Pmax / 1.1 * 0.999, Pmax / 2.2, 0, Pmin / 1.15].forEach(function (P) {
      ctx.fillText(P.toFixed(0), x0 + padL - 4, yOf(P) + 3);
    });
    ctx.textAlign = 'center';
    ctx.fillText((Mmax / 1.12).toFixed(0), xOf(Mmax / 1.12), yOf(0) + 12);

    // kurva nominal (putus sage)
    ctx.strokeStyle = sage; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    r.nom.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(xOf(p.Mn), yOf(p.Pn)); else ctx.lineTo(xOf(p.Mn), yOf(p.Pn));
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // kurva desain (amber solid)
    ctx.strokeStyle = amber; ctx.lineWidth = 2;
    ctx.beginPath();
    r.des.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(xOf(p.M), yOf(p.P)); else ctx.lineTo(xOf(p.M), yOf(p.P));
    });
    ctx.stroke();

    // titik balanced (nominal)
    ctx.fillStyle = sky;
    ctx.beginPath(); ctx.arc(xOf(r.Mbal), yOf(r.Pbal), 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = sky;
    ctx.fillText('balanced', xOf(r.Mbal) + 6, yOf(r.Pbal) + 3);

    // titik demand
    if (r.Pu > 0 || r.Mu > 0) {
      ctx.fillStyle = bad;
      ctx.beginPath(); ctx.arc(xOf(r.Mu), yOf(r.Pu), 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = bad; ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xOf(0), yOf(0)); ctx.lineTo(xOf(r.Mu), yOf(r.Pu)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.fillStyle = bad;
      ctx.fillText('(Mu,Pu)' + (r.dc != null ? ' D/C ' + r.dc.toFixed(2) : ''), xOf(r.Mu) + 7, yOf(r.Pu) - 5);
    }

    // hover: cari titik kurva nominal terdekat (dalam koordinat piksel)
    if (state.mouse && state.mouse.x > x0) {
      var best = null, bd = 1e9;
      r.nom.forEach(function (p) {
        var dx = xOf(p.Mn) - state.mouse.x, dy = yOf(p.Pn) - state.mouse.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = p; }
      });
      if (best && bd < 900) {
        state.UI.canvasTip(ctx, {
          mx: state.mouse.x, my: state.mouse.y, w: x0 + W, h: y0 + H, topBand: 34,
          text: 'Mn ' + best.Mn.toFixed(0) + ' · Pn ' + best.Pn.toFixed(0) +
            (isFinite(best.epsT) ? ' · εt ' + best.epsT.toFixed(4) : '') + ' · φ ' + best.phi.toFixed(2)
        });
      }
    }
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('pm-style')) return;
    var s = document.createElement('style');
    s.id = 'pm-style';
    s.textContent =
      '.pm-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.pm-canvas{position:relative;flex:1 1 52%;min-height:260px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.pm-res{flex:1 1 48%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Diagram P–M Kolom'));
    panel.appendChild(UI.el('div', 'sub', 'Diagram interaksi aksial–momen kolom beton bertulang persegi ' +
      '(uniaksial) via kompatibilitas regangan — SNI 2847:2019: kurva nominal & desain (φ Tabel 21.2.2, ' +
      'plafon 0,80/0,85·Po), titik balanced, dan D/C titik beban.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Penampang' },
      { type: 'number', id: 'b', label: 'Lebar b (sejajar sumbu lentur)', unit: 'mm', value: 400, min: 150, step: 25 },
      { type: 'number', id: 'h', label: 'Tinggi h (arah lentur)', unit: 'mm', value: 400, min: 150, step: 25 },
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
      { type: 'number', id: 'Mu', label: 'Momen Mu', unit: 'kN·m', value: 150, min: 0, step: 10, hint: 'Termasuk pembesaran momen bila kolom langsing.' }
    ];

    var results = UI.el('div', 'pm-res');
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

    var work = UI.el('div', 'pm-work');
    var canvasHost = UI.el('div', 'pm-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Diagram P–M kolom');
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
  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Diagram P–M kolom');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set(r.b + '×' + r.h + ' · ' + r.nBars + 'D' + r.db +
      (r.dc != null ? ' · D/C ' + r.dc.toFixed(2) : ''));

    if (r.dc != null)
      results.appendChild(UI.hero('D/C titik (Pu,Mu) — radial', UI.fmt(r.dc, 2), r.dc <= 1 ? 'OK' : 'NG'));
    else
      results.appendChild(UI.hero('φPn maks (plafon aksial)', UI.fmt(r.phiPnMax, 0), 'kN'));

    results.appendChild(UI.rhead('Penampang & tulangan'));
    results.appendChild(UI.kv('Ag / Ast', UI.fmt(r.Ag, 0) + ' / ' + UI.fmt(r.Ast, 0) + ' mm²'));
    results.appendChild(UI.kv('ρg', (r.rho * 100).toFixed(2) + ' %', (r.rho >= 0.01 && r.rho <= 0.08) ? 'ok' : 'bad'));
    results.appendChild(UI.kv('β1 / εty', r.beta1.toFixed(3) + ' / ' + r.ety.toFixed(4)));

    results.appendChild(UI.rhead('Titik-titik kunci (nominal)'));
    results.appendChild(UI.kv('Po (tekan murni)', UI.fmt(r.Po, 0) + ' kN'));
    results.appendChild(UI.kv('Pn,maks = ' + r.alphaMax.toFixed(2) + '·Po', UI.fmt(r.PnMax, 0) + ' kN'));
    results.appendChild(UI.kv('Balanced (cb=' + r.cBal.toFixed(0) + ' mm)', 'Mb ' + UI.fmt(r.Mbal, 0) + ' kN·m · Pb ' + UI.fmt(r.Pbal, 0) + ' kN'));
    results.appendChild(UI.kv('Lentur murni Mn (P=0)', UI.fmt(r.M0, 0) + ' kN·m'));
    results.appendChild(UI.kv('Tarik murni Pnt', UI.fmt(r.Pnt, 0) + ' kN'));

    results.appendChild(UI.rhead('Kurva desain (φ)'));
    results.appendChild(UI.kv('φ tekan / tarik terkendali', r.phiC.toFixed(2) + ' / 0,90'));
    results.appendChild(UI.kv('φPn plafon = ' + r.phiC.toFixed(2) + '·' + r.alphaMax.toFixed(2) + '·Po', UI.fmt(r.phiPnMax, 0) + ' kN'));
    if (r.dc != null && r.capPoint)
      results.appendChild(UI.kv('Kapasitas se-eksentrisitas (e=' + (r.Pu > 0 ? (r.Mu / r.Pu * 1000).toFixed(0) : '∞') + ' mm)',
        'φMn ' + UI.fmt(r.capPoint.M, 0) + ' kN·m · φPn ' + UI.fmt(r.capPoint.P, 0) + ' kN'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 2847:2019 — kompatibilitas regangan (εcu 0,003, blok persegi β1), Es 200.000 MPa, baja elastoplastis ±fy, ' +
      'koreksi beton terdesak pada baris dalam blok tekan. φ Tabel 21.2.2 (transisi εty…εty+0,003), plafon aksial ' +
      '0,80·Po (ikat) / 0,85·Po (spiral) Ps. 22.4.2. Pola tulangan keliling simetris. <b>Lentur uniaksial</b> ' +
      'terhadap sumbu-X. <b>TIDAK termasuk</b>: biaksial (Bresler), kelangsingan (Ps. 6.6.4 — Mu harus sudah ' +
      'diperbesar), detail gempa (Ps. 18), penampang non-persegi. Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.1.0', RW = 62;
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
      .replace(/φ/g, 'phi').replace(/β/g, 'beta').replace(/ε/g, 'eps').replace(/'/g, "'")
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

  function buildReport(r) {
    var now = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('DIAGRAM INTERAKSI P-M KOLOM (SNI 2847:2019)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Kompatibilitas regangan, uniaksial', dt));
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
    L.push(rowR('Balanced cb / Mb / Pb', numR(r.cBal, 0) + ' mm / ' + numR(r.Mbal, 0) + ' kNm / ' + numR(r.Pbal, 0) + ' kN'));
    L.push(rowR('Lentur murni Mn(P=0)', numR(r.M0, 0) + ' kNm'));
    L.push(rowR('Tarik murni Pnt', numR(r.Pnt, 0) + ' kN'));
    L.push('');
    L.push(' KURVA DESAIN'); L.push(ruleR('='));
    L.push(rowR('phi tekan/tarik', numR(r.phiC, 2) + ' / 0.90 (transisi eps_ty..+0.003)'));
    L.push(rowR('phi*Pn plafon', numR(r.phiPnMax, 0) + ' kN'));
    if (r.dc != null) {
      L.push(rowR('Titik uji Pu / Mu', numR(r.Pu, 0) + ' kN / ' + numR(r.Mu, 0) + ' kNm'));
      if (r.capPoint)
        L.push(rowR('Kapasitas se-eksentrisitas', 'phiMn ' + numR(r.capPoint.M, 0) + ' / phiPn ' + numR(r.capPoint.P, 0)));
      L.push(rowR('>> D/C radial', numR(r.dc, 2) + (r.dc <= 1 ? ' OK' : ' NG')));
    }
    L.push(ruleR('='));
    L.push('');
    L.push(' SAMPEL KURVA DESAIN (phiMn kNm ; phiPn kN)');
    L.push(ruleR('-'));
    var step = Math.max(1, Math.floor(r.des.length / 14));
    for (var i = 0; i < r.des.length; i += step) {
      L.push(rowR('  ' + numR(r.des[i].M, 0), numR(r.des[i].P, 0)));
    }

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Uniaksial sumbu-X, pola keliling simetris. BELUM: biaksial,');
    L.push(' kelangsingan orde-2, detail gempa Ps.18. Verifikasi insinyur.');
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
    var base = 'Kolom-PM_' + r.b + 'x' + r.h + '_' + r.nBars + 'D' + r.db + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Diagram P–M Kolom', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

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
