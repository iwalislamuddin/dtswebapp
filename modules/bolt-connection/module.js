/* ============================================================
   Civil Tools — modules/bolt-connection/module.js  (Tier 2, kanvas 2D)
   Sambungan Baut — geser, tarik, kombinasi & tumpu (bearing/tearout).
   Referensi: SNI 1729:2020 (adopsi AISC 360-16) Ps. J3, DFBK (φ=0,75).

   Cakupan:
   - Kuat geser baut (J3.6)   : Rn = Fnv·Ab  (per bidang geser, ×m bidang)
   - Kuat tarik baut (J3.6)   : Rn = Fnt·Ab
   - Kombinasi tarik+geser (J3.7): F'nt = 1,3·Fnt − Fnt/(φ·Fnv)·frv ≤ Fnt
     (dilewati bila tegangan perlu ≤ 30% tegangan tersedia — J3.7)
   - Tumpu & sobek lubang (J3.10, lubang standar, deformasi diperhitungkan):
     Rn = 1,2·lc·t·Fu ≤ 2,4·d·t·Fu per baut; lc tepi = le−dh/2, lc dalam = s−dh
   - Kapasitas grup geser EFEKTIF = Σ min(geser baut, tumpu baut) per baut
     (AISC J3.6 commentary — lebih tepat daripada cek terpisah)
   - Mutu baut: A307, A325/Gr.8.8 (Grup A), A490/Gr.10.9 (Grup B), kustom;
     ulir N (termasuk bidang geser) / X (di luar bidang geser)
   - Batas geometri: spasi min 2,67d (pref. 3d, J3.3), jarak tepi min
     Tabel J3.4M, jarak tepi maks 12t ≤ 150 mm (J3.5)

   TIDAK termasuk: geser eksentris (metode pusat rotasi sesaat), slip-critical
   (baut mutu tinggi pratarik — ini tumpu/bearing type), blok geser pelat (J4.3),
   leleh/fraktur pelat sambung, prying action tarik.
   Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'bolt-connection';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  /* ---------- mutu baut (Tabel J3.2, MPa) ---------- */
  var GRADES = {
    a325: { label: 'A325 / Gr.8.8',  Fnt: 620, FnvN: 372, FnvX: 457, threadOpt: true },
    a490: { label: 'A490 / Gr.10.9', Fnt: 780, FnvN: 457, FnvX: 579, threadOpt: true },
    a307: { label: 'A307 (biasa)',   Fnt: 310, FnvN: 188, FnvX: 188, threadOpt: false },
    custom: { label: 'Kustom',       Fnt: 620, FnvN: 372, FnvX: 457, threadOpt: true }
  };

  // lubang standar (Tabel J3.3M): d<24 → d+2 ; d≥24 → d+3
  function holeDia(d) { return d + (d < 24 ? 2 : 3); }
  // jarak tepi minimum (Tabel J3.4M); fallback 1,25d
  var EDGE_MIN = { 16: 22, 20: 26, 22: 28, 24: 30, 27: 34, 30: 38, 36: 46 };
  function edgeMin(d) { return EDGE_MIN[d] || Math.ceil(1.25 * d); }

  /* ============================================================
     KALKULASI (SNI 1729:2020 Ps. J3, DFBK)
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var grade = v.grade || 'a325';
    var G = GRADES[grade];
    var thread = (grade === 'a307') ? 'N' : (v.thread || 'N');
    var Fnt = (grade === 'custom') ? num(v.Fnt) : G.Fnt;
    var Fnv = (grade === 'custom') ? num(v.Fnv) : (thread === 'X' ? G.FnvX : G.FnvN);
    var d = num(v.d);
    var m = Math.max(1, Math.round(num(v.planes)));      // jumlah bidang geser
    var nr = Math.max(1, Math.round(num(v.nr)));         // baris searah beban
    var nc = Math.max(1, Math.round(num(v.nc)));         // kolom tegak lurus beban
    var s = num(v.s);                                    // spasi searah beban (mm)
    var sg = num(v.sg);                                  // spasi tegak lurus (gage, mm) — utk gambar & cek
    var le = num(v.le);                                  // jarak tepi searah beban (mm)
    var t = num(v.t), Fu = num(v.Fu);                    // pelat tumpu
    var Vu = num(v.Vu), Tu = num(v.Tu);                  // kN pada grup

    var n = nr * nc;
    var Ab = Math.PI * d * d / 4;                        // mm²
    var dh = holeDia(d);
    var phi = 0.75;

    r.grade = grade; r.gradeLabel = G.label; r.thread = thread;
    r.Fnt = Fnt; r.Fnv = Fnv; r.d = d; r.m = m;
    r.nr = nr; r.nc = nc; r.n = n; r.s = s; r.sg = sg; r.le = le;
    r.t = t; r.Fu = Fu; r.Vu = Vu; r.Tu = Tu;
    r.Ab = Ab; r.dh = dh; r.phi = phi;

    /* --- per baut: beban --- */
    var rv = n > 0 ? Vu / n : 0;                         // kN geser per baut
    var rt = n > 0 ? Tu / n : 0;                         // kN tarik per baut
    r.rv = rv; r.rt = rt;

    /* --- geser baut (J3.6) --- */
    var rnv = Fnv * Ab * m / 1000;                       // kN nominal per baut
    var phiRnv = phi * rnv;
    r.rnv = rnv; r.phiRnv = phiRnv;

    /* --- tarik baut (J3.6) --- */
    var rnt = Fnt * Ab / 1000;
    var phiRnt = phi * rnt;
    r.rnt = rnt; r.phiRnt = phiRnt;
    r.dcTension = (Tu > 0) ? (phiRnt > 0 ? rt / phiRnt : Infinity) : 0;

    /* --- tumpu / sobek (J3.10) — per baut, lubang standar --- */
    var bearingOk = (t > 0 && Fu > 0 && le > 0);
    var lcEdge = le - dh / 2;
    var lcInner = s - dh;
    var rnBrgCap = 2.4 * d * t * Fu / 1000;              // kN batas atas
    var rnBrgEdge = 0, rnBrgInner = 0;
    if (bearingOk) {
      rnBrgEdge = Math.min(1.2 * Math.max(0, lcEdge) * t * Fu / 1000, rnBrgCap);
      rnBrgInner = (nr > 1) ? Math.min(1.2 * Math.max(0, lcInner) * t * Fu / 1000, rnBrgCap) : 0;
    }
    r.bearingOk = bearingOk; r.lcEdge = lcEdge; r.lcInner = lcInner;
    r.rnBrgEdge = rnBrgEdge; r.rnBrgInner = rnBrgInner; r.rnBrgCap = rnBrgCap;

    /* --- kapasitas grup geser EFEKTIF: Σ min(geser, tumpu) per baut --- */
    var Rge = 0;
    if (bearingOk) {
      // tiap kolom: 1 baut tepi + (nr−1) baut dalam
      Rge = nc * (Math.min(rnv, rnBrgEdge) + (nr - 1) * Math.min(rnv, rnBrgInner));
    } else {
      Rge = n * rnv;                                    // tanpa data pelat → geser baut saja
    }
    var phiRge = phi * Rge;
    r.Rge = Rge; r.phiRge = phiRge;
    r.dcShear = (Vu > 0) ? (phiRge > 0 ? Vu / phiRge : Infinity) : 0;

    // pembanding: total geser murni & total tumpu murni
    r.phiVboltTotal = phi * n * rnv;
    r.phiBrgTotal = bearingOk ? phi * nc * (rnBrgEdge + (nr - 1) * rnBrgInner) : null;

    /* --- kombinasi tarik + geser (J3.7) --- */
    var frv = (Ab > 0) ? rv * 1000 / (Ab * m) : 0;       // MPa tegangan geser perlu
    var frt = (Ab > 0) ? rt * 1000 / Ab : 0;             // MPa tegangan tarik perlu
    var ratioV = Fnv > 0 ? frv / (phi * Fnv) : 0;
    var ratioT = Fnt > 0 ? frt / (phi * Fnt) : 0;
    var comboNeeded = (Vu > 0 && Tu > 0 && ratioV > 0.3 && ratioT > 0.3);
    var FntMod = null, phiRntMod = null, dcCombo = 0;
    if (Vu > 0 && Tu > 0) {
      FntMod = Math.min(Fnt, Math.max(0, 1.3 * Fnt - Fnt / (phi * Fnv) * frv));
      phiRntMod = phi * FntMod * Ab / 1000;
      dcCombo = phiRntMod > 0 ? rt / phiRntMod : Infinity;
    }
    r.frv = frv; r.frt = frt; r.ratioV = ratioV; r.ratioT = ratioT;
    r.comboNeeded = comboNeeded; r.FntMod = FntMod; r.phiRntMod = phiRntMod;
    r.dcCombo = comboNeeded ? dcCombo : 0;
    r.dcComboInfo = dcCombo;                             // tampil walau tak wajib

    /* --- govern --- */
    var checks = [
      { key: 'geser',     dc: r.dcShear },
      { key: 'tarik',     dc: r.dcTension },
      { key: 'kombinasi', dc: r.dcCombo }
    ];
    var gov = checks[0];
    checks.forEach(function (c) { if (c.dc > gov.dc) gov = c; });
    r.gov = gov.key; r.govDC = gov.dc;
    r.valid = true;

    /* --- peringatan geometri & catatan --- */
    var sMin = Math.ceil(2.67 * d), sPref = 3 * d, leMin = edgeMin(d);
    r.sMin = sMin; r.sPref = sPref; r.leMin = leMin;
    if (nr > 1 && s < sMin)
      r.warn.push('Spasi s = ' + s + ' mm < minimum 2,67·d = ' + sMin + ' mm (J3.3) — TIDAK memenuhi syarat.');
    else if (nr > 1 && s < sPref)
      r.warn.push('Spasi s = ' + s + ' mm < preferensi 3·d = ' + sPref + ' mm (J3.3) — boleh, tetapi kurang disarankan.');
    if (nc > 1 && sg > 0 && sg < sMin)
      r.warn.push('Gage g = ' + sg + ' mm < minimum 2,67·d = ' + sMin + ' mm (J3.3).');
    if (le > 0 && le < leMin)
      r.warn.push('Jarak tepi le = ' + le + ' mm < minimum Tabel J3.4M = ' + leMin + ' mm — TIDAK memenuhi syarat.');
    if (t > 0 && le > Math.min(12 * t, 150))
      r.warn.push('Jarak tepi le = ' + le + ' mm > maksimum 12t = ' + Math.min(12 * t, 150).toFixed(0) + ' mm (J3.5).');
    if (bearingOk && lcEdge <= 0)
      r.warn.push('lc tepi = ' + lcEdge.toFixed(1) + ' mm ≤ 0 — lubang terlalu dekat tepi, kuat sobek nol.');
    if (!bearingOk && Vu > 0)
      r.warn.push('Data pelat (t, Fu, le) belum lengkap — cek tumpu/sobek dilewati; kapasitas geser = baut saja.');
    if (grade === 'a307' && v.thread === 'X')
      r.warn.push('A307: ulir selalu dianggap termasuk bidang geser (tidak ada opsi X).');
    if (Vu > 0 && Tu > 0 && !comboNeeded)
      r.warn.push('Interaksi J3.7 tidak wajib ditinjau (tegangan perlu ≤ 30% tersedia) — nilai tetap ditampilkan sebagai info.');
    if (r.dcShear > 1) r.warn.push('D/C geser grup = ' + r.dcShear.toFixed(2) + ' > 1 — tambah baut/diameter, atau perbaiki tumpu (t, le, s).');
    if (r.dcTension > 1) r.warn.push('D/C tarik = ' + r.dcTension.toFixed(2) + ' > 1 — tambah baut atau perbesar diameter.');
    if (r.dcCombo > 1) r.warn.push('D/C kombinasi tarik+geser = ' + r.dcCombo.toFixed(2) + ' > 1 (J3.7) — kombinasi menentukan.');

    return r;
  }

  /* ============================================================
     KANVAS — kiri: denah grup baut; kanan: bar keadaan batas
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat sambungan.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', line = css('--line'), bad = css('--bad') || '#e5694f';

    var splitX = Math.max(230, w * 0.44);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(splitX, 8); ctx.lineTo(splitX, h - 8); ctx.stroke();

    drawPlan(ctx, 0, 0, splitX, h, r);
    drawBars(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      var g = r.govDC;
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: 34,
        text: 'D/C ' + (isFinite(g) ? g.toFixed(2) : '—') + ' (' + r.gov + ') · ' + r.n + ' baut ' + r.gradeLabel
      });
    }
  }

  // Denah grup baut + panah beban + dimensi (pita .cap: tidak menggambar di y<34)
  function drawPlan(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber'), line = css('--line'), sky = css('--sky') || '#30bced';
    var padT = 46, padB = 34, padL = 46, padR = 30;
    var availW = W - padL - padR, availH = H - padT - padB;
    if (availW < 40 || availH < 40) return;

    // dimensi fisik grup (mm) + margin pelat 2·le sekeliling
    var gw = (r.nc - 1) * (r.sg || 3 * r.d), gh = (r.nr - 1) * (r.s || 3 * r.d);
    var margin = Math.max(r.le || 1.5 * r.d, 1.5 * r.d);
    var pw = gw + 2 * margin, ph = gh + 2 * margin;
    var sc = Math.min(availW / pw, availH / ph);
    var cx = x0 + padL + availW / 2, cy = y0 + padT + availH / 2;

    // pelat
    var px = cx - pw * sc / 2, py = cy - ph * sc / 2;
    ctx.fillStyle = line; ctx.globalAlpha = 0.25;
    ctx.fillRect(px, py, pw * sc, ph * sc);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = dim; ctx.lineWidth = 1.2;
    ctx.strokeRect(px, py, pw * sc, ph * sc);

    // baut
    var rB = Math.max(3, r.d * sc / 2);
    for (var i = 0; i < r.nr; i++) for (var j = 0; j < r.nc; j++) {
      var bx = cx + (j - (r.nc - 1) / 2) * (r.sg || 3 * r.d) * sc;
      var by = cy + (i - (r.nr - 1) / 2) * (r.s || 3 * r.d) * sc;
      ctx.beginPath(); ctx.arc(bx, by, rB, 0, Math.PI * 2);
      ctx.fillStyle = amber; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by, rB * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = ink; ctx.stroke();
    }

    // panah beban Vu (searah baris = vertikal ke bawah)
    if (r.Vu > 0) {
      var ax = cx, ay1 = py - 26, ay2 = py - 4;
      ctx.strokeStyle = css('--bad') || '#e5694f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay1); ctx.lineTo(ax, ay2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - 5, ay2 - 7); ctx.lineTo(ax, ay2); ctx.lineTo(ax + 5, ay2 - 7); ctx.stroke();
      ctx.fillStyle = css('--bad') || '#e5694f';
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('Vu ' + r.Vu.toFixed(0) + ' kN', ax + 8, ay1 + 10);
    }

    // dimensi spasi s (kanan grup) & le (bawah)
    ctx.strokeStyle = css('--sky') || '#30bced'; ctx.fillStyle = css('--sky') || '#30bced';
    ctx.lineWidth = 1; ctx.font = '9px "JetBrains Mono", monospace';
    if (r.nr > 1) {
      var dx = cx + (gw / 2 + margin * 0.55) * sc;
      var yA = cy - gh * sc / 2, yB = yA + (r.s || 3 * r.d) * sc;
      ctx.beginPath(); ctx.moveTo(dx, yA); ctx.lineTo(dx, yB); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText('s=' + r.s, dx + 3, (yA + yB) / 2 + 3);
    }
    var yEdge = cy + gh * sc / 2, yPl = py + ph * sc;
    ctx.beginPath(); ctx.moveTo(px + pw * sc * 0.18, yEdge); ctx.lineTo(px + pw * sc * 0.18, yPl); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText('le=' + r.le, px + pw * sc * 0.18 - 3, (yEdge + yPl) / 2 + 3);

    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(r.nr + '×' + r.nc + ' M' + r.d + ' (' + r.thread + ')', cx, y0 + H - 14);
  }

  // Bar perbandingan keadaan batas vs demand
  function drawBars(ctx, x0, y0, W, H, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', bad = css('--bad') || '#e5694f';
    var padT = 46, padB = 26, padL = 118, padR = 66;
    var availW = W - padL - padR;
    if (availW < 40) return;

    var rows = [];
    rows.push({ label: 'Geser grup', cap: r.phiRge, dem: r.Vu, dc: r.dcShear });
    if (r.Tu > 0) rows.push({ label: 'Tarik grup', cap: r.phiRnt * r.n, dem: r.Tu, dc: r.dcTension });
    if (r.phiRntMod != null && r.Tu > 0)
      rows.push({ label: 'Kombinasi J3.7', cap: r.phiRntMod * r.n, dem: r.Tu, dc: r.dcComboInfo, info: !r.comboNeeded });
    if (r.phiBrgTotal != null) rows.push({ label: 'Tumpu total', cap: r.phiBrgTotal, dem: r.Vu, dc: 0, aux: true });
    rows.push({ label: 'Geser baut ×n', cap: r.phiVboltTotal, dem: r.Vu, dc: 0, aux: true });

    var maxV = 1;
    rows.forEach(function (b) { maxV = Math.max(maxV, b.cap, b.dem); });
    var n = rows.length;
    var areaH = H - padT - padB, rowH = areaH / n, barH = Math.max(6, Math.min(18, rowH * 0.5));

    ctx.font = '10px "JetBrains Mono", monospace';
    rows.forEach(function (b, i) {
      var yMid = y0 + padT + i * rowH + rowH / 2;
      var y = yMid - barH / 2;
      var isGov = (b.dc === r.govDC && r.govDC > 0 && !b.aux);
      var len = b.cap / maxV * availW;

      ctx.fillStyle = b.aux ? dim : (isGov ? amber : sage);
      ctx.globalAlpha = b.aux ? 0.35 : (b.info ? 0.5 : 0.9);
      ctx.fillRect(x0 + padL, y, Math.max(2, len), barH);
      ctx.globalAlpha = 1;

      ctx.fillStyle = isGov ? amber : dim;
      ctx.textAlign = 'right';
      ctx.fillText(b.label, x0 + padL - 8, yMid + 3);
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      ctx.fillText(b.cap.toFixed(0), x0 + padL + Math.max(2, len) + 5, yMid + 3);

      // garis demand
      if (b.dem > 0) {
        var dxm = x0 + padL + b.dem / maxV * availW;
        ctx.strokeStyle = bad; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(dxm, y - 3); ctx.lineTo(dxm, y + barH + 3); ctx.stroke();
      }
    });

    ctx.fillStyle = dim; ctx.textAlign = 'left';
    ctx.fillText('kN · garis merah = demand', x0 + padL, y0 + H - 10);
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('bc-style')) return;
    var s = document.createElement('style');
    s.id = 'bc-style';
    s.textContent =
      '.bc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.bc-canvas{position:relative;flex:1 1 44%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.bc-res{flex:1 1 56%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Sambungan Baut'));
    panel.appendChild(UI.el('div', 'sub', 'Cek sambungan baut tipe tumpu (bearing-type): geser, tarik, ' +
      'kombinasi tarik-geser (J3.7), dan tumpu/sobek lubang (J3.10) — SNI 1729:2020 (AISC 360-16) Ps. J3, DFBK. ' +
      'Kapasitas geser grup memakai Σ min(geser, tumpu) per baut.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Baut' },
      { type: 'select', id: 'grade', label: 'Mutu baut', value: 'a325', options: [
        { value: 'a325', label: 'A325 / Gr.8.8 (Grup A)' },
        { value: 'a490', label: 'A490 / Gr.10.9 (Grup B)' },
        { value: 'a307', label: 'A307 (baut biasa)' },
        { value: 'custom', label: 'Kustom (isi Fnt/Fnv)' } ] },
      { type: 'segment', id: 'thread', label: 'Posisi ulir', value: 'N', options: [
        { value: 'N', label: 'N — ulir termasuk' }, { value: 'X', label: 'X — di luar bidang' } ] },
      { type: 'number', id: 'Fnt', label: 'Fnt kustom', unit: 'MPa', value: 620, min: 100, step: 10, hint: 'Dipakai hanya bila mutu = Kustom.' },
      { type: 'number', id: 'Fnv', label: 'Fnv kustom', unit: 'MPa', value: 372, min: 50, step: 10 },
      { type: 'number', id: 'd', label: 'Diameter baut d', unit: 'mm', value: 20, min: 10, step: 1 },
      { type: 'number', id: 'planes', label: 'Jumlah bidang geser', value: 1, min: 1, max: 2, step: 1, hint: '1 = single shear, 2 = double shear (pelat penyambung dua sisi).' },

      { type: 'group', label: 'Pola Baut' },
      { type: 'number', id: 'nr', label: 'Baris (searah beban)', value: 2, min: 1, step: 1 },
      { type: 'number', id: 'nc', label: 'Kolom (tegak lurus)', value: 2, min: 1, step: 1 },
      { type: 'number', id: 's', label: 'Spasi s (searah beban)', unit: 'mm', value: 70, min: 0, step: 5 },
      { type: 'number', id: 'sg', label: 'Gage g (tegak lurus)', unit: 'mm', value: 70, min: 0, step: 5 },
      { type: 'number', id: 'le', label: 'Jarak tepi le (searah beban)', unit: 'mm', value: 40, min: 0, step: 5 },

      { type: 'group', label: 'Pelat Tumpu' },
      { type: 'number', id: 't', label: 'Tebal pelat t', unit: 'mm', value: 10, min: 0, step: 1, hint: 'Pelat/elemen tertipis yang menumpu baut.' },
      { type: 'number', id: 'Fu', label: 'Kuat tarik pelat Fu', unit: 'MPa', value: 370, min: 100, step: 10, hint: 'BJ37 ≈ 370 MPa, BJ41 ≈ 410, BJ50 ≈ 500.' },

      { type: 'group', label: 'Beban Terfaktor (DFBK)' },
      { type: 'number', id: 'Vu', label: 'Geser grup Vu', unit: 'kN', value: 150, min: 0, step: 5 },
      { type: 'number', id: 'Tu', label: 'Tarik grup Tu', unit: 'kN', value: 0, min: 0, step: 5, hint: '0 = tanpa tarik (geser murni).' }
    ];

    var results = UI.el('div', 'bc-res');
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

    var work = UI.el('div', 'bc-work');
    var canvasHost = UI.el('div', 'bc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Sambungan baut');
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

    state.cap.set(r.n + '×M' + r.d + ' ' + r.gradeLabel + ' · D/C ' +
      (isFinite(r.govDC) ? r.govDC.toFixed(2) : '—') + ' (' + r.gov + ')');

    results.appendChild(UI.heroRow([
      { label: 'D/C menentukan (' + r.gov + ')', value: isFinite(r.govDC) ? UI.fmt(r.govDC, 2) : '—',
        unit: r.govDC <= 1 ? 'OK' : 'NG', tone: r.govDC <= 1 ? 'ok' : 'bad' },
      { label: 'φRn grup efektif', value: UI.fmt(r.phiRge, 1), unit: 'kN' },
      { label: 'Vu terpakai', value: UI.fmt(r.Vu, 1), unit: 'kN' }
    ]));

    results.appendChild(UI.rhead('Properti baut'));
    results.appendChild(UI.kv('Mutu · ulir', r.gradeLabel + ' · ' + r.thread));
    results.appendChild(UI.kv('Fnt / Fnv', r.Fnt + ' / ' + r.Fnv + ' MPa'));
    results.appendChild(UI.kv('Ab (M' + r.d + ')', UI.fmt(r.Ab, 0) + ' mm²'));
    results.appendChild(UI.kv('Lubang standar dh', r.dh + ' mm'));
    results.appendChild(UI.kv('Beban per baut rv / rt', UI.fmt(r.rv, 1) + ' / ' + UI.fmt(r.rt, 1) + ' kN'));

    results.appendChild(UI.rhead('Geser baut (J3.6) & tumpu lubang (J3.10)'));
    results.appendChild(UI.kv('φrn geser per baut (×' + r.m + ' bidang)', UI.fmt(r.phiRnv, 1) + ' kN'));
    if (r.bearingOk) {
      results.appendChild(UI.kv('lc tepi / dalam', UI.fmt(r.lcEdge, 1) + ' / ' + (r.nr > 1 ? UI.fmt(r.lcInner, 1) : '—') + ' mm'));
      results.appendChild(UI.kv('φrn tumpu tepi / dalam', UI.fmt(0.75 * r.rnBrgEdge, 1) + ' / ' +
        (r.nr > 1 ? UI.fmt(0.75 * r.rnBrgInner, 1) : '—') + ' kN'));
      results.appendChild(UI.kv('Batas atas 2,4·d·t·Fu (×φ)', UI.fmt(0.75 * r.rnBrgCap, 1) + ' kN'));
    }
    results.appendChild(UI.kv('φRn grup efektif Σmin(geser,tumpu)', UI.fmt(r.phiRge, 1) + ' kN'));
    results.appendChild(UI.kv('D/C geser grup = Vu/φRn', r.Vu > 0 ? UI.fmt(r.dcShear, 2) : '—',
      r.dcShear <= 1 ? 'ok' : 'bad'));

    if (r.Tu > 0) {
      results.appendChild(UI.rhead('Tarik baut (J3.6)'));
      results.appendChild(UI.kv('φrn tarik per baut', UI.fmt(r.phiRnt, 1) + ' kN'));
      results.appendChild(UI.kv('D/C tarik = rt/φrnt', UI.fmt(r.dcTension, 2), r.dcTension <= 1 ? 'ok' : 'bad'));

      if (r.FntMod != null) {
        results.appendChild(UI.rhead('Kombinasi tarik + geser (J3.7)'));
        results.appendChild(UI.kv('frv / frt (perlu)', UI.fmt(r.frv, 1) + ' / ' + UI.fmt(r.frt, 1) + ' MPa'));
        results.appendChild(UI.kv('Rasio thd tersedia', (r.ratioV * 100).toFixed(0) + '% / ' + (r.ratioT * 100).toFixed(0) + '%' +
          (r.comboNeeded ? ' → interaksi WAJIB' : ' → ≤30%, tak wajib')));
        results.appendChild(UI.kv("F'nt termodifikasi", UI.fmt(r.FntMod, 1) + ' MPa'));
        results.appendChild(UI.kv("D/C kombinasi = rt/φr'nt", UI.fmt(r.dcComboInfo, 2),
          (r.comboNeeded ? (r.dcComboInfo <= 1 ? 'ok' : 'bad') : '')));
      }
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1729:2020 (adopsi AISC 360-16) Ps. J3, DFBK φ=0,75. Sambungan tipe <b>tumpu</b> (bearing-type), ' +
      'lubang <b>standar</b>, deformasi lubang diperhitungkan (1,2·lc·t·Fu ≤ 2,4·d·t·Fu). Geser dibagi rata ' +
      '(beban konsentris di centroid grup). Kapasitas geser grup = Σ min(geser baut, tumpu) per baut. ' +
      '<b>TIDAK termasuk</b>: geser eksentris (ICR), slip-critical/pratarik, blok geser (J4.3), leleh/fraktur ' +
      'pelat sambung, prying action. Verifikasi oleh insinyur penanggung jawab.'));

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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-')
      .replace(/φ/g, 'phi').replace(/Σ/g, 'sum').replace(/[^\x20-\x7E]/g, '?');
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

  // Gbr. 1 — denah pola baut + grafik kapasitas per baut
  function figBoltPlan(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var sg = r.sg > 0 ? r.sg : 3 * r.d;
    var le = r.le > 0 ? r.le : 1.5 * r.d;
    var edgeV = Math.max(1.5 * r.d, 30);
    var Wmm = le + Math.max(0, r.nr - 1) * r.s + 3 * r.d;    // pelat: tepi kiri..putus kanan
    var Hmm = Math.max(0, r.nc - 1) * sg + 2 * edgeV;
    var sc = Math.min(250 / Wmm, 100 / Hmm);
    var x0 = 120, y0 = 24;
    var W = Wmm * sc, H = Hmm * sc;
    // pelat (tepi kanan putus: dashed)
    ops.push({ t: 'line', x1: x0, y1: y0, x2: x0 + W, y2: y0, lw: 1 });
    ops.push({ t: 'line', x1: x0, y1: y0 + H, x2: x0 + W, y2: y0 + H, lw: 1 });
    ops.push({ t: 'line', x1: x0, y1: y0, x2: x0, y2: y0 + H, lw: 1 });
    ops.push({ t: 'line', x1: x0 + W, y1: y0, x2: x0 + W, y2: y0 + H, lw: 0.6, g: 0.5, dash: [4, 3] });
    // baut: kolom i searah beban (dari tepi kiri le + i*s), baris j tegak lurus
    var rb = Math.max(2.2, r.dh * sc / 2);
    for (var i = 0; i < r.nr; i++) {
      for (var j = 0; j < r.nc; j++) {
        var bx = x0 + (le + i * r.s) * sc;
        var by = y0 + (edgeV + j * sg) * sc;
        ops.push({ t: 'circle', cx: bx, cy: by, r: rb, lw: 0.9 });
        ops.push({ t: 'line', x1: bx - rb - 2, y1: by, x2: bx + rb + 2, y2: by, lw: 0.3, g: 0.5 });
        ops.push({ t: 'line', x1: bx, y1: by - rb - 2, x2: bx, y2: by + rb + 2, lw: 0.3, g: 0.5 });
      }
    }
    // dimensi le & s (bawah) + g (kanan)
    var yd = y0 + H + 14;
    F.dimH(ops, x0, x0 + le * sc, yd, 'le=' + numR(le, 0));
    if (r.nr > 1) F.dimH(ops, x0 + le * sc, x0 + (le + r.s) * sc, yd, 's=' + numR(r.s, 0));
    if (r.nc > 1) {
      F.dimV(ops, y0 + edgeV * sc, y0 + (edgeV + sg) * sc, x0 + W + 12, '');
      ops.push({ t: 'text', x: x0 + W + 18, y: y0 + (edgeV + sg / 2) * sc + 2.5, s: 'g=' + numR(sg, 0), size: 6.5 });
    }
    // panah beban Vu (menarik pelat ke kanan)
    F.arrow(ops, x0 + W + 6, y0 + H / 2, x0 + W + 40, y0 + H / 2, { lw: 1.2 });
    ops.push({ t: 'text', x: x0 + W + 22, y: y0 + H / 2 - 6, s: 'Vu=' + numR(r.Vu, 0) + ' kN', size: 6.5 });
    ops.push({ t: 'text', x: x0 + 6, y: y0 + 10, s: r.n + ' M' + r.d + ' (' + r.gradeLabel.split(' ')[0] + ')', size: 6.5, g: 0.35 });
    /* --- grafik kapasitas per baut --- */
    var by2 = yd + 22, bx0 = 205, bw = 200;
    var rows = [['Geser baut (' + r.m + ' bdg)', r.phiRnv, 0.2]];
    if (r.bearingOk) {
      rows.push(['Tumpu tepi', 0.75 * r.rnBrgEdge, 0.45]);
      if (r.nr > 1) rows.push(['Tumpu dalam', 0.75 * r.rnBrgInner, 0.6]);
    }
    var maxV = Math.max(r.rv, 0.01);
    rows.forEach(function (rw) { maxV = Math.max(maxV, rw[1]); });
    maxV *= 1.1;
    rows.forEach(function (rw, i3) {
      var y = by2 + i3 * 17;
      ops.push({ t: 'text', x: bx0 - 6, y: y + 8, s: rw[0], size: 6.5, align: 'r' });
      ops.push({ t: 'rect', x: bx0, y: y, w: rw[1] / maxV * bw, h: 11, fill: true, g: rw[2] });
      ops.push({ t: 'text', x: bx0 + rw[1] / maxV * bw + 4, y: y + 8, s: numR(rw[1], 1) + ' kN', size: 6.5 });
    });
    if (r.rv > 0) {
      ops.push({ t: 'line', x1: bx0 + r.rv / maxV * bw, y1: by2 - 6, x2: bx0 + r.rv / maxV * bw, y2: by2 + rows.length * 17 + 2, lw: 1, dash: [3, 2] });
      ops.push({ t: 'text', x: bx0 + r.rv / maxV * bw, y: by2 + rows.length * 17 + 11, s: 'rv=' + numR(r.rv, 1), size: 6, align: 'c' });
    }
    var yCap = by2 + rows.length * 17 + 26;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Pola baut ' + r.nr + 'x' + r.nc + ' M' + r.d +
      ' - phiRn grup = ' + numR(r.phiRge, 1) + ' kN, D/C ' + tolatin(r.gov) + ' = ' + numR(r.govDC, 2), size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Denah pola baut & kapasitas - lihat versi PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('SAMBUNGAN BAUT (SNI 1729:2020 Ps. J3)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('DFBK, bearing-type', dt));
    L.push('');
    L.push(' KONFIGURASI'); L.push(ruleR('-'));
    L.push(rowR('Mutu / ulir', tolatin(r.gradeLabel) + ' / ' + r.thread));
    L.push(rowR('Fnt / Fnv', r.Fnt + ' / ' + r.Fnv + ' MPa'));
    L.push(rowR('Baut', r.nr + ' x ' + r.nc + ' = ' + r.n + ' M' + r.d + ', ' + r.m + ' bidang geser'));
    L.push(rowR('Ab / lubang dh', numR(r.Ab, 0) + ' mm2 / ' + r.dh + ' mm'));
    L.push(rowR('Spasi s / gage g', numR(r.s, 0) + ' / ' + numR(r.sg, 0) + ' mm'));
    L.push(rowR('Jarak tepi le', numR(r.le, 0) + ' mm'));
    L.push(rowR('Pelat t / Fu', numR(r.t, 0) + ' mm / ' + numR(r.Fu, 0) + ' MPa'));
    L.push('');
    L.push(' BEBAN TERFAKTOR'); L.push(ruleR('-'));
    L.push(rowR('Vu (geser grup)', numR(r.Vu, 1) + ' kN'));
    L.push(rowR('Tu (tarik grup)', numR(r.Tu, 1) + ' kN'));
    L.push(rowR('Per baut rv / rt', numR(r.rv, 1) + ' / ' + numR(r.rt, 1) + ' kN'));
    L.push('');
    L.push(figBoltPlan(r));
    L.push('');
    L.push(' GESER & TUMPU (J3.6, J3.10)'); L.push(ruleR('='));
    L.push(rowR('phi*rn geser per baut', numR(r.phiRnv, 1) + ' kN'));
    if (r.bearingOk) {
      L.push(rowR('lc tepi / dalam', numR(r.lcEdge, 1) + ' / ' + (r.nr > 1 ? numR(r.lcInner, 1) : '-') + ' mm'));
      L.push(rowR('phi*rn tumpu tepi/dalam', numR(0.75 * r.rnBrgEdge, 1) + ' / ' + (r.nr > 1 ? numR(0.75 * r.rnBrgInner, 1) : '-') + ' kN'));
    }
    L.push(rowR('phi*Rn grup efektif', numR(r.phiRge, 1) + ' kN'));
    L.push(rowR('>> D/C geser grup', numR(r.dcShear, 2) + (r.dcShear <= 1 ? ' OK' : ' NG')));
    if (r.Tu > 0) {
      L.push('');
      L.push(' TARIK & KOMBINASI (J3.6, J3.7)'); L.push(ruleR('='));
      L.push(rowR('phi*rn tarik per baut', numR(r.phiRnt, 1) + ' kN'));
      L.push(rowR('>> D/C tarik', numR(r.dcTension, 2) + (r.dcTension <= 1 ? ' OK' : ' NG')));
      if (r.FntMod != null) {
        L.push(rowR("F'nt termodifikasi", numR(r.FntMod, 1) + ' MPa'));
        L.push(rowR('>> D/C kombinasi', numR(r.dcComboInfo, 2) + (r.dcComboInfo <= 1 ? ' OK' : ' NG') +
          (r.comboNeeded ? '' : ' (tak wajib)')));
      }
    }
    L.push(ruleR('='));
    L.push(rowR('>> D/C MENENTUKAN (' + tolatin(r.gov) + ')', numR(r.govDC, 2)));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Bearing-type, lubang standar, beban konsentris. BELUM: geser');
    L.push(' eksentris (ICR), slip-critical, blok geser, prying action.');
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
    var base = 'Sambungan-Baut_' + r.nr + 'x' + r.nc + 'M' + r.d + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Sambungan Baut', category: 'Sambungan', needsCanvas: true, needsRenderer: false },

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
