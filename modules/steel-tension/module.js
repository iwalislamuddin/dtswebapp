/* ============================================================
   Civil Tools — modules/steel-tension/module.js  (Tier 2, kanvas 2D)
   Kapasitas batang tarik baja — SNI 1729:2020 (mengadopsi AISC 360-16)

   Dua keadaan batas kekuatan tarik (Ps. 5.2 / D2):
     (a) Leleh pada penampang bruto : Pn = Fy · Ag
     (b) Fraktur pada penampang neto efektif : Pn = Fu · Ae ,  Ae = U · An

   Faktor tahanan / keamanan:
     DFBK (LRFD): φt·Pn  → φt = 0.90 (leleh) , 0.75 (fraktur)
     ASD        : Pn/Ωt  → Ωt = 1.67 (leleh) , 2.00 (fraktur)
   Kapasitas desain = keadaan batas yang MENGHASILKAN kekuatan terkecil.

   Luas neto (sambungan baut):
     An = Ag − Σ(dh · t) ,  dh = db + kelonggaran lubang
   Shear lag U (Tabel 5.2-1 / D3.1): berkurang bila tak semua elemen tersambung.

   Kelangsingan: L/rmin ≤ 300 (rekomendasi batang tarik, Ps. 5.4 / D1).

   Data profil dari library core/steel-profiles.js. Blok geser (block shear)
   & desain sambungan TIDAK termasuk — cek terpisah.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'steel-tension';

  var PHI_Y = 0.90, PHI_R = 0.75, OM_Y = 1.67, OM_R = 2.00;

  // Mutu baja: [label, Fy, Fu]  (MPa)
  var GRADES = [
    ['BJ 37 (Fy 240 / Fu 370)', 240, 370],
    ['BJ 41 (Fy 250 / Fu 410)', 250, 410],
    ['BJ 50 (Fy 290 / Fu 500)', 290, 500],
    ['BJ 55 (Fy 410 / Fu 550)', 410, 550],
    ['SS400 (Fy 245 / Fu 400)', 245, 400],
    ['A36 (Fy 250 / Fu 400)', 250, 400],
    ['A572 Gr50 (Fy 345 / Fu 450)', 345, 450],
    ['A992 (Fy 345 / Fu 450)', 345, 450],
    ['Custom', 0, 0]
  ];
  // Shear lag preset: [label, U]  (U=0 → manual)
  var UPRESET = [
    ['Semua elemen tersambung / las melintang (U=1.0)', 1.0],
    ['WF sayap tersambung, bf≥2/3·d, ≥3 baut (U=0.90)', 0.90],
    ['WF badan / bf<2/3·d ; kanal umum (U=0.85)', 0.85],
    ['Siku, ≥4 baut satu baris (U=0.80)', 0.80],
    ['Siku/kanal, sambungan pendek 2–3 baut (U=0.70)', 0.70],
    ['Manual (isi U sendiri)', 0]
  ];

  var state = {};
  var SP = null;   // window.SteelProfiles

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function compute(v) {
    var r = { warn: [], valid: false };
    var type = v.ptype, name = v.psize;
    var p = SP.get(type, name);
    if (!p) { r.warn.push('Profil belum dipilih.'); return r; }
    var ti = SP.typeInfo(type);

    var Fy = num(v.Fy), Fu = num(v.Fu);
    if (!(Fy > 0) || !(Fu > 0) || Fu < Fy) {
      r.warn.push('Fy & Fu harus > 0 dan Fu ≥ Fy.'); return r;
    }

    var Ag = SP.AgMm2(p);                          // mm²
    var conn = v.conn;                             // 'bolt' | 'weld'
    var nHole = Math.max(0, parseInt(v.nHole, 10) || 0);
    var db = num(v.db), hole = num(v.hole);
    var tHole = num(v.tHole) || SP.tGov(type, p);
    var dh = db + hole;                            // diameter lubang efektif
    var An;
    if (conn === 'bolt' && nHole > 0) {
      An = Ag - nHole * dh * tHole;
      if (An < 0.3 * Ag) r.warn.push('An sangat kecil (' + Math.round(An) + ' mm²) — periksa jumlah/tebal lubang.');
    } else {
      An = Ag;                                     // las / tanpa lubang
    }
    if (An > Ag) An = Ag;

    // Shear lag U
    var U;
    if (v.Upreset === '0') U = num(v.Uval);
    else U = num(v.Upreset);
    if (!(U > 0)) { U = 1.0; r.warn.push('U tidak valid → dipakai 1.0.'); }
    if (U > 1) U = 1.0;
    var Ae = U * An;

    // Kekuatan nominal (N → kN)
    var PnY = Fy * Ag / 1000;
    var PnR = Fu * Ae / 1000;

    // Desain
    var phiPnY = PHI_Y * PnY, phiPnR = PHI_R * PnR;
    var PaY = PnY / OM_Y, PaR = PnR / OM_R;
    var phiPn = Math.min(phiPnY, phiPnR);
    var Pa = Math.min(PaY, PaR);
    var govLRFD = phiPnY <= phiPnR ? 'Leleh (bruto)' : 'Fraktur (neto)';
    var govASD = PaY <= PaR ? 'Leleh (bruto)' : 'Fraktur (neto)';

    // Kelangsingan
    var rmin = SP.rminMm(p);                        // mm
    var L = num(v.L);
    var slender = (rmin > 0 && L > 0) ? L / rmin : null;

    // Rasio demand/capacity
    var Pu = num(v.Pu), Pa_dem = num(v.Pa);
    var dcL = (Pu > 0) ? Pu / phiPn : null;
    var dcA = (Pa_dem > 0) ? Pa_dem / Pa : null;

    r.valid = true;
    r.p = p; r.type = type; r.ti = ti; r.name = name;
    r.Fy = Fy; r.Fu = Fu; r.Ag = Ag; r.An = An; r.Ae = Ae; r.U = U;
    r.conn = conn; r.nHole = nHole; r.db = db; r.hole = hole; r.dh = dh; r.tHole = tHole;
    r.PnY = PnY; r.PnR = PnR;
    r.phiPnY = phiPnY; r.phiPnR = phiPnR; r.phiPn = phiPn; r.govLRFD = govLRFD;
    r.PaY = PaY; r.PaR = PaR; r.Pa = Pa; r.govASD = govASD;
    r.rmin = rmin; r.L = L; r.slender = slender;
    r.Pu = Pu; r.Pa_dem = Pa_dem; r.dcL = dcL; r.dcA = dcA;

    if (slender !== null && slender > 300)
      r.warn.push('L/r = ' + Math.round(slender) + ' > 300 — melebihi rekomendasi kelangsingan batang tarik (Ps. 5.4). Pertimbangkan profil lebih kaku.');
    if (An < Ag && Ae < An) { /* info only */ }
    if (dcL !== null && dcL > 1) r.warn.push('DFBK: Pu/φPn = ' + dcL.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.');
    if (dcA !== null && dcA > 1) r.warn.push('ASD: Pa/(Pn/Ω) = ' + dcA.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.');
    if (p.source === 'hitung') r.warn.push('Properti profil ' + ti.name + ' DIHITUNG dari geometri (' + (p.note || '') + '); verifikasi terhadap katalog pabrikan.');

    return r;
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('st-style')) return;
    var s = document.createElement('style');
    s.id = 'st-style';
    s.textContent =
      '.st-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.st-canvas{position:relative;flex:1 1 50%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.st-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function fillSizes(type, keep) {
    var sel = state.form.fields.psize.node;
    sel.innerHTML = '';
    SP.list(type).forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name + '  ·  ' + p.w.toFixed(1) + ' kg/m';
      sel.appendChild(o);
    });
    if (keep) sel.value = keep;
    if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Batang Tarik Baja'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas tarik profil baja — SNI 1729:2020 (DFBK & ASD). Leleh penampang bruto vs fraktur penampang neto efektif, faktor shear lag, kelangsingan. Profil dari library baja; penampang tergambar otomatis.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'st-work');
    var canvasHost = UI.el('div', 'st-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang & keadaan batas');
    var results = UI.el('div', 'st-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var typeOpts = SP.types.map(function (t) { return { value: t.key, label: t.name + ' — ' + t.full }; });
    var sizeOpts = SP.list('WF').map(function (p) { return { value: p.name, label: p.name }; });
    var gradeOpts = GRADES.map(function (g, i) { return { value: String(i), label: g[0] }; });
    var uOpts = UPRESET.map(function (u, i) { return { value: String(u[1]), label: u[0] }; });

    var schema = [
      { type: 'group', label: 'Profil (library baja)' },
      { type: 'select', id: 'ptype', label: 'Tipe profil', value: 'WF', options: typeOpts },
      { type: 'select', id: 'psize', label: 'Ukuran', value: sizeOpts[8] ? sizeOpts[8].value : sizeOpts[0].value, options: sizeOpts },

      { type: 'group', label: 'Mutu Baja' },
      { type: 'select', id: 'grade', label: 'Mutu', value: '0', options: gradeOpts },
      { type: 'number', id: 'Fy', label: 'Fy — tegangan leleh', unit: 'MPa', value: 240, min: 100, step: 5 },
      { type: 'number', id: 'Fu', label: 'Fu — tegangan tarik putus', unit: 'MPa', value: 370, min: 100, step: 5 },

      { type: 'group', label: 'Sambungan' },
      { type: 'segment', id: 'conn', label: 'Jenis', value: 'bolt', options: [{ value: 'bolt', label: 'Baut' }, { value: 'weld', label: 'Las' }] },
      { type: 'number', id: 'nHole', label: 'Jumlah lubang (penampang kritis)', unit: '', value: 2, min: 0, step: 1 },
      { type: 'number', id: 'db', label: 'Diameter baut', unit: 'mm', value: 16, min: 8, step: 1 },
      { type: 'number', id: 'hole', label: 'Kelonggaran lubang', unit: 'mm', value: 2, min: 0, step: 0.5 },
      { type: 'number', id: 'tHole', label: 'Tebal elemen berlubang (0 = auto)', unit: 'mm', value: 0, min: 0, step: 0.5, hint: 'Kosong/0 → pakai tebal elemen tersambung dari library.' },
      { type: 'select', id: 'Upreset', label: 'Shear lag U', value: '1', options: uOpts },
      { type: 'number', id: 'Uval', label: 'U manual', unit: '', value: 0.85, min: 0.1, max: 1, step: 0.05 },

      { type: 'group', label: 'Batang & Beban' },
      { type: 'number', id: 'L', label: 'Panjang batang L (kelangsingan)', unit: 'mm', value: 3000, min: 0, step: 100 },
      { type: 'number', id: 'Pu', label: 'Pu — gaya tarik terfaktor (DFBK)', unit: 'kN', value: 0, min: 0, step: 10, hint: '0 = lewati rasio D/C.' },
      { type: 'number', id: 'Pa', label: 'Pa — gaya tarik layan (ASD)', unit: 'kN', value: 0, min: 0, step: 10, hint: '0 = lewati rasio D/C.' }
    ];

    function syncVisibility(vals) {
      var isBolt = vals.conn === 'bolt';
      ['nHole', 'db', 'hole', 'tHole'].forEach(function (id) {
        var f = state.form.fields[id]; if (f) f.node.closest('.ck-field').style.display = isBolt ? '' : 'none';
      });
      var manualU = String(vals.Upreset) === '0';
      var uf = state.form.fields.Uval; if (uf) uf.node.closest('.ck-field').style.display = manualU ? '' : 'none';
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'ptype') { fillSizes(vals.ptype); vals = form.getValues(); }
      if (changedId === 'grade') {
        var g = GRADES[parseInt(vals.grade, 10)];
        if (g && g[1] > 0) { form.setValue('Fy', g[1]); form.setValue('Fu', g[2]); vals = form.getValues(); }
      }
      syncVisibility(vals);
      update(vals, results);
    }, ID);   // ID → daftar ke window.CivilForms utk terima handoff (Kombinasi Beban → Pu)
    state.form = form;
    state.results = results;

    fillSizes('WF', schema[2].value);

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

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

    syncVisibility(form.getValues());
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Penampang & keadaan batas');
      results.appendChild(UI.el('div', 'ck-empty', 'Pilih profil, mutu baja, dan data sambungan untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    var p = r.p;
    state.cap.set(r.ti.name + '  ·  ' + p.name);

    results.appendChild(UI.heroRow([
      { label: 'φPn DFBK — ' + r.govLRFD, value: UI.fmt(r.phiPn, 1), unit: 'kN' },
      { label: 'Pn/Ω (ASD)', value: UI.fmt(r.Pa, 1), unit: 'kN' },
      (r.dcL !== null)
        ? { label: 'Pu/φPn', value: UI.fmt(r.dcL, 2), unit: r.dcL <= 1 ? 'OK' : 'NG', tone: r.dcL <= 1 ? 'ok' : 'bad' }
        : { label: 'φPn fraktur', value: UI.fmt(r.phiPnR, 1), unit: 'kN' }
    ]));

    results.appendChild(UI.rhead('Profil'));
    results.appendChild(UI.kv('Tipe', r.ti.name + ' — ' + r.ti.full));
    results.appendChild(UI.kv('Ukuran', p.name));
    results.appendChild(UI.kv('Berat', UI.fmt(p.w, 1) + ' kg/m'));
    results.appendChild(UI.kv('Ag (luas bruto)', UI.fmt(r.Ag, 0) + ' mm² (' + UI.fmt(p.A, 2) + ' cm²)'));
    results.appendChild(UI.kv('rmin (jari-jari girasi min)', UI.fmt(p.imin, 2) + ' cm'));
    results.appendChild(UI.kv('Sumber properti', p.source === 'tabel' ? 'Tabel ' + r.ti.std : 'Dihitung — ' + (p.note || 'geometri')));

    results.appendChild(UI.rhead('Penampang neto efektif'));
    if (r.conn === 'bolt' && r.nHole > 0) {
      results.appendChild(UI.kv('Lubang', r.nHole + ' × Ø' + UI.fmt(r.dh, 0) + ' mm (baut Ø' + r.db + ' + ' + r.hole + ')'));
      results.appendChild(UI.kv('Tebal elemen berlubang', UI.fmt(r.tHole, 1) + ' mm'));
      results.appendChild(UI.kv('An = Ag − Σ(dh·t)', UI.fmt(r.An, 0) + ' mm²'));
    } else {
      results.appendChild(UI.kv('An (tanpa lubang / las)', UI.fmt(r.An, 0) + ' mm²'));
    }
    results.appendChild(UI.kv('U (shear lag)', UI.fmt(r.U, 2)));
    results.appendChild(UI.kv('Ae = U·An', UI.fmt(r.Ae, 0) + ' mm²'));

    results.appendChild(UI.rhead('Kekuatan nominal'));
    results.appendChild(UI.kv('Pn leleh = Fy·Ag', UI.fmt(r.PnY, 1) + ' kN'));
    results.appendChild(UI.kv('Pn fraktur = Fu·Ae', UI.fmt(r.PnR, 1) + ' kN'));

    results.appendChild(UI.rhead('DFBK (LRFD)'));
    results.appendChild(UI.kv('φPn leleh (φ=0,90)', UI.fmt(r.phiPnY, 1) + ' kN', r.govLRFD.indexOf('Leleh') === 0 ? 'ok' : ''));
    results.appendChild(UI.kv('φPn fraktur (φ=0,75)', UI.fmt(r.phiPnR, 1) + ' kN', r.govLRFD.indexOf('Fraktur') === 0 ? 'ok' : ''));
    results.appendChild(UI.kv('φPn menentukan', UI.fmt(r.phiPn, 1) + ' kN — ' + r.govLRFD, 'ok'));
    if (r.dcL !== null) results.appendChild(UI.kv('Pu / φPn', r.dcL.toFixed(2), r.dcL <= 1 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('ASD'));
    results.appendChild(UI.kv('Pn/Ω leleh (Ω=1,67)', UI.fmt(r.PaY, 1) + ' kN', r.govASD.indexOf('Leleh') === 0 ? 'ok' : ''));
    results.appendChild(UI.kv('Pn/Ω fraktur (Ω=2,00)', UI.fmt(r.PaR, 1) + ' kN', r.govASD.indexOf('Fraktur') === 0 ? 'ok' : ''));
    results.appendChild(UI.kv('Pn/Ω menentukan', UI.fmt(r.Pa, 1) + ' kN — ' + r.govASD, 'ok'));
    if (r.dcA !== null) results.appendChild(UI.kv('Pa / (Pn/Ω)', r.dcA.toFixed(2), r.dcA <= 1 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Kelangsingan'));
    if (r.slender !== null) {
      results.appendChild(UI.kv('L / rmin', Math.round(r.slender) + ' / 300', r.slender <= 300 ? 'ok' : 'bad'));
    } else {
      results.appendChild(UI.kv('L / rmin', 'isi L untuk cek', ''));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan — kapasitas & kelangsingan dalam batas.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1729:2020 (adopsi AISC 360-16) — leleh bruto Pn=Fy·Ag, fraktur neto Pn=Fu·Ae dengan Ae=U·An; ' +
      'faktor DFBK φ=0,90/0,75 dan ASD Ω=1,67/2,00; kelangsingan L/r≤300 (rekomendasi). ' +
      'An = Ag − Σ(dh·t) untuk satu baris lubang tegak-lurus gaya (koreksi zig-zag s²/4g & 0,85Ag pelat sambung TIDAK diterapkan). ' +
      '<b>Blok geser</b> dan desain sambungan (baut/las) tidak dihitung di sini. ' +
      'Profil hot-rolled memakai tabel; SHS/RHS/Pipa/CNP dihitung dari geometri (idealisasi sudut tajam). Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar penampang + bar keadaan batas ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Pilih profil untuk melihat penampang.', w / 2, h / 2);
      return;
    }
    // Kiri: penampang · Kanan: bar
    var splitX = Math.min(w * 0.52, w - 200);
    drawSection(ctx, 0, 0, splitX, h, r);
    drawBars(ctx, splitX, 0, w - splitX, h, r);

    // Hover: sorot keadaan batas menentukan (pill ber-posisi aman via helper bersama)
    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'DFBK phiPn ' + r.phiPn.toFixed(0) + ' kN · ' + r.govLRFD
      });
    }
  }

  function drawSection(ctx, ox, oy, w, h, r) {
    var p = r.p, ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), line = css('--line'), panel = css('--panel-solid');
    var padT = 40, padB = 44, padS = 30;
    var boxW = w - 2 * padS, boxH = h - padT - padB;

    // dimensi luar profil (mm)
    var dimW, dimH;
    if (p.shape === 'pipe') { dimW = p.D; dimH = p.D; }
    else if (p.shape === 'box') { dimW = p.B; dimH = p.H; }
    else if (p.shape === 'L') { dimW = p.a; dimH = p.a; }
    else { dimW = p.B; dimH = p.H; }               // I, C
    var sc = Math.min(boxW / dimW, boxH / dimH) * 0.82;
    var cx = ox + w / 2, cy = oy + padT + boxH / 2;

    ctx.save();
    ctx.fillStyle = ink; ctx.strokeStyle = line; ctx.lineWidth = 1;
    var W = dimW * sc, H = dimH * sc;

    if (p.shape === 'I') {
      var tw = p.tw * sc, tf = p.tf * sc;
      // 2 sayap + badan, digambar dari poligon
      ctx.beginPath();
      ctx.rect(cx - W / 2, cy - H / 2, W, tf);                 // sayap atas
      ctx.rect(cx - W / 2, cy + H / 2 - tf, W, tf);            // sayap bawah
      ctx.rect(cx - tw / 2, cy - H / 2 + tf, tw, H - 2 * tf);  // badan
      ctx.fill();
    } else if (p.shape === 'C') {
      var t = p.tw ? p.tw * sc : p.t * sc;
      var tfl = p.tf ? p.tf * sc : p.t * sc;
      var x0 = cx - W / 2;
      ctx.beginPath();
      ctx.rect(x0, cy - H / 2, t, H);                          // web (kiri)
      ctx.rect(x0, cy - H / 2, W, tfl);                        // flens atas
      ctx.rect(x0, cy + H / 2 - tfl, W, tfl);                  // flens bawah
      if (p.shape === 'C' && p.C) {                            // bibir CNP
        var lip = p.C * sc, tt = p.t * sc;
        ctx.rect(x0 + W - tt, cy - H / 2, tt, lip);
        ctx.rect(x0 + W - tt, cy + H / 2 - lip, tt, lip);
      }
      ctx.fill();
    } else if (p.shape === 'L') {
      var tl = p.t * sc, x0L = cx - W / 2, y0L = cy - H / 2;
      ctx.beginPath();
      ctx.rect(x0L, y0L, tl, H);                               // kaki vertikal
      ctx.rect(x0L, y0L + H - tl, W, tl);                      // kaki horizontal
      ctx.fill();
    } else if (p.shape === 'box') {
      var tb = p.t * sc;
      ctx.beginPath();
      ctx.rect(cx - W / 2, cy - H / 2, W, H);
      ctx.rect(cx - W / 2 + tb, cy - H / 2 + tb, W - 2 * tb, H - 2 * tb, true);
      ctx.fill('evenodd');
      ctx.strokeRect(cx - W / 2, cy - H / 2, W, H);
    } else if (p.shape === 'pipe') {
      var Rout = W / 2, Rin = Rout - p.t * sc;
      ctx.beginPath();
      ctx.arc(cx, cy, Rout, 0, Math.PI * 2);
      ctx.arc(cx, cy, Math.max(0.5, Rin), 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    }
    // garis tepi tipis untuk shape solid (I/C/L)
    if (p.shape === 'I' || p.shape === 'C' || p.shape === 'L' || p.shape === 'pipe') {
      ctx.strokeStyle = css('--bg2'); ctx.lineWidth = 0.8;
    }
    ctx.restore();

    // marker lubang baut pada elemen tersambung (skematik)
    if (r.conn === 'bolt' && r.nHole > 0) {
      var holeR = Math.max(2.2, Math.min(r.dh * sc / 2, 6));
      var hx = cx, hy = cy;
      // taruh sepanjang badan/kaki secara skematik vertikal
      var n = Math.min(r.nHole, 4);
      for (var i = 0; i < n; i++) {
        var yy = cy - (n - 1) * 9 / 2 + i * 9;
        ctx.beginPath(); ctx.arc(hx, yy, holeR, 0, Math.PI * 2);
        ctx.fillStyle = css('--bg'); ctx.fill();
        ctx.strokeStyle = amber; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }

    // dimensi B (bawah) & H (kiri)
    dimLine(ctx, cx - W / 2, cx + W / 2, cy + H / 2 + 20, dim, (p.shape === 'pipe' ? 'D ' : 'b ') + Math.round(dimW));
    dimVert(ctx, cx - W / 2 - 16, cy - H / 2, cy + H / 2, faint, (p.shape === 'pipe' ? '' : 'h ') + Math.round(dimH));
    // judul profil kini di label .cap (HTML) — tidak digambar di kanvas agar tak menumpuk.
  }

  function drawBars(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var padT = 44, padB = 34, padL = 16, padR = 24;
    var x0 = ox + padL, x1 = ox + w - padR;
    var maxV = Math.max(r.phiPnY, r.phiPnR, r.Pu || 0, 1);
    var barsY = oy + padT;
    var trackW = x1 - x0;

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KAPASITAS DFBK (kN)', x0, oy + 22);

    var items = [
      { lbl: 'φPn leleh', v: r.phiPnY, gov: r.govLRFD.indexOf('Leleh') === 0 },
      { lbl: 'φPn fraktur', v: r.phiPnR, gov: r.govLRFD.indexOf('Fraktur') === 0 }
    ];
    var bh = 22, gap = 20;
    items.forEach(function (it, i) {
      var y = barsY + i * (bh + gap);
      // track
      ctx.fillStyle = css('--panel-solid'); ctx.globalAlpha = 0.6;
      roundBar(ctx, x0, y, trackW, bh, 5); ctx.fill(); ctx.globalAlpha = 1;
      // fill
      var fw = Math.max(2, trackW * it.v / maxV);
      ctx.fillStyle = it.gov ? amber : css('--sage') || dim;
      if (!it.gov) ctx.globalAlpha = 0.5;
      roundBar(ctx, x0, y, fw, bh, 5); ctx.fill(); ctx.globalAlpha = 1;
      // label
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(it.lbl + (it.gov ? '  ◄ menentukan' : ''), x0 + 4, y - 5);
      ctx.textAlign = 'right'; ctx.fillStyle = it.gov ? amber : dim;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(it.v.toFixed(0), x1, y + bh + 12);
    });

    // garis demand Pu
    if (r.Pu > 0) {
      var dx = x0 + trackW * Math.min(r.Pu / maxV, 1);
      var yTop = barsY - 6, yBot = barsY + items.length * (bh + gap) - gap + bh + 6;
      ctx.strokeStyle = r.dcL > 1 ? css('--danger') || '#e5484d' : ink;
      ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(dx, yTop); ctx.lineTo(dx, yBot); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = r.dcL > 1 ? css('--danger') || '#e5484d' : ink;
      ctx.fillText('Pu ' + r.Pu.toFixed(0), dx, yTop - 3);
    }

    // ringkasan bawah
    var yB = oy + h - padB + 6;
    ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = amber;
    ctx.fillText('phiPn = ' + r.phiPn.toFixed(1) + ' kN', x0, yB);
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('ASD Pn/O = ' + r.Pa.toFixed(1) + ' kN' + (r.slender !== null ? '  ·  L/r ' + Math.round(r.slender) : ''), x0, yB + 15);
  }

  function roundBar(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function dimLine(ctx, x1, x2, y, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    [[x1, 1], [x2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(a[0], y); ctx.lineTo(a[0] + a[1] * 6, y - 3); ctx.lineTo(a[0] + a[1] * 6, y + 3); ctx.closePath(); ctx.fill();
    });
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = css('--bg'); ctx.fillRect((x1 + x2) / 2 - tw / 2 - 4, y - 8, tw + 8, 16);
    ctx.fillStyle = color; ctx.fillText(label, (x1 + x2) / 2, y + 4);
  }
  function dimVert(ctx, x, y1, y2, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    [[y1, 1], [y2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(x, a[0]); ctx.lineTo(x - 3, a[0] + a[1] * 6); ctx.lineTo(x + 3, a[0] + a[1] * 6); ctx.closePath(); ctx.fill();
    });
    if (!label) return;
    ctx.save(); ctx.translate(x - 10, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ---------- Report monospace ---------- */
  var APP_VER = 'v0.3.0';
  var RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', v = ' ' + value;
    var d = RW - l.length - v.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + v;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/φ/g, 'phi').replace(/Ω/g, 'Omega').replace(/Σ/g, 'sum').replace(/·/g, '*')
      .replace(/²/g, '2').replace(/√/g, 'sqrt').replace(/×/g, 'x').replace(/Ø/g, 'dia')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/′/g, "'")
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
    var p = r.p;
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('BATANG TARIK BAJA'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 1729:2020 (DFBK & ASD)', dt));
    L.push('');
    L.push(' PROFIL');
    L.push(ruleR('-'));
    L.push(rowR('Tipe', tolatin(r.ti.name + ' - ' + r.ti.full)));
    L.push(rowR('Ukuran', tolatin(p.name)));
    L.push(rowR('Sumber properti', p.source === 'tabel' ? 'Tabel ' + r.ti.std : 'Hitung (' + tolatin(p.note || '') + ')'));
    L.push(rowR('Berat', numR(p.w, 1) + ' kg/m'));
    L.push(rowR('Ag', numR(r.Ag, 0) + ' mm2'));
    L.push(rowR('rmin', numR(p.imin, 2) + ' cm'));
    L.push('');
    L.push(' MUTU BAJA');
    L.push(ruleR('-'));
    L.push(rowR('Fy', numR(r.Fy, 0) + ' MPa'));
    L.push(rowR('Fu', numR(r.Fu, 0) + ' MPa'));
    L.push('');
    L.push(' SAMBUNGAN & LUAS NETO');
    L.push(ruleR('-'));
    if (r.conn === 'bolt' && r.nHole > 0) {
      L.push(rowR('Jenis', 'Baut'));
      L.push(rowR('Lubang', r.nHole + ' x dia ' + numR(r.dh, 0) + ' mm'));
      L.push(rowR('  baut / kelonggaran', 'dia ' + r.db + ' + ' + r.hole + ' mm'));
      L.push(rowR('Tebal elemen berlubang', numR(r.tHole, 1) + ' mm'));
      L.push(rowR('An = Ag - sum(dh*t)', numR(r.An, 0) + ' mm2'));
    } else {
      L.push(rowR('Jenis', 'Las / tanpa lubang'));
      L.push(rowR('An', numR(r.An, 0) + ' mm2'));
    }
    L.push(rowR('U (shear lag)', numR(r.U, 2)));
    L.push(rowR('Ae = U*An', numR(r.Ae, 0) + ' mm2'));
    L.push('');
    L.push(' KEKUATAN NOMINAL');
    L.push(ruleR('-'));
    L.push(rowR('Pn leleh  = Fy*Ag', numR(r.PnY, 1) + ' kN'));
    L.push(rowR('Pn frakt. = Fu*Ae', numR(r.PnR, 1) + ' kN'));
    L.push('');
    L.push(' OUTPUT — DFBK (LRFD)');
    L.push(ruleR('='));
    L.push(rowR('phi*Pn leleh (phi 0.90)', numR(r.phiPnY, 1) + ' kN'));
    L.push(rowR('phi*Pn frakt (phi 0.75)', numR(r.phiPnR, 1) + ' kN'));
    L.push(rowR('>> phi*Pn desain', numR(r.phiPn, 1) + ' kN'));
    L.push(rowR('   Menentukan', tolatin(r.govLRFD)));
    if (r.dcL !== null) L.push(rowR('   Pu/phiPn', numR(r.dcL, 2) + (r.dcL <= 1 ? ' (OK)' : ' (LEBIH)')));
    L.push(ruleR('='));
    L.push('');
    L.push(' OUTPUT — ASD');
    L.push(ruleR('='));
    L.push(rowR('Pn/Omega leleh (O 1.67)', numR(r.PaY, 1) + ' kN'));
    L.push(rowR('Pn/Omega frakt (O 2.00)', numR(r.PaR, 1) + ' kN'));
    L.push(rowR('>> Pn/Omega izin', numR(r.Pa, 1) + ' kN'));
    L.push(rowR('   Menentukan', tolatin(r.govASD)));
    if (r.dcA !== null) L.push(rowR('   Pa/(Pn/O)', numR(r.dcA, 2) + (r.dcA <= 1 ? ' (OK)' : ' (LEBIH)')));
    L.push(ruleR('='));
    L.push('');
    L.push(' KELANGSINGAN');
    L.push(ruleR('-'));
    if (r.slender !== null) L.push(rowR('L/rmin (<= 300)', numR(r.slender, 0) + (r.slender <= 300 ? ' (OK)' : ' (LEBIH)')));
    else L.push(rowR('L/rmin', 'L belum diisi'));

    var notes = r.warn.slice();
    if (notes.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Blok geser & desain sambungan tidak termasuk perhitungan ini.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(centerR('Alat bantu; verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L.map(tolatin);
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi data profil & mutu dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Batang-Tarik_' + r.ti.name.replace(/[^\w]/g, '') + '_' + r.name.replace(/[^\w]/g, '') + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Batang Tarik Baja', category: 'Baja', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      SP = window.SteelProfiles;
      if (!SP) { container.innerHTML = '<div class="ck-empty" style="padding:24px">Library profil baja (core/steel-profiles.js) belum dimuat.</div>'; return; }
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null };
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
