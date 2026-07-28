/* ============================================================
   Civil Tools — modules/continuous-beam/module.js  (Tier 2, kanvas 2D)
   ANALISIS BALOK / PELAT SATU ARAH — METODE KOEFISIEN
   SNI 2847:2019 Ps. 6.5 (Tabel 6.5.2 momen, Tabel 6.5.4 geser)

   Mu = C · wu · ln²   ;   Vu = C · wu · ln / 2
   ln = bentang BERSIH (positif & geser); rata-rata dua bentang
        bersebelahan untuk momen negatif tumpuan.

   Koefisien momen (Tabel 6.5.2):
     M+ bentang ujung: ujung tak terkekang 1/11 ; integral tumpuan 1/14
     M+ bentang dalam: 1/16
     M− muka dalam tumpuan luar: balok tepi (spandrel) 1/24 ; kolom 1/16
     M− muka luar tumpuan dalam pertama: 2 bentang 1/9 ; >2 bentang 1/10
     M− muka lain tumpuan dalam: 1/11
     M− semua tumpuan 1/12: (a) pelat bentang ≤ 3 m; (b) balok dengan
        Σ kekakuan kolom / kekakuan balok > 8 di kedua ujung bentang
   Geser (Tabel 6.5.4):
     Muka luar tumpuan dalam pertama: 1,15·wu·ln/2 ; muka lain: wu·ln/2

   Syarat pemakaian (Ps. 6.5.1): prismatis · beban merata · L ≤ 3D
   (tak terfaktor) · minimal 2 bentang · bentang bersebelahan beda ≤ 20%.
   Redistribusi momen TIDAK diizinkan (Ps. 6.5.3).

   SATU BENTANG (di luar Ps. 6.5) → statika elastis eksak:
     sendi–sendi  : M+ = wu·ln²/8                    ; V = wu·ln/2
     jepit–sendi  : M− = wu·ln²/8 ; M+ = 9·wu·ln²/128 ; V = 5/8 & 3/8·wu·ln
     jepit–jepit  : M− = wu·ln²/12 ; M+ = wu·ln²/24   ; V = wu·ln/2
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'continuous-beam';
  var GAMMA_C = 24;      // kN/m³
  var Es = 200000;       // MPa

  var BARS = [10, 13, 16, 19, 22, 25, 29, 32];
  var STIRRUPS = [8, 10, 13];
  function barOptions() { return BARS.map(function (v) { return { value: v, label: 'D' + v }; }); }
  function stirOptions() { return STIRRUPS.map(function (v) { return { value: v, label: 'Ø' + v }; }); }

  function Ab(db) { return Math.PI / 4 * db * db; }
  function beta1(fc) {
    if (fc <= 28) return 0.85;
    if (fc >= 55) return 0.65;
    return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
  }
  function rhoSlabMin(fy) {
    // Susut & suhu (Ps. 24.4.3.2) — juga batas minimum lentur pelat 1-arah
    return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014);
  }

  /* Desain tulangan tarik penampang persegi terhadap Mu (kN·m).
     Asumsi terkendali tarik φ=0,90 (SNI 2847 Ps. 21.2.2); diverifikasi εt setelah As dihitung.
     Rn = Mn/(b·d²) ; ρ = (0.85f'c/fy)·[1−√(1−2Rn/(0.85f'c))]. */
  function designAs(Mu, b, d, fc, fy) {
    var o = { Mu: Mu, As: 0, rho: 0, a: 0, c: 0, et: Infinity, tc: true, infeasible: false };
    if (!(Mu > 0) || !(b > 0) || !(d > 0)) return o;
    var phi = 0.90;
    var Rn = (Mu * 1e6 / phi) / (b * d * d);                 // MPa
    var disc = 1 - 2 * Rn / (0.85 * fc);
    if (disc < 0) { o.infeasible = true; disc = 0; }          // Rn > kapasitas tulangan-tunggal
    o.rho = (0.85 * fc / fy) * (1 - Math.sqrt(disc));
    o.As = o.rho * b * d;
    o.a = o.As * fy / (0.85 * fc * b);
    o.c = o.a / beta1(fc);
    o.et = o.c > 0 ? 0.003 * (d - o.c) / o.c : Infinity;
    o.tc = o.et >= 0.005;                                     // terkendali tarik → φ=0,90 valid
    return o;
  }

  /* Desain tulangan geser (sengkang) terhadap Vu (kN) — SNI 2847:2019 Ps. 22.5 & 9.
     Vc = 0.17·λ·√f'c·bw·d ; φ=0,75 ; λ=1 (beton normal). */
  function designShear(Vu, bw, d, fc, fyt, dsDia) {
    var phi = 0.75, VuN = Vu * 1e3;                          // N
    var Vc = 0.17 * Math.sqrt(fc) * bw * d;                  // N
    var o = { phi: phi, Vc: Vc / 1e3, phiVc: phi * Vc / 1e3, VuN: VuN };
    o.Av = 2 * Ab(dsDia);                                    // sengkang 2 kaki (mm²)
    var VsReq = VuN / phi - Vc;                              // N
    o.VsReq = Math.max(0, VsReq) / 1e3;                      // kN
    o.VsMax = 0.66 * Math.sqrt(fc) * bw * d / 1e3;           // kN — batas Ps. 22.5.1.2
    o.overMax = VsReq > 0.66 * Math.sqrt(fc) * bw * d;
    // batas spasi maks (Ps. 9.7.6.2.2): Vs ≤ 0.33√f'c·bw·d → d/2 ; > → d/4
    o.sMax = (VsReq <= 0.33 * Math.sqrt(fc) * bw * d) ? Math.min(d / 2, 600) : Math.min(d / 4, 300);
    // Av/s minimum (Ps. 9.6.3.4)
    o.avMin = Math.max(0.062 * Math.sqrt(fc), 0.35) * bw / fyt;   // mm²/mm
    var avReq = VsReq > 0 ? (VsReq / (fyt * d)) : 0;              // dari Vs
    if (VuN <= 0.5 * o.phiVc * 1e3) o.zone = 'none';             // < ½φVc → tak perlu
    else if (VsReq <= 0) o.zone = 'min';                        // ½φVc..φVc → sengkang minimum
    else o.zone = 'calc';
    o.avUse = (o.zone === 'none') ? 0 : Math.max(avReq, o.avMin);
    var sFromAv = o.avUse > 0 ? o.Av / o.avUse : Infinity;
    o.sReq = Math.min(sFromAv, o.sMax);
    o.sPakai = (o.zone === 'none') ? null : Math.max(50, Math.floor(o.sReq / 10) * 10);
    return o;
  }

  var state = {};

  /* ================= PERHITUNGAN ================= */
  function compute(v) {
    var r = { elem: v.elem, n: Math.round(v.n), warn: [], valid: true };
    var n = r.n;
    if (!(n >= 1) || !(v.L > 0) || !(v.bsup >= 0) || !(v.h > 0)) { r.valid = false; return r; }
    if (n > 12) { r.n = n = 12; }

    // beban per meter (pelat: per lajur 1 m)
    if (v.elem === 'pelat') {
      r.qself = GAMMA_C * v.h / 1000;               // kN/m² ≡ kN/m per lajur
      r.wD = r.qself + (v.qDs || 0);
      r.wL = v.qLs || 0;
    } else {
      if (!(v.b > 0)) { r.valid = false; return r; }
      r.b = v.b;
      r.qself = GAMMA_C * v.b * v.h / 1e6;          // kN/m
      r.wD = r.qself + (v.qDb || 0);
      r.wL = v.qLb || 0;
    }
    r.h = v.h;
    if (!(r.wD > 0)) { r.valid = false; return r; }

    // kombinasi (SNI 2847 Ps. 5.3.1)
    r.wu14 = 1.4 * r.wD;
    r.wu12 = 1.2 * r.wD + 1.6 * r.wL;
    r.wu = Math.max(r.wu14, r.wu12);
    r.gov14 = r.wu14 >= r.wu12;

    // bentang bersih
    r.L = v.L; r.bsup = v.bsup;
    r.lnE = v.L - v.bsup / 1000;
    r.Li = (n >= 3 && v.Li > 0) ? v.Li : v.L;
    r.lnI = r.Li - v.bsup / 1000;
    if (!(r.lnE > 0) || !(r.lnI > 0)) { r.valid = false; return r; }

    if (r.wL > 3 * r.wD)
      r.warn.push('qL = ' + r.wL.toFixed(2) + ' > 3·qD = ' + (3 * r.wD).toFixed(2) +
        ' — syarat Ps. 6.5.1(c) TIDAK terpenuhi; metode koefisien tidak boleh dipakai, analisis elastis diperlukan.');

    if (n === 1) { computeSingle(r, v); if (v.design === 'ya') computeDesign(r, v); return r; }

    // ---- metode koefisien (n >= 2) ----
    if (n >= 3) {
      var rasio = Math.max(r.lnE, r.lnI) / Math.min(r.lnE, r.lnI);
      r.rasio = rasio;
      if (rasio > 1.2)
        r.warn.push('Bentang bersebelahan berbeda ' + ((rasio - 1) * 100).toFixed(0) +
          '% > 20% — syarat Ps. 6.5.1(e) TIDAK terpenuhi.');
    }

    r.ujung = v.ujung;
    r.m12 = (v.m12 === 'm12');
    r.cPosEnd = (v.ujung === 'bebas') ? 11 : 14;
    r.cNegExt = (v.ujung === 'bebas') ? 0 : (v.ujung === 'spandrel' ? 24 : 16);
    if (r.m12) {
      if (r.cNegExt) r.cNegExt = 12;
      r.cNegFI = 12; r.cNegInt = 12;
      if (v.elem === 'pelat' && (r.lnE > 3 || r.lnI > 3))
        r.warn.push('Opsi 1/12 untuk pelat hanya berlaku bila SEMUA bentang ≤ 3 m (Tabel 6.5.2) — bentang Anda lebih panjang.');
    } else {
      r.cNegFI = (n === 2) ? 9 : 10;
      r.cNegInt = 11;
      if (v.elem === 'pelat' && r.lnE <= 3 && r.lnI <= 3)
        r.warn.push('Semua bentang ≤ 3 m — boleh memakai opsi M− = wu·ln²/12 di semua tumpuan (Tabel 6.5.2).');
    }

    r.lnAvgFI = (n >= 3) ? (r.lnE + r.lnI) / 2 : r.lnE;

    r.MposEnd = r.wu * r.lnE * r.lnE / r.cPosEnd;
    r.MposInt = (n >= 3) ? r.wu * r.lnI * r.lnI / 16 : null;
    r.MnegExt = r.cNegExt ? r.wu * r.lnE * r.lnE / r.cNegExt : 0;
    r.MnegFI = r.wu * r.lnAvgFI * r.lnAvgFI / r.cNegFI;
    r.MnegInt = (n >= 4) ? r.wu * r.lnI * r.lnI / r.cNegInt : null;

    r.Vext = r.wu * r.lnE / 2;
    r.VFI = 1.15 * r.wu * r.lnE / 2;
    r.Vint = (n >= 3) ? r.wu * r.lnI / 2 : null;

    // array utk kanvas: momen di tiap tumpuan (negatif) & tengah bentang (positif)
    r.supM = []; r.supV = []; r.spanM = []; r.spanLen = [];
    for (var i = 0; i <= n; i++) {
      if (i === 0 || i === n) { r.supM.push(r.MnegExt); r.supV.push(r.Vext); }
      else if (i === 1 || i === n - 1) { r.supM.push(r.MnegFI); r.supV.push(r.VFI); }
      else { r.supM.push(r.MnegInt); r.supV.push(r.Vint); }
    }
    for (i = 0; i < n; i++) {
      var end = (i === 0 || i === n - 1);
      r.spanM.push(end ? r.MposEnd : r.MposInt);
      r.spanLen.push(end ? r.L : r.Li);
    }
    r.MnegMax = Math.max.apply(null, r.supM);
    r.MposMax = Math.max(r.MposEnd, r.MposInt || 0);
    r.VuMax = r.VFI;
    if (v.design === 'ya') computeDesign(r, v);
    return r;
  }

  /* Desain penulangan lentur (balok & pelat) + geser (balok saja). */
  function computeDesign(r, v) {
    var fc = v.fc, fy = v.fy, cc = v.cc, db = parseFloat(v.db);
    var d = { valid: false, fc: fc, fy: fy, cc: cc, db: db, Ab: Ab(db) };
    r.des = d;
    if (!(fc > 0) || !(fy > 0) || !(cc >= 0) || !(db > 0)) return;

    var pelat = (r.elem === 'pelat');
    var bDes = pelat ? 1000 : r.b;                 // pelat: per lajur 1 m
    var ds = pelat ? 0 : parseFloat(v.ds);
    var dEff = r.h - cc - ds - db / 2;             // 1 lapis
    if (!(dEff > 0)) { d.err = 'Tinggi efektif ≤ 0 — periksa h, selimut, atau diameter.'; return; }
    d.bDes = bDes; d.d = dEff; d.ds = ds;

    // As,min lentur
    d.AsMin = pelat
      ? rhoSlabMin(fy) * bDes * r.h                                  // Ps. 7.6.1.1 → 24.4.3.2 (Ag)
      : Math.max(0.25 * Math.sqrt(fc) / fy, 1.4 / fy) * bDes * dEff; // Ps. 9.6.1.2
    d.sMaxSlab = pelat ? Math.min(3 * r.h, 450) : null;              // Ps. 7.7.2.3

    // Daftar momen kritis → item desain
    var items = [];
    function add(label, Mu, face) {
      if (!(Mu > 0)) return;
      var a = designAs(Mu, bDes, dEff, fc, fy);
      var AsReq = Math.max(a.As, d.AsMin);
      var it = { label: label, Mu: Mu, face: face, As: a.As, AsReq: AsReq,
        et: a.et, tc: a.tc, infeasible: a.infeasible, govMin: AsReq > a.As + 1e-6 };
      if (pelat) {
        var s = 1000 * d.Ab / AsReq;                                // spasi teoretis
        var sPakai = Math.floor(s / 25) * 25;                       // bulatkan turun ke kelipatan 25 mm
        var sCap = Math.floor(d.sMaxSlab / 25) * 25;                // batas spasi maks (kelipatan 25)
        if (sPakai > sCap) sPakai = sCap;
        it.s = Math.max(50, sPakai);
        it.AsProv = 1000 * d.Ab / it.s;
        it.spacingCap = s > d.sMaxSlab;                              // spasi teoretis > batas → batas menentukan
        it.txt = 'D' + db + '-' + it.s;
      } else {
        it.n = Math.max(2, Math.ceil(AsReq / d.Ab));
        it.AsProv = it.n * d.Ab;
        it.txt = it.n + ' D' + db;
      }
      items.push(it);
    }

    if (r.n === 1) {
      add('M+ lapangan', r.Mpos1, 'bawah');
      add('M− tumpuan jepit', r.MnegJ, 'atas');
    } else {
      add('M+ bentang ujung', r.MposEnd, 'bawah');
      if (r.MposInt !== null) add('M+ bentang dalam', r.MposInt, 'bawah');
      add('M− tumpuan luar', r.MnegExt, 'atas');
      add('M− tumpuan dalam-1', r.MnegFI, 'atas');
      if (r.MnegInt !== null) add('M− tumpuan dalam lain', r.MnegInt, 'atas');
    }
    d.items = items;
    d.anyInfeasible = items.some(function (i) { return i.infeasible; });
    d.anyNotTC = items.some(function (i) { return !i.tc && !i.infeasible; });

    // Geser — hanya balok
    if (!pelat) {
      var fyt = (v.fyt > 0) ? v.fyt : fy;
      d.fyt = fyt;
      d.shear = designShear(r.VuMax, r.b, dEff, fc, fyt, ds);
    }
    d.valid = true;
  }

  function computeSingle(r, v) {
    var ln = r.lnE, wu = r.wu, c = v.tumpuan1;
    r.tumpuan1 = c;
    r.spanLen = [r.L];
    if (c === 'js') {
      r.MnegJ = wu * ln * ln / 8;
      r.Mpos1 = 9 * wu * ln * ln / 128;
      r.VJ = 5 * wu * ln / 8;
      r.VS = 3 * wu * ln / 8;
      r.supM = [r.MnegJ, 0]; r.supV = [r.VJ, r.VS];
    } else if (c === 'jj') {
      r.MnegJ = wu * ln * ln / 12;
      r.Mpos1 = wu * ln * ln / 24;
      r.VJ = r.VS = wu * ln / 2;
      r.supM = [r.MnegJ, r.MnegJ]; r.supV = [r.VJ, r.VJ];
    } else {
      r.MnegJ = 0;
      r.Mpos1 = wu * ln * ln / 8;
      r.VJ = r.VS = wu * ln / 2;
      r.supM = [0, 0]; r.supV = [r.VJ, r.VJ];
    }
    r.spanM = [r.Mpos1];
    r.MnegMax = r.MnegJ;
    r.MposMax = r.Mpos1;
    r.VuMax = r.VJ;
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('cb-style')) return;
    var s = document.createElement('style');
    s.id = 'cb-style';
    s.textContent =
      '.cb-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.cb-canvas{position:relative;flex:1 1 52%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.cb-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Balok / Pelat Satu Arah Menerus'));
    panel.appendChild(UI.el('div', 'sub', 'Momen & geser ultimit metode koefisien SNI 2847:2019 Ps. 6.5 — 1 bentang memakai statika eksak.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'cb-work');
    var canvasHost = UI.el('div', 'cb-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Diagram momen ultimit');
    var results = UI.el('div', 'cb-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Elemen' },
      { type: 'segment', id: 'elem', label: 'Jenis elemen', value: 'pelat', options: [{ value: 'pelat', label: 'Pelat 1-arah' }, { value: 'balok', label: 'Balok' }] },
      { type: 'number', id: 'n', label: 'Jumlah bentang', unit: '', value: 4, min: 1, max: 12, step: 1 },

      { type: 'group', label: 'Geometri' },
      { type: 'number', id: 'L', label: 'L — bentang ujung (as–as)', unit: 'm', value: 4, min: 0.5, step: 0.1 },
      { type: 'number', id: 'Li', label: 'L dalam — bentang dalam (as–as)', unit: 'm', value: 4, min: 0.5, step: 0.1 },
      { type: 'number', id: 'bsup', label: 'Lebar tumpuan (balok/kolom)', unit: 'mm', value: 300, min: 0, step: 10 },
      { type: 'number', id: 'b', label: 'b — lebar balok', unit: 'mm', value: 300, min: 100, step: 10 },
      { type: 'number', id: 'h', label: 'h — tinggi / tebal', unit: 'mm', value: 130, min: 50, step: 10 },

      { type: 'group', label: 'Beban (belum terfaktor)' },
      { type: 'number', id: 'qDs', label: 'qD — mati tambahan (SDL)', unit: 'kN/m²', value: 1.5, min: 0, step: 0.1 },
      { type: 'number', id: 'qLs', label: 'qL — hidup', unit: 'kN/m²', value: 3, min: 0, step: 0.1 },
      { type: 'number', id: 'qDb', label: 'qD — mati tambahan (SDL)', unit: 'kN/m', value: 15, min: 0, step: 0.5 },
      { type: 'number', id: 'qLb', label: 'qL — hidup', unit: 'kN/m', value: 10, min: 0, step: 0.5 },

      { type: 'group', label: 'Kondisi tumpuan' },
      { type: 'segment', id: 'ujung', label: 'Ujung eksterior', value: 'spandrel', options: [
        { value: 'bebas', label: 'Bebas' }, { value: 'spandrel', label: 'Balok tepi' }, { value: 'kolom', label: 'Kolom' }] },
      { type: 'segment', id: 'm12', label: 'M− tumpuan', value: 'std', options: [
        { value: 'std', label: 'Tabel 6.5.2' }, { value: 'm12', label: '1/12 semua' }] },
      { type: 'select', id: 'tumpuan1', label: 'Tumpuan (1 bentang)', value: 'ss', options: [
        { value: 'ss', label: 'Sendi – Sendi' }, { value: 'js', label: 'Jepit – Sendi' }, { value: 'jj', label: 'Jepit – Jepit' }] },

      { type: 'group', label: 'Desain Tulangan (SNI 2847:2019)' },
      { type: 'segment', id: 'design', label: 'Hitung penulangan', value: 'ya', options: [
        { value: 'ya', label: 'Ya' }, { value: 'tidak', label: 'Tidak' }] },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — tul. lentur', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'cc', label: 'Selimut bersih', unit: 'mm', value: 20, min: 15, step: 5 },
      { type: 'select', id: 'db', label: 'Ø tul. utama', value: 10, options: barOptions() },
      { type: 'number', id: 'fyt', label: 'fyt — sengkang', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'select', id: 'ds', label: 'Ø sengkang', value: 10, options: stirOptions() }
    ];

    function syncVisibility(vals) {
      var n = Math.round(vals.n);
      var pelat = vals.elem === 'pelat';
      var des = vals.design === 'ya';
      var vis = {
        Li: n >= 3, b: !pelat,
        qDs: pelat, qLs: pelat, qDb: !pelat, qLb: !pelat,
        ujung: n >= 2, m12: n >= 2, tumpuan1: n === 1,
        fc: des, fy: des, cc: des, db: des,
        fyt: des && !pelat, ds: des && !pelat
      };
      Object.keys(vis).forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = vis[id] ? '' : 'none';
      });
    }

    var H_DEF = { pelat: 130, balok: 500 };
    var CC_DEF = { pelat: 20, balok: 40 };
    var DB_DEF = { pelat: 10, balok: 16 };
    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'elem') {
        form.setValue('h', H_DEF[vals.elem]);
        form.setValue('cc', CC_DEF[vals.elem]);
        form.setValue('db', DB_DEF[vals.elem]);
        vals = form.getValues();
      }
      syncVisibility(vals);
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

    syncVisibility(form.getValues());
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Diagram momen ultimit');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri dan beban untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    var uM = r.elem === 'pelat' ? ' kN·m/m' : ' kN·m';
    var uV = r.elem === 'pelat' ? ' kN/m' : ' kN';
    var uW = r.elem === 'pelat' ? ' kN/m²' : ' kN/m';
    state.cap.set('Mu− ' + UI.fmt(r.MnegMax, 1) + ' · Mu+ ' + UI.fmt(r.MposMax, 1) + uM);

    results.appendChild(UI.heroRow([
      { label: 'Mu− negatif maks', value: UI.fmt(r.MnegMax, 2), unit: uM.trim() },
      { label: 'Mu+ positif maks', value: UI.fmt(r.MposMax, 2), unit: uM.trim() },
      { label: 'wu menentukan', value: UI.fmt(r.wu, 2), unit: uW.trim() }
    ]));

    results.appendChild(UI.rhead('Beban'));
    results.appendChild(UI.kv('Berat sendiri (γc 24)', UI.fmt(r.qself, 2) + uW));
    results.appendChild(UI.kv('qD total (sendiri + SDL)', UI.fmt(r.wD, 2) + uW));
    results.appendChild(UI.kv('qL', UI.fmt(r.wL, 2) + uW));
    results.appendChild(UI.kv('qL ≤ 3·qD (Ps. 6.5.1c)', UI.fmt(r.wL, 2) + ' ≤ ' + UI.fmt(3 * r.wD, 2), r.wL <= 3 * r.wD ? 'ok' : 'bad'));
    results.appendChild(UI.kv('1,4·qD', UI.fmt(r.wu14, 2) + uW, r.gov14 ? 'ok' : ''));
    results.appendChild(UI.kv('1,2·qD + 1,6·qL', UI.fmt(r.wu12, 2) + uW, r.gov14 ? '' : 'ok'));
    results.appendChild(UI.kv('wu menentukan', UI.fmt(r.wu, 2) + uW));

    if (r.n === 1) {
      var lbl = { ss: 'sendi–sendi', js: 'jepit–sendi', jj: 'jepit–jepit' }[r.tumpuan1];
      results.appendChild(UI.rhead('Statika eksak — 1 bentang (' + lbl + '), ln = ' + UI.fmt(r.lnE, 2) + ' m'));
      if (r.MnegJ > 0) results.appendChild(UI.kv('Mu− tumpuan jepit', UI.fmt(r.MnegJ, 2) + uM));
      results.appendChild(UI.kv('Mu+ lapangan', UI.fmt(r.Mpos1, 2) + uM));
      results.appendChild(UI.kv('Vu ' + (r.tumpuan1 === 'js' ? 'sisi jepit' : 'tumpuan'), UI.fmt(r.VJ, 2) + uV));
      if (r.tumpuan1 === 'js') results.appendChild(UI.kv('Vu sisi sendi', UI.fmt(r.VS, 2) + uV));
      results.appendChild(UI.note('Catatan',
        'Metode koefisien Ps. 6.5 mensyaratkan <b>minimal 2 bentang</b> — untuk 1 bentang dipakai rumus statika ' +
        'elastis eksak sesuai kondisi tumpuan. Kondisi jepit menuntut tumpuan benar-benar kaku terhadap rotasi.'));
    } else {
      results.appendChild(UI.rhead('Momen ultimit (Tabel 6.5.2) — ln ujung ' + UI.fmt(r.lnE, 2) + (r.n >= 3 ? ' · ln dalam ' + UI.fmt(r.lnI, 2) : '') + ' m'));
      results.appendChild(UI.kv('M+ bentang ujung (1/' + r.cPosEnd + ')', UI.fmt(r.MposEnd, 2) + uM));
      if (r.MposInt !== null) results.appendChild(UI.kv('M+ bentang dalam (1/16)', UI.fmt(r.MposInt, 2) + uM));
      results.appendChild(UI.kv('M− tumpuan luar' + (r.cNegExt ? ' (1/' + r.cNegExt + ')' : ''), r.cNegExt ? UI.fmt(r.MnegExt, 2) + uM : '0 (ujung bebas)'));
      results.appendChild(UI.kv('M− tumpuan dalam pertama (1/' + r.cNegFI + ')', UI.fmt(r.MnegFI, 2) + uM));
      if (r.MnegInt !== null) results.appendChild(UI.kv('M− tumpuan dalam lainnya (1/' + r.cNegInt + ')', UI.fmt(r.MnegInt, 2) + uM));
      results.appendChild(UI.rhead('Geser ultimit (Tabel 6.5.4)'));
      results.appendChild(UI.kv('Vu muka tumpuan luar (wu·ln/2)', UI.fmt(r.Vext, 2) + uV));
      results.appendChild(UI.kv('Vu tumpuan dalam pertama (1,15·wu·ln/2)', UI.fmt(r.VFI, 2) + uV));
      if (r.Vint !== null) results.appendChild(UI.kv('Vu muka tumpuan lainnya (wu·ln/2)', UI.fmt(r.Vint, 2) + uV));
      results.appendChild(UI.note('Syarat pemakaian (Ps. 6.5.1)',
        'Elemen prismatis · beban terdistribusi merata · qL ≤ 3·qD (tak terfaktor) · minimal 2 bentang · ' +
        'bentang bersebelahan berbeda ≤ 20%. M− dihitung di <b>muka tumpuan</b> dengan ln rata-rata dua bentang ' +
        'bersebelahan. Redistribusi momen tidak diizinkan (Ps. 6.5.3).'));
    }

    if (r.des) renderDesign(results, r, uM, uV);

    if (r.warn.length) {
      results.appendChild(UI.note('Peringatan',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    }
    results.appendChild(UI.note('Referensi',
      'SNI 2847:2019 Ps. 6.5 (adopsi ACI 318-19). Nilai ' + (r.elem === 'pelat' ? 'per lajur 1 m' : 'per balok') + '. ' +
      'Lanjutkan ke tool <b>Kapasitas Balok (φMn)</b> / <b>Tulangan Minimum</b> untuk desain penampang. ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Panel hasil desain tulangan ---------- */
  function renderDesign(results, r, uM, uV) {
    var UI = state.UI, d = r.des, pelat = (r.elem === 'pelat');
    var uAs = pelat ? ' mm²/m' : ' mm²';
    if (!d.valid) {
      results.appendChild(UI.rhead('Desain tulangan'));
      results.appendChild(UI.note('Periksa input', d.err || 'Lengkapi f\'c, fy, selimut, dan diameter tulangan.'));
      return;
    }

    results.appendChild(UI.rhead('Desain tulangan lentur — SNI 2847 Ps. 22 (φ = 0,90)'));
    results.appendChild(UI.kv('d — tinggi efektif (1 lapis)', UI.fmt(d.d, 0) + ' mm'));
    results.appendChild(UI.kv('As,min ' + (pelat ? '(susut-suhu, Ps. 24.4.3.2)' : '(Ps. 9.6.1.2)'),
      UI.fmt(d.AsMin, 0) + uAs));
    if (pelat) results.appendChild(UI.kv('Spasi maks (min 3h; 450)', UI.fmt(d.sMaxSlab, 0) + ' mm'));

    d.items.forEach(function (it) {
      var tone = it.infeasible ? 'bad' : (it.tc ? 'ok' : '');
      results.appendChild(UI.kv(
        it.label + ' (' + it.face + ') — Mu ' + UI.fmt(it.Mu, 1) + uM,
        it.txt + '  · As ' + UI.fmt(it.AsReq, 0) + uAs + (it.govMin ? ' (As,min)' : ''),
        tone));
    });

    if (!pelat && d.shear) {
      var s = d.shear;
      results.appendChild(UI.rhead('Desain geser (sengkang) — Ps. 22.5, Vu ' + UI.fmt(r.VuMax, 1) + uV.trim()));
      results.appendChild(UI.kv('Vc = 0,17√f\'c·bw·d', UI.fmt(s.Vc, 1) + ' kN'));
      results.appendChild(UI.kv('φVc (φ=0,75)', UI.fmt(s.phiVc, 1) + ' kN'));
      results.appendChild(UI.kv('½·φVc', UI.fmt(s.phiVc / 2, 1) + ' kN'));
      if (s.zone === 'none') {
        results.appendChild(UI.kv('Kebutuhan', 'Vu ≤ ½φVc — sengkang tidak diperlukan', 'ok'));
        results.appendChild(UI.kv('Saran praktis', 'Pasang sengkang minimum Ø' + d.ds + ' bila balok utama'));
      } else {
        results.appendChild(UI.kv('Vs perlu = Vu/φ − Vc', UI.fmt(s.VsReq, 1) + ' kN' +
          (s.zone === 'min' ? ' (≤0 → sengkang minimum)' : '')));
        results.appendChild(UI.kv('Vs maks (0,66√f\'c·bw·d)', UI.fmt(s.VsMax, 1) + ' kN', s.overMax ? 'bad' : 'ok'));
        results.appendChild(UI.kv('Sengkang Ø' + d.ds + ' 2 kaki (Av ' + UI.fmt(s.Av, 0) + ' mm²)',
          'spasi ' + s.sPakai + ' mm', s.overMax ? 'bad' : 'ok'));
        results.appendChild(UI.kv('Spasi maks (Ps. 9.7.6.2.2)', UI.fmt(s.sMax, 0) + ' mm'));
      }
    }

    var msg = [];
    if (d.anyInfeasible) msg.push('Sebagian momen melampaui kapasitas tulangan tunggal (Rn terlalu besar) — perbesar penampang atau pakai tulangan tekan/rangkap.');
    if (d.anyNotTC) msg.push('Sebagian penampang belum terkendali tarik (εt < 0,005) sehingga φ &lt; 0,90 — hasil As kurang konservatif; perbesar d atau turunkan Mu.');
    if (d.shear && d.shear.overMax) msg.push('Vs perlu &gt; Vs maks — penampang balok terlalu kecil untuk geser; perbesar bw atau h.');
    results.appendChild(UI.note('Desain tulangan',
      'Lentur: penampang persegi tulangan tarik-saja, ρ dari Rn=Mu/(φbd²), asumsi terkendali tarik φ=0,90. ' +
      (pelat ? 'Pelat dihitung per lajur 1 m; spasi dibulatkan turun ke kelipatan 25 mm ≤ spasi maks. '
             : 'Balok: jumlah batang 1 lapis (min 2); cek spasi & multi-lapis pada tool Kapasitas Balok. ') +
      'Geser hanya balok. ' + (msg.length ? '<b>Perhatian:</b> ' + msg.join(' ') : 'Verifikasi tata letak & panjang penyaluran sebelum gambar kerja.')));
  }

  /* ================= KANVAS ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint');
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data untuk melihat diagram momen.', w / 2, h / 2);
      return;
    }
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), sky = css('--sky') || '#30BCED', line = css('--line');

    var padL = 46, padR = 30, padT = 44, padB = 26;
    var totL = 0, i;
    for (i = 0; i < r.n; i++) totL += r.spanLen[i];
    var sc = (w - padL - padR) / totL;
    var xs = [padL];
    for (i = 0; i < r.n; i++) xs.push(xs[i] + r.spanLen[i] * sc);

    var yBeam = padT + 30;
    var maxNeg = Math.max(r.MnegMax, 1e-9), maxPos = Math.max(r.MposMax, 1e-9);
    var y0 = yBeam + 34 + Math.min(60, h * 0.16);           // garis nol BMD
    var kNeg = (y0 - yBeam - 30) / maxNeg;                  // M− ke atas, jangan tabrak balok
    var kPos = (h - padB - 16 - y0) / maxPos;               // M+ ke bawah
    var k = Math.max(0.0001, Math.min(kNeg, kPos));

    // ---- beban merata (panah kecil di atas balok) ----
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    var qy0 = yBeam - 18;
    ctx.beginPath(); ctx.moveTo(xs[0], qy0); ctx.lineTo(xs[r.n], qy0); ctx.stroke();
    for (var qx = xs[0]; qx <= xs[r.n] + 0.1; qx += Math.max(18, totL * sc / 40)) {
      ctx.beginPath(); ctx.moveTo(qx, qy0); ctx.lineTo(qx, yBeam - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(qx - 2.5, yBeam - 8); ctx.lineTo(qx, yBeam - 3.5); ctx.lineTo(qx + 2.5, yBeam - 8); ctx.stroke();
    }
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('wu = ' + r.wu.toFixed(2), xs[0], qy0 - 4);

    // ---- balok & tumpuan ----
    ctx.strokeStyle = ink; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(xs[0], yBeam); ctx.lineTo(xs[r.n], yBeam); ctx.stroke();
    for (i = 0; i <= r.n; i++) {
      var x = xs[i];
      ctx.strokeStyle = dim; ctx.lineWidth = 1.4; ctx.fillStyle = dim;
      ctx.beginPath();
      ctx.moveTo(x, yBeam); ctx.lineTo(x - 6, yBeam + 11); ctx.lineTo(x + 6, yBeam + 11);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 8, yBeam + 11); ctx.lineTo(x + 8, yBeam + 11); ctx.stroke();
    }
    // simbol jepit utk 1 bentang
    if (r.n === 1 && r.tumpuan1 !== 'ss') {
      [[xs[0], true], [xs[1], r.tumpuan1 === 'jj']].forEach(function (a) {
        if (!a[1]) return;
        ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a[0], yBeam - 14); ctx.lineTo(a[0], yBeam + 12); ctx.stroke();
      });
    }

    // ---- BMD ----
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xs[0], y0); ctx.lineTo(xs[r.n], y0); ctx.stroke();

    ctx.strokeStyle = amber; ctx.lineWidth = 1.8;
    ctx.fillStyle = amber;
    ctx.globalAlpha = 1;
    for (i = 0; i < r.n; i++) {
      var yLp = y0 - (r.supM[i] || 0) * k;
      var yRp = y0 - (r.supM[i + 1] || 0) * k;
      var yMp = y0 + (r.spanM[i] || 0) * k;
      // parabola melalui 3 titik (ujung & tengah)
      var A = yLp, B = 4 * yMp - 3 * yLp - yRp, C = 2 * yLp + 2 * yRp - 4 * yMp;
      ctx.beginPath();
      for (var t = 0; t <= 24; t++) {
        var xi = t / 24;
        var px = xs[i] + (xs[i + 1] - xs[i]) * xi;
        var py = A + B * xi + C * xi * xi;
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // ordinat tumpuan (garis kecil) + label kiri-setengah (nilai kanan simetris)
    ctx.font = '10px "JetBrains Mono", monospace';
    var half = Math.ceil(r.n / 2);
    for (i = 0; i <= r.n; i++) {
      var xv = xs[i], mv = r.supM[i] || 0;
      if (mv > 0) {
        ctx.strokeStyle = faint; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xv, y0); ctx.lineTo(xv, y0 - mv * k); ctx.stroke();
      }
      if (i <= half && mv > 0) {
        ctx.fillStyle = sky; ctx.textAlign = 'center';
        ctx.fillText(mv.toFixed(1), xv, Math.max(yBeam + 22, y0 - mv * k - 5));
      }
    }
    for (i = 0; i < r.n; i++) {
      var mp = r.spanM[i] || 0;
      if (i < half && mp > 0) {
        ctx.fillStyle = amber; ctx.textAlign = 'center';
        ctx.fillText('+' + mp.toFixed(1), (xs[i] + xs[i + 1]) / 2, y0 + mp * k + 13);
      }
    }
    if (r.n >= 4) {
      ctx.fillStyle = faint; ctx.textAlign = 'right';
      ctx.fillText('simetris', xs[r.n], h - padB + 12);
    }

    // ---- hover ----
    state.hoverText = null;
    if (state.mouse) {
      var mx = state.mouse.x, best = null, bd = 26;
      for (i = 0; i <= r.n; i++) {
        var d1 = Math.abs(mx - xs[i]);
        if (d1 < bd) { bd = d1; best = { sup: i }; }
      }
      if (!best) {
        for (i = 0; i < r.n; i++) {
          var cxm = (xs[i] + xs[i + 1]) / 2;
          if (Math.abs(mx - cxm) < (xs[i + 1] - xs[i]) / 2 - 10) best = { span: i };
        }
      }
      if (best) {
        var uM = r.elem === 'pelat' ? ' kNm/m' : ' kNm';
        var uV = r.elem === 'pelat' ? ' kN/m' : ' kN';
        if (best.sup !== undefined) {
          state.hoverText = 'Tumpuan ' + (best.sup + 1) + ': Mu- ' + (r.supM[best.sup] || 0).toFixed(2) + uM +
            ' · Vu ' + (r.supV[best.sup] || 0).toFixed(2) + uV;
        } else {
          state.hoverText = 'Bentang ' + (best.span + 1) + ': Mu+ ' + (r.spanM[best.span] || 0).toFixed(2) + uM;
        }
        state.UI.canvasTip(ctx, { mx: state.mouse.x, my: state.mouse.y, w: w, h: h, text: state.hoverText });
      }
    }
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.5.0';
  var RW = 62;

  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value;
    var l = label + ' ', v = ' ' + value;
    var d = RW - l.length - v.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + v;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/·/g, '*').replace(/²/g, '2').replace(/³/g, '3').replace(/γ/g, 'gamma')
      .replace(/Σ/g, 'sum').replace(/φ/g, 'phi').replace(/Ø/g, 'O')
      .replace(/′/g, "'").replace(/’/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[×]/g, 'x')
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

  // Gbr. 1 — skema balok menerus + diagram momen (parabola per bentang)
  function figMoment(r) {
    var F = window.CivilReport.fig;
    var ops = [];
    var uM = r.elem === 'pelat' ? ' kNm/m' : ' kNm';
    var total = 0;
    r.spanLen.forEach(function (Ls) { total += Ls; });
    var x0 = 76, sx = 380 / total, yb = 92;
    var Mmax = Math.max(r.MnegMax || 0.001, r.MposMax || 0.001);
    var sM = 52 / Mmax;
    // beban merata wu (panah kecil di atas balok)
    for (var ia = 0; ia <= 14; ia++) {
      var xa = x0 + total * sx * ia / 14;
      F.arrow(ops, xa, yb - 22, xa, yb - 6, { lw: 0.5, g: 0.55 });
    }
    ops.push({ t: 'line', x1: x0, y1: yb - 22, x2: x0 + total * sx, y2: yb - 22, lw: 0.5, g: 0.55 });
    ops.push({ t: 'text', x: x0 + total * sx + 6, y: yb - 20, s: 'wu=' + numR(r.wu, 2), size: 6.5, g: 0.3 });
    // balok + tumpuan
    ops.push({ t: 'line', x1: x0, y1: yb, x2: x0 + total * sx, y2: yb, lw: 1.6 });
    var xs = [x0];
    r.spanLen.forEach(function (Ls) { xs.push(xs[xs.length - 1] + Ls * sx); });
    xs.forEach(function (xsup, i2) {
      ops.push({ t: 'poly', pts: [[xsup, yb], [xsup - 5, yb + 9], [xsup + 5, yb + 9]], close: true, fill: true, g: 0.4 });
      if (r.supV && r.supV[i2] != null)
        ops.push({ t: 'text', x: xsup, y: yb + 18, s: 'V=' + numR(r.supV[i2], 1), size: 5.5, align: 'c', g: 0.4 });
    });
    // diagram momen: parabola tiap bentang lewat (-Ml, +Mpos, -Mr); positif ke bawah
    for (var isp = 0; isp < r.spanLen.length; isp++) {
      var Ml = -(r.supM[isp] || 0), Mr = -(r.supM[isp + 1] || 0);
      var Mm = r.spanM[isp] || 0;
      var pts = [];
      for (var k = 0; k <= 24; k++) {
        var t = k / 24;
        // kuadratik lewat 3 titik: M(0)=Ml, M(0.5)=Mm, M(1)=Mr
        var Mt = Ml * (1 - t) * (1 - 2 * t) + 4 * Mm * t * (1 - t) + Mr * t * (2 * t - 1);
        pts.push([xs[isp] + (xs[isp + 1] - xs[isp]) * t, yb + Mt * sM]);
      }
      ops.push({ t: 'poly', pts: pts, lw: 1.1 });
      // label puncak positif & negatif
      ops.push({ t: 'text', x: (xs[isp] + xs[isp + 1]) / 2, y: yb + Mm * sM + 9, s: numR(Mm, 1), size: 6, align: 'c', g: 0.2 });
    }
    xs.forEach(function (xsup, i3) {
      var Ms = r.supM[i3] || 0;
      if (Ms > 0.005) ops.push({ t: 'text', x: xsup, y: yb - Ms * sM - 4, s: '-' + numR(Ms, 1), size: 6, align: 'c', g: 0.2 });
    });
    var yCap = yb + Mmax * sM + 26;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Diagram momen ' +
      (r.n === 1 ? 'statika eksak (1 bentang)' : 'metode koefisien (' + r.n + ' bentang)') +
      ' - M+maks ' + numR(r.MposMax, 1) + tolatin(uM) + ', M-maks ' + numR(r.MnegMax, 1) + tolatin(uM), size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Diagram momen balok menerus - lihat versi PDF' } };
  }

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var uM = r.elem === 'pelat' ? ' kNm/m' : ' kNm';
    var uV = r.elem === 'pelat' ? ' kN/m' : ' kN';
    var uW = r.elem === 'pelat' ? ' kN/m2' : ' kN/m';
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('MOMEN & GESER ' + (r.elem === 'pelat' ? 'PELAT SATU ARAH' : 'BALOK') + ' MENERUS'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019 Ps. 6.5', dt));
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR('Jenis elemen', r.elem === 'pelat' ? 'Pelat satu arah (lajur 1 m)' : 'Balok'));
    L.push(rowR('Jumlah bentang', r.n));
    L.push(rowR('L bentang ujung (as-as)', numR(r.L, 2) + ' m'));
    if (r.n >= 3) L.push(rowR('L bentang dalam (as-as)', numR(r.Li, 2) + ' m'));
    L.push(rowR('Lebar tumpuan', numR(r.bsup, 0) + ' mm'));
    L.push(rowR(r.elem === 'pelat' ? 'Tebal pelat h' : 'Penampang b x h', r.elem === 'pelat' ? numR(r.h, 0) + ' mm' : numR(r.b, 0) + ' x ' + numR(r.h, 0) + ' mm'));
    if (r.n >= 2) {
      L.push(rowR('Ujung eksterior', { bebas: 'Tak terkekang', spandrel: 'Integral balok tepi', kolom: 'Integral kolom' }[r.ujung]));
      if (r.m12) L.push(rowR('Opsi M- tumpuan', '1/12 semua tumpuan'));
    } else {
      L.push(rowR('Tumpuan', { ss: 'Sendi-sendi', js: 'Jepit-sendi', jj: 'Jepit-jepit' }[r.tumpuan1]));
    }
    L.push('');
    L.push(' BEBAN (belum terfaktor)');
    L.push(ruleR('-'));
    L.push(rowR('Berat sendiri (gamma_c 24)', numR(r.qself, 2) + uW));
    L.push(rowR('qD total (sendiri + SDL)', numR(r.wD, 2) + uW));
    L.push(rowR('qL', numR(r.wL, 2) + uW));
    L.push(rowR('Cek qL <= 3 qD (6.5.1c)', r.wL <= 3 * r.wD ? 'OK' : 'TIDAK OK'));
    L.push(rowR('wu = maks(1.4D; 1.2D+1.6L)', numR(r.wu, 2) + uW + (r.gov14 ? ' (1.4D)' : ' (1.2D+1.6L)')));
    L.push('');
    L.push(figMoment(r));
    L.push('');
    if (r.n === 1) {
      L.push(' STATIKA EKSAK - 1 BENTANG (di luar Ps. 6.5)');
      L.push(ruleR('-'));
      L.push(rowR('ln bentang bersih', numR(r.lnE, 2) + ' m'));
      L.push('');
      L.push(' OUTPUT');
      L.push(ruleR('='));
      if (r.MnegJ > 0) L.push(rowR('>> Mu- tumpuan jepit', numR(r.MnegJ, 2) + uM));
      L.push(rowR('>> Mu+ lapangan', numR(r.Mpos1, 2) + uM));
      L.push(rowR('>> Vu ' + (r.tumpuan1 === 'js' ? 'sisi jepit' : 'tumpuan'), numR(r.VJ, 2) + uV));
      if (r.tumpuan1 === 'js') L.push(rowR('>> Vu sisi sendi', numR(r.VS, 2) + uV));
      L.push(ruleR('='));
    } else {
      L.push(' MOMEN ULTIMIT  Mu = C * wu * ln^2  (Tabel 6.5.2)');
      L.push(ruleR('-'));
      L.push(rowR('ln ujung / dalam', numR(r.lnE, 2) + (r.n >= 3 ? ' / ' + numR(r.lnI, 2) : '') + ' m'));
      L.push(rowR('ln rata-rata (M- tumpuan-1)', numR(r.lnAvgFI, 2) + ' m'));
      L.push('');
      L.push(' OUTPUT');
      L.push(ruleR('='));
      L.push(rowR('>> M+ bentang ujung (1/' + r.cPosEnd + ')', numR(r.MposEnd, 2) + uM));
      if (r.MposInt !== null) L.push(rowR('>> M+ bentang dalam (1/16)', numR(r.MposInt, 2) + uM));
      L.push(rowR('>> M- tumpuan luar' + (r.cNegExt ? ' (1/' + r.cNegExt + ')' : ''), r.cNegExt ? numR(r.MnegExt, 2) + uM : '0 (bebas)'));
      L.push(rowR('>> M- tumpuan dalam-1 (1/' + r.cNegFI + ')', numR(r.MnegFI, 2) + uM));
      if (r.MnegInt !== null) L.push(rowR('>> M- tumpuan dalam lain (1/' + r.cNegInt + ')', numR(r.MnegInt, 2) + uM));
      L.push(rowR('>> Vu muka tumpuan luar', numR(r.Vext, 2) + uV));
      L.push(rowR('>> Vu tumpuan dalam-1 (1.15x)', numR(r.VFI, 2) + uV));
      if (r.Vint !== null) L.push(rowR('>> Vu muka tumpuan lain', numR(r.Vint, 2) + uV));
      L.push(ruleR('='));
      L.push('');
      L.push(' Syarat Ps. 6.5.1: prismatis; beban merata; qL <= 3 qD;');
      L.push(' minimal 2 bentang; beda bentang bersebelahan <= 20%.');
      L.push(' M- di muka tumpuan; ln rata-rata utk momen negatif.');
      L.push(' Redistribusi momen tidak diizinkan (Ps. 6.5.3).');
    }

    if (r.des) reportDesign(L, r);

    if (r.warn.length) {
      L.push('');
      L.push(' CATATAN');
      L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(centerR('Alat bantu; verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L.map(function (x) { return typeof x === 'string' ? tolatin(x) : x; });
  }

  function reportDesign(L, r) {
    var d = r.des, pelat = (r.elem === 'pelat');
    var uM = pelat ? ' kNm/m' : ' kNm';
    var uV = pelat ? ' kN/m' : ' kN';
    var uAs = pelat ? ' mm2/m' : ' mm2';
    L.push('');
    L.push(' DESAIN TULANGAN - SNI 2847:2019');
    L.push(ruleR('-'));
    if (!d.valid) {
      wrapR(' ' + tolatin(d.err || 'Data desain belum lengkap.'), RW).forEach(function (ln) { L.push(ln); });
      return;
    }
    L.push(rowR("f'c / fy", numR(d.fc, 0) + ' / ' + numR(d.fy, 0) + ' MPa'));
    L.push(rowR('Selimut / Ø utama', numR(d.cc, 0) + ' mm / D' + d.db));
    if (!pelat) L.push(rowR('fyt / Ø sengkang', numR(d.fyt, 0) + ' MPa / O' + d.ds));
    L.push(rowR('d tinggi efektif (1 lapis)', numR(d.d, 0) + ' mm'));
    L.push(rowR('As,min' + (pelat ? ' (susut-suhu)' : ' (Ps.9.6.1.2)'), numR(d.AsMin, 0) + uAs));
    if (pelat) L.push(rowR('Spasi maks (min 3h;450)', numR(d.sMaxSlab, 0) + ' mm'));
    L.push('');
    L.push(' LENTUR  (phi=0.90 ; Rn=Mu/(phi*b*d^2))');
    L.push(ruleR('.'));
    d.items.forEach(function (it) {
      L.push(rowR(it.label + ' (' + it.face + ')', 'Mu ' + numR(it.Mu, 1) + uM));
      L.push(rowR('  >> ' + it.txt, 'As ' + numR(it.AsReq, 0) + uAs + (it.govMin ? ' (As,min)' : '') +
        (it.infeasible ? ' [PERBESAR]' : (!it.tc ? ' [et<0.005]' : ''))));
    });
    if (!pelat && d.shear) {
      var s = d.shear;
      L.push('');
      L.push(' GESER  (phi=0.75 ; Vu ' + numR(r.VuMax, 1) + uV + ')');
      L.push(ruleR('.'));
      L.push(rowR("Vc = 0.17*sqrt(f'c)*bw*d", numR(s.Vc, 1) + ' kN'));
      L.push(rowR('phiVc / (1/2)phiVc', numR(s.phiVc, 1) + ' / ' + numR(s.phiVc / 2, 1) + ' kN'));
      if (s.zone === 'none') {
        L.push(rowR('>> Sengkang', 'Vu <= 1/2 phiVc -> tidak perlu'));
      } else {
        L.push(rowR('Vs perlu = Vu/phi - Vc', numR(s.VsReq, 1) + ' kN' + (s.zone === 'min' ? ' (min)' : '')));
        L.push(rowR("Vs maks 0.66*sqrt(f'c)*bw*d", numR(s.VsMax, 1) + ' kN' + (s.overMax ? ' [LAMPAUI]' : '')));
        L.push(rowR('>> Sengkang O' + d.ds + ' 2 kaki', 'spasi ' + s.sPakai + ' mm'));
        L.push(rowR('   Spasi maks (Ps.9.7.6.2.2)', numR(s.sMax, 0) + ' mm'));
      }
    }
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast('Lengkapi geometri dan beban dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Menerus_' + r.elem + '_' + r.n + 'bentang_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Balok/Pelat Menerus', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null, hoverText: null };
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
