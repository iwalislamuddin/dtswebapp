/* ============================================================
   Civil Tools — modules/beam-shear-torsion/module.js  (Tier 2, kanvas 2D)
   Geser & Torsi Balok Beton Bertulang — SNI 2847:2019
   Cek kapasitas penampang persegi terhadap kombinasi geser (Vu) + torsi (Tu),
   dengan sengkang tertutup (n kaki) + tulangan longitudinal.

   Acuan SNI 2847:2019 (setara ACI 318-19):
     φ = 0,75 (geser & torsi, Ps. 21.2.1).

     GESER (Ps. 22.5)
       Vc = 0,17·λ·√f'c·bw·d               (Ps. 22.5.5.1, tanpa gaya aksial)
       Vs = Av·fyt·d / s                    (Ps. 22.5.10.5.3)
       Vs,maks = 0,66·√f'c·bw·d             (Ps. 22.5.1.2 — batas dimensi)
       φVn = φ(Vc + Vs)

     TORSI (Ps. 22.7)
       Tth = 0,083·λ·√f'c·(Acp²/pcp)        (torsi batas — boleh diabaikan, Ps. 22.7.4.1)
       Aoh = x1·y1  (as sengkang terluar),  ph = 2(x1+y1),  Ao = 0,85·Aoh
       Tn = 2·Ao·At·fyt·cotθ / s            (Ps. 22.7.6.1),  θ = 45° → cotθ = 1
       φTn = φ·Tn
       Cek dimensi penampang solid (Ps. 22.7.7.1a):
         √[(Vu/(bw·d))² + (Tu·ph/(1,7·Aoh²))²] ≤ φ(Vc/(bw·d) + 0,66·√f'c)

     TULANGAN MINIMUM / PERLU
       (Av+2At)/s ≥ maks(0,062·√f'c·bw/fyt ; 0,35·bw/fyt)   (Ps. 9.6.4.2)
       Al = (At/s)·ph·(fyt/fy)·cot²θ                         (Ps. 22.7.6.1.2)
       Al,min = 0,42·√f'c·Acp/fy − (At/s)·ph·(fyt/fy)        (Ps. 9.6.4.3)
             dengan At/s ≥ 0,175·bw/fyt
       Spasi maks sengkang: geser d/2 (600) atau d/4 (300) bila Vs>0,33√f'c·bw·d
             (Ps. 9.7.6.2.2); torsi ph/8 ≤ 300 mm (Ps. 9.7.6.3.3).

   √f'c dibatasi ≤ 8,3 MPa (f'c ≤ ~69 MPa). λ = 1,0 beton normal.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'beam-shear-torsion';
  var PHI = 0.75;       // geser & torsi
  var COT = 1.0;        // θ = 45°

  var BARS = [10, 13, 16, 19, 22, 25, 29, 32, 36];
  var STIRRUPS = [8, 10, 13, 16];
  function barOptions() { return BARS.map(function (v) { return { value: v, label: 'D' + v + ' (' + v + ' mm)' }; }); }
  function stirOptions() { return STIRRUPS.map(function (v) { return { value: v, label: 'D' + v + ' (' + v + ' mm)' }; }); }
  function Aone(db) { return Math.PI / 4 * db * db; }

  var state = {};

  function compute(v) {
    var fc = v.fc, fy = v.fy, fyt = v.fyt, lam = parseFloat(v.lam);
    var b = v.b, h = v.h, cc = v.cc;
    var ds = parseFloat(v.ds), nLegs = Math.max(2, parseInt(v.nLegs, 10) || 2), s = v.s;
    var nTop = parseInt(v.nTop, 10) || 0, dbTop = parseFloat(v.dbTop);
    var nBot = parseInt(v.nBot, 10) || 0, dbBot = parseFloat(v.dbBot);
    var nSideRaw = parseInt(v.nSide, 10) || 0, dbSide = parseFloat(v.dbSide);
    var Vu = v.Vu * 1e3;          // kN -> N
    var Tu = v.Tu * 1e6;          // kN·m -> N·mm

    var r = { warn: [], valid: false };
    if (!(fc > 0) || !(fy > 0) || !(fyt > 0) || !(b > 0) || !(h > 0) || !(ds > 0) || !(s > 0) ||
        !(nBot >= 2) || !(dbBot > 0) || !(nTop >= 2) || !(dbTop > 0)) return r;

    // Tul. samping wajib kelipatan 2 (kiri = kanan); jika ganjil, dibulatkan turun.
    var nSide = nSideRaw;
    if (nSide < 0) nSide = 0;
    if (nSide % 2 !== 0) { nSide = nSide - 1; r.warn.push('Jumlah tulangan samping harus kelipatan 2 (kiri = kanan); dipakai ' + nSide + ' batang.'); }

    var sqrtfc = Math.min(Math.sqrt(fc), 8.3);
    var Ab = Aone(ds);                                   // luas 1 kaki sengkang
    var d = h - cc - ds - dbBot / 2;                     // tinggi efektif → ke tul. bawah (tarik)
    if (!(d > 0)) { r.warn.push('Tinggi efektif d ≤ 0 — periksa h, selimut, diameter sengkang & tulangan.'); return r; }

    /* ---- Geometri torsi (as sengkang tertutup terluar) ---- */
    var x1 = b - 2 * cc - ds, y1 = h - 2 * cc - ds;
    if (!(x1 > 0) || !(y1 > 0)) { r.warn.push('Dimensi inti sengkang ≤ 0 — selimut terlalu besar terhadap b/h.'); return r; }
    var Aoh = x1 * y1, ph = 2 * (x1 + y1), Ao = 0.85 * Aoh;
    var Acp = b * h, pcp = 2 * (b + h);
    r.valid = true;

    /* ---- GESER ---- */
    var Vc = 0.17 * lam * sqrtfc * b * d;               // N
    var Av = nLegs * Ab;                                 // total kaki (geser)
    var Vs = Av * fyt * d / s;
    var VsMax = 0.66 * sqrtfc * b * d;
    var VsEff = Math.min(Vs, VsMax);
    var phiVn = PHI * (Vc + VsEff);
    var ratioV = phiVn > 0 ? Vu / phiVn : Infinity;

    /* ---- TORSI ---- */
    var At = Ab;                                         // 1 kaki (sengkang tertutup terluar)
    var Tn = 2 * Ao * At * fyt * COT / s;                // N·mm
    var phiTn = PHI * Tn;
    var ratioT = phiTn > 0 ? Tu / phiTn : Infinity;
    var Tth = 0.083 * lam * sqrtfc * Acp * Acp / pcp;    // torsi batas
    var phiTth = PHI * Tth;
    var torsionNeglig = Tu < phiTth;

    /* ---- Cek dimensi penampang (Ps. 22.7.7.1a) ---- */
    var lhs = Math.sqrt(Math.pow(Vu / (b * d), 2) + Math.pow(Tu * ph / (1.7 * Aoh * Aoh), 2));
    var rhs = PHI * (Vc / (b * d) + 0.66 * sqrtfc);
    var sectionOK = lhs <= rhs;
    var ratioSec = rhs > 0 ? lhs / rhs : Infinity;

    /* ---- Tulangan transversal perlu ---- */
    var AvsShear = Math.max(0, (Vu / PHI - Vc) / (fyt * d));   // mm²/mm (total kaki, geser)
    var AtsTors = Tu / (PHI * 2 * Ao * fyt * COT);             // mm²/mm (per kaki, torsi)
    var demandTrans = AvsShear + 2 * AtsTors;                  // gabungan (Av+2At)/s perlu
    var minTrans = Math.max(0.062 * sqrtfc * b / fyt, 0.35 * b / fyt);
    var demandTransGov = Math.max(demandTrans, minTrans);
    var provTrans = (nLegs + 2) * Ab / s;                      // (Av+2At)/s tersedia (Ps. 9.6.4.2)
    var ratioTrans = provTrans > 0 ? demandTransGov / provTrans : Infinity;

    /* ---- Tulangan longitudinal torsi ---- */
    var AtsForAl = Math.max(AtsTors, 0.175 * b / fyt);
    var AlReq = AtsTors * ph * (fyt / fy) * COT * COT;
    var AlMin = Math.max(0, 0.42 * sqrtfc * Acp / fy - AtsForAl * ph * (fyt / fy));
    var AlGov = Math.max(AlReq, AlMin);
    var nLong = nTop + nBot + nSide;
    var AlProv = nTop * Aone(dbTop) + nBot * Aone(dbBot) + nSide * Aone(dbSide);
    var ratioAl = AlGov > 0 ? AlGov / AlProv : 0;

    /* ---- Spasi maksimum ---- */
    var smaxShear = (Vs <= 0.33 * sqrtfc * b * d) ? Math.min(d / 2, 600) : Math.min(d / 4, 300);
    var smaxTors = Math.min(ph / 8, 300);
    var smax = Math.min(smaxShear, smaxTors);
    var sOK = s <= smax + 1e-6;

    /* ---- simpan ---- */
    Object.assign(r, {
      fc: fc, fy: fy, fyt: fyt, lam: lam, b: b, h: h, cc: cc, ds: ds, nLegs: nLegs, s: s,
      nTop: nTop, dbTop: dbTop, nBot: nBot, dbBot: dbBot, nSide: nSide, dbSide: dbSide,
      nLong: nLong, Vu: Vu, Tu: Tu, sqrtfc: sqrtfc, d: d, Ab: Ab,
      x1: x1, y1: y1, Aoh: Aoh, ph: ph, Ao: Ao, Acp: Acp, pcp: pcp,
      Vc: Vc, Av: Av, Vs: Vs, VsMax: VsMax, VsEff: VsEff, phiVn: phiVn, ratioV: ratioV,
      At: At, Tn: Tn, phiTn: phiTn, ratioT: ratioT, Tth: Tth, phiTth: phiTth, torsionNeglig: torsionNeglig,
      lhs: lhs, rhs: rhs, sectionOK: sectionOK, ratioSec: ratioSec,
      AvsShear: AvsShear, AtsTors: AtsTors, demandTrans: demandTrans, minTrans: minTrans,
      demandTransGov: demandTransGov, provTrans: provTrans, ratioTrans: ratioTrans,
      AlReq: AlReq, AlMin: AlMin, AlGov: AlGov, AlProv: AlProv, ratioAl: ratioAl,
      smaxShear: smaxShear, smaxTors: smaxTors, smax: smax, sOK: sOK,
      // kN / kN·m untuk tampil
      VckN: Vc / 1e3, VskN: VsEff / 1e3, phiVnkN: phiVn / 1e3, VukN: Vu / 1e3, VsMaxkN: VsMax / 1e3,
      phiTnkNm: phiTn / 1e6, TukNm: Tu / 1e6, phiTthkNm: phiTth / 1e6
    });

    /* ---- peringatan ---- */
    if (!sectionOK) r.warn.push('Dimensi penampang TIDAK cukup untuk kombinasi geser+torsi (Ps. 22.7.7.1): √(…) = ' + r.lhs.toFixed(2) + ' > φ(…) = ' + r.rhs.toFixed(2) + ' MPa. Perbesar b/h atau naikkan f\'c.');
    if (Vs > VsMax) r.warn.push('Vs = ' + (Vs / 1e3).toFixed(1) + ' kN > Vs,maks = ' + (VsMax / 1e3).toFixed(1) + ' kN (Ps. 22.5.1.2). Kapasitas dibatasi Vs,maks; perbesar penampang.');
    if (!torsionNeglig && ratioT > 1.0) r.warn.push('φTn = ' + r.phiTnkNm.toFixed(2) + ' kN·m < Tu = ' + r.TukNm.toFixed(2) + ' kN·m. Perkecil spasi sengkang, perbesar diameter, atau tambah dimensi.');
    if (ratioV > 1.0) r.warn.push('φVn = ' + r.phiVnkN.toFixed(1) + ' kN < Vu = ' + r.VukN.toFixed(1) + ' kN. Sengkang geser kurang.');
    if (ratioTrans > 1.0) r.warn.push('Sengkang tersedia ((Av+2At)/s = ' + r.provTrans.toFixed(3) + ' mm²/mm) < perlu gabungan (Av+2At)/s = ' + r.demandTransGov.toFixed(3) + ' mm²/mm.');
    if (!sOK) r.warn.push('Spasi s = ' + Math.round(s) + ' mm > spasi maks ' + Math.round(smax) + ' mm (geser ' + Math.round(smaxShear) + ' / torsi ph/8 = ' + Math.round(smaxTors) + ' mm).');
    if (AlProv < AlGov - 1e-6) r.warn.push('Tulangan longitudinal torsi tersedia Al = ' + Math.round(AlProv) + ' mm² < perlu Al = ' + Math.round(AlGov) + ' mm² (sebar merata keliling sengkang).');
    if (torsionNeglig && Tu > 0) r.warn.push('Tu = ' + r.TukNm.toFixed(2) + ' kN·m < φ·Tth = ' + r.phiTthkNm.toFixed(2) + ' kN·m → torsi boleh DIABAIKAN (Ps. 22.7.4.1); desain cukup terhadap geser.');

    return r;
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('bst-style')) return;
    var s = document.createElement('style');
    s.id = 'bst-style';
    s.textContent =
      '.bst-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.bst-canvas{position:relative;flex:1 1 50%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.bst-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Geser & Torsi Balok Beton'));
    panel.appendChild(UI.el('div', 'sub', 'Cek kombinasi geser (Vu) + torsi (Tu) balok persegi bertulang — SNI 2847:2019. Sengkang tertutup n-kaki + tulangan longitudinal; θ = 45°, φ = 0,75. Diagram penampang otomatis.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'bst-work');
    var canvasHost = UI.el('div', 'bst-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang + sengkang tertutup + aliran torsi');
    var results = UI.el('div', 'bst-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Material' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — tul. longitudinal', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'fyt', label: 'fyt — sengkang', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'select', id: 'lam', label: 'λ — jenis beton', value: 1.0, options: [
        { value: 1.0, label: 'Normal (1,0)' }, { value: 0.85, label: 'Ringan-pasir (0,85)' }, { value: 0.75, label: 'Ringan (0,75)' }
      ] },

      { type: 'group', label: 'Penampang' },
      { type: 'number', id: 'b', label: 'b — lebar (bw)', unit: 'mm', value: 300, min: 100, step: 10 },
      { type: 'number', id: 'h', label: 'h — tinggi total', unit: 'mm', value: 500, min: 150, step: 10 },
      { type: 'number', id: 'cc', label: 'Selimut bersih (ke sengkang)', unit: 'mm', value: 40, min: 15, step: 5 },

      { type: 'group', label: 'Sengkang (tertutup)' },
      { type: 'select', id: 'ds', label: 'Diameter sengkang', value: 10, options: stirOptions() },
      { type: 'segment', id: 'nLegs', label: 'Jumlah kaki', value: 2, options: [
        { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }
      ] },
      { type: 'number', id: 's', label: 'Spasi sengkang (s)', unit: 'mm', value: 100, min: 25, step: 5 },

      { type: 'group', label: 'Tulangan Longitudinal' },
      { type: 'number', id: 'nTop', label: 'Tul. atas — jumlah', unit: '', value: 2, min: 2, step: 1 },
      { type: 'select', id: 'dbTop', label: 'Tul. atas — diameter', value: 16, options: barOptions() },
      { type: 'number', id: 'nBot', label: 'Tul. bawah — jumlah', unit: '', value: 2, min: 2, step: 1 },
      { type: 'select', id: 'dbBot', label: 'Tul. bawah — diameter', value: 19, options: barOptions() },
      { type: 'number', id: 'nSide', label: 'Tul. samping — jumlah (kelipatan 2)', unit: '', value: 2, min: 0, step: 2 },
      { type: 'select', id: 'dbSide', label: 'Tul. samping — diameter', value: 13, options: barOptions() },

      { type: 'group', label: 'Gaya Dalam Terfaktor' },
      { type: 'number', id: 'Vu', label: 'Vu — geser', unit: 'kN', value: 150, min: 0, step: 5 },
      { type: 'number', id: 'Tu', label: 'Tu — torsi', unit: 'kN·m', value: 25, min: 0, step: 1 }
    ];

    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); });
    state.form = form;
    state.results = results;

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf);
    repGrp.appendChild(btnTxt);
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

    update(form.getValues(), results);
  }

  function ratioTone(x) { return (x <= 1.0) ? 'ok' : 'bad'; }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Penampang + sengkang tertutup + aliran torsi');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi material, penampang, sengkang, tulangan & gaya dalam untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }

    var worst = Math.max(r.ratioV, r.torsionNeglig ? 0 : r.ratioT, r.ratioSec, r.ratioTrans, r.ratioAl);
    state.cap.set('φVn ' + UI.fmt(r.phiVnkN, 0) + ' kN · φTn ' + UI.fmt(r.phiTnkNm, 1) + ' kN·m · D/C ' + UI.fmt(worst, 2));

    results.appendChild(UI.heroRow([
      { label: 'φVn (geser)', value: UI.fmt(r.phiVnkN, 0), unit: 'kN' },
      { label: 'Vu/φVn', value: UI.fmt(r.ratioV, 2), tone: ratioTone(r.ratioV) },
      { label: r.torsionNeglig ? 'Torsi diabaikan' : 'Tu/φTn', value: r.torsionNeglig ? '—' : UI.fmt(r.ratioT, 2), tone: r.torsionNeglig ? '' : ratioTone(r.ratioT) }
    ]));

    results.appendChild(UI.rhead('Geometri & tulangan'));
    results.appendChild(UI.kv('d (tinggi efektif)', UI.fmt(r.d, 0) + ' mm'));
    results.appendChild(UI.kv('Sengkang', 'D' + r.ds + ' — ' + r.nLegs + ' kaki @ ' + UI.fmt(r.s, 0) + ' mm'));
    results.appendChild(UI.kv('Av (geser, total kaki)', UI.fmt(r.Av, 0) + ' mm²'));
    results.appendChild(UI.kv('Tul. atas', r.nTop + ' D' + r.dbTop));
    results.appendChild(UI.kv('Tul. bawah (tarik)', r.nBot + ' D' + r.dbBot));
    results.appendChild(UI.kv('Tul. samping', r.nSide > 0 ? r.nSide + ' D' + r.dbSide + ' (' + (r.nSide / 2) + '/sisi)' : 'tidak ada'));
    results.appendChild(UI.kv('Total Al', r.nLong + ' batang = ' + UI.fmt(r.AlProv, 0) + ' mm²'));
    results.appendChild(UI.kv('Aoh (as sengkang)', UI.fmt(r.Aoh, 0) + ' mm² · ph ' + UI.fmt(r.ph, 0) + ' mm'));
    results.appendChild(UI.kv('Ao = 0,85·Aoh', UI.fmt(r.Ao, 0) + ' mm²'));

    results.appendChild(UI.rhead('Kapasitas geser (Ps. 22.5)'));
    results.appendChild(UI.kv('Vc = 0,17·λ·√f\'c·bw·d', UI.fmt(r.VckN, 1) + ' kN'));
    results.appendChild(UI.kv('Vs = Av·fyt·d/s', UI.fmt(r.VskN, 1) + ' kN' + (r.Vs > r.VsMax ? ' (dibatasi Vs,maks ' + UI.fmt(r.VsMaxkN, 1) + ' kN)' : ''), r.Vs > r.VsMax ? 'bad' : ''));
    results.appendChild(UI.kv('φVn = φ(Vc+Vs)', UI.fmt(r.phiVnkN, 1) + ' kN'));
    results.appendChild(UI.kv('Vu', UI.fmt(r.VukN, 1) + ' kN'));
    results.appendChild(UI.kv('Rasio Vu/φVn', UI.fmt(r.ratioV, 3), ratioTone(r.ratioV)));

    results.appendChild(UI.rhead('Kapasitas torsi (Ps. 22.7)'));
    results.appendChild(UI.kv('φ·Tth (torsi batas)', UI.fmt(r.phiTthkNm, 2) + ' kN·m'));
    results.appendChild(UI.kv('Status torsi', r.torsionNeglig ? 'Boleh diabaikan (Tu < φTth)' : 'Wajib didesain (Tu ≥ φTth)', r.torsionNeglig ? 'ok' : ''));
    results.appendChild(UI.kv('Tn = 2·Ao·At·fyt·cotθ/s', UI.fmt(r.phiTnkNm / PHI, 2) + ' kN·m'));
    results.appendChild(UI.kv('φTn (kapasitas)', UI.fmt(r.phiTnkNm, 2) + ' kN·m'));
    results.appendChild(UI.kv('Tu', UI.fmt(r.TukNm, 2) + ' kN·m'));
    if (!r.torsionNeglig) results.appendChild(UI.kv('Rasio Tu/φTn', UI.fmt(r.ratioT, 3), ratioTone(r.ratioT)));

    results.appendChild(UI.rhead('Kontrol dimensi & spasi'));
    results.appendChild(UI.kv('Cek penampang (Ps. 22.7.7.1)', UI.fmt(r.lhs, 2) + ' ≤ ' + UI.fmt(r.rhs, 2) + ' MPa', r.sectionOK ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Rasio dimensi', UI.fmt(r.ratioSec, 3), ratioTone(r.ratioSec)));
    results.appendChild(UI.kv('Spasi maks (geser/torsi)', UI.fmt(r.smax, 0) + ' mm', r.sOK ? 'ok' : 'bad'));
    results.appendChild(UI.kv('s ≤ s,maks', r.sOK ? 'OK' : 'GAGAL (' + UI.fmt(r.s, 0) + ' > ' + UI.fmt(r.smax, 0) + ')', r.sOK ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Tulangan perlu (gabungan)'));
    results.appendChild(UI.kv('(Av/s) perlu geser', UI.fmt(r.AvsShear, 3) + ' mm²/mm'));
    results.appendChild(UI.kv('(At/s) perlu torsi (per kaki)', UI.fmt(r.AtsTors, 3) + ' mm²/mm'));
    results.appendChild(UI.kv('(Av+2At)/s perlu', UI.fmt(r.demandTransGov, 3) + ' mm²/mm' + (r.demandTransGov <= r.minTrans + 1e-9 ? ' (min)' : '')));
    results.appendChild(UI.kv('(Av+2At)/s tersedia', UI.fmt(r.provTrans, 3) + ' mm²/mm'));
    results.appendChild(UI.kv('Rasio sengkang', UI.fmt(r.ratioTrans, 3), ratioTone(r.ratioTrans)));
    results.appendChild(UI.kv('Al perlu (longitudinal torsi)', UI.fmt(r.AlGov, 0) + ' mm²' + (r.AlGov <= r.AlMin + 1e-6 && r.AlMin > 0 ? ' (min)' : '')));
    results.appendChild(UI.kv('Al tersedia', UI.fmt(r.AlProv, 0) + ' mm²', r.AlProv >= r.AlGov ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan — penampang & tulangan memenuhi geser + torsi SNI 2847:2019.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 2847:2019 — Vc = 0,17·λ·√f\'c·bw·d (Ps. 22.5.5.1, tanpa gaya aksial), Vs = Av·fyt·d/s (Ps. 22.5.10.5.3), ' +
      'Vs,maks = 0,66·√f\'c·bw·d (Ps. 22.5.1.2). Torsi: Tth (Ps. 22.7.4.1), Tn = 2·Ao·At·fyt·cotθ/s (Ps. 22.7.6.1) dengan ' +
      '<b>θ = 45° (cotθ = 1)</b> & Ao = 0,85·Aoh, cek dimensi solid Ps. 22.7.7.1. Sengkang minimum (Av+2At)/s (Ps. 9.6.4.2), ' +
      'tulangan longitudinal Al & Al,min (Ps. 22.7.6.1.2 & 9.6.4.3), spasi maks (Ps. 9.7.6.2.2 & 9.7.6.3.3). ' +
      '<b>At = luas satu kaki</b> sengkang tertutup terluar; <b>Av = seluruh kaki</b>. Al disebar merata di keliling sengkang ' +
      '(min satu batang tiap sudut). φ = 0,75. Torsi kesetimbangan (bukan kompatibilitas) — tidak ada redistribusi. ' +
      'Verifikasi detail pengangkuran sengkang 135° & panjang penyaluran Al secara terpisah.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar penampang + sengkang + aliran torsi ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), line = css('--line');

    if (!r || !r.valid) {
      ctx.fillStyle = faint;
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data penampang untuk melihat diagram.', w / 2, h / 2);
      return;
    }

    var padT = 42, padB = 58, padL = 74;
    var drawH = h - padT - padB;
    var secBoxW = Math.min(w * 0.42, 250);
    var sc = Math.min(drawH / r.h, secBoxW / r.b);
    var secW = r.b * sc, secH = r.h * sc;
    var x0 = padL, y0 = padT + (drawH - secH) / 2;
    var yTop = y0, yBot = y0 + secH;

    /* ---- Blok beton ---- */
    ctx.fillStyle = css('--panel-solid'); ctx.globalAlpha = 0.9;
    ctx.fillRect(x0, yTop, secW, secH); ctx.globalAlpha = 1;
    ctx.strokeStyle = line; ctx.lineWidth = 1.3;
    ctx.strokeRect(x0, yTop, secW, secH);

    /* ---- Area Aoh (di dalam sengkang) diarsir amber lembut ---- */
    var offPx = (r.cc + r.ds / 2) * sc;                 // dari tepi beton ke as sengkang
    var sx = x0 + offPx, sy = yTop + offPx;
    var sw = secW - 2 * offPx, sh = secH - 2 * offPx;
    if (sw > 0 && sh > 0) {
      ctx.fillStyle = amber; ctx.globalAlpha = 0.10;
      ctx.fillRect(sx, sy, sw, sh); ctx.globalAlpha = 1;
      // sengkang tertutup terluar (garis amber)
      ctx.strokeStyle = amber; ctx.lineWidth = 1.6;
      ctx.strokeRect(sx, sy, sw, sh);

      /* ---- Aliran torsi (panah melingkar) di tengah ---- */
      var cxm = sx + sw / 2, cym = sy + sh / 2;
      var rr = Math.min(sw, sh) * 0.24;
      if (rr > 8 && !r.torsionNeglig) {
        ctx.strokeStyle = dim; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(cxm, cym, rr, -Math.PI * 0.55, Math.PI * 1.25); ctx.stroke();
        // kepala panah
        var ah = Math.PI * 1.25;
        var ax = cxm + rr * Math.cos(ah), ay = cym + rr * Math.sin(ah);
        var tang = ah + Math.PI / 2;
        ctx.fillStyle = dim;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 6 * Math.cos(tang - 0.4), ay - 6 * Math.sin(tang - 0.4));
        ctx.lineTo(ax - 6 * Math.cos(tang + 0.4), ay - 6 * Math.sin(tang + 0.4));
        ctx.closePath(); ctx.fill();
        ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = dim; ctx.textAlign = 'center';
        ctx.fillText('T', cxm, cym + 3.5);
      }
    }

    /* ---- Kaki sengkang antara (bila >2) — garis vertikal di dalam ---- */
    if (r.nLegs > 2 && sw > 0) {
      ctx.strokeStyle = amber; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.7;
      for (var li = 1; li < r.nLegs - 1; li++) {
        var lx = sx + sw * li / (r.nLegs - 1);
        ctx.beginPath(); ctx.moveTo(lx, sy); ctx.lineTo(lx, sy + sh); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* ---- Tulangan longitudinal (atas / bawah / samping) ---- */
    barLayout(r).forEach(function (bp) {
      var cx = x0 + bp.x * sc, cy = yTop + bp.y * sc;
      var rad = Math.max(2.5, Math.min(bp.db * sc / 2, 8));
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = ink; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = css('--bg2'); ctx.stroke();
    });

    /* ---- Dimensi ---- */
    dimLine(ctx, x0, x0 + secW, yBot + 22, dim, 'b = ' + Math.round(r.b));
    dimVert(ctx, x0 - 18, yTop, yBot, faint, 'h ' + Math.round(r.h));

    /* ---- Label ringkas kanan ---- */
    var lx0 = x0 + secW + 26;
    if (lx0 < w - 60) {
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      var lines = [
        ['Vu/φVn', r.ratioV.toFixed(2), r.ratioV <= 1 ? amber : css('--red')],
        [r.torsionNeglig ? 'Torsi' : 'Tu/φTn', r.torsionNeglig ? 'abai' : r.ratioT.toFixed(2), (r.torsionNeglig || r.ratioT <= 1) ? dim : css('--red')],
        ['Dimensi', r.ratioSec.toFixed(2), r.ratioSec <= 1 ? dim : css('--red')]
      ];
      var ly = yTop + 6;
      lines.forEach(function (ln) {
        ctx.fillStyle = faint; ctx.fillText(ln[0], lx0, ly);
        ctx.fillStyle = ln[2]; ctx.fillText(ln[1], lx0 + 66, ly);
        ly += 18;
      });
    }

    /* ---- Hover ---- */
    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'phiVn=' + r.phiVnkN.toFixed(0) + 'kN  phiTn=' + r.phiTnkNm.toFixed(1) + 'kNm'
      });
    }
  }

  /* Tata letak batang longitudinal dalam koordinat penampang (mm, origin kiri-atas):
     baris atas (nTop), baris bawah (nBot), batang samping (nSide dibagi rata kiri/kanan
     di antara baris atas & bawah, tidak menimpa sudut). Dipakai kanvas & figur PDF. */
  function barLayout(r) {
    var bars = [];
    function off(db) { return r.cc + r.ds + db / 2; }   // tepi beton → pusat batang
    var yTopC = off(r.dbTop), yBotC = r.h - off(r.dbBot);
    // baris atas
    var xTL = off(r.dbTop), xTR = r.b - off(r.dbTop);
    for (var i = 0; i < r.nTop; i++) {
      var xt = (r.nTop === 1) ? r.b / 2 : xTL + (xTR - xTL) * i / (r.nTop - 1);
      bars.push({ x: xt, y: yTopC, db: r.dbTop });
    }
    // baris bawah
    var xBL = off(r.dbBot), xBR = r.b - off(r.dbBot);
    for (var j = 0; j < r.nBot; j++) {
      var xb = (r.nBot === 1) ? r.b / 2 : xBL + (xBR - xBL) * j / (r.nBot - 1);
      bars.push({ x: xb, y: yBotC, db: r.dbBot });
    }
    // batang samping (per sisi), interior antara baris atas & bawah
    var perSide = Math.floor(r.nSide / 2);
    var xSL = off(r.dbSide), xSR = r.b - off(r.dbSide);
    for (var k = 1; k <= perSide; k++) {
      var ys = yTopC + (yBotC - yTopC) * k / (perSide + 1);
      bars.push({ x: xSL, y: ys, db: r.dbSide });
      bars.push({ x: xSR, y: ys, db: r.dbSide });
    }
    return bars;
  }

  function dimLine(ctx, x1, x2, y, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    [[x1, 1], [x2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(a[0], y); ctx.lineTo(a[0] + a[1] * 6, y - 3); ctx.lineTo(a[0] + a[1] * 6, y + 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(a[0], y - 5); ctx.lineTo(a[0], y + 5); ctx.stroke();
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
      ctx.beginPath(); ctx.moveTo(x - 5, a[0]); ctx.lineTo(x + 5, a[0]); ctx.stroke();
    });
    ctx.save(); ctx.translate(x - 10, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ---------- Report monospace ---------- */
  var APP_VER = 'v0.7.3', RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value;
    var l = label + ' ', vv = ' ' + value;
    var d = RW - l.length - vv.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + vv;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/ε/g, 'e').replace(/β/g, 'beta').replace(/ρ/g, 'rho').replace(/φ/g, 'phi').replace(/λ/g, 'lambda')
      .replace(/θ/g, 'theta').replace(/·/g, '*').replace(/√/g, 'sqrt').replace(/²/g, '2').replace(/′/g, "'").replace(/’/g, "'")
      .replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[×]/g, 'x')
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

  // Gbr. 1 — penampang + sengkang tertutup + tulangan longitudinal (vektor PDF)
  function figSection(r) {
    var ops = [];
    var s = Math.min(120 / r.b, 150 / r.h);
    var bs = r.b * s, hs = r.h * s;
    var x0 = 118 - bs / 2, y0 = 20;
    ops.push({ t: 'rect', x: x0, y: y0, w: bs, h: hs, lw: 1.1 });
    // sengkang tertutup
    var off = (r.cc + r.ds / 2) * s;
    var sx = x0 + off, sy = y0 + off, sw = bs - 2 * off, sh = hs - 2 * off;
    ops.push({ t: 'rect', x: sx, y: sy, w: sw, h: sh, lw: 0.8, g: 0.2 });
    // kaki antara
    for (var li = 1; li < r.nLegs - 1; li++) {
      var lx = sx + sw * li / (r.nLegs - 1);
      ops.push({ t: 'line', x1: lx, y1: sy, x2: lx, y2: sy + sh, lw: 0.5, g: 0.4 });
    }
    // batang longitudinal (atas / bawah / samping)
    barLayout(r).forEach(function (bp) {
      ops.push({ t: 'circle', cx: x0 + bp.x * s, cy: y0 + bp.y * s, r: Math.max(1.4, bp.db * s / 2), fill: true });
    });
    // dimensi
    window.CivilReport.fig.dimH(ops, x0, x0 + bs, y0 + hs + 14, 'b = ' + Math.round(r.b));
    ops.push({ t: 'text', x: x0 - 8, y: y0 + hs / 2 + 2.5, s: 'h=' + Math.round(r.h), size: 6.5, align: 'r' });
    // aliran torsi
    if (!r.torsionNeglig) {
      var cx = sx + sw / 2, cy = sy + sh / 2, rr = Math.min(sw, sh) * 0.22;
      if (rr > 4) {
        ops.push({ t: 'text', x: cx, y: cy + 2, s: 'T', size: 8, align: 'c' });
        ops.push({ t: 'circle', cx: cx, cy: cy, r: rr, lw: 0.5, g: 0.5 });
      }
    }
    var yCap = y0 + hs + 26;
    ops.push({ t: 'text', x: 118, y: yCap, s: 'Gbr. 1  Penampang ' + Math.round(r.b) + 'x' + Math.round(r.h) +
      ' - atas ' + r.nTop + 'D' + r.dbTop + ' bawah ' + r.nBot + 'D' + r.dbBot +
      (r.nSide > 0 ? ' samping ' + r.nSide + 'D' + r.dbSide : '') +
      ' + sengkang D' + r.ds + '/' + r.nLegs + 'kaki', size: 7, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 8) / 11.5), ops: ops, alt: 'Gbr. 1 Penampang & sengkang - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('GESER & TORSI BALOK BETON BERTULANG'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019', dt));
    L.push('');
    L.push(' DESKRIPSI');
    L.push(ruleR('-'));
    L.push(' Cek kombinasi geser (Vu) + torsi (Tu) balok persegi');
    L.push(' bertulang. Sengkang tertutup n-kaki + tul. longitudinal.');
    L.push(' theta = 45 (cot=1), phi = 0.75.');
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR("f'c  Mutu beton", numR(r.fc, 1) + ' MPa'));
    L.push(rowR('fy   Tul. longitudinal', numR(r.fy, 1) + ' MPa'));
    L.push(rowR('fyt  Sengkang', numR(r.fyt, 1) + ' MPa'));
    L.push(rowR('lambda  Jenis beton', numR(r.lam, 2)));
    L.push(rowR('b    Lebar (bw)', numR(r.b, 0) + ' mm'));
    L.push(rowR('h    Tinggi total', numR(r.h, 0) + ' mm'));
    L.push(rowR('Selimut bersih', numR(r.cc, 0) + ' mm'));
    L.push(rowR('Sengkang', 'D' + numR(r.ds, 0) + ' - ' + r.nLegs + ' kaki @ ' + numR(r.s, 0) + ' mm'));
    L.push(rowR('Tul. atas', r.nTop + ' D' + r.dbTop));
    L.push(rowR('Tul. bawah (tarik)', r.nBot + ' D' + r.dbBot));
    L.push(rowR('Tul. samping', r.nSide > 0 ? r.nSide + ' D' + r.dbSide + ' (' + (r.nSide / 2) + '/sisi)' : 'tidak ada'));
    L.push(rowR('Vu  Geser', numR(r.VukN, 1) + ' kN'));
    L.push(rowR('Tu  Torsi', numR(r.TukNm, 2) + ' kN.m'));
    L.push('');
    L.push(figSection(r));
    L.push('');
    L.push(' GEOMETRI');
    L.push(ruleR('-'));
    L.push(rowR('d   Tinggi efektif', numR(r.d, 0) + ' mm'));
    L.push(rowR('Aoh (as sengkang)', numR(r.Aoh, 0) + ' mm2'));
    L.push(rowR('ph  Keliling as sengkang', numR(r.ph, 0) + ' mm'));
    L.push(rowR('Ao = 0.85*Aoh', numR(r.Ao, 0) + ' mm2'));
    L.push('');
    L.push(' GESER (Ps. 22.5)');
    L.push(ruleR('-'));
    L.push(rowR('Vc = 0.17*lambda*sqrt(fc)*bw*d', numR(r.VckN, 1) + ' kN'));
    L.push(rowR('Av (total kaki)', numR(r.Av, 0) + ' mm2'));
    L.push(rowR('Vs = Av*fyt*d/s', numR(r.Vs / 1e3, 1) + ' kN'));
    L.push(rowR('Vs,maks = 0.66*sqrt(fc)*bw*d', numR(r.VsMaxkN, 1) + ' kN'));
    L.push(rowR('phiVn = phi(Vc+Vs)', numR(r.phiVnkN, 1) + ' kN'));
    L.push(rowR('>> Rasio Vu/phiVn', numR(r.ratioV, 3) + (r.ratioV <= 1 ? ' OK' : ' GAGAL')));
    L.push('');
    L.push(' TORSI (Ps. 22.7)');
    L.push(ruleR('-'));
    L.push(rowR('phi*Tth (torsi batas)', numR(r.phiTthkNm, 2) + ' kN.m'));
    L.push(rowR('Status', r.torsionNeglig ? 'boleh diabaikan' : 'wajib didesain'));
    L.push(rowR('Tn = 2*Ao*At*fyt*cot/s', numR(r.phiTnkNm / PHI, 2) + ' kN.m'));
    L.push(rowR('phiTn (kapasitas)', numR(r.phiTnkNm, 2) + ' kN.m'));
    if (!r.torsionNeglig) L.push(rowR('>> Rasio Tu/phiTn', numR(r.ratioT, 3) + (r.ratioT <= 1 ? ' OK' : ' GAGAL')));
    L.push('');
    L.push(' KONTROL DIMENSI & SPASI');
    L.push(ruleR('-'));
    L.push(rowR('Cek penampang Ps.22.7.7.1', numR(r.lhs, 2) + ' <= ' + numR(r.rhs, 2) + ' MPa ' + (r.sectionOK ? 'OK' : 'GAGAL')));
    L.push(rowR('Spasi maks (geser/torsi)', numR(r.smax, 0) + ' mm ' + (r.sOK ? 'OK' : 'GAGAL')));
    L.push('');
    L.push(' TULANGAN PERLU (GABUNGAN)');
    L.push(ruleR('-'));
    L.push(rowR('(Av/s) perlu geser', numR(r.AvsShear, 3) + ' mm2/mm'));
    L.push(rowR('(At/s) perlu torsi/kaki', numR(r.AtsTors, 3) + ' mm2/mm'));
    L.push(rowR('(Av+2At)/s perlu', numR(r.demandTransGov, 3) + ' mm2/mm'));
    L.push(rowR('(Av+2At)/s tersedia', numR(r.provTrans, 3) + ' mm2/mm ' + (r.ratioTrans <= 1 ? 'OK' : 'KURANG')));
    L.push(rowR('Al perlu (long. torsi)', numR(r.AlGov, 0) + ' mm2'));
    L.push(rowR('Al tersedia', numR(r.AlProv, 0) + ' mm2 ' + (r.AlProv >= r.AlGov ? 'OK' : 'KURANG')));
    L.push('');
    L.push(' OUTPUT');
    L.push(ruleR('='));
    L.push(rowR('phiVn', numR(r.phiVnkN, 1) + ' kN'));
    L.push(rowR('phiTn', numR(r.phiTnkNm, 2) + ' kN.m'));
    var worst = Math.max(r.ratioV, r.torsionNeglig ? 0 : r.ratioT, r.ratioSec, r.ratioTrans, r.ratioAl);
    L.push(rowR('>> D/C maksimum', numR(worst, 3) + (worst <= 1 ? ' OK' : ' GAGAL')));
    L.push(ruleR('='));

    var notes = r.warn.slice();
    if (notes.length) {
      L.push('');
      L.push(' CATATAN');
      L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(centerR('Alat bantu; verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L.map(function (x) { return typeof x === 'string' ? tolatin(x) : x; });
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast('Lengkapi data penampang & gaya dalam dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Geser-Torsi_' + Math.round(r.b) + 'x' + Math.round(r.h) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Geser & Torsi Balok', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
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
