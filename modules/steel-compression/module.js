/* ============================================================
   Civil Tools — modules/steel-compression/module.js  (Tier 2, kanvas 2D)
   Kapasitas batang tekan baja — SNI 1729:2020 (mengadopsi AISC 360-16), Bab E

   Keadaan batas kekuatan tekan (tekuk lentur, Ps. E3):
     Pn = Fcr · Ag
   dengan tegangan kritis Fcr bergantung kelangsingan efektif KL/r:
     Fe = π²·E / (KL/r)²                       (tegangan tekuk elastis, Euler)
     bila KL/r ≤ 4.71·√(E/Fy)  ↔  Fy/Fe ≤ 2.25 :  Fcr = 0.658^(Fy/Fe) · Fy   (inelastis)
     selain itu                                :  Fcr = 0.877 · Fe            (elastis)

   Faktor tahanan / keamanan tekan:
     DFBK (LRFD): φc·Pn  → φc = 0.90
     ASD        : Pn/Ωc  → Ωc = 1.67

   Kelangsingan efektif diambil MAKSIMUM dari dua sumbu:
     KLx/rx  dan  KLy/ry  (rx, ry dari library profil). KL/r ≤ 200 (rekomendasi Ps. E2).

   Tekuk torsi (Ps. E4-2) DIHITUNG untuk penampang dwi-simetris terbuka (WF):
     Fe = [π²·E·Cw/(Kz·Lz)² + G·J] / (Ix + Iy) ,  lalu Fcr dari Fe (pers. E3).
     J & Cw dihitung dari geometri (J thin-wall tanpa fillet → konservatif;
     Cw = Iy·(d−tf)²/4). Pn = min(tekuk lentur E3, tekuk torsi E4).
   Penampang tertutup (SHS/RHS/Pipa) dikecualikan dari E4 (J besar → tak menentukan).
   Lentur-torsi (E4/E5) untuk penampang tunggal/tak-simetris (UNP, siku, CNP) BELUM
   dihitung — perlu properti pusat geser & torsi yang belum ada di library.

   Cek elemen langsing (Tabel B4.1a) → bila ada elemen langsing, metode Ps. E7
   (luas efektif) TIDAK diterapkan; kapasitas dihitung asumsi non-langsing + peringatan.

   Data profil dari library core/steel-profiles.js.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'steel-compression';

  var E_MOD = 200000;                 // MPa — modulus elastisitas baja
  var PHI_C = 0.90, OMEGA_C = 1.67;

  // Mutu baja: [label, Fy, Fu]  (MPa) — hanya Fy dipakai untuk tekuk
  var GRADES = [
    ['BJ 37 (Fy 240)', 240, 370],
    ['BJ 41 (Fy 250)', 250, 410],
    ['BJ 50 (Fy 290)', 290, 500],
    ['BJ 55 (Fy 410)', 410, 550],
    ['SS400 (Fy 245)', 245, 400],
    ['A36 (Fy 250)', 250, 400],
    ['A572 Gr50 (Fy 345)', 345, 450],
    ['A992 (Fy 345)', 345, 450],
    ['Custom', 0, 0]
  ];
  // Faktor panjang efektif K (Tabel C-A-7.1 AISC — nilai desain). [label, K]  (K=0 → manual)
  var KPRESET = [
    ['Sendi–sendi  (K=1,0)', 1.0],
    ['Jepit–jepit  (K=0,65)', 0.65],
    ['Jepit–sendi  (K=0,80)', 0.80],
    ['Jepit–rol geser  (K=1,2)', 1.2],
    ['Sendi–bebas translasi  (K=2,0)', 2.0],
    ['Jepit–bebas / kantilever  (K=2,1)', 2.1],
    ['Manual (isi K sendiri)', 0]
  ];

  var state = {};
  var SP = null;   // window.SteelProfiles

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // Fcr (MPa) dari tegangan tekuk elastis Fe — Pers. E3-2/E3-3, dipakai lentur & torsi
  function FcrFe(Fe, Fy) {
    if (!(Fe > 0)) return 0;
    if (Fy / Fe <= 2.25) return Math.pow(0.658, Fy / Fe) * Fy;   // inelastis
    return 0.877 * Fe;                                            // elastis (Euler)
  }
  // Tegangan kritis untuk kelangsingan lentur lam = KL/r
  function Fcr(lam, Fy) {
    if (!(lam > 0)) return Fy;                       // batang sangat pendek → leleh
    return FcrFe(Math.PI * Math.PI * E_MOD / (lam * lam), Fy);
  }

  // Cek elemen langsing (Tabel B4.1a, komponen tekan). Return { slender, items:[{el,lam,lamr}] }
  function localCheck(type, p, Fy) {
    var kE = Math.sqrt(E_MOD / Fy);
    var items = [];
    function add(el, lam, lamr) { items.push({ el: el, lam: lam, lamr: lamr, slender: lam > lamr }); }
    if (p.shape === 'I') {
      add('Sayap (b/2tf)', (p.B / 2) / p.tf, 0.56 * kE);
      add('Badan (h/tw)', (p.H - 2 * p.tf) / p.tw, 1.49 * kE);
    } else if (type === 'UNP') {
      add('Sayap (b/tf)', p.B / p.tf, 0.56 * kE);
      add('Badan (h/tw)', (p.H - 2 * p.tf) / p.tw, 1.49 * kE);
    } else if (p.shape === 'L') {
      add('Kaki (b/t)', p.a / p.t, 0.45 * kE);
    } else if (p.shape === 'box') {
      var lw = (Math.max(p.B, p.H) - 2 * p.t) / p.t;
      add('Dinding (b/t)', lw, 1.40 * kE);
    } else if (p.shape === 'pipe') {
      add('Dinding (D/t)', p.D / p.t, 0.11 * E_MOD / Fy);
    }
    var slender = items.some(function (it) { return it.slender; });
    return { slender: slender, items: items, cnp: type === 'CNP' };
  }

  function compute(v) {
    var r = { warn: [], valid: false };
    var type = v.ptype, name = v.psize;
    var p = SP.get(type, name);
    if (!p) { r.warn.push('Profil belum dipilih.'); return r; }
    var ti = SP.typeInfo(type);

    var Fy = num(v.Fy);
    if (!(Fy > 0)) { r.warn.push('Fy harus > 0.'); return r; }

    var Ag = SP.AgMm2(p);                          // mm²
    var rx = p.ix * 10, ry = p.iy * 10;            // cm → mm
    if (!(rx > 0) || !(ry > 0)) { r.warn.push('Jari-jari girasi profil tidak tersedia.'); return r; }

    // Faktor panjang efektif
    var K;
    if (v.Kpreset === '0') K = num(v.Kval);
    else K = num(v.Kpreset);
    if (!(K > 0)) { K = 1.0; r.warn.push('K tidak valid → dipakai 1,0.'); }

    var Lx = num(v.Lx), Ly = num(v.Ly);
    var lamX = (Lx > 0) ? K * Lx / rx : 0;
    var lamY = (Ly > 0) ? K * Ly / ry : 0;
    var lam = Math.max(lamX, lamY);
    if (!(lam > 0)) { r.warn.push('Panjang batang (Lx/Ly) harus > 0.'); return r; }
    var govAxis = (lamY >= lamX) ? 'y-y (sumbu lemah)' : 'x-x (sumbu kuat)';

    // (1) Tekuk lentur — Ps. E3
    var lamLimit = 4.71 * Math.sqrt(E_MOD / Fy);   // batas inelastis↔elastis
    var FeFlex = Math.PI * Math.PI * E_MOD / (lam * lam);
    var FcrFlex = Fcr(lam, Fy);
    var PnFlex = FcrFlex * Ag / 1000;              // kN

    // (2) Tekuk torsi — Ps. E4-2 (hanya penampang dwi-simetris terbuka: WF)
    var tors = null;
    if (type === 'WF') {
      var G = 77200;                                // MPa — G = E/2(1+ν), ν=0,3 (≈ AISC 11.200 ksi)
      var Ix4 = p.Ix * 1e4, Iy4 = p.Iy * 1e4;       // cm⁴ → mm⁴
      var ho = p.H - p.tf;                          // jarak antar titik-berat sayap
      var Cw = Iy4 * ho * ho / 4;                   // mm⁶ (I dwi-simetris)
      var J = (2 * p.B * Math.pow(p.tf, 3) + (p.H - 2 * p.tf) * Math.pow(p.tw, 3)) / 3; // mm⁴ (thin-wall, tanpa fillet → konservatif)
      var Kz = num(v.Kz); if (!(Kz > 0)) Kz = 1.0;
      var Lz = num(v.Lz); if (!(Lz > 0)) Lz = Math.max(Lx, Ly);
      var Lcz = Kz * Lz;
      var FeT = (Math.PI * Math.PI * E_MOD * Cw / (Lcz * Lcz) + G * J) / (Ix4 + Iy4); // Pers. E4-2
      var FcrT = FcrFe(FeT, Fy);
      var lamT = Math.PI * Math.sqrt(E_MOD / FeT);  // kelangsingan lentur setara (untuk plot & banding)
      tors = { G: G, Cw: Cw, J: J, Kz: Kz, Lz: Lz, Lcz: Lcz, Fe: FeT, Fcr: FcrT, lamEq: lamT, Pn: FcrT * Ag / 1000 };
    }

    // (3) Kapasitas menentukan = minimum antar keadaan batas
    var Pn, fcrGov, feGov, govLS;
    if (tors && tors.Pn < PnFlex) {
      Pn = tors.Pn; fcrGov = tors.Fcr; feGov = tors.Fe; govLS = 'Tekuk torsi (E4)';
    } else {
      Pn = PnFlex; fcrGov = FcrFlex; feGov = FeFlex; govLS = 'Tekuk lentur (E3)';
    }
    var mode = (Fy / feGov <= 2.25) ? 'Inelastis (tekuk tak-elastis)' : 'Elastis (Euler)';
    var phiPn = PHI_C * Pn;
    var Pa = Pn / OMEGA_C;

    // Rasio demand/capacity
    var Pu = num(v.Pu), Pa_dem = num(v.Pa);
    var dcL = (Pu > 0) ? Pu / phiPn : null;
    var dcA = (Pa_dem > 0) ? Pa_dem / Pa : null;

    // Elemen langsing
    var lc = localCheck(type, p, Fy);

    r.valid = true;
    r.p = p; r.type = type; r.ti = ti; r.name = name;
    r.Fy = Fy; r.Ag = Ag; r.rx = rx; r.ry = ry;
    r.K = K; r.Lx = Lx; r.Ly = Ly; r.lamX = lamX; r.lamY = lamY; r.lam = lam; r.govAxis = govAxis;
    r.lamLimit = lamLimit;
    r.FeFlex = FeFlex; r.FcrFlex = FcrFlex; r.PnFlex = PnFlex;
    r.tors = tors;
    r.Fe = feGov; r.Fcr = fcrGov; r.govLS = govLS; r.mode = mode;
    r.Pn = Pn; r.phiPn = phiPn; r.Pa = Pa;
    r.Pu = Pu; r.Pa_dem = Pa_dem; r.dcL = dcL; r.dcA = dcA;
    r.local = lc;

    if (lam > 200)
      r.warn.push('KL/r = ' + Math.round(lam) + ' > 200 — melebihi rekomendasi kelangsingan batang tekan (Ps. E2). Perbesar profil atau kurangi panjang tekuk.');
    if (lc.slender)
      r.warn.push('Penampang punya elemen LANGSING (rasio b/t melebihi λr) — Ps. E7 (luas efektif) TIDAK diterapkan; φPn di atas berpotensi TERLALU BESAR. Perlu analisis elemen langsing.');
    if (lc.cnp)
      r.warn.push('Profil CNP (cold-formed) mengikuti AISI/SNI 7971 dengan luas efektif; hasil di sini hanya perkiraan tekuk lentur kolom — verifikasi terpisah.');
    if (type === 'SHS' || type === 'RHS' || type === 'PIPE')
      r.warn.push('Penampang tertutup (HSS) — tekuk torsi/lentur-torsi dikecualikan dari Ps. E4 (konstanta torsi J besar → tak menentukan); cukup tekuk lentur.');
    else if (type === 'UNP' || type === 'L' || type === 'CNP')
      r.warn.push('Penampang tunggal/tak-simetris — tekuk lentur-torsi (Ps. E4' + (type === 'L' ? '/E5' : '') + ') dapat MENENTUKAN dan belum dihitung (perlu properti pusat geser & torsi). Hanya tekuk lentur ditampilkan — hasil berpotensi tidak konservatif.');
    if (tors && tors.Pn < PnFlex)
      r.warn.push('Tekuk TORSI (E4) menentukan: φPn torsi ' + (PHI_C * tors.Pn).toFixed(1) + ' kN < φPn lentur ' + (PHI_C * PnFlex).toFixed(1) + ' kN. Periksa panjang tak-terkekang torsi Lz (biasanya terjadi bila Lz > Ly).');
    if (dcL !== null && dcL > 1) r.warn.push('DFBK: Pu/φPn = ' + dcL.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.');
    if (dcA !== null && dcA > 1) r.warn.push('ASD: Pa/(Pn/Ω) = ' + dcA.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.');
    if (p.source === 'hitung') r.warn.push('Properti profil ' + ti.name + ' DIHITUNG dari geometri (' + (p.note || '') + '); verifikasi terhadap katalog pabrikan.');

    return r;
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('sc-style')) return;
    var s = document.createElement('style');
    s.id = 'sc-style';
    s.textContent =
      '.sc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.sc-canvas{position:relative;flex:1 1 50%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.sc-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}';
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
    panel.appendChild(UI.el('h2', null, 'Batang Tekan Baja'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas tekan profil baja — SNI 1729:2020 (DFBK & ASD). Tekuk lentur Bab E: Fcr dari kelangsingan efektif KL/r (inelastis/elastis), cek dua sumbu & elemen langsing. Profil dari library baja; penampang & kurva kolom tergambar otomatis.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'sc-work');
    var canvasHost = UI.el('div', 'sc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang & kurva kolom');
    var results = UI.el('div', 'sc-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var typeOpts = SP.types.map(function (t) { return { value: t.key, label: t.name + ' — ' + t.full }; });
    var sizeOpts = SP.list('WF').map(function (p) { return { value: p.name, label: p.name }; });
    var gradeOpts = GRADES.map(function (g, i) { return { value: String(i), label: g[0] }; });
    var kOpts = KPRESET.map(function (u) { return { value: String(u[1]), label: u[0] }; });

    var schema = [
      { type: 'group', label: 'Profil (library baja)' },
      { type: 'select', id: 'ptype', label: 'Tipe profil', value: 'WF', options: typeOpts },
      { type: 'select', id: 'psize', label: 'Ukuran', value: sizeOpts[12] ? sizeOpts[12].value : sizeOpts[0].value, options: sizeOpts },

      { type: 'group', label: 'Mutu Baja' },
      { type: 'select', id: 'grade', label: 'Mutu', value: '0', options: gradeOpts },
      { type: 'number', id: 'Fy', label: 'Fy — tegangan leleh', unit: 'MPa', value: 240, min: 100, step: 5, hint: 'E = 200.000 MPa (tetap).' },

      { type: 'group', label: 'Panjang & Kekangan (tekuk)' },
      { type: 'select', id: 'Kpreset', label: 'Faktor panjang efektif K', value: '1', options: kOpts },
      { type: 'number', id: 'Kval', label: 'K manual', unit: '', value: 1.0, min: 0.4, max: 3, step: 0.05 },
      { type: 'number', id: 'Lx', label: 'Lx — panjang tak-terkekang sumbu kuat (x-x)', unit: 'mm', value: 3000, min: 0, step: 100 },
      { type: 'number', id: 'Ly', label: 'Ly — panjang tak-terkekang sumbu lemah (y-y)', unit: 'mm', value: 3000, min: 0, step: 100, hint: 'Bila pengaku lateral berbeda per sumbu, isi Lx & Ly berbeda.' },
      { type: 'number', id: 'Kz', label: 'Kz — faktor panjang efektif torsi (WF)', unit: '', value: 1.0, min: 0.5, max: 2, step: 0.05 },
      { type: 'number', id: 'Lz', label: 'Lz — panjang tak-terkekang torsi (WF)', unit: 'mm', value: 3000, min: 0, step: 100, hint: 'Jarak antar pengaku puntir. Umumnya = panjang penuh; tekuk torsi menentukan bila Lz > Ly.' },

      { type: 'group', label: 'Beban' },
      { type: 'number', id: 'Pu', label: 'Pu — gaya tekan terfaktor (DFBK)', unit: 'kN', value: 0, min: 0, step: 10, hint: '0 = lewati rasio D/C.' },
      { type: 'number', id: 'Pa', label: 'Pa — gaya tekan layan (ASD)', unit: 'kN', value: 0, min: 0, step: 10, hint: '0 = lewati rasio D/C.' }
    ];

    function syncVisibility(vals) {
      var manualK = String(vals.Kpreset) === '0';
      var kf = state.form.fields.Kval; if (kf) kf.node.closest('.ck-field').style.display = manualK ? '' : 'none';
      var isWF = vals.ptype === 'WF';   // tekuk torsi (E4) hanya untuk WF (dwi-simetris terbuka)
      ['Kz', 'Lz'].forEach(function (id) {
        var f = state.form.fields[id]; if (f) f.node.closest('.ck-field').style.display = isWF ? '' : 'none';
      });
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'ptype') { fillSizes(vals.ptype); vals = form.getValues(); }
      if (changedId === 'grade') {
        var g = GRADES[parseInt(vals.grade, 10)];
        if (g && g[1] > 0) { form.setValue('Fy', g[1]); vals = form.getValues(); }
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
      state.cap.set('Penampang & kurva kolom');
      results.appendChild(UI.el('div', 'ck-empty', 'Pilih profil, mutu baja, dan panjang tekuk untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    var p = r.p;
    var govTors = r.govLS.indexOf('torsi') >= 0;
    state.cap.set(r.ti.name + '  ·  ' + p.name + '  ·  Fcr ' + Math.round(r.Fcr) + ' MPa · ' + (govTors ? 'E4' : 'E3'));

    var dcTxt = (r.dcL !== null) ? ' · Pu/φPn = ' + r.dcL.toFixed(2) : '';
    results.appendChild(UI.hero('φPn (DFBK) — ' + r.govLS, UI.fmt(r.phiPn, 1), 'kN'));
    results.appendChild(UI.el('div', 'ck-empty',
      'ASD: Pn/Ω = ' + UI.fmt(r.Pa, 1) + ' kN' + dcTxt + '. Menentukan: ' + r.govLS + (govTors ? '' : ' (sumbu ' + r.govAxis + ')') + '.'));

    results.appendChild(UI.rhead('Profil'));
    results.appendChild(UI.kv('Tipe', r.ti.name + ' — ' + r.ti.full));
    results.appendChild(UI.kv('Ukuran', p.name));
    results.appendChild(UI.kv('Berat', UI.fmt(p.w, 1) + ' kg/m'));
    results.appendChild(UI.kv('Ag (luas bruto)', UI.fmt(r.Ag, 0) + ' mm² (' + UI.fmt(p.A, 2) + ' cm²)'));
    results.appendChild(UI.kv('rx / ry (jari-jari girasi)', UI.fmt(p.ix, 2) + ' / ' + UI.fmt(p.iy, 2) + ' cm'));
    results.appendChild(UI.kv('Sumber properti', p.source === 'tabel' ? 'Tabel ' + r.ti.std : 'Dihitung — ' + (p.note || 'geometri')));

    results.appendChild(UI.rhead('Kelangsingan efektif'));
    results.appendChild(UI.kv('K (faktor panjang efektif)', UI.fmt(r.K, 2)));
    results.appendChild(UI.kv('KLx / rx (sumbu kuat)', Math.round(r.lamX), r.lamX >= r.lamY ? 'ok' : ''));
    results.appendChild(UI.kv('KLy / ry (sumbu lemah)', Math.round(r.lamY), r.lamY > r.lamX ? 'ok' : ''));
    results.appendChild(UI.kv('KL/r menentukan', Math.round(r.lam) + ' / 200 — ' + r.govAxis, r.lam <= 200 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Tekuk lentur (Ps. E3)'));
    results.appendChild(UI.kv('λ batas = 4,71√(E/Fy)', UI.fmt(r.lamLimit, 1) + '  (KL/r ' + (r.lam <= r.lamLimit ? '≤' : '>') + ' batas)'));
    results.appendChild(UI.kv('Fe = π²E/(KL/r)²', UI.fmt(r.FeFlex, 1) + ' MPa'));
    results.appendChild(UI.kv('Fcr lentur', UI.fmt(r.FcrFlex, 1) + ' MPa'));
    results.appendChild(UI.kv('Pn lentur = Fcr·Ag', UI.fmt(r.PnFlex, 1) + ' kN', govTors ? '' : 'ok'));

    if (r.tors) {
      var t = r.tors;
      results.appendChild(UI.rhead('Tekuk torsi (Ps. E4 — WF)'));
      results.appendChild(UI.kv('J (konstanta torsi, dihitung)', UI.fmt(t.J / 1e4, 2) + ' cm⁴'));
      results.appendChild(UI.kv('Cw (konstanta warping, dihitung)', UI.fmt(t.Cw / 1e6, 0) + ' cm⁶'));
      results.appendChild(UI.kv('Kz·Lz (panjang torsi)', UI.fmt(t.Lcz, 0) + ' mm'));
      results.appendChild(UI.kv('Fe torsi = [π²ECw/Lcz²+GJ]/(Ix+Iy)', UI.fmt(t.Fe, 1) + ' MPa'));
      results.appendChild(UI.kv('Fcr torsi', UI.fmt(t.Fcr, 1) + ' MPa'));
      results.appendChild(UI.kv('Pn torsi = Fcr·Ag', UI.fmt(t.Pn, 1) + ' kN', govTors ? 'ok' : ''));
    }

    results.appendChild(UI.rhead('Kekuatan menentukan & desain'));
    results.appendChild(UI.kv('Keadaan batas menentukan', r.govLS, 'ok'));
    results.appendChild(UI.kv('Fcr menentukan', UI.fmt(r.Fcr, 1) + ' MPa — ' + r.mode));
    results.appendChild(UI.kv('Pn = Fcr·Ag', UI.fmt(r.Pn, 1) + ' kN'));
    results.appendChild(UI.kv('φPn (DFBK, φc=0,90)', UI.fmt(r.phiPn, 1) + ' kN', 'ok'));
    if (r.dcL !== null) results.appendChild(UI.kv('Pu / φPn', r.dcL.toFixed(2), r.dcL <= 1 ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Pn/Ω (ASD, Ωc=1,67)', UI.fmt(r.Pa, 1) + ' kN', 'ok'));
    if (r.dcA !== null) results.appendChild(UI.kv('Pa / (Pn/Ω)', r.dcA.toFixed(2), r.dcA <= 1 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Cek elemen langsing (Tabel B4.1a)'));
    if (r.local.items.length) {
      r.local.items.forEach(function (it) {
        results.appendChild(UI.kv(it.el, UI.fmt(it.lam, 1) + ' / λr ' + UI.fmt(it.lamr, 1),
          it.slender ? 'bad' : 'ok'));
      });
      results.appendChild(UI.kv('Klasifikasi', r.local.slender ? 'ADA elemen langsing' : 'Non-langsing (kompak/non-kompak)',
        r.local.slender ? 'bad' : 'ok'));
    } else {
      results.appendChild(UI.kv('Cek b/t', 'tidak tersedia untuk tipe ini', ''));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan — kapasitas, kelangsingan & elemen dalam batas.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1729:2020 (adopsi AISC 360-16) Bab E — tekuk lentur Pn=Fcr·Ag; ' +
      'Fcr=0,658^(Fy/Fe)·Fy bila KL/r≤4,71√(E/Fy), selain itu Fcr=0,877·Fe; E=200.000 MPa; ' +
      'DFBK φc=0,90 dan ASD Ωc=1,67; kelangsingan KL/r≤200 (rekomendasi). ' +
      'KL/r menentukan diambil maksimum antara sumbu x-x dan y-y. ' +
      '<b>Tekuk torsi (E4-2)</b> dihitung untuk WF (dwi-simetris terbuka): Fe=[π²ECw/(Kz·Lz)²+GJ]/(Ix+Iy), J & Cw dari geometri (J tanpa fillet → konservatif); Pn=min(lentur, torsi). ' +
      'Penampang tertutup (SHS/RHS/Pipa) dikecualikan dari E4. <b>Lentur-torsi (E4/E5) untuk UNP/Siku/CNP</b> dan <b>reduksi elemen langsing (E7)</b> TIDAK dihitung di sini. ' +
      'Profil hot-rolled memakai tabel; SHS/RHS/Pipa/CNP dihitung dari geometri (idealisasi sudut tajam). Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar penampang + kurva kolom ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Pilih profil untuk melihat penampang & kurva kolom.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.44, w - 240);
    drawSection(ctx, 0, 0, splitX, h, r);
    drawCurve(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'DFBK phiPn ' + r.phiPn.toFixed(0) + ' kN · ' + (r.govLS.indexOf('torsi') >= 0 ? 'torsi E4' : 'lentur E3')
      });
    }
  }

  function drawSection(ctx, ox, oy, w, h, r) {
    var p = r.p, ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), amber = css('--amber');
    var padT = 40, padB = 44, padS = 26;
    var boxW = w - 2 * padS, boxH = h - padT - padB;

    var dimW, dimH;
    if (p.shape === 'pipe') { dimW = p.D; dimH = p.D; }
    else if (p.shape === 'box') { dimW = p.B; dimH = p.H; }
    else if (p.shape === 'L') { dimW = p.a; dimH = p.a; }
    else { dimW = p.B; dimH = p.H; }
    var sc = Math.min(boxW / dimW, boxH / dimH) * 0.80;
    var cx = ox + w / 2, cy = oy + padT + boxH / 2;

    ctx.save();
    ctx.fillStyle = ink; ctx.strokeStyle = line; ctx.lineWidth = 1;
    var W = dimW * sc, H = dimH * sc;

    if (p.shape === 'I') {
      var tw = p.tw * sc, tf = p.tf * sc;
      ctx.beginPath();
      ctx.rect(cx - W / 2, cy - H / 2, W, tf);
      ctx.rect(cx - W / 2, cy + H / 2 - tf, W, tf);
      ctx.rect(cx - tw / 2, cy - H / 2 + tf, tw, H - 2 * tf);
      ctx.fill();
    } else if (p.shape === 'C') {
      var t = p.tw ? p.tw * sc : p.t * sc;
      var tfl = p.tf ? p.tf * sc : p.t * sc;
      var x0 = cx - W / 2;
      ctx.beginPath();
      ctx.rect(x0, cy - H / 2, t, H);
      ctx.rect(x0, cy - H / 2, W, tfl);
      ctx.rect(x0, cy + H / 2 - tfl, W, tfl);
      if (p.C) {
        var lip = p.C * sc, tt = p.t * sc;
        ctx.rect(x0 + W - tt, cy - H / 2, tt, lip);
        ctx.rect(x0 + W - tt, cy + H / 2 - lip, tt, lip);
      }
      ctx.fill();
    } else if (p.shape === 'L') {
      var tl = p.t * sc, x0L = cx - W / 2, y0L = cy - H / 2;
      ctx.beginPath();
      ctx.rect(x0L, y0L, tl, H);
      ctx.rect(x0L, y0L + H - tl, W, tl);
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
    ctx.restore();

    // keadaan batas menentukan (skematik)
    ctx.save();
    var govTors = r.govLS.indexOf('torsi') >= 0;
    if (govTors) {
      // simbol puntir: busur + panah di pusat
      ctx.strokeStyle = amber; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6;
      var rr = Math.min(W, H) * 0.30 + 6;
      ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI * 0.7, Math.PI * 0.55); ctx.stroke();
      var ax = cx + rr * Math.cos(Math.PI * 0.55), ay = cy + rr * Math.sin(Math.PI * 0.55);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 5, ay - 5); ctx.moveTo(ax, ay); ctx.lineTo(ax + 4, ay - 5); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = amber; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('tekuk puntir (E4)', cx, cy - H / 2 - 15);
    } else {
      // sumbu tekuk lentur menentukan: garis putus-putus sepanjang sumbu netral
      ctx.strokeStyle = amber; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      var weakIsY = (r.govAxis.indexOf('y-y') === 0);
      if (weakIsY) { ctx.beginPath(); ctx.moveTo(cx, cy - H / 2 - 10); ctx.lineTo(cx, cy + H / 2 + 10); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(cx - W / 2 - 10, cy); ctx.lineTo(cx + W / 2 + 10, cy); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = amber; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('sumbu tekuk ' + (weakIsY ? 'y-y' : 'x-x'), cx, cy - H / 2 - 15);
    }
    ctx.restore();

    dimLine(ctx, cx - W / 2, cx + W / 2, cy + H / 2 + 20, dim, (p.shape === 'pipe' ? 'D ' : 'b ') + Math.round(dimW));
    dimVert(ctx, cx - W / 2 - 14, cy - H / 2, cy + H / 2, faint, (p.shape === 'pipe' ? '' : 'h ') + Math.round(dimH));
  }

  // Kurva kolom Fcr vs KL/r + titik operasi
  function drawCurve(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), sage = css('--sage') || dim;
    var padT = 42, padB = 40, padL = 46, padR = 20;
    var gx0 = ox + padL, gx1 = ox + w - padR;
    var gy0 = oy + padT, gy1 = oy + h - padB;
    var gw = gx1 - gx0, gh = gy1 - gy0;

    var lamTors = r.tors ? r.tors.lamEq : 0;
    var xMax = Math.max(200, r.lam * 1.15, lamTors * 1.15);
    var yMax = r.Fy;                                 // sumbu Fcr 0..Fy
    function X(s) { return gx0 + gw * Math.min(s / xMax, 1); }
    function Y(f) { return gy1 - gh * Math.min(f / yMax, 1); }

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KURVA KOLOM  Fcr (MPa) vs KL/r', gx0, oy + 22);

    // sumbu
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx0, gy0); ctx.lineTo(gx0, gy1); ctx.lineTo(gx1, gy1); ctx.stroke();
    // grid Fy
    ctx.strokeStyle = line; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(gx0, Y(r.Fy)); ctx.lineTo(gx1, Y(r.Fy)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = faint; ctx.textAlign = 'right'; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Fy ' + Math.round(r.Fy), gx0 - 4, Y(r.Fy) + 3);
    ctx.fillText('0', gx0 - 4, gy1 + 3);
    ctx.textAlign = 'center';
    ctx.fillText('0', gx0, gy1 + 13);
    ctx.fillText(String(Math.round(xMax)), gx1, gy1 + 13);
    // batas 200
    if (xMax >= 200) {
      ctx.strokeStyle = dim; ctx.globalAlpha = 0.6; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(200), gy0); ctx.lineTo(X(200), gy1); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = dim; ctx.fillText('200', X(200), gy0 - 3);
    }

    // kurva Fcr
    ctx.strokeStyle = sage; ctx.lineWidth = 2; ctx.beginPath();
    var first = true;
    for (var s = 1; s <= xMax; s += Math.max(1, xMax / 160)) {
      var f = Fcr(s, r.Fy);
      var px = X(s), py = Y(f);
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // transisi inelastis↔elastis (λ batas)
    if (r.lamLimit <= xMax) {
      var lx = X(r.lamLimit);
      ctx.strokeStyle = faint; ctx.globalAlpha = 0.7; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx, gy0); ctx.lineTo(lx, gy1); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('λ batas ' + Math.round(r.lamLimit), lx, gy1 + 24);
    }

    // titik operasi — lentur (E3) & torsi (E4), keduanya jatuh di kurva
    var govTors = r.govLS.indexOf('torsi') >= 0;
    var pts = [{ s: r.lam, f: r.FcrFlex, gov: !govTors, tag: 'E3' }];
    if (r.tors) pts.push({ s: r.tors.lamEq, f: r.tors.Fcr, gov: govTors, tag: 'E4' });
    pts.forEach(function (pt) {
      var opx = X(pt.s), opy = Y(pt.f);
      ctx.strokeStyle = amber; ctx.globalAlpha = pt.gov ? 0.55 : 0.22; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(opx, gy1); ctx.lineTo(opx, opy); ctx.lineTo(gx0, opy); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = pt.gov ? amber : dim; ctx.beginPath(); ctx.arc(opx, opy, pt.gov ? 4.8 : 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = css('--bg'); ctx.lineWidth = 1.4; ctx.stroke();
      var right = opx > gx0 + gw * 0.6;
      ctx.textAlign = right ? 'right' : 'left';
      var lblx = right ? opx - 8 : opx + 8;
      if (pt.gov) {
        ctx.fillStyle = amber; ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(pt.tag + ' Fcr ' + Math.round(pt.f), lblx, opy - 6);
        ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText('KL/r ' + Math.round(pt.s), lblx, opy + 8);
      } else {
        ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(pt.tag, lblx, opy - 4);
      }
    });

    // ringkasan bawah
    var yB = oy + h - 8;
    ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = amber;
    ctx.fillText('phiPn = ' + r.phiPn.toFixed(1) + ' kN', gx0, yB);
    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText(r.mode, gx1, yB);
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
  var APP_VER = 'v0.1.0';
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
      .replace(/λ/g, 'lambda').replace(/π/g, 'pi')
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
    L.push(centerR('BATANG TEKAN BAJA'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 1729:2020 Bab E (DFBK & ASD)', dt));
    L.push('');
    L.push(' PROFIL');
    L.push(ruleR('-'));
    L.push(rowR('Tipe', tolatin(r.ti.name + ' - ' + r.ti.full)));
    L.push(rowR('Ukuran', tolatin(p.name)));
    L.push(rowR('Sumber properti', p.source === 'tabel' ? 'Tabel ' + r.ti.std : 'Hitung (' + tolatin(p.note || '') + ')'));
    L.push(rowR('Berat', numR(p.w, 1) + ' kg/m'));
    L.push(rowR('Ag', numR(r.Ag, 0) + ' mm2'));
    L.push(rowR('rx / ry', numR(p.ix, 2) + ' / ' + numR(p.iy, 2) + ' cm'));
    L.push('');
    L.push(' MUTU BAJA');
    L.push(ruleR('-'));
    L.push(rowR('Fy', numR(r.Fy, 0) + ' MPa'));
    L.push(rowR('E', numR(E_MOD, 0) + ' MPa'));
    L.push('');
    L.push(' PANJANG & KELANGSINGAN');
    L.push(ruleR('-'));
    L.push(rowR('K (faktor panjang efektif)', numR(r.K, 2)));
    L.push(rowR('Lx / Ly', numR(r.Lx, 0) + ' / ' + numR(r.Ly, 0) + ' mm'));
    L.push(rowR('KLx/rx', numR(r.lamX, 0)));
    L.push(rowR('KLy/ry', numR(r.lamY, 0)));
    L.push(rowR('KL/r menentukan (<= 200)', numR(r.lam, 0) + (r.lam <= 200 ? ' (OK)' : ' (LEBIH)')));
    L.push(rowR('   Sumbu menentukan', tolatin(r.govAxis)));
    L.push('');
    L.push(' TEKUK LENTUR (Ps. E3)');
    L.push(ruleR('-'));
    L.push(rowR('lambda batas 4.71*sqrt(E/Fy)', numR(r.lamLimit, 1)));
    L.push(rowR('Fe lentur = pi2*E/(KL/r)2', numR(r.FeFlex, 1) + ' MPa'));
    L.push(rowR('Fcr lentur', numR(r.FcrFlex, 1) + ' MPa'));
    L.push(rowR('Pn lentur = Fcr*Ag', numR(r.PnFlex, 1) + ' kN'));
    L.push('');
    if (r.tors) {
      L.push(' TEKUK TORSI (Ps. E4-2, dwi-simetris terbuka)');
      L.push(ruleR('-'));
      L.push(rowR('J (hitung, tanpa fillet)', numR(r.tors.J / 1e4, 2) + ' cm4'));
      L.push(rowR('Cw (hitung)', numR(r.tors.Cw / 1e6, 0) + ' cm6'));
      L.push(rowR('Kz*Lz', numR(r.tors.Lcz, 0) + ' mm'));
      L.push(rowR('Fe torsi = [pi2*E*Cw/Lcz2+G*J]/(Ix+Iy)', numR(r.tors.Fe, 1) + ' MPa'));
      L.push(rowR('Fcr torsi', numR(r.tors.Fcr, 1) + ' MPa'));
      L.push(rowR('Pn torsi = Fcr*Ag', numR(r.tors.Pn, 1) + ' kN'));
      L.push('');
    }
    L.push(' OUTPUT — DFBK (LRFD)');
    L.push(ruleR('='));
    L.push(rowR('Keadaan batas menentukan', tolatin(r.govLS)));
    L.push(rowR('Fcr menentukan', numR(r.Fcr, 1) + ' MPa (' + tolatin(r.mode) + ')'));
    L.push(rowR('Pn = Fcr*Ag', numR(r.Pn, 1) + ' kN'));
    L.push(rowR('>> phi*Pn (phi_c 0.90)', numR(r.phiPn, 1) + ' kN'));
    if (r.dcL !== null) L.push(rowR('   Pu/phiPn', numR(r.dcL, 2) + (r.dcL <= 1 ? ' (OK)' : ' (LEBIH)')));
    L.push(ruleR('='));
    L.push('');
    L.push(' OUTPUT — ASD');
    L.push(ruleR('='));
    L.push(rowR('>> Pn/Omega (Omega_c 1.67)', numR(r.Pa, 1) + ' kN'));
    if (r.dcA !== null) L.push(rowR('   Pa/(Pn/O)', numR(r.dcA, 2) + (r.dcA <= 1 ? ' (OK)' : ' (LEBIH)')));
    L.push(ruleR('='));
    L.push('');
    if (r.local.items.length) {
      L.push(' CEK ELEMEN LANGSING (Tabel B4.1a)');
      L.push(ruleR('-'));
      r.local.items.forEach(function (it) {
        L.push(rowR('  ' + tolatin(it.el), numR(it.lam, 1) + ' / lr ' + numR(it.lamr, 1) + (it.slender ? ' (LANGSING)' : ' (ok)')));
      });
      L.push(rowR('Klasifikasi', r.local.slender ? 'ADA elemen langsing' : 'Non-langsing'));
      L.push('');
    }

    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' Tekuk torsi (E4) dihitung utk WF. Lentur-torsi (E4/E5) utk UNP/');
    L.push(' Siku/CNP & reduksi elemen langsing (E7) tidak termasuk.');
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
    if (!r.valid) { UI.toast('Lengkapi data profil, mutu & panjang dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Batang-Tekan_' + r.ti.name.replace(/[^\w]/g, '') + '_' + r.name.replace(/[^\w]/g, '') + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Batang Tekan Baja', category: 'Baja', needsCanvas: true, needsRenderer: false },

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
