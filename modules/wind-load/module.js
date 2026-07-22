/* ============================================================
   Civil Tools — modules/wind-load/module.js  (Tier 2, kanvas 2D)
   Beban Angin — SNI 1727:2020 (adopsi ASCE 7-16), prosedur pengarah
   (directional), SPGAU/MWFRS gedung tertutup kaku, DINDING.

   Rumus:
   - Tekanan velositas: qz = 0,613·Kz·Kzt·Kd·Ke·V²  (N/m²; V m/s)
   - Kz = 2,01·(z/zg)^(2/α), z ≥ 4,6 m (di bawahnya pakai z = 4,6 m)
       Eksposur B: α=7,0  zg=365,76 m · C: α=9,5 zg=274,32 · D: α=11,5 zg=213,36
   - Dinding datang (windward): p = qz·G·Cp − qh·(GCpi), Cp = +0,8 (variasi z)
   - Dinding pergi (leeward)  : p = qh·G·Cp − qh·(GCpi),
       Cp dari L/B: ≤1 → −0,5 · =2 → −0,3 · ≥4 → −0,2 (interpolasi linear)
   - Dinding samping           : Cp = −0,7 (qh)
   - GCpi: tertutup ±0,18 · tertutup sebagian ±0,55 · terbuka 0
   - Geser dasar arah angin: F = Σ strip [qz·G·0,8 + qh·G·|Cp,lee|]·B·dz
     (tekanan internal saling meniadakan untuk gaya horizontal total SPGAU)
   - Beban minimum SPGAU (Ps. 27.1.5): dinding 0,77 kN/m² (proyeksi vertikal)

   TIDAK termasuk: atap (uplift/zona atap datar & miring), gedung fleksibel
   (Gf, T > 1 dtk), topografi Kzt ≠ 1 dihitung manual, parapet, komponen &
   kladding (K&K), prosedur amplop (envelope). Verifikasi oleh insinyur.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'wind-load';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  var EXPO = {
    B: { alpha: 7.0, zg: 365.76 },
    C: { alpha: 9.5, zg: 274.32 },
    D: { alpha: 11.5, zg: 213.36 }
  };

  function KzAt(z, ex) {
    var e = EXPO[ex] || EXPO.C;
    var zz = Math.max(4.6, Math.min(z, e.zg));
    return 2.01 * Math.pow(zz / e.zg, 2 / e.alpha);
  }

  // Cp leeward dari L/B (Gbr. 27.3-1): ≤1 → −0,5; 2 → −0,3; ≥4 → −0,2
  function cpLee(LB) {
    if (LB <= 1) return -0.5;
    if (LB <= 2) return -0.5 + (LB - 1) * (0.2);        // −0,5 → −0,3
    if (LB <= 4) return -0.3 + (LB - 2) * (0.05);       // −0,3 → −0,2
    return -0.2;
  }

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var V = num(v.V);                    // m/s
    var ex = v.expo || 'C';
    var Kd = num(v.Kd) || 0.85;
    var Kzt = num(v.Kzt) || 1.0;
    var Ke = num(v.Ke) || 1.0;
    var G = num(v.G) || 0.85;
    var enc = v.enc || 'enclosed';
    var B = num(v.B), Lp = num(v.L), H = num(v.H);   // m (B tegak lurus angin)

    var GCpi = enc === 'partial' ? 0.55 : (enc === 'open' ? 0 : 0.18);
    r.V = V; r.expo = ex; r.Kd = Kd; r.Kzt = Kzt; r.Ke = Ke; r.G = G;
    r.enc = enc; r.GCpi = GCpi; r.B = B; r.L = Lp; r.H = H;

    if (V <= 0 || B <= 0 || Lp <= 0 || H <= 0) {
      r.warn.push('Lengkapi V, B, L, dan H (> 0).');
      return r;
    }

    var q = function (z) { return 0.613 * KzAt(z, ex) * Kzt * Kd * Ke * V * V / 1000; }; // kPa
    var Kh = KzAt(H, ex);
    var qh = q(H);
    r.Kh = Kh; r.qh = qh;

    var LB = Lp / B;
    var CpL = cpLee(LB);
    var CpW = 0.8, CpS = -0.7;
    r.LB = LB; r.CpL = CpL; r.CpW = CpW; r.CpS = CpS;

    /* --- tekanan desain dinding (kPa) --- */
    // windward di puncak (z=H), dua tanda GCpi
    r.pWWtopPlus = qh * G * CpW - qh * GCpi;    // internal positif (mengurangi)
    r.pWWtopMinus = qh * G * CpW + qh * GCpi;   // internal negatif (menambah)
    r.pLee = qh * G * CpL - qh * GCpi;          // + internal positif → makin negatif? tanda: −qh·(+GCpi)
    r.pLeeMinus = qh * G * CpL + qh * GCpi;
    r.pSide = qh * G * CpS - qh * GCpi;
    r.pSideMinus = qh * G * CpS + qh * GCpi;
    // net horizontal (untuk geser dasar; internal saling meniadakan)
    r.pNetTop = qh * G * CpW + qh * G * Math.abs(CpL);

    /* --- tabel elevasi & geser dasar (integrasi 40 strip) --- */
    var nS = 40, dz = H / nS, F = 0, M = 0;
    var table = [];
    for (var i = 0; i < nS; i++) {
      var zMid = (i + 0.5) * dz;
      var pNet = q(zMid) * G * CpW + qh * G * Math.abs(CpL);
      F += pNet * B * dz;                     // kN
      M += pNet * B * dz * zMid;              // kN·m
    }
    // beban minimum 0,77 kPa pada proyeksi dinding (Ps. 27.1.5)
    var Fmin = 0.77 * B * H;
    r.F = F; r.M = M; r.Fmin = Fmin;
    r.minGoverns = Fmin > F;
    r.Fdesign = Math.max(F, Fmin);

    var levels = [0.25, 0.5, 0.75, 1.0];
    levels.forEach(function (f) {
      var z = f * H;
      var Kz = KzAt(z, ex), qz = q(z);
      table.push({
        z: z, Kz: Kz, qz: qz,
        pWW: qz * G * CpW - qh * GCpi,
        pWWm: qz * G * CpW + qh * GCpi
      });
    });
    r.table = table;
    r.valid = true;

    /* --- peringatan --- */
    if (H > 160)
      r.warn.push('H = ' + H.toFixed(0) + ' m sangat tinggi — cek fleksibilitas (T > 1 dtk → perlu Gf, bukan G=0,85). Prosedur ini untuk gedung KAKU.');
    else if (H > 60)
      r.warn.push('H > 60 m — prosedur pengarah tetap berlaku, tetapi pastikan gedung kaku (n1 ≥ 1 Hz); bila fleksibel gunakan Gf.');
    if (H / Math.min(B, Lp) > 4)
      r.warn.push('H/lebar-terkecil = ' + (H / Math.min(B, Lp)).toFixed(1) + ' > 4 — gedung langsing, kemungkinan fleksibel; periksa frekuensi alami.');
    if (r.minGoverns)
      r.warn.push('Beban minimum SPGAU 0,77 kN/m² (Ps. 27.1.5) MENENTUKAN: F,min = ' + Fmin.toFixed(1) + ' kN > hasil hitungan ' + F.toFixed(1) + ' kN.');
    if (V < 20 || V > 60)
      r.warn.push('V = ' + V + ' m/s di luar rentang lazim peta angin Indonesia (± 25–45 m/s) — pastikan satuan m/s (bukan km/jam).');
    if (Kzt !== 1)
      r.warn.push('Kzt = ' + Kzt + ' ≠ 1 — pastikan dihitung dari Ps. 26.8 (bukit/escarpment).');
    r.warn.push('Atap TIDAK dihitung (uplift atap datar/miring, zona tepi) — tinjau terpisah. Tekanan dinding samping & internal untuk desain elemen dinding (K&K perlu prosedur Bab 30).');

    return r;
  }

  /* ============================================================
     KANVAS — elevasi gedung + profil tekanan windward/leeward
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat profil tekanan.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', line = css('--line'), bad = css('--bad') || '#e5694f';

    var padT = 46, padB = 40, padL = 30, padR = 30;
    var availH = h - padT - padB;
    // layout: [profil tekanan windward] [gedung] [leeward]
    var profW = Math.max(90, w * 0.26);
    var bldW = Math.max(70, Math.min(150, w * 0.2));
    var cx = w * 0.52;
    var gx0 = cx - bldW / 2, gx1 = cx + bldW / 2;
    var scaleY = availH / r.H;
    var yOf = function (z) { return padT + availH - z * scaleY; };

    // tanah
    ctx.strokeStyle = dim; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(w - padR, yOf(0)); ctx.stroke();
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (var gx = padL; gx < w - padR; gx += 14) {
      ctx.beginPath(); ctx.moveTo(gx, yOf(0)); ctx.lineTo(gx - 6, yOf(0) + 7); ctx.stroke();
    }

    // gedung
    ctx.fillStyle = line; ctx.globalAlpha = 0.3;
    ctx.fillRect(gx0, yOf(r.H), bldW, availH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    ctx.strokeRect(gx0, yOf(r.H), bldW, availH);

    // profil tekanan windward (kurva qz·G·Cp) — sisi kiri gedung
    var pMax = r.qh * r.G * r.CpW;
    var pScale = (profW - 26) / Math.max(0.01, pMax);
    ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 1.6;
    ctx.beginPath();
    var steps = 32;
    for (var i = 0; i <= steps; i++) {
      var z = r.H * i / steps;
      var p = 0.613 * KzAt(Math.max(z, 0.01), r.expo) * r.Kzt * r.Kd * r.Ke * r.V * r.V / 1000 * r.G * r.CpW;
      var x = gx0 - p * pScale, y = yOf(z);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.lineTo(gx0, yOf(r.H)); ctx.lineTo(gx0, yOf(0)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // panah windward (3 elevasi)
    [0.25, 0.55, 0.85].forEach(function (f) {
      var z = f * r.H;
      var p = 0.613 * KzAt(z, r.expo) * r.Kzt * r.Kd * r.Ke * r.V * r.V / 1000 * r.G * r.CpW;
      var x0a = gx0 - p * pScale, y = yOf(z);
      ctx.strokeStyle = amber; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x0a, y); ctx.lineTo(gx0 - 3, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx0 - 9, y - 4); ctx.lineTo(gx0 - 3, y); ctx.lineTo(gx0 - 9, y + 4); ctx.stroke();
    });

    // leeward (konstan, hisap) — panah menjauh sisi kanan
    var pL = Math.abs(r.qh * r.G * r.CpL);
    var pLpx = pL * pScale;
    ctx.strokeStyle = sky; ctx.lineWidth = 1.4;
    [0.25, 0.55, 0.85].forEach(function (f) {
      var y = yOf(f * r.H);
      ctx.beginPath(); ctx.moveTo(gx1 + 3, y); ctx.lineTo(gx1 + 3 + pLpx, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx1 + pLpx - 3, y - 4); ctx.lineTo(gx1 + 3 + pLpx, y); ctx.lineTo(gx1 + pLpx - 3, y + 4); ctx.stroke();
    });
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(gx1 + 3 + pLpx, yOf(0)); ctx.lineTo(gx1 + 3 + pLpx, yOf(r.H)); ctx.stroke();
    ctx.setLineDash([]);

    // label
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = amber; ctx.textAlign = 'right';
    ctx.fillText('windward', gx0 - 8, yOf(r.H) - 8);
    ctx.fillText('q' + '·G·Cp', gx0 - 8, yOf(r.H) + 4);
    ctx.fillStyle = sky; ctx.textAlign = 'left';
    ctx.fillText('leeward ' + pL.toFixed(2) + ' kPa', gx1 + 8, yOf(r.H) - 8);
    ctx.fillStyle = dim; ctx.textAlign = 'center';
    ctx.fillText('H=' + r.H.toFixed(0) + ' m · B=' + r.B.toFixed(0) + ' m', cx, yOf(r.H) - 20);
    ctx.fillStyle = ink; ctx.textAlign = 'center';
    ctx.fillText('F = ' + r.Fdesign.toFixed(1) + ' kN' + (r.minGoverns ? ' (min!)' : ''), cx, h - 14);

    // hover
    if (state.mouse) {
      var my = state.mouse.y;
      if (my >= padT && my <= padT + availH) {
        var zH = (padT + availH - my) / scaleY;
        var Kz = KzAt(Math.max(zH, 0.01), r.expo);
        var qz = 0.613 * Kz * r.Kzt * r.Kd * r.Ke * r.V * r.V / 1000;
        state.UI.canvasTip(ctx, {
          mx: state.mouse.x, my: my, w: w, h: h, topBand: 34,
          text: 'z=' + zH.toFixed(1) + ' m · Kz ' + Kz.toFixed(2) + ' · qz ' + qz.toFixed(3) +
            ' kPa · p,ww ' + (qz * r.G * r.CpW).toFixed(3) + ' kPa'
        });
      }
    }
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('wl-style')) return;
    var s = document.createElement('style');
    s.id = 'wl-style';
    s.textContent =
      '.wl-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.wl-canvas{position:relative;flex:1 1 46%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.wl-res{flex:1 1 54%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Beban Angin'));
    panel.appendChild(UI.el('div', 'sub', 'Tekanan angin desain dinding SPGAU/MWFRS — prosedur pengarah ' +
      'SNI 1727:2020 (ASCE 7-16) Bab 26–27, gedung tertutup kaku: qz, tekanan windward/leeward/samping ' +
      '± tekanan internal, dan gaya geser dasar arah angin.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Angin Dasar' },
      { type: 'number', id: 'V', label: 'Kecepatan angin dasar V', unit: 'm/s', value: 35, min: 10, step: 1, hint: 'Peta SNI 1727 / kajian hazard lokal (MRI sesuai kategori risiko).' },
      { type: 'segment', id: 'expo', label: 'Kategori eksposur', value: 'C', options: [
        { value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'D', label: 'D' } ] },
      { type: 'number', id: 'Kd', label: 'Faktor arah Kd', value: 0.85, min: 0.5, max: 1, step: 0.05, hint: 'Gedung SPGAU: 0,85 (Tabel 26.6-1).' },
      { type: 'number', id: 'Kzt', label: 'Faktor topografi Kzt', value: 1.0, min: 1, max: 3, step: 0.05 },
      { type: 'number', id: 'Ke', label: 'Faktor elevasi Ke', value: 1.0, min: 0.8, max: 1, step: 0.01, hint: '1,0 permukaan laut; boleh <1 di dataran tinggi (Tabel 26.9-1).' },
      { type: 'number', id: 'G', label: 'Faktor efek hembusan G', value: 0.85, min: 0.8, max: 1, step: 0.01, hint: '0,85 untuk gedung kaku (n1 ≥ 1 Hz).' },
      { type: 'select', id: 'enc', label: 'Klasifikasi ketertutupan', value: 'enclosed', options: [
        { value: 'enclosed', label: 'Tertutup (GCpi ±0,18)' },
        { value: 'partial', label: 'Tertutup sebagian (±0,55)' },
        { value: 'open', label: 'Terbuka (0)' } ] },

      { type: 'group', label: 'Dimensi Gedung' },
      { type: 'number', id: 'B', label: 'Lebar B (tegak lurus angin)', unit: 'm', value: 30, min: 1, step: 1 },
      { type: 'number', id: 'L', label: 'Panjang L (sejajar angin)', unit: 'm', value: 20, min: 1, step: 1 },
      { type: 'number', id: 'H', label: 'Tinggi atap rata-rata H', unit: 'm', value: 24, min: 3, step: 1 }
    ];

    var results = UI.el('div', 'wl-res');
    var form = UI.buildForm(panel, schema, function (vals) {
      update(vals, results);
    }, ID);
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

    var work = UI.el('div', 'wl-work');
    var canvasHost = UI.el('div', 'wl-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Beban angin');
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
      state.cap.set('Beban angin');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set('V=' + r.V + ' m/s · Eksp. ' + r.expo + ' · qh ' + r.qh.toFixed(3) +
      ' kPa · F ' + r.Fdesign.toFixed(0) + ' kN');

    results.appendChild(UI.heroRow([
      { label: 'Geser dasar F' + (r.minGoverns ? ' (min)' : ''), value: UI.fmt(r.Fdesign, 1), unit: 'kN' },
      { label: 'Tekanan velositas qh', value: r.qh.toFixed(3), unit: 'kPa' },
      { label: 'Momen guling dasar', value: UI.fmt(r.M, 0), unit: 'kN·m' }
    ]));

    results.appendChild(UI.rhead('Tekanan velositas'));
    results.appendChild(UI.kv('Kh (z = H = ' + r.H + ' m)', r.Kh.toFixed(3)));
    results.appendChild(UI.kv('qh = 0,613·Kh·Kzt·Kd·Ke·V²', r.qh.toFixed(3) + ' kPa'));
    results.appendChild(UI.kv('GCpi (' + (r.enc === 'enclosed' ? 'tertutup' : r.enc === 'partial' ? 'tertutup sebagian' : 'terbuka') + ')', '±' + r.GCpi));

    results.appendChild(UI.rhead('Koefisien tekanan dinding (Gbr. 27.3-1)'));
    results.appendChild(UI.kv('Windward Cp', '+' + r.CpW.toFixed(2)));
    results.appendChild(UI.kv('Leeward Cp (L/B = ' + r.LB.toFixed(2) + ')', r.CpL.toFixed(2)));
    results.appendChild(UI.kv('Samping Cp', r.CpS.toFixed(2)));

    results.appendChild(UI.rhead('Tekanan desain p (kPa) — di puncak, ± internal'));
    results.appendChild(UI.kv('Windward (+GCpi / −GCpi)', r.pWWtopPlus.toFixed(3) + ' / ' + r.pWWtopMinus.toFixed(3)));
    results.appendChild(UI.kv('Leeward (+GCpi / −GCpi)', r.pLee.toFixed(3) + ' / ' + r.pLeeMinus.toFixed(3)));
    results.appendChild(UI.kv('Samping (+GCpi / −GCpi)', r.pSide.toFixed(3) + ' / ' + r.pSideMinus.toFixed(3)));
    results.appendChild(UI.kv('Net windward+leeward (puncak)', r.pNetTop.toFixed(3) + ' kPa'));

    results.appendChild(UI.rhead('Distribusi windward per elevasi'));
    r.table.forEach(function (t) {
      results.appendChild(UI.kv('z = ' + t.z.toFixed(1) + ' m · Kz ' + t.Kz.toFixed(3),
        'qz ' + t.qz.toFixed(3) + ' → p ' + t.pWW.toFixed(3) + ' / ' + t.pWWm.toFixed(3) + ' kPa'));
    });

    results.appendChild(UI.rhead('Gaya total arah angin'));
    results.appendChild(UI.kv('F hitungan (windward+leeward)', UI.fmt(r.F, 1) + ' kN'));
    results.appendChild(UI.kv('F minimum 0,77 kPa × B×H (27.1.5)', UI.fmt(r.Fmin, 1) + ' kN', r.minGoverns ? 'bad' : ''));
    results.appendChild(UI.kv('Momen guling dasar (hitungan)', UI.fmt(r.M, 0) + ' kN·m'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1727:2020 (adopsi ASCE 7-16) Bab 26–27, <b>prosedur pengarah</b>, gedung <b>tertutup & kaku</b> ' +
      '(G = 0,85), SPGAU/MWFRS <b>dinding</b> satu arah angin (tegak lurus lebar B). qz = 0,613·Kz·Kzt·Kd·Ke·V². ' +
      'Geser dasar mengintegrasikan windward (variasi z) + leeward (konstan qh); tekanan internal saling ' +
      'meniadakan pada gaya horizontal total. Nilai V dari peta angin SNI/kajian hazard sesuai kategori risiko. ' +
      '<b>TIDAK termasuk</b>: atap (uplift), gedung fleksibel (Gf), K&K (Bab 30), parapet, prosedur amplop. ' +
      'Jalankan untuk kedua arah gedung (tukar B↔L). Verifikasi oleh insinyur penanggung jawab.'));

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
    value = '' + value; var l = label + ' ', v = ' ' + value;
    var d = RW - l.length - v.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + v;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n) || !isFinite(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x').replace(/±/g, '+/-')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/↔/g, '<->')
      .replace(/α/g, 'alpha').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('BEBAN ANGIN SPGAU - DINDING (SNI 1727:2020)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Prosedur pengarah, gedung tertutup kaku', dt));
    L.push('');
    L.push(' PARAMETER'); L.push(ruleR('-'));
    L.push(rowR('V dasar', numR(r.V, 1) + ' m/s'));
    L.push(rowR('Eksposur', r.expo));
    L.push(rowR('Kd / Kzt / Ke / G', numR(r.Kd, 2) + ' / ' + numR(r.Kzt, 2) + ' / ' + numR(r.Ke, 2) + ' / ' + numR(r.G, 2)));
    L.push(rowR('GCpi', '+/-' + numR(r.GCpi, 2)));
    L.push(rowR('B x L x H', numR(r.B, 1) + ' x ' + numR(r.L, 1) + ' x ' + numR(r.H, 1) + ' m'));
    L.push('');
    L.push(' TEKANAN VELOSITAS'); L.push(ruleR('-'));
    L.push(rowR('Kh (z=H)', numR(r.Kh, 3)));
    L.push(rowR('qh', numR(r.qh, 3) + ' kPa'));
    L.push('');
    L.push(' KOEFISIEN Cp DINDING'); L.push(ruleR('-'));
    L.push(rowR('Windward / Leeward / Samping', '+0.80 / ' + numR(r.CpL, 2) + ' / -0.70'));
    L.push('');
    L.push(' TEKANAN DESAIN (kPa, +GCpi / -GCpi)'); L.push(ruleR('='));
    L.push(rowR('Windward puncak', numR(r.pWWtopPlus, 3) + ' / ' + numR(r.pWWtopMinus, 3)));
    L.push(rowR('Leeward', numR(r.pLee, 3) + ' / ' + numR(r.pLeeMinus, 3)));
    L.push(rowR('Samping', numR(r.pSide, 3) + ' / ' + numR(r.pSideMinus, 3)));
    L.push('');
    L.push(' DISTRIBUSI WINDWARD'); L.push(ruleR('-'));
    r.table.forEach(function (t) {
      L.push(rowR('z=' + numR(t.z, 1) + ' m  Kz=' + numR(t.Kz, 3), 'qz ' + numR(t.qz, 3) + ' kPa'));
    });
    L.push('');
    L.push(' GAYA TOTAL ARAH ANGIN'); L.push(ruleR('='));
    L.push(rowR('F hitungan', numR(r.F, 1) + ' kN'));
    L.push(rowR('F minimum (0.77 kPa)', numR(r.Fmin, 1) + ' kN' + (r.minGoverns ? ' <<MENENTUKAN' : '')));
    L.push(rowR('>> F DESAIN', numR(r.Fdesign, 1) + ' kN'));
    L.push(rowR('Momen guling dasar', numR(r.M, 0) + ' kN*m'));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' SPGAU dinding satu arah. BELUM: atap, Gf fleksibel, K&K,');
    L.push(' parapet. Jalankan dua arah (tukar B<->L). Verifikasi insinyur.');
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
    var base = 'Beban-Angin_V' + r.V + '_H' + r.H + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Beban Angin', category: 'Umum', needsCanvas: true, needsRenderer: false },

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
