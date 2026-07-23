/* ============================================================
   Civil Tools — modules/pipe-flow/module.js  (Tier 2, kanvas 2D)
   Aliran Pipa Bertekanan (saluran tertutup penuh) — kehilangan energi.

   Rumus:
   - Darcy–Weisbach: hf = f·(L/D)·V²/(2g)
       f laminar (Re < 2300): f = 64/Re
       f turbulen: Swamee–Jain f = 0,25 / [log10(ε/(3,7D) + 5,74/Re^0,9)]²
       (eksplisit, ±1% dari Colebrook untuk 5e3<Re<1e8, 1e-6<ε/D<0,01)
   - Kehilangan minor: hm = ΣK·V²/(2g)
   - Pembanding Hazen–Williams (SI): hf = 10,67·L·Q^1,852/(C^1,852·D^4,87)
   - Re = V·D/ν ;  V = Q/A

   TIDAK termasuk: jaringan pipa (loop/Hardy-Cross), pemilihan pompa
   (kurva sistem-pompa), transien/water hammer, aliran sebagian
   (pakai tool Saluran Terbuka mode lingkaran), kavitasi/NPSH.
   Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'pipe-flow';
  var state = {};
  var G = 9.81;

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  var MAT = {
    pvc:      { label: 'PVC / HDPE',        eps: 0.0015, C: 150 },
    steelNew: { label: 'Baja baru',         eps: 0.045,  C: 130 },
    steelOld: { label: 'Baja lama/berkarat',eps: 0.5,    C: 100 },
    castiron: { label: 'Besi cor',          eps: 0.26,   C: 110 },
    concrete: { label: 'Beton',             eps: 0.5,    C: 120 },
    gip:      { label: 'GIP (galvanis)',    eps: 0.15,   C: 120 }
  };

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var D = num(v.D) / 1000;                 // mm → m
    var Lp = num(v.Lp);
    var Q = num(v.Q) / 1000;                 // L/s → m³/s
    var mat = v.mat || 'pvc';
    var eps = (mat === 'custom' ? num(v.eps) : MAT[mat].eps) / 1000;   // mm → m
    var C = (mat === 'custom' ? num(v.C) : MAT[mat].C);
    var nu = num(v.nu) * 1e-6 || 1.004e-6;   // input ×10⁻⁶ m²/s
    var sumK = num(v.sumK);

    r.D = D; r.Lp = Lp; r.Q = Q; r.mat = mat; r.eps = eps; r.C = C; r.nu = nu; r.sumK = sumK;
    r.matLabel = mat === 'custom' ? 'Kustom' : MAT[mat].label;

    if (D <= 0 || Lp <= 0 || Q <= 0) { r.warn.push('Isi D, L, dan Q (> 0).'); return r; }

    var A = Math.PI * D * D / 4;
    var V = Q / A;
    var Re = V * D / nu;
    r.A = A; r.V = V; r.Re = Re;

    var f;
    if (Re < 2300) {
      f = 64 / Re;
      r.regime = 'laminar';
    } else {
      f = 0.25 / Math.pow(Math.log10(eps / (3.7 * D) + 5.74 / Math.pow(Re, 0.9)), 2);
      r.regime = Re < 4000 ? 'transisi' : 'turbulen';
    }
    r.f = f;

    var hv = V * V / (2 * G);                // velocity head
    var hf = f * (Lp / D) * hv;
    var hm = sumK * hv;
    var hTot = hf + hm;
    r.hv = hv; r.hf = hf; r.hm = hm; r.hTot = hTot;
    r.gradient = hf / Lp * 1000;             // m per km

    // Hazen-Williams pembanding
    var hfHW = 10.67 * Lp * Math.pow(Q, 1.852) / (Math.pow(C, 1.852) * Math.pow(D, 4.87));
    r.hfHW = hfHW;
    r.diffHW = hf > 0 ? (hfHW - hf) / hf * 100 : 0;
    r.valid = true;

    if (V < 0.3) r.warn.push('V = ' + V.toFixed(2) + ' m/s < 0,3 m/s — risiko pengendapan; pertimbangkan D lebih kecil.');
    if (V > 3.0) r.warn.push('V = ' + V.toFixed(2) + ' m/s > 3 m/s — bising/erosif & rugi tinggi; pertimbangkan D lebih besar (lazim 0,6–2,5 m/s).');
    if (r.regime === 'transisi') r.warn.push('Re = ' + Re.toFixed(0) + ' di zona transisi (2300–4000) — f tak menentu; hasil indikatif.');
    if (Re >= 2300 && (eps / D < 1e-6 || eps / D > 0.05))
      r.warn.push('ε/D = ' + (eps / D).toExponential(1) + ' di luar rentang validitas Swamee–Jain — hasil ekstrapolasi.');
    if (mat === 'custom' && C <= 0) r.warn.push('C Hazen–Williams kustom belum diisi — pembanding HW tidak bermakna.');
    if (Math.abs(r.diffHW) > 20)
      r.warn.push('Selisih Darcy vs Hazen–Williams ' + r.diffHW.toFixed(0) + '% — wajar bila V di luar ±0,9–2 m/s atau pipa sangat kasar (HW empiris utk air).');

    return r;
  }

  /* ============================================================
     KANVAS — profil pipa + garis EGL/HGL
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi input untuk melihat profil energi.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', line = css('--line');

    var padT = 50, padB = 44, padL = 56, padR = 56;
    var availW = w - padL - padR, availH = h - padT - padB;
    if (availW < 100 || availH < 70) return;

    // skala vertikal: total head di hulu = hTot + hv (referensi hilir 0)
    var Hmax = Math.max(r.hTot + r.hv, 0.001) * 1.15;
    var yOf = function (head) { return padT + availH - head / Hmax * availH; };
    var x0 = padL, x1 = w - padR;

    // pipa (di bawah)
    var pipeY = padT + availH - 8;
    ctx.strokeStyle = dim; ctx.lineWidth = 8; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(x0, pipeY); ctx.lineTo(x1, pipeY); ctx.stroke();
    ctx.globalAlpha = 1;
    // panah aliran
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    var ay = pipeY;
    ctx.beginPath(); ctx.moveTo(x0 + availW * 0.45, ay); ctx.lineTo(x0 + availW * 0.55, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + availW * 0.55 - 6, ay - 4); ctx.lineTo(x0 + availW * 0.55, ay);
    ctx.lineTo(x0 + availW * 0.55 - 6, ay + 4); ctx.stroke();

    // EGL: dari hTot+hv (hulu) turun ke hv (hilir) — rugi hf linear + hm dianggap terdistribusi
    var eglUp = r.hTot + r.hv, eglDn = r.hv;
    ctx.strokeStyle = amber; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x0, yOf(eglUp)); ctx.lineTo(x1, yOf(eglDn)); ctx.stroke();
    // HGL = EGL − hv
    ctx.strokeStyle = sky; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x0, yOf(eglUp - r.hv)); ctx.lineTo(x1, yOf(0)); ctx.stroke();
    ctx.setLineDash([]);

    // label
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = amber; ctx.textAlign = 'left';
    ctx.fillText('EGL', x0 + 4, yOf(eglUp) - 6);
    ctx.fillStyle = sky;
    ctx.fillText('HGL', x0 + 4, yOf(eglUp - r.hv) + 12);
    // dimensi head total
    ctx.strokeStyle = sage; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1 + 14, yOf(eglUp)); ctx.lineTo(x1 + 14, yOf(eglDn)); ctx.stroke();
    ctx.fillStyle = sage; ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(x1 + 24, (yOf(eglUp) + yOf(eglDn)) / 2); ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('hL ' + r.hTot.toFixed(2) + ' m', 0, 0);
    ctx.restore();

    ctx.fillStyle = dim; ctx.textAlign = 'center';
    ctx.fillText('L=' + r.Lp.toFixed(0) + ' m · Ø' + (r.D * 1000).toFixed(0) + ' mm (' + r.matLabel + ')',
      (x0 + x1) / 2, pipeY + 18);
    ctx.fillStyle = ink;
    ctx.fillText('V ' + r.V.toFixed(2) + ' m/s · hf ' + r.hf.toFixed(2) + ' m · hm ' + r.hm.toFixed(2) + ' m',
      (x0 + x1) / 2, h - 12);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h, topBand: 36,
        text: 'Re ' + r.Re.toExponential(2) + ' · f ' + r.f.toFixed(4) + ' · gradien ' + r.gradient.toFixed(1) + ' m/km'
      });
    }
  }

  /* ============================================================
     RENDER DOM
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('pf-style')) return;
    var s = document.createElement('style');
    s.id = 'pf-style';
    s.textContent =
      '.pf-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.pf-canvas{position:relative;flex:1 1 42%;min-height:200px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.pf-res{flex:1 1 58%;overflow-y:auto;padding:16px 22px 30px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Aliran Pipa (Tertutup)'));
    panel.appendChild(UI.el('div', 'sub', 'Kehilangan energi pipa bertekanan: Darcy–Weisbach dengan faktor ' +
      'gesek Swamee–Jain (≈Colebrook) + kehilangan minor ΣK, dibandingkan Hazen–Williams. ' +
      'Untuk pipa/gorong-gorong terisi sebagian gunakan tool Saluran Terbuka.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Pipa' },
      { type: 'number', id: 'D', label: 'Diameter dalam D', unit: 'mm', value: 100, min: 10, step: 5 },
      { type: 'number', id: 'Lp', label: 'Panjang L', unit: 'm', value: 200, min: 1, step: 10 },
      { type: 'select', id: 'mat', label: 'Material', value: 'pvc', options: [
        { value: 'pvc', label: 'PVC/HDPE (ε 0,0015 mm · C 150)' },
        { value: 'steelNew', label: 'Baja baru (0,045 · 130)' },
        { value: 'steelOld', label: 'Baja lama (0,5 · 100)' },
        { value: 'castiron', label: 'Besi cor (0,26 · 110)' },
        { value: 'gip', label: 'GIP galvanis (0,15 · 120)' },
        { value: 'concrete', label: 'Beton (0,5 · 120)' },
        { value: 'custom', label: 'Kustom' } ] },
      { type: 'number', id: 'eps', label: 'Kekasaran ε kustom', unit: 'mm', value: 0.0015, min: 0, step: 0.01 },
      { type: 'number', id: 'C', label: 'C Hazen–Williams kustom', value: 150, min: 60, max: 160, step: 5 },

      { type: 'group', label: 'Aliran & Fluida' },
      { type: 'number', id: 'Q', label: 'Debit Q', unit: 'L/s', value: 10, min: 0.01, step: 1 },
      { type: 'number', id: 'nu', label: 'Viskositas kinematik ν', unit: '×10⁻⁶ m²/s', value: 1.004, min: 0.2, step: 0.1, hint: 'Air 20°C = 1,004. Air 30°C ≈ 0,801.' },
      { type: 'number', id: 'sumK', label: 'Σ koefisien minor K', value: 2, min: 0, step: 0.5, hint: 'Belokan 90° ≈ 0,3–0,9 · katup gerbang buka ≈ 0,2 · masuk ≈ 0,5 · keluar = 1,0.' }
    ];

    var results = UI.el('div', 'pf-res');
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

    var work = UI.el('div', 'pf-work');
    var canvasHost = UI.el('div', 'pf-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Aliran pipa');
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
      state.cap.set('Aliran pipa');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set('Ø' + (r.D * 1000).toFixed(0) + ' · Q ' + (r.Q * 1000).toFixed(1) +
      ' L/s · hL ' + r.hTot.toFixed(2) + ' m');

    results.appendChild(UI.heroRow([
      { label: 'hL total = hf + hm', value: r.hTot.toFixed(3), unit: 'm' },
      { label: 'Kecepatan V', value: r.V.toFixed(2), unit: 'm/s', tone: (r.V >= 0.3 && r.V <= 3) ? 'ok' : 'bad' },
      { label: 'Gradien hidraulik', value: r.gradient.toFixed(2), unit: 'm/km' }
    ]));

    results.appendChild(UI.rhead('Hidraulika dasar'));
    results.appendChild(UI.kv('Luas A', (r.A * 1e6).toFixed(0) + ' mm²'));
    results.appendChild(UI.kv('Kecepatan V = Q/A', r.V.toFixed(3) + ' m/s', (r.V >= 0.3 && r.V <= 3) ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Reynolds Re = V·D/ν', r.Re.toExponential(3) + ' (' + r.regime + ')'));
    results.appendChild(UI.kv('Velocity head V²/2g', r.hv.toFixed(4) + ' m'));

    results.appendChild(UI.rhead('Darcy–Weisbach'));
    results.appendChild(UI.kv('ε / ε/D', (r.eps * 1000).toFixed(4) + ' mm / ' + (r.eps / r.D).toExponential(2)));
    results.appendChild(UI.kv('Faktor gesek f (' + (r.regime === 'laminar' ? '64/Re' : 'Swamee–Jain') + ')', r.f.toFixed(5)));
    results.appendChild(UI.kv('hf gesek = f·(L/D)·V²/2g', r.hf.toFixed(3) + ' m'));
    results.appendChild(UI.kv('Gradien hidraulik', r.gradient.toFixed(2) + ' m/km'));
    results.appendChild(UI.kv('hm minor = ΣK·V²/2g (ΣK=' + r.sumK + ')', r.hm.toFixed(3) + ' m'));

    results.appendChild(UI.rhead('Pembanding Hazen–Williams (C=' + r.C + ')'));
    results.appendChild(UI.kv('hf HW = 10,67·L·Q^1,852/(C^1,852·D^4,87)', r.hfHW.toFixed(3) + ' m'));
    results.appendChild(UI.kv('Selisih vs Darcy', (r.diffHW >= 0 ? '+' : '') + r.diffHW.toFixed(1) + ' %',
      Math.abs(r.diffHW) <= 20 ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'Pipa bundar <b>terisi penuh (bertekanan)</b>, fluida tunggal. Darcy–Weisbach + <b>Swamee–Jain</b> ' +
      '(eksplisit, ±1% Colebrook, valid 5×10³&lt;Re&lt;10⁸, 10⁻⁶&lt;ε/D&lt;10⁻²); laminar 64/Re. ' +
      'Kehilangan minor lumped ΣK·V²/2g. Hazen–Williams hanya utk AIR suhu normal & V lazim — pembanding. ' +
      'Nilai ε & C indikatif (kondisi pipa aktual menentukan). <b>TIDAK termasuk</b>: jaringan/loop, kurva pompa, ' +
      'water hammer, kavitasi. Verifikasi oleh insinyur penanggung jawab.'));

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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/³/g, '3').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/ε/g, 'eps')
      .replace(/Σ/g, 'sum').replace(/ν/g, 'nu').replace(/Ø/g, 'D').replace(/⁻⁶/g, 'e-6')
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

  // Gbr. 1 — profil energi pipa: EGL & HGL sepanjang L
  function figEnergy(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var px0 = 90, pw = 360, top = 16, ph = 140, bot = top + ph;
    var Hmax = Math.max(r.hTot + r.hv, 0.001) * 1.15;
    function Y(head) { return bot - head / Hmax * ph; }
    var x1 = px0 + pw;
    // pipa (garis tebal abu di bawah) + panah aliran
    ops.push({ t: 'line', x1: px0, y1: bot, x2: x1, y2: bot, lw: 5, g: 0.7 });
    F.arrow(ops, px0 + pw * 0.46, bot - 9, px0 + pw * 0.56, bot - 9, { lw: 1.1 });
    ops.push({ t: 'text', x: px0 + pw * 0.58, y: bot - 7, s: 'Q=' + numR(r.Q * 1000, 1) + ' L/s, V=' + numR(r.V, 2) + ' m/s', size: 6.5, g: 0.3 });
    // tick head kiri
    var stH = F.niceStep(Hmax, 4);
    for (var th = 0; th <= Hmax; th += stH) {
      ops.push({ t: 'line', x1: px0 - 3, y1: Y(th), x2: px0, y2: Y(th), lw: 0.5, g: 0.4 });
      ops.push({ t: 'text', x: px0 - 6, y: Y(th) + 2.3, s: numR(th, stH < 1 ? 2 : 1), size: 6, align: 'r', g: 0.35 });
    }
    ops.push({ t: 'line', x1: px0, y1: top, x2: px0, y2: bot, lw: 0.8 });
    ops.push({ t: 'text', x: px0 - 6, y: top - 4, s: 'head (m)', size: 6.5, align: 'r', g: 0.3 });
    // EGL (hulu hTot+hv → hilir hv) & HGL (= EGL - hv)
    var eglUp = r.hTot + r.hv;
    ops.push({ t: 'line', x1: px0, y1: Y(eglUp), x2: x1, y2: Y(r.hv), lw: 1.3 });
    ops.push({ t: 'text', x: px0 + 6, y: Y(eglUp) - 4, s: 'EGL', size: 6.5 });
    ops.push({ t: 'line', x1: px0, y1: Y(eglUp - r.hv), x2: x1, y2: Y(0), lw: 1, g: 0.45, dash: [5, 3] });
    ops.push({ t: 'text', x: px0 + 46, y: Y(eglUp - r.hv) + 9, s: 'HGL', size: 6.5, g: 0.35 });
    // anotasi hv & hL total di hilir
    F.dimV(ops, Y(r.hv), Y(0), x1 + 14, '');
    ops.push({ t: 'text', x: x1 + 20, y: (Y(r.hv) + Y(0)) / 2 + 2.5, s: 'hv=' + numR(r.hv, 3), size: 6 });
    F.dimV(ops, Y(eglUp), Y(r.hv), x1 + 40, '');
    ops.push({ t: 'text', x: x1 + 46, y: (Y(eglUp) + Y(r.hv)) / 2 + 2.5, s: 'hL=' + numR(r.hTot, 2), size: 6 });
    ops.push({ t: 'text', x: px0 + pw / 2, y: bot + 12, s: 'L = ' + numR(r.Lp, 0) + ' m, D = ' + numR(r.D * 1000, 0) + ' mm (' + tolatin(r.matLabel) + ')', size: 6.5, align: 'c', g: 0.35 });
    var yCap = bot + 28;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Profil energi (EGL/HGL) - f=' + numR(r.f, 4) +
      ' (' + r.regime + '), hf=' + numR(r.hf, 2) + ' m, hm=' + numR(r.hm, 2) + ' m', size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Profil energi EGL/HGL - lihat versi PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('ALIRAN PIPA BERTEKANAN'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Darcy-Weisbach + Hazen-Williams', dt));
    L.push('');
    L.push(' PIPA & ALIRAN'); L.push(ruleR('-'));
    L.push(rowR('Diameter dalam D', numR(r.D * 1000, 0) + ' mm'));
    L.push(rowR('Panjang L', numR(r.Lp, 0) + ' m'));
    L.push(rowR('Material', tolatin(r.matLabel) + ' (eps ' + numR(r.eps * 1000, 4) + ' mm, C ' + r.C + ')'));
    L.push(rowR('Debit Q', numR(r.Q * 1000, 2) + ' L/s'));
    L.push(rowR('Viskositas nu', (r.nu * 1e6).toFixed(3) + 'e-6 m2/s'));
    L.push('');
    L.push(figEnergy(r));
    L.push('');
    L.push(' HASIL'); L.push(ruleR('='));
    L.push(rowR('Kecepatan V', numR(r.V, 3) + ' m/s'));
    L.push(rowR('Reynolds Re', r.Re.toExponential(3) + ' (' + r.regime + ')'));
    L.push(rowR('Faktor gesek f', numR(r.f, 5)));
    L.push(rowR('hf gesek', numR(r.hf, 3) + ' m'));
    L.push(rowR('hm minor (sumK=' + r.sumK + ')', numR(r.hm, 3) + ' m'));
    L.push(rowR('>> TOTAL hL', numR(r.hTot, 3) + ' m'));
    L.push(rowR('Gradien', numR(r.gradient, 2) + ' m/km'));
    L.push(ruleR('='));
    L.push('');
    L.push(' PEMBANDING HAZEN-WILLIAMS'); L.push(ruleR('-'));
    L.push(rowR('hf HW (C=' + r.C + ')', numR(r.hfHW, 3) + ' m'));
    L.push(rowR('Selisih vs Darcy', (r.diffHW >= 0 ? '+' : '') + numR(r.diffHW, 1) + ' %'));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Pipa penuh bertekanan. BELUM: jaringan, pompa, water hammer.');
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
    var base = 'Pipa_D' + (r.D * 1000).toFixed(0) + '_Q' + (r.Q * 1000).toFixed(0) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Aliran Pipa (Tertutup)', category: 'Hidraulika & Hidrologi', needsCanvas: true, needsRenderer: false },

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
