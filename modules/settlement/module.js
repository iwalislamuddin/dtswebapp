/* ============================================================
   Civil Tools — modules/settlement/module.js  (Tier 2, kanvas 2D)
   Penurunan fondasi dangkal — DUA komponen:
     1) Penurunan SEGERA / elastis (immediate, Se)
     2) Penurunan KONSOLIDASI primer (consolidation, Sc)
   + Laju konsolidasi (Terzaghi Tv–U) opsional.

   1. PENURUNAN SEGERA (teori elastisitas, Das/Bowles) — Steinbrenner
   ------------------------------------------------------------
     Se = q0 · B' · (1−μs²)/Es · Is · If        (per sudut area lentur)
     Is = F1 + (1−2μs)/(1−μs)·F2   (fungsi m'=L/B, n'=H/B')
       F1 = (A0+A1)/π ; F2 = (n'/2π)·arctan(A2)
       A0 = m'·ln[ (1+√(m'²+1))·√(m'²+n'²) / (m'·(1+√(m'²+n'²+1))) ]
       A1 = ln[ (m'+√(m'²+1))·√(1+n'²) / (m'+√(m'²+n'²+1)) ]
       A2 = m' / (n'·√(m'²+n'²+1))
     PUSAT fondasi lentur (superposisi 4 kuadran): B'=B/2, m'=L/B, n'=H/(B/2)
       Se,pusat = 4 · q0 · (B/2) · (1−μs²)/Es · Is · If
     SUDUT: B'=B, m'=L/B, n'=H/B → Se,sudut = q0·B·(1−μs²)/Es·Is·If
     Rata-rata lentur ≈ 0,85·Se,pusat ; KAKU ≈ 0,93·rata-rata ≈ 0,79·Se,pusat.
     If = faktor kedalaman Fox (default 1,0; input — kurang dari 1 mereduksi Se).
     H = tebal lapisan tanah termampatkan di BAWAH dasar fondasi (H besar ≈ ruang
     setengah tak hingga). Lingkaran → luas ekuivalen persegi (B=L=0,886·D).

   2. PENURUNAN KONSOLIDASI (e–log p)
   ------------------------------------------------------------
     Δσ' di sepanjang lempung via metode 2:1 (rata-rata Simpson: atas, tengah, bawah):
       persegi/bujur sangkar: Δσ = q0·B·L / ((B+z)(L+z))
       menerus (strip):        Δσ = q0·B / (B+z)
       (z = kedalaman di bawah dasar fondasi)
       Δσ,rata = (Δσ_atas + 4·Δσ_tengah + Δσ_bawah)/6
     σ'0 = tegangan efektif overburden awal di tengah lempung (input).
     σ'c = tegangan prakonsolidasi ; OCR = σ'c/σ'0. σ'f = σ'0 + Δσ,rata.
     NC (σ'0 ≥ σ'c):        Sc = Cc·H/(1+e0)·log10(σ'f/σ'0)
     OC & σ'f ≤ σ'c:        Sc = Cr·H/(1+e0)·log10(σ'f/σ'0)
     OC & σ'f > σ'c:        Sc = Cr·H/(1+e0)·log10(σ'c/σ'0)
                               + Cc·H/(1+e0)·log10(σ'f/σ'c)

   3. LAJU KONSOLIDASI (Terzaghi 1-D) — opsional
   ------------------------------------------------------------
     Tv = cv·t/Hdr²  ; Hdr = H (drainase tunggal) atau H/2 (drainase ganda)
     U≤60%: Tv = (π/4)·U² → U = √(4Tv/π)
     U>60%: Tv = 1,781 − 0,933·log10(100−U%)
     t50 (Tv=0,197), t90 (Tv=0,848). St = Se + U·Sc.

   TIDAK termasuk: pemampatan sekunder (creep), lempung berlapis banyak,
   penurunan pasir metode Schmertmann/N-SPT, Δσ Boussinesq penuh, interaksi
   tanah–struktur. Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'settlement';

  var D2R = Math.PI / 180;

  var SHAPES = [
    ['strip', 'Menerus (strip)'],
    ['square', 'Bujur sangkar'],
    ['circular', 'Lingkaran'],
    ['rect', 'Persegi panjang']
  ];

  var state = {};
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function shapeName(k) { for (var i = 0; i < SHAPES.length; i++) if (SHAPES[i][0] === k) return SHAPES[i][1]; return k; }

  /* ---------- Faktor pengaruh elastis Steinbrenner ---------- */
  function steinbrennerIs(m, n, mu) {
    if (n <= 0) n = 1e-6;
    if (m < 1e-6) m = 1e-6;
    var m2 = m * m, n2 = n * n;
    var r_m1 = Math.sqrt(m2 + 1);
    var r_mn = Math.sqrt(m2 + n2);
    var r_mn1 = Math.sqrt(m2 + n2 + 1);
    var r_1n = Math.sqrt(1 + n2);
    var A0 = m * Math.log(((1 + r_m1) * r_mn) / (m * (1 + r_mn1)));
    var A1 = Math.log(((m + r_m1) * r_1n) / (m + r_mn1));
    var F1 = (A0 + A1) / Math.PI;
    var A2 = m / (n * r_mn1);
    var F2 = (n / (2 * Math.PI)) * Math.atan(A2);
    var Is = F1 + (1 - 2 * mu) / (1 - mu) * F2;
    return { Is: Is, F1: F1, F2: F2 };
  }

  /* ---------- Tambahan tegangan metode 2:1 ---------- */
  function stress2to1(q, Bc, Lc, z, isStrip) {
    if (z < 0) z = 0;
    if (isStrip) return q * Bc / (Bc + z);
    return q * Bc * Lc / ((Bc + z) * (Lc + z));
  }

  /* ---------- Derajat konsolidasi ---------- */
  function degreeU(Tv) {
    if (Tv <= 0) return 0;
    if (Tv < 0.2827) {                         // U ≤ 60%
      var U = Math.sqrt(4 * Tv / Math.PI);
      return Math.min(U, 0.6);
    }
    var log = (1.781 - Tv) / 0.933;            // log10(100 − U%)
    var rem = Math.pow(10, log);               // 100 − U%
    var U2 = 1 - rem / 100;
    if (U2 > 0.99999) U2 = 0.99999;
    return U2;
  }

  /* ---------- COMPUTE ---------- */
  function compute(v) {
    var r = { warn: [], valid: false };
    var shape = v.shape || 'square';
    var B = num(v.B), L = num(v.L), Df = num(v.Df), q0 = num(v.q0);
    var EsMPa = num(v.Es), mu = num(v.mu), Hs = num(v.Hs), If = num(v.If);
    var rigid = String(v.rigid) === 'rigid';
    var ztop = num(v.ztop), Hc = num(v.Hc), e0 = num(v.e0), Cc = num(v.Cc), Cr = num(v.Cr);
    var sig0 = num(v.sig0), sigc = num(v.sigc);
    var cv = num(v.cv), tYr = num(v.t), drain = String(v.drain || 'double');

    if (!(B > 0)) { r.warn.push('Lebar fondasi B harus > 0.'); return r; }
    if (!(Df >= 0)) { r.warn.push('Kedalaman Df tidak boleh negatif.'); return r; }
    if (!(q0 > 0)) { r.warn.push('Tekanan neto q0 harus > 0.'); return r; }
    if (!(EsMPa > 0)) { r.warn.push('Modulus elastisitas Es harus > 0.'); return r; }
    if (!(mu > 0 && mu < 0.5)) { if (mu >= 0.5) mu = 0.49; else mu = 0.3; }
    if (!(Hs > 0)) Hs = 30;
    if (!(If > 0)) If = 1;

    var isStrip = shape === 'strip';
    var Bc, Lc;
    if (isStrip) { Bc = B; Lc = B * 40; L = 0; }
    else if (shape === 'square') { Bc = B; Lc = B; L = B; }
    else if (shape === 'circular') { Bc = 0.8862 * B; Lc = 0.8862 * B; L = B; }
    else { // rect
      if (!(L > 0)) { r.warn.push('Panjang L harus > 0 untuk fondasi persegi panjang.'); return r; }
      if (L < B) { var t = L; L = B; B = t; Bc = B; r.warn.push('L < B ditukar agar B = sisi pendek.'); }
      Bc = B; Lc = L;
    }

    /* ---- Penurunan segera (elastis) ---- */
    var Es = EsMPa * 1000;                       // MPa → kPa
    var mC = Lc / Bc, nC = Hs / (Bc / 2);
    var isC = steinbrennerIs(mC, nC, mu);
    var SeCenter = 4 * q0 * (Bc / 2) * (1 - mu * mu) / Es * isC.Is * If;   // m
    var mE = Lc / Bc, nE = Hs / Bc;
    var isE = steinbrennerIs(mE, nE, mu);
    var SeCorner = q0 * Bc * (1 - mu * mu) / Es * isE.Is * If;             // m
    var SeAvg = 0.85 * SeCenter;
    var SeRigid = 0.93 * SeAvg;
    SeCenter *= 1000; SeCorner *= 1000; SeAvg *= 1000; SeRigid *= 1000;    // mm
    var Se = rigid ? SeRigid : SeCenter;

    /* ---- Penurunan konsolidasi ---- */
    var consol = { active: false };
    if (Hc > 0 && Cc > 0 && e0 > 0) {
      if (!(sig0 > 0)) { r.warn.push("σ'0 (tegangan efektif di tengah lempung) harus > 0 untuk konsolidasi."); }
      else {
        if (Cr < 0) Cr = 0;
        if (!(sigc > 0) || sigc < sig0) sigc = sig0;   // σ'c ≥ σ'0
        var zt = Math.max(0.001, ztop - Df);           // kedalaman puncak lempung di bawah dasar
        var zm = zt + Hc / 2, zb = zt + Hc;
        var dTop = stress2to1(q0, Bc, Lc, zt, isStrip);
        var dMid = stress2to1(q0, Bc, Lc, zm, isStrip);
        var dBot = stress2to1(q0, Bc, Lc, zb, isStrip);
        var dAvg = (dTop + 4 * dMid + dBot) / 6;
        var sigF = sig0 + dAvg;
        var OCR = sigc / sig0;
        var nc = OCR <= 1.0001;
        var HH = Hc / (1 + e0), Sc, mode;
        if (nc) { Sc = Cc * HH * Math.log10(sigF / sig0); mode = 'NC'; }
        else if (sigF <= sigc) { Sc = Cr * HH * Math.log10(sigF / sig0); mode = 'OC-recompression'; }
        else {
          Sc = Cr * HH * Math.log10(sigc / sig0) + Cc * HH * Math.log10(sigF / sigc);
          mode = 'OC-melewati-σc';
        }
        Sc *= 1000;                                    // mm
        consol = {
          active: true, zt: zt, zm: zm, zb: zb, dTop: dTop, dMid: dMid, dBot: dBot, dAvg: dAvg,
          sig0: sig0, sigc: sigc, sigF: sigF, OCR: OCR, nc: nc, mode: mode, Sc: Sc, Cc: Cc, Cr: Cr,
          e0: e0, Hc: Hc, ztop: ztop
        };
      }
    } else if (Hc > 0 || Cc > 0) {
      r.warn.push('Konsolidasi tidak dihitung — lengkapi tebal lempung Hc, Cc dan e0 (juga σ0).');
    }

    var Sc = consol.active ? consol.Sc : 0;
    var Stotal = Se + Sc;

    /* ---- Laju konsolidasi ---- */
    var rate = { active: false };
    if (cv > 0 && consol.active) {
      var Hdr = (drain === 'single') ? Hc : Hc / 2;
      var t50 = 0.197 * Hdr * Hdr / cv;
      var t90 = 0.848 * Hdr * Hdr / cv;
      var rObj = { active: true, cv: cv, Hdr: Hdr, drain: drain, t50: t50, t90: t90 };
      if (tYr > 0) {
        var Tv = cv * tYr / (Hdr * Hdr);
        var U = degreeU(Tv);
        rObj.t = tYr; rObj.Tv = Tv; rObj.U = U;
        rObj.St = Se + U * Sc;                          // penurunan pada waktu t
      }
      rate = rObj;
    }

    r.valid = true;
    r.shape = shape; r.B = B; r.L = L; r.Df = Df; r.q0 = q0; r.isStrip = isStrip;
    r.Bc = Bc; r.Lc = Lc;
    r.EsMPa = EsMPa; r.mu = mu; r.Hs = Hs; r.If = If; r.rigid = rigid;
    r.IsCenter = isC.Is; r.IsCorner = isE.Is;
    r.SeCenter = SeCenter; r.SeCorner = SeCorner; r.SeAvg = SeAvg; r.SeRigid = SeRigid; r.Se = Se;
    r.consol = consol; r.Sc = Sc; r.Stotal = Stotal; r.rate = rate;

    /* ---- Peringatan ---- */
    if (consol.active && ztop < Df) r.warn.push('Puncak lempung (' + ztop.toFixed(2) + ' m) di atas dasar fondasi (Df=' + Df.toFixed(2) + ' m) — Δσ dihitung dari dasar fondasi (z diklamp ke ~0). Periksa stratigrafi.');
    if (consol.active) {
      if (consol.nc) r.warn.push('Lempung NORMALLY CONSOLIDATED (σc ≈ σ0, OCR ≈ 1) — seluruh regangan pakai Cc; penurunan konsolidasi cenderung besar.');
      else if (consol.mode === 'OC-recompression') r.warn.push('OVERCONSOLIDATED, σf ≤ σc — seluruh regangan pada kurva pemampatan-kembali (Cr); penurunan kecil.');
      else r.warn.push('OVERCONSOLIDATED, σf melewati σc (OCR=' + consol.OCR.toFixed(2) + ') — regangan dua tahap: Cr sampai σc lalu Cc setelahnya.');
      r.warn.push('Δσ metode 2:1 (rata-rata Simpson di sepanjang lempung) — pendekatan; untuk lempung tebal/berlapis pakai Boussinesq atau bagi sub-lapisan.');
    }
    if (r.rate.active && !r.rate.t) r.warn.push('Isi waktu t (tahun) untuk menghitung derajat konsolidasi U pada saat t.');
    if (Df > B * 4) r.warn.push('Df/B = ' + (Df / B).toFixed(1) + ' > 4 — fondasi cenderung dalam; metode penurunan dangkal mungkin tidak berlaku.');
    if (Hs < 2 * B) r.warn.push('Lapisan termampatkan H = ' + Hs.toFixed(1) + ' m < 2B — pastikan H benar (kedalaman ke lapisan keras/batuan di bawah dasar fondasi).');
    r.warn.push('Penurunan segera memakai teori elastis (cocok untuk lempung jenuh tak-terdrainase & pasir sebagai estimasi). PEMAMPATAN SEKUNDER (creep) tidak dihitung.');

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

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Penurunan Fondasi'));
    panel.appendChild(UI.el('div', 'sub', 'Penurunan fondasi dangkal — SEGERA (elastis, Steinbrenner) + KONSOLIDASI primer (e–log p, NC/OC) + laju konsolidasi (Tv–U). Δσ metode 2:1. Profil tanah & rincian penurunan tergambar.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'st-work');
    var canvasHost = UI.el('div', 'st-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Profil tanah & komponen penurunan');
    var results = UI.el('div', 'st-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var shapeOpts = SHAPES.map(function (s) { return { value: s[0], label: s[1] }; });

    var schema = [
      { type: 'group', label: 'Geometri & Beban Fondasi' },
      { type: 'select', id: 'shape', label: 'Bentuk', value: 'square', options: shapeOpts },
      { type: 'number', id: 'B', label: 'B — lebar / sisi / diameter', unit: 'm', value: 2.0, min: 0.1, step: 0.1, hint: 'Lingkaran: B = diameter. Persegi panjang: B = sisi pendek.' },
      { type: 'number', id: 'L', label: 'L — panjang', unit: 'm', value: 3.0, min: 0.1, step: 0.1, hint: 'Hanya untuk persegi panjang.' },
      { type: 'number', id: 'Df', label: 'Df — kedalaman dasar fondasi', unit: 'm', value: 1.5, min: 0, step: 0.1 },
      { type: 'number', id: 'q0', label: 'q0 — tekanan neto di dasar', unit: 'kPa', value: 150, min: 1, step: 5, hint: 'Tekanan neto = tekanan kotak − γ·Df.' },

      { type: 'group', label: 'Penurunan Segera (Elastis)' },
      { type: 'number', id: 'Es', label: 'Es — modulus elastisitas tanah', unit: 'MPa', value: 10, min: 0.1, step: 0.5, hint: 'Rata-rata di zona pengaruh (±2–4B). Lempung ~5–25, pasir ~10–50 MPa.' },
      { type: 'number', id: 'mu', label: 'μs — angka Poisson', unit: '', value: 0.3, min: 0.05, max: 0.49, step: 0.05, hint: 'Lempung jenuh undrained ≈0,5; pasir ≈0,3.' },
      { type: 'number', id: 'Hs', label: 'H — tebal lapisan termampatkan', unit: 'm', value: 8, min: 0.5, step: 0.5, hint: 'Dari dasar fondasi ke lapisan keras. Besar (≥ ~4B) ≈ setengah ruang tak hingga.' },
      { type: 'number', id: 'If', label: 'If — faktor kedalaman (Fox)', unit: '', value: 1.0, min: 0.3, max: 1, step: 0.05, hint: '1,0 = konservatif (abaikan penanaman). Baca chart Fox untuk Df/B & L/B (< 1 mereduksi Se).' },
      { type: 'segment', id: 'rigid', label: 'Kekakuan fondasi', value: 'flex',
        options: [{ value: 'flex', label: 'Lentur (pusat)' }, { value: 'rigid', label: 'Kaku' }] },

      { type: 'group', label: 'Penurunan Konsolidasi (Lempung)' },
      { type: 'number', id: 'ztop', label: 'z — kedalaman puncak lempung', unit: 'm', value: 3.0, min: 0, step: 0.1, hint: 'Dari permukaan tanah. Kosongkan Hc = 0 bila tak ada lempung.' },
      { type: 'number', id: 'Hc', label: 'Hc — tebal lapisan lempung', unit: 'm', value: 4.0, min: 0, step: 0.1 },
      { type: 'number', id: 'e0', label: 'e0 — angka pori awal', unit: '', value: 0.9, min: 0.1, step: 0.05 },
      { type: 'number', id: 'Cc', label: 'Cc — indeks kompresi', unit: '', value: 0.25, min: 0, step: 0.01 },
      { type: 'number', id: 'Cr', label: 'Cr — indeks pemampatan-kembali', unit: '', value: 0.05, min: 0, step: 0.01, hint: 'Cr ≈ 0,1–0,2·Cc. Untuk lempung OC.' },
      { type: 'number', id: 'sig0', label: "σ'0 — tegangan efektif di tengah lempung", unit: 'kPa', value: 60, min: 0, step: 1, hint: "σ'0 = Σ γ'·z sampai tengah lempung." },
      { type: 'number', id: 'sigc', label: "σ'c — tegangan prakonsolidasi", unit: 'kPa', value: 80, min: 0, step: 1, hint: "σ'c ≤ σ'0 → NC (normally consolidated)." },

      { type: 'group', label: 'Laju Konsolidasi (opsional)' },
      { type: 'number', id: 'cv', label: 'cv — koefisien konsolidasi', unit: 'm²/th', value: 1.5, min: 0, step: 0.1, hint: '0 = lewati laju (anggap konsolidasi penuh).' },
      { type: 'segment', id: 'drain', label: 'Drainase', value: 'double',
        options: [{ value: 'double', label: 'Ganda (Hdr=Hc/2)' }, { value: 'single', label: 'Tunggal (Hdr=Hc)' }] },
      { type: 'number', id: 't', label: 't — waktu ditinjau', unit: 'tahun', value: 3, min: 0, step: 0.5, hint: '0 = lewati. Penurunan pada waktu t: St = Se + U·Sc.' }
    ];

    function syncVisibility(vals) {
      var isRect = vals.shape === 'rect';
      var f = state.form.fields.L; if (f) f.node.closest('.ck-field').style.display = isRect ? '' : 'none';
    }

    var form = UI.buildForm(panel, schema, function (vals) {
      syncVisibility(vals);
      update(vals, results);
    });
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
      state.cap.set('Profil tanah & komponen penurunan');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri, beban & parameter tanah untuk menghitung penurunan.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set(shapeName(r.shape) + ' · B=' + r.B + ' m · S_total ' + r.Stotal.toFixed(1) + ' mm');

    // Hero — total penurunan
    var hero = UI.el('div', 'ck-hero');
    hero.appendChild(UI.el('div', 'k', 'Penurunan total S = Se + Sc' + (r.rigid ? ' (fondasi kaku)' : ' (lentur, pusat)')));
    var vrow = UI.el('div');
    vrow.style.cssText = 'display:flex; align-items:baseline; gap:24px; flex-wrap:wrap';
    var v1 = UI.el('div', 'v', UI.fmt(r.Stotal, 1) + ' <small>mm</small>');
    var v2 = UI.el('div');
    v2.style.cssText = "font-family:'JetBrains Mono',monospace; color:var(--ink-dim)";
    v2.innerHTML = '<div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase">segera + konsolidasi</div>' +
      '<div style="font-size:16px;font-weight:700;line-height:1.15;color:var(--ink)">' +
      UI.fmt(r.Se, 1) + ' + ' + UI.fmt(r.Sc, 1) + ' <small style="font-size:12px;font-weight:500;color:var(--ink-dim)">mm</small></div>';
    vrow.appendChild(v1); vrow.appendChild(v2);
    hero.appendChild(vrow);
    results.appendChild(hero);

    var stTxt = (r.rate.active && r.rate.t) ? ' · pada t=' + r.rate.t + ' th: St = ' + UI.fmt(r.rate.St, 1) + ' mm (U=' + (r.rate.U * 100).toFixed(0) + '%)' : '';
    results.appendChild(UI.el('div', 'ck-empty',
      'Se = penurunan segera · Sc = penurunan konsolidasi primer.' + stTxt));

    // Komponen
    results.appendChild(UI.rhead('Komponen penurunan'));
    results.appendChild(UI.kv('Se — segera (elastis)', UI.fmt(r.Se, 2) + ' mm', 'ok'));
    results.appendChild(UI.kv('Sc — konsolidasi primer', UI.fmt(r.Sc, 2) + ' mm', r.consol.active ? 'ok' : ''));
    results.appendChild(UI.kv('S_total = Se + Sc', UI.fmt(r.Stotal, 2) + ' mm', 'ok'));
    if (r.rate.active && r.rate.t) results.appendChild(UI.kv('St pada t = ' + r.rate.t + ' th', UI.fmt(r.rate.St, 2) + ' mm'));

    // Segera
    results.appendChild(UI.rhead('Penurunan segera (elastis)'));
    results.appendChild(UI.kv('Es / μs', UI.fmt(r.EsMPa, 1) + ' MPa / ' + r.mu.toFixed(2)));
    results.appendChild(UI.kv('H / If', UI.fmt(r.Hs, 1) + ' m / ' + r.If.toFixed(2)));
    results.appendChild(UI.kv('Is pusat / sudut', r.IsCenter.toFixed(3) + ' / ' + r.IsCorner.toFixed(3)));
    results.appendChild(UI.kv('Se pusat (lentur)', UI.fmt(r.SeCenter, 2) + ' mm', r.rigid ? '' : 'ok'));
    results.appendChild(UI.kv('Se sudut (lentur)', UI.fmt(r.SeCorner, 2) + ' mm'));
    results.appendChild(UI.kv('Se rata-rata (lentur)', UI.fmt(r.SeAvg, 2) + ' mm'));
    results.appendChild(UI.kv('Se kaku (≈0,93·rata-rata)', UI.fmt(r.SeRigid, 2) + ' mm', r.rigid ? 'ok' : ''));

    // Konsolidasi
    if (r.consol.active) {
      var c = r.consol;
      results.appendChild(UI.rhead('Penurunan konsolidasi (e–log p)'));
      results.appendChild(UI.kv('Lempung: puncak / tebal', c.ztop.toFixed(2) + ' m / ' + c.Hc.toFixed(2) + ' m'));
      results.appendChild(UI.kv('e0 / Cc / Cr', c.e0.toFixed(2) + ' / ' + c.Cc.toFixed(3) + ' / ' + c.Cr.toFixed(3)));
      results.appendChild(UI.kv('Δσ atas / tengah / bawah', c.dTop.toFixed(1) + ' / ' + c.dMid.toFixed(1) + ' / ' + c.dBot.toFixed(1) + ' kPa'));
      results.appendChild(UI.kv('Δσ rata-rata (Simpson)', UI.fmt(c.dAvg, 1) + ' kPa'));
      results.appendChild(UI.kv("σ'0 / σ'c / σ'f", c.sig0.toFixed(1) + ' / ' + c.sigc.toFixed(1) + ' / ' + UI.fmt(c.sigF, 1) + ' kPa'));
      results.appendChild(UI.kv('OCR / kondisi', c.OCR.toFixed(2) + ' · ' + (c.nc ? 'Normally Consolidated' : 'Overconsolidated')));
      results.appendChild(UI.kv('Sc — konsolidasi', UI.fmt(c.Sc, 2) + ' mm', 'ok'));
    }

    // Laju
    if (r.rate.active) {
      var rt = r.rate;
      results.appendChild(UI.rhead('Laju konsolidasi (Terzaghi)'));
      results.appendChild(UI.kv('cv / drainase', UI.fmt(rt.cv, 2) + ' m²/th · ' + (rt.drain === 'double' ? 'ganda' : 'tunggal')));
      results.appendChild(UI.kv('Hdr (lintasan drainase)', UI.fmt(rt.Hdr, 2) + ' m'));
      results.appendChild(UI.kv('t50 / t90', UI.fmt(rt.t50, 2) + ' / ' + UI.fmt(rt.t90, 2) + ' tahun'));
      if (rt.t) {
        results.appendChild(UI.kv('Tv pada t=' + rt.t + ' th', rt.Tv.toFixed(3)));
        results.appendChild(UI.kv('U — derajat konsolidasi', (rt.U * 100).toFixed(1) + ' %', 'ok'));
        results.appendChild(UI.kv('St = Se + U·Sc', UI.fmt(rt.St, 2) + ' mm', 'ok'));
      }
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      '<b>Segera (elastis)</b>: Se = q0·B′·(1−μs²)/Es·Is·If dengan Is Steinbrenner (F1,F2), superposisi pusat 4-kuadran & sudut, lapisan berhingga H, koreksi kedalaman Fox If. Kaku ≈ 0,93·rata-rata lentur. ' +
      '<b>Konsolidasi</b>: Sc dari kurva e–log p (Cc/Cr), klasifikasi NC/OC via σ′c; Δσ metode 2:1 dengan rata-rata Simpson (atas/tengah/bawah). ' +
      '<b>Laju</b>: Terzaghi 1-D, Tv=cv·t/Hdr², U(Tv). ' +
      '<b>TIDAK termasuk</b>: pemampatan sekunder (creep), lempung berlapis banyak, metode Schmertmann/N-SPT untuk pasir, Boussinesq penuh. ' +
      'Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi data untuk melihat profil tanah & penurunan.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.5, w - 210);
    drawProfile(ctx, 0, 0, splitX, h, r);
    drawSettle(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'S_total ' + r.Stotal.toFixed(1) + ' mm'
      });
    }
  }

  function drawProfile(ctx, ox, oy, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), amber = css('--amber'), sage = css('--sage') || dim, sky = css('--sky') || dim;
    var B = r.B, Df = r.Df, c = r.consol;
    var padT = 60, padB = 30, padS = 34;
    var Wpx = w - 2 * padS, Hpx = h - padT - padB;

    // rentang kedalaman: sampai bawah lempung / zona 2:1
    var deepClay = c.active ? (c.ztop + c.Hc) : (Df + 2 * B);
    var yspan = Math.max(deepClay + 0.5, Df + Math.max(2 * B, 2));
    var xspan = Math.max(B * 3.2, B + 2);
    var sc = Math.min(Wpx / xspan, Hpx / yspan);
    var usedH = yspan * sc;
    var cx = ox + w / 2, ySurf = oy + padT + Math.max(0, (Hpx - usedH) / 2);
    var soilBottom = oy + h - padB;
    function X(wx) { return cx + wx * sc; }
    function Y(d) { return ySurf + d * sc; }

    // blok tanah
    ctx.save();
    ctx.fillStyle = css('--bg2') || line; ctx.globalAlpha = 0.5;
    ctx.fillRect(ox + padS, ySurf, Wpx, soilBottom - ySurf); ctx.globalAlpha = 1;
    // permukaan tanah
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ox + padS, ySurf); ctx.lineTo(ox + w - padS, ySurf); ctx.stroke();
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    for (var xx = ox + padS; xx < ox + w - padS; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, ySurf); ctx.lineTo(xx - 6, ySurf - 6); ctx.stroke(); }
    ctx.restore();

    var xL = X(-B / 2), xR = X(B / 2), yBase = Y(Df);
    var hf = Math.max(9, Math.min(0.3 * B * sc, 0.3 * (yBase - ySurf) + 8));

    // lapisan lempung (band arsir)
    if (c.active) {
      var yC0 = Y(c.ztop), yC1 = Y(c.ztop + c.Hc);
      ctx.save();
      ctx.fillStyle = sage; ctx.globalAlpha = 0.22;
      ctx.fillRect(ox + padS, yC0, Wpx, yC1 - yC0); ctx.globalAlpha = 1;
      ctx.strokeStyle = sage; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(ox + padS, yC0); ctx.lineTo(ox + w - padS, yC0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + padS, yC1); ctx.lineTo(ox + w - padS, yC1); ctx.stroke();
      // arsir diagonal lempung
      ctx.globalAlpha = 0.35;
      for (var yy = yC0; yy < yC1; yy += 9) { ctx.beginPath(); ctx.moveTo(ox + padS, yy); ctx.lineTo(ox + padS + 9, yy - 9 < yC0 ? yC0 : yy - 9); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = sage; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('LEMPUNG', ox + padS + 4, (yC0 + yC1) / 2 + 3);
      ctx.restore();
      // dimensi Hc
      dimVert(ctx, ox + w - padS - 8, yC0, yC1, sage, 'Hc ' + c.Hc + ' m');
    }

    // sebaran tegangan 2:1 (garis putus dari tepi dasar, kemiringan 1H:2V)
    if (c.active) {
      ctx.save();
      ctx.strokeStyle = amber; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      var zEnd = (c.ztop + c.Hc) - Df; if (zEnd < 0.2) zEnd = 0.2;
      ctx.beginPath(); ctx.moveTo(xL, yBase); ctx.lineTo(X(-B / 2 - zEnd / 2), Y(Df + zEnd)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xR, yBase); ctx.lineTo(X(B / 2 + zEnd / 2), Y(Df + zEnd)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // label 2:1
      ctx.fillStyle = amber; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('2:1', X(B / 2 + zEnd / 2) + 2, Y(Df + zEnd / 2));
      ctx.restore();
    }

    // fondasi
    ctx.save();
    ctx.fillStyle = ink;
    ctx.fillRect(xL, yBase - hf, xR - xL, hf);
    var colW = Math.max(8, (xR - xL) * 0.22);
    ctx.fillRect(cx - colW / 2, ySurf - 6, colW, yBase - hf - ySurf + 6);
    ctx.restore();

    // beban (panah saja — teks q0 ditaruh di sisi telapak agar tak menumpuk pita judul atas)
    ctx.save();
    ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, ySurf - 22); ctx.lineTo(cx, ySurf - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 4, ySurf - 12); ctx.lineTo(cx, ySurf - 4); ctx.lineTo(cx + 4, ySurf - 12); ctx.closePath(); ctx.fill();
    ctx.restore();

    // panah penurunan di dasar (skematik)
    ctx.save();
    ctx.strokeStyle = sky; ctx.fillStyle = sky; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, yBase + 4); ctx.lineTo(cx, yBase + 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 4, yBase + 15); ctx.lineTo(cx, yBase + 23); ctx.lineTo(cx + 4, yBase + 15); ctx.closePath(); ctx.fill();
    ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('S ' + r.Stotal.toFixed(0) + 'mm', cx, yBase + 33);
    ctx.restore();

    // dimensi B & Df
    dimLine(ctx, xL, xR, yBase - hf - 10, dim, 'B ' + B + ' m');
    dimVert(ctx, ox + padS + 8, ySurf, yBase, faint, 'Df ' + Df + ' m');

    // label q0 di sisi kanan telapak (bukan di pita judul atas)
    ctx.fillStyle = amber; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('q0=' + r.q0.toFixed(0) + ' kPa', xR + 6, yBase - hf / 2 + 3);
  }

  // Panel kanan: bar komponen penurunan + progress konsolidasi
  function drawSettle(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var sage = css('--sage') || dim, sky = css('--sky') || dim, ink = css('--ink');
    var padL = 60, padR = 24, padT = 46, padB = 40;
    var gx0 = ox + padL, gx1 = ox + w - padR, gy0 = oy + padT, gy1 = oy + h - padB;

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('PENURUNAN (mm)', gx0 - 4, oy + 22);

    var rows = [
      { lbl: 'Se', val: r.Se, col: sky, pri: false },
      { lbl: 'Sc', val: r.Sc, col: sage, pri: false },
      { lbl: 'Total', val: r.Stotal, col: amber, pri: true }
    ];
    if (r.rate.active && r.rate.t) rows.push({ lbl: 'St(t)', val: r.rate.St, col: dim, pri: false });

    var vMax = 0; rows.forEach(function (o) { vMax = Math.max(vMax, o.val); });
    vMax = vMax * 1.15 || 1;
    function BX(v) { return gx0 + (gx1 - gx0) * Math.min(v / vMax, 1); }

    var n = rows.length, gap = 14;
    var rowH = (gy1 - gy0 - gap * (n - 1)) / n;
    var bh = Math.min(30, rowH);
    rows.forEach(function (o, i) {
      var y = gy0 + i * (rowH + gap);
      ctx.fillStyle = line; ctx.globalAlpha = 0.4; ctx.fillRect(gx0, y, gx1 - gx0, bh); ctx.globalAlpha = 1;
      // Total = tumpuk Se + Sc
      if (o.lbl === 'Total' && r.Sc > 0) {
        ctx.fillStyle = sky; ctx.globalAlpha = 0.85; ctx.fillRect(gx0, y, BX(r.Se) - gx0, bh);
        ctx.fillStyle = sage; ctx.globalAlpha = 0.7; ctx.fillRect(BX(r.Se), y, BX(o.val) - BX(r.Se), bh);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = o.col; ctx.globalAlpha = o.pri ? 0.95 : 0.7;
        ctx.fillRect(gx0, y, BX(o.val) - gx0, bh); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = o.pri ? amber : dim; ctx.font = (o.pri ? 'bold ' : '') + '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(o.lbl, gx0 - 6, y + bh / 2 + 3);
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(o.val.toFixed(1), BX(o.val) + 5, y + bh / 2 + 3);
    });

    // legenda tumpukan
    var yL = gy1 + 14;
    ctx.fillStyle = sky; ctx.fillRect(gx0, yL - 7, 10, 8);
    ctx.fillStyle = sage; ctx.fillRect(gx0 + 58, yL - 7, 10, 8);
    ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Se segera', gx0 + 13, yL);
    ctx.fillText('Sc konsolidasi', gx0 + 71, yL);

    // derajat konsolidasi
    if (r.rate.active && r.rate.t) {
      var yb = oy + h - 6;
      ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = amber;
      ctx.fillText('U = ' + (r.rate.U * 100).toFixed(0) + '% @ ' + r.rate.t + ' th', gx0 - 4, yb);
    } else if (r.consol.active) {
      var yb2 = oy + h - 6;
      ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = faint;
      ctx.fillText(r.consol.nc ? 'NC' : 'OC (OCR ' + r.consol.OCR.toFixed(1) + ')', gx0 - 4, yb2);
    }
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
  var APP_VER = 'v0.2.0';
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
      .replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/Ω/g, 'Omega').replace(/·/g, '*')
      .replace(/μ/g, 'mu').replace(/σ/g, 'sigma').replace(/Δ/g, 'd').replace(/Σ/g, 'sum')
      .replace(/₀/g, '0').replace(/²/g, '2').replace(/³/g, '3').replace(/⁴/g, '4').replace(/½/g, '0.5')
      .replace(/√/g, 'sqrt').replace(/×/g, 'x').replace(/′/g, "'").replace(/’/g, "'").replace(/°/g, 'deg')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≈/g, '~').replace(/→/g, '->')
      .replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');
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
    var c = r.consol, rt = r.rate;
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('PENURUNAN FONDASI - SEGERA + KONSOLIDASI'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Elastis (Steinbrenner) + e-log p', dt));
    L.push('');
    L.push(' GEOMETRI & BEBAN');
    L.push(ruleR('-'));
    L.push(rowR('Bentuk', tolatin(shapeName(r.shape))));
    L.push(rowR('B (lebar/sisi/diameter)', numR(r.B, 2) + ' m'));
    if (r.shape === 'rect') L.push(rowR('L (panjang)', numR(r.L, 2) + ' m'));
    L.push(rowR('Df (kedalaman dasar)', numR(r.Df, 2) + ' m'));
    L.push(rowR('q0 (tekanan neto)', numR(r.q0, 1) + ' kPa'));
    L.push('');
    L.push(' PENURUNAN SEGERA (ELASTIS)');
    L.push(ruleR('-'));
    L.push(rowR('Es / mu', numR(r.EsMPa, 1) + ' MPa / ' + numR(r.mu, 2)));
    L.push(rowR('H (lapisan) / If', numR(r.Hs, 1) + ' m / ' + numR(r.If, 2)));
    L.push(rowR('Is pusat / sudut', numR(r.IsCenter, 3) + ' / ' + numR(r.IsCorner, 3)));
    L.push(rowR('Se pusat (lentur)', numR(r.SeCenter, 2) + ' mm'));
    L.push(rowR('Se sudut (lentur)', numR(r.SeCorner, 2) + ' mm'));
    L.push(rowR('Se rata-rata (lentur)', numR(r.SeAvg, 2) + ' mm'));
    L.push(rowR('Se kaku (~0.93*rata2)', numR(r.SeRigid, 2) + ' mm'));
    L.push(rowR('>> Se dipakai (' + (r.rigid ? 'kaku' : 'lentur-pusat') + ')', numR(r.Se, 2) + ' mm'));
    L.push('');
    if (c.active) {
      L.push(' PENURUNAN KONSOLIDASI (e-log p)');
      L.push(ruleR('-'));
      L.push(rowR('Lempung puncak / tebal', numR(c.ztop, 2) + ' / ' + numR(c.Hc, 2) + ' m'));
      L.push(rowR('e0 / Cc / Cr', numR(c.e0, 2) + ' / ' + numR(c.Cc, 3) + ' / ' + numR(c.Cr, 3)));
      L.push(rowR('dsigma atas/tengah/bawah', numR(c.dTop, 1) + '/' + numR(c.dMid, 1) + '/' + numR(c.dBot, 1) + ' kPa'));
      L.push(rowR('dsigma rata-rata (Simpson)', numR(c.dAvg, 1) + ' kPa'));
      L.push(rowR("sigma'0 / sigma'c / sigma'f", numR(c.sig0, 1) + '/' + numR(c.sigc, 1) + '/' + numR(c.sigF, 1) + ' kPa'));
      L.push(rowR('OCR / kondisi', numR(c.OCR, 2) + ' ' + (c.nc ? '(NC)' : '(OC)')));
      L.push(rowR('>> Sc (konsolidasi)', numR(c.Sc, 2) + ' mm'));
      L.push('');
    }
    if (rt.active) {
      L.push(' LAJU KONSOLIDASI (TERZAGHI)');
      L.push(ruleR('-'));
      L.push(rowR('cv / drainase', numR(rt.cv, 2) + ' m2/th / ' + (rt.drain === 'double' ? 'ganda' : 'tunggal')));
      L.push(rowR('Hdr', numR(rt.Hdr, 2) + ' m'));
      L.push(rowR('t50 / t90', numR(rt.t50, 2) + ' / ' + numR(rt.t90, 2) + ' th'));
      if (rt.t) {
        L.push(rowR('Tv @ t=' + numR(rt.t, 1) + ' th', numR(rt.Tv, 3)));
        L.push(rowR('U (derajat konsolidasi)', numR(rt.U * 100, 1) + ' %'));
        L.push(rowR('St = Se + U*Sc', numR(rt.St, 2) + ' mm'));
      }
      L.push('');
    }
    L.push(' HASIL');
    L.push(ruleR('='));
    L.push(rowR('Se (segera)', numR(r.Se, 2) + ' mm'));
    L.push(rowR('Sc (konsolidasi)', numR(r.Sc, 2) + ' mm'));
    L.push(rowR('>> S_TOTAL = Se + Sc', numR(r.Stotal, 2) + ' mm'));
    if (rt.active && rt.t) L.push(rowR('   St pada t=' + numR(rt.t, 1) + ' th', numR(rt.St, 2) + ' mm'));
    L.push(ruleR('='));
    L.push('');
    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' Segera: teori elastis (Steinbrenner Is, Fox If). Konsolidasi:');
    L.push(' e-log p (Cc/Cr, NC/OC), dsigma metode 2:1 (Simpson). Laju: Terzaghi.');
    L.push(' TIDAK termasuk pemampatan sekunder, lempung berlapis banyak,');
    L.push(' metode Schmertmann/N-SPT untuk pasir, Boussinesq penuh.');
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
    if (!r.valid) { UI.toast('Lengkapi data fondasi & tanah dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Penurunan_' + shapeName(r.shape).replace(/[^\w]/g, '') + '_B' + r.B + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Penurunan Fondasi', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
