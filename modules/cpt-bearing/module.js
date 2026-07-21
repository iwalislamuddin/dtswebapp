/* ============================================================
   Civil Tools — modules/cpt-bearing/module.js  (Tier 2, kanvas 2D)
   Daya Dukung Fondasi Dangkal dari Data CPT/Sondir (qc).

   Metode:
   - PASIR — Meyerhof (1956, bentuk SI Bowles): daya dukung IZIN NETO untuk
     penurunan 25 mm:
       B ≤ 1,2 m : qa = (qc̄/15)·Kd
       B > 1,2 m : qa = (qc̄/25)·((B+0,3)/B)²·Kd
     Kd = 1 + 0,33·Df/B ≤ 1,33. (qc̄ & qa dalam kPa — penurunan menentukan
     di pasir; bukan keruntuhan geser.)
   - LEMPUNG — kuat geser tak-teralir dari qc: su = (qc̄ − σv0)/Nk (Nk 12–18,
     default 14), lalu Skempton: qult,net = 5·su·(1+0,2·Df/B)·(1+0,2·B/L),
     Df/B ≤ 2,5. q_izin,net = qult,net/FS.
   - qc̄ dirata-rata dari dasar fondasi (Df) sampai Df+B (interpolasi linear
     antar titik data).

   Input data CPT: tempel (paste) dua kolom "z  qc" per baris — dari Excel/
   CSV hasil sondir. Satuan qc: kg/cm² (sondir klasik) atau MPa (CPT modern).

   TIDAK termasuk: muka air tanah (σv0 memakai γ total — masukkan γ efektif
   manual bila perlu), tanah berlapis campuran pasir-lempung di zona pengaruh,
   koreksi qt (CPTu), eksentrisitas/beban miring, penurunan lempung
   (konsolidasi — pakai tool Penurunan Fondasi). Verifikasi oleh insinyur.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'cpt-bearing';
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  var KGCM2 = 98.0665;   // 1 kg/cm² = 98,0665 kPa

  /* ---------- parser data CPT ---------- */
  // Terima baris "z qc" dipisah spasi/tab/koma/;. Baris tak valid dilewati.
  function parseCPT(text, unit) {
    var pts = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      if (!s || /^[#\/]/.test(s)) return;
      var parts = s.split(/[\s,;]+/).map(parseFloat);
      if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1]) && parts[1] >= 0) {
        var qc = unit === 'mpa' ? parts[1] * 1000 : parts[1] * KGCM2;   // → kPa
        pts.push({ z: parts[0], qc: qc, fs: (parts.length >= 3 && isFinite(parts[2])) ? parts[2] : null });
      }
    });
    pts.sort(function (a, b) { return a.z - b.z; });
    // buang duplikat z
    var out = [];
    pts.forEach(function (p) { if (!out.length || p.z > out[out.length - 1].z + 1e-9) out.push(p); });
    return out;
  }

  function qcAt(pts, z) {
    if (!pts.length) return 0;
    if (z <= pts[0].z) return pts[0].qc;
    if (z >= pts[pts.length - 1].z) return pts[pts.length - 1].qc;
    for (var i = 1; i < pts.length; i++) {
      if (z <= pts[i].z) {
        var a = pts[i - 1], b = pts[i];
        return a.qc + (b.qc - a.qc) * (z - a.z) / (b.z - a.z);
      }
    }
    return pts[pts.length - 1].qc;
  }

  function qcAvg(pts, z1, z2) {
    var n = 60, sum = 0;
    for (var i = 0; i < n; i++) sum += qcAt(pts, z1 + (i + 0.5) * (z2 - z1) / n);
    return sum / n;
  }

  /* ============================================================
     KALKULASI
     ============================================================ */
  function compute(v, pts) {
    var r = { valid: false, warn: [] };
    var B = num(v.B), Lr = Math.max(num(v.L), num(v.B));   // L ≥ B
    var Df = num(v.Df), gamma = num(v.gamma);
    var soil = v.soil || 'sand';
    var Nk = num(v.Nk) || 14;
    var FS = num(v.FS) || 3;
    var qw = num(v.qw);                                    // beban kerja (kPa) opsional

    r.B = B; r.L = Lr; r.Df = Df; r.gamma = gamma; r.soil = soil; r.Nk = Nk; r.FS = FS; r.qw = qw;
    r.pts = pts; r.nPts = pts.length;

    if (!pts.length) { r.warn.push('Tempel data CPT (z & qc per baris) terlebih dulu.'); return r; }
    if (B <= 0 || Df < 0) { r.warn.push('Isi B > 0 dan Df ≥ 0.'); return r; }

    var zMax = pts[pts.length - 1].z;
    r.zMax = zMax;
    if (Df + B > zMax)
      r.warn.push('Zona pengaruh Df+B = ' + (Df + B).toFixed(1) + ' m melampaui data terdalam (' + zMax.toFixed(1) +
        ' m) — qc di bawahnya diekstrapolasi konstan. Tambah data bila ada.');

    var qcb = qcAvg(pts, Df, Df + B);                      // kPa
    var sigv0 = gamma * Df;                                // kPa (total; MAT tak dimodelkan)
    r.qcb = qcb; r.sigv0 = sigv0;

    if (soil === 'sand') {
      var Kd = Math.min(1 + 0.33 * Df / B, 1.33);
      var qaNet = (B <= 1.2)
        ? (qcb / 15) * Kd
        : (qcb / 25) * Math.pow((B + 0.3) / B, 2) * Kd;
      r.Kd = Kd; r.qaNet = qaNet;
      r.method = 'Meyerhof (1956) — penurunan 25 mm';
      r.qult = null;
    } else {
      var su = Math.max(0, (qcb - sigv0) / Nk);
      var dfb = Math.min(Df / B, 2.5);
      var qultNet = 5 * su * (1 + 0.2 * dfb) * (1 + 0.2 * B / Lr);
      r.su = su; r.dfb = dfb; r.qult = qultNet;
      r.qaNet = qultNet / FS;
      r.method = 'su = (qc̄−σv0)/Nk + Skempton';
    }
    r.qaGross = r.qaNet + sigv0;
    r.dc = (qw > 0 && r.qaNet > 0) ? qw / r.qaNet : 0;
    r.valid = true;

    if (soil === 'sand' && qcb < 2000)
      r.warn.push('qc̄ = ' + (qcb / 1000).toFixed(1) + ' MPa rendah untuk pasir — cek apakah sebenarnya lempung/lanau (pilih mode Lempung).');
    if (soil === 'clay' && qcb > 5000)
      r.warn.push('qc̄ = ' + (qcb / 1000).toFixed(1) + ' MPa tinggi untuk lempung — cek apakah sebenarnya pasir (pilih mode Pasir).');
    if (soil === 'clay')
      r.warn.push('Penurunan KONSOLIDASI lempung tidak dihitung di sini — sering menentukan; cek dengan tool Penurunan Fondasi.');
    if (soil === 'sand')
      r.warn.push('q_izin pasir adalah nilai NETO berbasis penurunan 25 mm (bukan keruntuhan). Untuk penurunan izin berbeda, skala linear (mis. 40 mm → ×1,6).');
    r.warn.push('σv0 memakai γ total tanpa muka air tanah — bila MAT dangkal, gunakan γ efektif rata-rata secara manual.');
    if (r.dc > 1) r.warn.push('D/C = ' + r.dc.toFixed(2) + ' > 1 — beban kerja melampaui daya dukung izin.');

    return r;
  }

  /* ============================================================
     KANVAS — profil qc vs kedalaman + fondasi + jendela rata-rata
     ============================================================ */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid || !r.pts.length) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Tempel data CPT untuk melihat profil qc.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), amber = css('--amber');
    var sage = css('--sage') || dim, sky = css('--sky') || '#30bced', line = css('--line');

    var padT = 44, padB = 30, padL = 64, padR = 26;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    if (plotW < 60 || plotH < 60) return;

    var zMax = Math.max(r.zMax, r.Df + r.B) * 1.05;
    var qcMax = 1;
    r.pts.forEach(function (p) { qcMax = Math.max(qcMax, p.qc); });
    qcMax *= 1.1;

    var xOf = function (qc) { return padL + qc / qcMax * plotW; };
    var yOf = function (z) { return padT + z / zMax * plotH; };

    // grid + sumbu
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.fillStyle = dim;
    for (var gz = 0; gz <= zMax; gz += Math.max(1, Math.ceil(zMax / 8))) {
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.moveTo(padL, yOf(gz)); ctx.lineTo(w - padR, yOf(gz)); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      ctx.fillText(gz.toFixed(0) + ' m', padL - 5, yOf(gz) + 3);
    }
    var qcStep = Math.pow(10, Math.floor(Math.log10(qcMax))) / 2;
    for (var gq = 0; gq <= qcMax; gq += qcStep) {
      ctx.textAlign = 'center';
      ctx.fillText((gq / 1000).toFixed(1), xOf(gq), padT - 6);
    }
    ctx.textAlign = 'left';
    ctx.fillText('qc (MPa)', w - padR - 52, padT - 6);

    // jendela rata-rata Df..Df+B (arsir sage)
    ctx.fillStyle = sage; ctx.globalAlpha = 0.18;
    ctx.fillRect(padL, yOf(r.Df), plotW, yOf(r.Df + r.B) - yOf(r.Df));
    ctx.globalAlpha = 1;

    // kurva qc
    ctx.strokeStyle = amber; ctx.lineWidth = 1.8;
    ctx.beginPath();
    r.pts.forEach(function (p, i) {
      var x = xOf(p.qc), y = yOf(p.z);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // garis qc̄ pada jendela
    ctx.strokeStyle = sky; ctx.lineWidth = 1.4; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(xOf(r.qcb), yOf(r.Df)); ctx.lineTo(xOf(r.qcb), yOf(r.Df + r.B)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = sky; ctx.textAlign = 'left';
    ctx.fillText('qc̄ ' + (r.qcb / 1000).toFixed(2) + ' MPa', Math.min(xOf(r.qcb) + 5, w - padR - 80), yOf(r.Df + r.B / 2) + 3);

    // fondasi (di kiri, skematik): kolom + telapak di Df
    var fx = padL + plotW * 0.06, fw = Math.max(18, plotW * 0.07);
    ctx.fillStyle = dim; ctx.globalAlpha = 0.9;
    ctx.fillRect(fx, yOf(r.Df) - 5, fw, 6);                       // telapak
    ctx.fillRect(fx + fw / 2 - 2.5, yOf(0), 5, yOf(r.Df) - yOf(0) - 4);  // kolom
    ctx.globalAlpha = 1;
    ctx.fillStyle = dim; ctx.textAlign = 'left';
    ctx.fillText('B=' + r.B.toFixed(1) + ' m · Df=' + r.Df.toFixed(1) + ' m', fx, yOf(r.Df) + 14);

    // hover
    if (state.mouse) {
      var my = state.mouse.y;
      if (my >= padT && my <= padT + plotH) {
        var zH = (my - padT) / plotH * zMax;
        var qcH = qcAt(r.pts, zH);
        state.UI.canvasTip(ctx, {
          mx: state.mouse.x, my: my, w: w, h: h, topBand: 34,
          text: 'z=' + zH.toFixed(1) + ' m · qc ' + (qcH / 1000).toFixed(2) + ' MPa (' + (qcH / KGCM2).toFixed(0) + ' kg/cm²)'
        });
      }
    }
  }

  /* ============================================================
     RENDER DOM (form + textarea CPT kustom)
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('cb-style')) return;
    var s = document.createElement('style');
    s.id = 'cb-style';
    s.textContent =
      '.cb-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.cb-canvas{position:relative;flex:1 1 46%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.cb-res{flex:1 1 54%;overflow-y:auto;padding:16px 22px 30px}' +
      '.cb-ta{width:100%;min-height:130px;resize:vertical;background:var(--bg2);color:var(--ink);' +
        'border:1px solid var(--line);border-radius:8px;padding:8px 10px;' +
        'font:11px "JetBrains Mono",monospace;line-height:1.5}' +
      '.cb-ta:focus{outline:none;border-color:var(--amber)}';
    document.head.appendChild(s);
  }

  var SAMPLE =
    '# z(m)  qc\n0.0  5\n0.5  8\n1.0  10\n1.5  12\n2.0  15\n2.5  20\n3.0  28\n' +
    '3.5  35\n4.0  45\n4.5  55\n5.0  70\n6.0  90\n7.0  110\n8.0  130\n10.0  150\n12.0  180';

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Daya Dukung dari CPT'));
    panel.appendChild(UI.el('div', 'sub', 'Daya dukung izin fondasi dangkal langsung dari data sondir/CPT: ' +
      'pasir memakai Meyerhof (1956, penurunan 25 mm), lempung memakai su = (qc̄−σv0)/Nk + Skempton. ' +
      'Tempel data z–qc dari Excel/CSV.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Data CPT' },
      { type: 'segment', id: 'unit', label: 'Satuan qc', value: 'kgcm2', options: [
        { value: 'kgcm2', label: 'kg/cm²' }, { value: 'mpa', label: 'MPa' } ] },

      { type: 'group', label: 'Fondasi' },
      { type: 'number', id: 'B', label: 'Lebar B', unit: 'm', value: 1.5, min: 0.3, step: 0.1 },
      { type: 'number', id: 'L', label: 'Panjang L', unit: 'm', value: 1.5, min: 0.3, step: 0.1, hint: 'L = B untuk bujur sangkar; L besar ≈ menerus.' },
      { type: 'number', id: 'Df', label: 'Kedalaman dasar Df', unit: 'm', value: 1.0, min: 0, step: 0.1 },
      { type: 'number', id: 'gamma', label: 'γ tanah di atas dasar', unit: 'kN/m³', value: 17, min: 10, step: 0.5, hint: 'Pakai γ efektif rata-rata bila MAT dangkal.' },

      { type: 'group', label: 'Jenis Tanah Pendukung' },
      { type: 'segment', id: 'soil', label: 'Dominan di zona Df..Df+B', value: 'sand', options: [
        { value: 'sand', label: 'Pasir' }, { value: 'clay', label: 'Lempung' } ] },
      { type: 'number', id: 'Nk', label: 'Faktor kerucut Nk (lempung)', value: 14, min: 8, max: 25, step: 1, hint: 'Lazim 12–18; makin besar makin konservatif.' },
      { type: 'number', id: 'FS', label: 'Faktor keamanan FS (lempung)', value: 3, min: 1.5, step: 0.5 },

      { type: 'group', label: 'Beban (opsional)' },
      { type: 'number', id: 'qw', label: 'Tekanan kerja neto q', unit: 'kPa', value: 0, min: 0, step: 10, hint: '0 = tanpa cek D/C.' }
    ];

    var results = UI.el('div', 'cb-res');
    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); }, ID);
    state.form = form;

    // textarea CPT kustom — sisip ke grup pertama (setelah segment satuan)
    var taWrap = UI.el('div', 'ck-field');
    taWrap.appendChild(UI.el('label', null, 'Data z–qc (satu titik per baris)'));
    var ta = document.createElement('textarea');
    ta.className = 'cb-ta';
    ta.spellcheck = false;
    ta.value = SAMPLE;
    taWrap.appendChild(ta);
    taWrap.appendChild(UI.el('div', 'ck-field-hint',
      'Format: kedalaman lalu qc, dipisah spasi/tab/koma. Baris diawali # dilewati. Kolom ke-3 (fs) diabaikan di tool ini.'));
    var firstGrp = form.root.querySelector('.ck-grp');
    firstGrp.appendChild(taWrap);
    state.ta = ta;
    state.onTa = function () { update(form.getValues(), results); };
    ta.addEventListener('input', state.onTa);

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    var work = UI.el('div', 'cb-work');
    var canvasHost = UI.el('div', 'cb-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Daya dukung CPT');
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
    var pts = parseCPT(state.ta ? state.ta.value : '', vals.unit);
    var r = compute(vals, pts);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Daya dukung CPT');
      results.appendChild(UI.el('div', 'ck-empty', r.warn[0] || 'Lengkapi input.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set((r.soil === 'sand' ? 'Pasir' : 'Lempung') + ' · qc̄ ' + (r.qcb / 1000).toFixed(2) +
      ' MPa · q,izin ' + r.qaNet.toFixed(0) + ' kPa');

    results.appendChild(UI.heroRow([
      { label: 'q izin NETO (' + r.method + ')', value: UI.fmt(r.qaNet, 0), unit: 'kPa' },
      { label: 'q izin BRUTO', value: UI.fmt(r.qaGross, 0), unit: 'kPa' },
      r.dc > 0
        ? { label: 'D/C = qkerja/qizin', value: UI.fmt(r.dc, 2), unit: r.dc <= 1 ? 'OK' : 'NG', tone: r.dc <= 1 ? 'ok' : 'bad' }
        : { label: 'qc̄ rata-rata', value: (r.qcb / 1000).toFixed(2), unit: 'MPa' }
    ]));

    results.appendChild(UI.rhead('Data & rata-rata'));
    results.appendChild(UI.kv('Jumlah titik data', r.nPts + ' (0–' + r.zMax.toFixed(1) + ' m)'));
    results.appendChild(UI.kv('qc̄ (Df → Df+B = ' + r.Df.toFixed(1) + '–' + (r.Df + r.B).toFixed(1) + ' m)',
      (r.qcb / 1000).toFixed(2) + ' MPa = ' + (r.qcb / KGCM2).toFixed(0) + ' kg/cm²'));
    results.appendChild(UI.kv('σv0 di dasar = γ·Df', UI.fmt(r.sigv0, 1) + ' kPa'));

    if (r.soil === 'sand') {
      results.appendChild(UI.rhead('Pasir — Meyerhof (penurunan 25 mm)'));
      results.appendChild(UI.kv('Faktor kedalaman Kd = 1+0,33·Df/B', r.Kd.toFixed(3) + ' (≤1,33)'));
      results.appendChild(UI.kv(r.B <= 1.2 ? 'qa = (qc̄/15)·Kd' : 'qa = (qc̄/25)·((B+0,3)/B)²·Kd',
        UI.fmt(r.qaNet, 0) + ' kPa', 'ok'));
    } else {
      results.appendChild(UI.rhead('Lempung — su dari qc + Skempton'));
      results.appendChild(UI.kv('su = (qc̄−σv0)/Nk (Nk=' + r.Nk + ')', UI.fmt(r.su, 1) + ' kPa'));
      results.appendChild(UI.kv('qult,net = 5·su·(1+0,2·Df/B)·(1+0,2·B/L)', UI.fmt(r.qult, 0) + ' kPa'));
      results.appendChild(UI.kv('q,izin,net = qult,net / FS(' + r.FS + ')', UI.fmt(r.qaNet, 0) + ' kPa', 'ok'));
    }
    results.appendChild(UI.kv('q,izin BRUTO (+σv0)', UI.fmt(r.qaGross, 0) + ' kPa'));
    if (r.dc > 0)
      results.appendChild(UI.kv('D/C = q kerja / q izin neto', UI.fmt(r.dc, 2), r.dc <= 1 ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'Metode langsung dari qc sondir. <b>Pasir</b>: Meyerhof (1956, bentuk SI Bowles) — q izin NETO untuk ' +
      'penurunan 25 mm (1 inci); keruntuhan geser jarang menentukan di pasir. <b>Lempung</b>: su=(qc̄−σv0)/Nk ' +
      '(Nk 12–18 tergantung kalibrasi lokal) + kapasitas Skempton; penurunan konsolidasi TIDAK termasuk. ' +
      'qc̄ = rata-rata linear Df→Df+B. 1 kg/cm² = 98,07 kPa. <b>TIDAK termasuk</b>: koreksi qt (CPTu u2), MAT ' +
      '(pakai γ efektif manual), lapisan campuran, eksentrisitas/kemiringan beban. Bandingkan dengan tool ' +
      '"Daya Dukung Tanah" (parameter c-φ). Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).'));

    if (state.cv) state.cv.redraw();
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.3.0', RW = 62;
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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/×/g, 'x').replace(/σ/g, 'sig')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/γ/g, 'gamma')
      .replace(/φ/g, 'phi').replace(/̄/g, '').replace(/→/g, '->').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('DAYA DUKUNG FONDASI DANGKAL DARI CPT'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Metode langsung qc sondir', dt));
    L.push('');
    L.push(' FONDASI & TANAH'); L.push(ruleR('-'));
    L.push(rowR('B x L / Df', numR(r.B, 2) + ' x ' + numR(r.L, 2) + ' m / ' + numR(r.Df, 2) + ' m'));
    L.push(rowR('gamma / sigv0 dasar', numR(r.gamma, 1) + ' kN/m3 / ' + numR(r.sigv0, 1) + ' kPa'));
    L.push(rowR('Jenis tanah pendukung', r.soil === 'sand' ? 'PASIR' : 'LEMPUNG (Nk=' + r.Nk + ', FS=' + r.FS + ')'));
    L.push(rowR('Data CPT', r.nPts + ' titik, 0-' + numR(r.zMax, 1) + ' m'));
    L.push(rowR('qc rata-rata (Df..Df+B)', numR(r.qcb / 1000, 2) + ' MPa = ' + numR(r.qcb / KGCM2, 0) + ' kg/cm2'));
    L.push('');
    L.push(' HASIL'); L.push(ruleR('='));
    if (r.soil === 'sand') {
      L.push(rowR('Kd = 1+0.33*Df/B (<=1.33)', numR(r.Kd, 3)));
      L.push(rowR(r.B <= 1.2 ? 'qa = (qc/15)*Kd' : 'qa = (qc/25)*((B+0.3)/B)2*Kd', ''));
    } else {
      L.push(rowR('su = (qc-sigv0)/Nk', numR(r.su, 1) + ' kPa'));
      L.push(rowR('qult,net (Skempton)', numR(r.qult, 0) + ' kPa'));
    }
    L.push(rowR('>> q IZIN NETO', numR(r.qaNet, 0) + ' kPa'));
    L.push(rowR('   q izin BRUTO (+sigv0)', numR(r.qaGross, 0) + ' kPa'));
    if (r.dc > 0) L.push(rowR('>> D/C (q kerja ' + numR(r.qw, 0) + ')', numR(r.dc, 2) + (r.dc <= 1 ? ' OK' : ' NG')));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Pasir: Meyerhof 25mm (neto). Lempung: su dari qc + Skempton.');
    L.push(' BELUM: CPTu qt, MAT otomatis, lapisan campuran, eksentrisitas.');
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
    var vals = state.form.getValues();
    var r = compute(vals, parseCPT(state.ta.value, vals.unit));
    if (!r.valid) { UI.toast('Lengkapi data CPT dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'CPT-Dangkal_B' + r.B + '_Df' + r.Df + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Daya Dukung CPT', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
      if (state.ta && state.onTa) state.ta.removeEventListener('input', state.onTa);
      state = {};
    }
  };
})();
