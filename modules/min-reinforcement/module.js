/* ============================================================
   Civil Tools — modules/min-reinforcement/module.js  (Tier 2, kanvas 2D)
   TULANGAN MINIMUM — SNI 2847:2019 (adopsi ACI 318-19)

   Lima jenis elemen dalam satu tool:
   1. BALOK (Ps. 9.6.1.2)  : As,min = maks(0,25·√f'c/fy ; 1,4/fy)·bw·d
      + tulangan geser minimum Av,min (Ps. 9.6.3.4) & spasi maks (Ps. 9.7.6.2.2)
   2. KOLOM PERSEGI (Ps. 10.6.1.1) : 0,01·Ag ≤ Ast ≤ 0,08·Ag, min 4 batang
      + sengkang ikat minimum (Ps. 25.7.2: Ø & spasi 16db/48dt/b_min)
   3. KOLOM LINGKARAN (Ps. 10.6.1.1) : sda; min 4 (ikat) / 6 (spiral, Ps. 10.7.3.1)
      + rasio spiral minimum ρs (Ps. 25.7.3.3) & pitch bersih 25–75 mm (25.7.3.1)
   4. PELAT / SLAB (Ps. 7.6.1.1 & 8.6.1.1 → 24.4.3.2) :
      fy < 420 → 0,0020·Ag ; fy ≥ 420 → maks(0,0018·420/fy ; 0,0014)·Ag
      spasi maks min(3h, 450) (Ps. 7.7.2.3 / 24.4.3.3)
   5. PILE CAP (Ps. 13.3 → fondasi telapak, min lentur mengikuti pelat) :
      As,min per meter lebar tiap arah + jumlah batang tersebar B×L
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'min-reinforcement';

  var BARS = [10, 13, 16, 19, 22, 25, 29, 32, 36];
  var STIRRUPS = [8, 10, 13];

  var state = {};

  function Ab(db) { return Math.PI / 4 * db * db; }

  /* ================= PERHITUNGAN ================= */
  function rhoSlab(fy) {
    // Ps. 24.4.3.2 (susut & suhu) — dipakai juga oleh 7.6.1.1 / 8.6.1.1
    return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014);
  }

  function compute(v) {
    var r = { elem: v.elem, warn: [], valid: true };
    var fc = v.fc, fy = v.fy;
    if (!(fc > 0) || !(fy > 0)) { r.valid = false; return r; }
    r.fc = fc; r.fy = fy;
    var db = parseFloat(v.db), ds = parseFloat(v.ds);
    r.db = db; r.ds = ds; r.Ab = Ab(db);

    if (v.elem === 'balok') computeBalok(r, v);
    else if (v.elem === 'kolom-p') computeKolomP(r, v);
    else if (v.elem === 'kolom-l') computeKolomL(r, v);
    else if (v.elem === 'pelat') computePelat(r, v);
    else computePilecap(r, v);
    return r;
  }

  function computeBalok(r, v) {
    var bw = v.b, h = v.h, cc = v.cc, fyt = v.fyt;
    if (!(bw > 0) || !(h > 0) || !(cc >= 0) || !(fyt > 0)) { r.valid = false; return; }
    r.bw = bw; r.h = h; r.cc = cc; r.fyt = fyt;
    r.d = h - cc - r.ds - r.db / 2;                       // 1 lapis tulangan
    if (r.d <= 0) { r.valid = false; return; }

    r.rho1 = 0.25 * Math.sqrt(r.fc) / r.fy;               // Ps. 9.6.1.2(a)
    r.rho2 = 1.4 / r.fy;                                  // Ps. 9.6.1.2(b)
    r.rhoMin = Math.max(r.rho1, r.rho2);
    r.govSqrt = r.rho1 >= r.rho2;                         // true → √f'c menentukan
    r.AsMin = r.rhoMin * bw * r.d;

    r.n = Math.max(2, Math.ceil(r.AsMin / r.Ab));         // min praktis 2 batang (sudut sengkang)
    r.AsProv = r.n * r.Ab;

    // Spasi bersih horizontal 1 lapis (Ps. 25.2.1): >= maks(25, db)
    r.sClearMin = Math.max(25, r.db);
    r.sClear = (bw - 2 * (cc + r.ds) - r.n * r.db) / Math.max(1, r.n - 1);
    if (r.n > 1 && r.sClear < r.sClearMin)
      r.warn.push('Spasi bersih ' + r.sClear.toFixed(0) + ' mm < ' + r.sClearMin.toFixed(0) +
        ' mm (Ps. 25.2.1) — perbesar bw, perkecil db, atau susun 2 lapis.');

    // Tulangan geser minimum (Ps. 9.6.3.4): Av/s >= maks(0,062√f'c, 0,35)·bw/fyt
    r.avPerS = Math.max(0.062 * Math.sqrt(r.fc), 0.35) * bw / fyt;   // mm²/mm
    r.Av = 2 * Ab(r.ds);                                  // sengkang 2 kaki
    r.sAv = r.Av / r.avPerS;                              // spasi maks dari Av,min
    r.sMaxD = Math.min(r.d / 2, 600);                     // Ps. 9.7.6.2.2 (Vs kecil)
    r.sPakai = Math.floor(Math.min(r.sAv, r.sMaxD) / 10) * 10;

    if (h > 900) r.warn.push('h > 900 mm — perlu tulangan kulit (skin) di kedua sisi badan (Ps. 9.7.2.3).');
  }

  // Distribusi batang keliling kolom persegi: 4 sudut + sisanya ke sisi terpanjang
  function layoutRect(n, b, h) {
    var nx = 2, ny = 2, rem = n - 4;
    while (rem > 0) {
      if (b / (nx - 1) >= h / (ny - 1)) nx++; else ny++;
      rem -= 2;
    }
    return { nx: nx, ny: ny };
  }

  function computeKolomP(r, v) {
    var b = v.b, h = v.h, cc = v.cc;
    if (!(b > 0) || !(h > 0) || !(cc >= 0)) { r.valid = false; return; }
    r.b = b; r.h = h; r.cc = cc;
    r.Ag = b * h;
    r.AstMin = 0.01 * r.Ag;                               // Ps. 10.6.1.1
    r.AstMax = 0.08 * r.Ag;

    var n = Math.max(4, Math.ceil(r.AstMin / r.Ab));      // min 4 batang (Ps. 10.7.3.1)
    if (n % 2 === 1) n++;                                 // genap agar simetris
    r.n = n;
    r.AsProv = n * r.Ab;
    r.rhoProv = r.AsProv / r.Ag;
    r.layout = layoutRect(n, b, h);

    // Perkiraan spasi bersih terkecil antar batang (Ps. 25.2.3: >= maks(1,5db, 40))
    var cx = b - 2 * (cc + r.ds) - r.db;                  // jarak pusat sudut-ke-sudut arah x
    var cy = h - 2 * (cc + r.ds) - r.db;
    r.sClearMin = Math.max(1.5 * r.db, 40);
    r.sClear = Math.min(cx / (r.layout.nx - 1), cy / (r.layout.ny - 1)) - r.db;
    if (r.sClear < r.sClearMin)
      r.warn.push('Spasi bersih antar batang ' + r.sClear.toFixed(0) + ' mm < ' +
        r.sClearMin.toFixed(0) + ' mm (Ps. 25.2.3) — perbesar penampang atau kurangi jumlah batang (db lebih besar).');

    // Sengkang ikat minimum (Ps. 25.7.2)
    r.tieDia = r.db <= 32 ? 10 : 13;                      // Ps. 25.7.2.2
    if (r.ds < r.tieDia)
      r.warn.push('Sengkang ikat Ø' + r.ds + ' < minimum Ø' + r.tieDia + ' untuk tulangan D' + r.db + ' (Ps. 25.7.2.2).');
    r.sTie = Math.min(16 * r.db, 48 * r.ds, Math.min(b, h));   // Ps. 25.7.2.1
    r.sTiePakai = Math.floor(r.sTie / 10) * 10;
  }

  function computeKolomL(r, v) {
    var D = v.D, cc = v.cc, spiral = (v.tieType === 'spiral');
    if (!(D > 0) || !(cc >= 0)) { r.valid = false; return; }
    r.D = D; r.cc = cc; r.spiral = spiral;
    r.dsp = spiral ? parseFloat(v.dsp) : r.ds;            // Ø tul. transversal terpakai
    r.Ag = Math.PI / 4 * D * D;
    r.AstMin = 0.01 * r.Ag;                               // Ps. 10.6.1.1
    r.AstMax = 0.08 * r.Ag;

    r.nMin = spiral ? 6 : 4;                              // Ps. 10.7.3.1
    r.n = Math.max(r.nMin, Math.ceil(r.AstMin / r.Ab));
    r.AsProv = r.n * r.Ab;
    r.rhoProv = r.AsProv / r.Ag;

    // Spasi bersih antar batang di lingkaran (Ps. 25.2.3)
    var rb = D / 2 - cc - r.dsp - r.db / 2;               // radius lingkaran pusat batang
    r.ringR = rb;
    r.sClearMin = Math.max(1.5 * r.db, 40);
    r.sClear = 2 * rb * Math.sin(Math.PI / r.n) - r.db;
    if (rb <= 0) { r.valid = false; return; }
    if (r.sClear < r.sClearMin)
      r.warn.push('Spasi bersih antar batang ' + r.sClear.toFixed(0) + ' mm < ' +
        r.sClearMin.toFixed(0) + ' mm (Ps. 25.2.3) — gunakan db lebih besar (jumlah lebih sedikit) atau perbesar D.');

    if (spiral) {
      var fyt = v.fyt;
      if (!(fyt > 0)) { r.valid = false; return; }
      if (fyt > 700) { fyt = 700; r.warn.push('fyt spiral dibatasi 700 MPa (Ps. 25.7.3.3).'); }
      r.fyt = fyt;
      r.Dc = D - 2 * cc;                                  // diameter inti (out-out spiral)
      r.Ach = Math.PI / 4 * r.Dc * r.Dc;
      r.rhoS = 0.45 * (r.Ag / r.Ach - 1) * r.fc / fyt;    // Ps. 25.7.3.3
      var Asp = Ab(r.dsp);
      r.sPitch = 4 * Asp / (r.Dc * r.rhoS);               // ρs = 4·Asp/(Dc·s)
      r.sPitchPakai = Math.floor(r.sPitch / 5) * 5;
      r.sPitchClear = r.sPitchPakai - r.dsp;              // pitch bersih (Ps. 25.7.3.1: 25–75)
      if (r.sPitchClear > 75) {
        r.sPitchPakai = 75 + r.dsp;
        r.warn.push('Pitch bersih dibatasi maksimum 75 mm (Ps. 25.7.3.1).');
        r.sPitchClear = 75;
      }
      if (r.sPitchClear < 25)
        r.warn.push('Pitch bersih ' + r.sPitchClear.toFixed(0) + ' mm < 25 mm (Ps. 25.7.3.1) — gunakan batang spiral lebih besar.');
    } else {
      r.tieDia = r.db <= 32 ? 10 : 13;
      if (r.ds < r.tieDia)
        r.warn.push('Sengkang ikat Ø' + r.ds + ' < minimum Ø' + r.tieDia + ' untuk tulangan D' + r.db + ' (Ps. 25.7.2.2).');
      r.sTie = Math.min(16 * r.db, 48 * r.ds, D);         // Ps. 25.7.2.1
      r.sTiePakai = Math.floor(r.sTie / 10) * 10;
    }
  }

  function computePelat(r, v) {
    var h = v.h;
    if (!(h > 0)) { r.valid = false; return; }
    r.h = h; r.dua = (v.arah === 'dua');
    r.rhoMin = rhoSlab(r.fy);
    r.AsMin = r.rhoMin * 1000 * h;                        // mm²/m
    r.sTheo = r.Ab * 1000 / r.AsMin;
    r.sMax = Math.min(3 * h, 450);                        // Ps. 7.7.2.3 / 24.4.3.3
    r.sMax2 = Math.min(2 * h, 450);                       // dua arah, penampang kritis (Ps. 8.7.2.2)
    r.sPakai = Math.floor(Math.min(r.sTheo, r.sMax) / 5) * 5;
    if (r.sPakai < 25 + r.db)
      r.warn.push('Spasi sangat rapat — pertimbangkan batang lebih besar.');
    r.AsProv = r.Ab * 1000 / r.sPakai;
    if (r.dua)
      r.warn.push('Pelat dua arah: pada penampang kritis spasi maksimum min(2h, 450) = ' +
        r.sMax2.toFixed(0) + ' mm (Ps. 8.7.2.2).');
  }

  function computePilecap(r, v) {
    var h = v.h, B = v.B, L = v.L, cc = v.cc;
    if (!(h > 0) || !(B > 0) || !(L > 0) || !(cc >= 0)) { r.valid = false; return; }
    r.h = h; r.B = B; r.L = L; r.cc = cc;
    r.rhoMin = rhoSlab(r.fy);                             // Ps. 13.3 → 7.6.1.1 / 8.6.1.1
    r.AsMin = r.rhoMin * 1000 * h;                        // mm²/m per arah
    r.sTheo = r.Ab * 1000 / r.AsMin;
    r.sMax = Math.min(3 * h, 450);
    r.sPakai = Math.floor(Math.min(r.sTheo, r.sMax) / 5) * 5;
    r.AsProv = r.Ab * 1000 / r.sPakai;
    // Batang arah-B (sejajar sisi B) tersebar sepanjang L, dan sebaliknya
    r.nDirB = Math.ceil((L - 2 * cc) / r.sPakai) + 1;
    r.nDirL = Math.ceil((B - 2 * cc) / r.sPakai) + 1;
    r.AsTotB = r.nDirB * r.Ab;
    r.AsTotL = r.nDirL * r.Ab;
    if (h >= 900)
      r.warn.push('Pile cap sangat tebal — cek aksi balok tinggi / strut-and-tie (Ps. 9.9 / Ps. 23) dan tulangan kulit sisi.');
    r.warn.push('Minimum ini basis fondasi telapak (Ps. 13.3). Sebagian praktisi memakai As,min balok (1,4/fy·b·d) untuk pile cap yang bekerja sebagai balok — lebih konservatif.');
  }

  /* ================= UI ================= */
  var ELEMS = [
    { value: 'balok', label: 'Balok' },
    { value: 'kolom-p', label: 'Kolom persegi' },
    { value: 'kolom-l', label: 'Kolom lingkaran' },
    { value: 'pelat', label: 'Pelat (slab)' },
    { value: 'pilecap', label: 'Pile cap' }
  ];

  // Field yang tampil per elemen
  var VIS = {
    'balok':   ['fc', 'fy', 'fyt', 'b', 'h', 'cc', 'db', 'ds'],
    'kolom-p': ['fc', 'fy', 'b', 'h', 'cc', 'db', 'ds'],
    'kolom-l': ['fc', 'fy', 'D', 'cc', 'db', 'tieType'],   // + ds ATAU dsp/fyt sesuai tieType
    'pelat':   ['fc', 'fy', 'h', 'db', 'arah'],
    'pilecap': ['fc', 'fy', 'h', 'B', 'L', 'cc', 'db']
  };

  function injectStyle() {
    if (document.getElementById('mr-style')) return;
    var s = document.createElement('style');
    s.id = 'mr-style';
    s.textContent =
      '.mr-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.mr-canvas{position:relative;flex:1 1 50%;min-height:220px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.mr-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Tulangan Minimum'));
    panel.appendChild(UI.el('div', 'sub', 'As,min balok, kolom (persegi & lingkaran), pelat, dan pile cap — SNI 2847:2019. Termasuk sengkang/spiral minimum.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'mr-work');
    var canvasHost = UI.el('div', 'mr-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang & tulangan minimum');
    var results = UI.el('div', 'mr-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var barOpts = BARS.map(function (d) { return { value: d, label: 'D' + d + ' (' + Ab(d).toFixed(1) + ' mm²)' }; });
    var stirOpts = STIRRUPS.map(function (d) { return { value: d, label: 'Ø' + d }; });

    var schema = [
      { type: 'group', label: 'Elemen' },
      { type: 'select', id: 'elem', label: 'Jenis elemen', value: 'balok', options: ELEMS },

      { type: 'group', label: 'Material' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tul. utama', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'fyt', label: 'fyt — mutu sengkang/spiral', unit: 'MPa', value: 420, min: 240, step: 10 },

      { type: 'group', label: 'Dimensi' },
      { type: 'number', id: 'b', label: 'b — lebar penampang', unit: 'mm', value: 300, min: 100, step: 10 },
      { type: 'number', id: 'h', label: 'h — tinggi / tebal', unit: 'mm', value: 500, min: 50, step: 10 },
      { type: 'number', id: 'D', label: 'D — diameter kolom', unit: 'mm', value: 500, min: 200, step: 10 },
      { type: 'number', id: 'B', label: 'B — lebar pile cap', unit: 'mm', value: 1800, min: 300, step: 50 },
      { type: 'number', id: 'L', label: 'L — panjang pile cap', unit: 'mm', value: 1800, min: 300, step: 50 },

      { type: 'group', label: 'Tulangan' },
      { type: 'number', id: 'cc', label: 'cc — selimut bersih', unit: 'mm', value: 40, min: 10, step: 5 },
      { type: 'select', id: 'db', label: 'db — tulangan utama', value: 19, options: barOpts },
      { type: 'segment', id: 'tieType', label: 'Tulangan transversal', value: 'ikat', options: [{ value: 'ikat', label: 'Sengkang ikat' }, { value: 'spiral', label: 'Spiral' }] },
      { type: 'select', id: 'ds', label: 'Ø sengkang', value: 10, options: stirOpts },
      { type: 'select', id: 'dsp', label: 'Ø batang spiral', value: 10, options: stirOpts },
      { type: 'segment', id: 'arah', label: 'Sistem pelat', value: 'satu', options: [{ value: 'satu', label: 'Satu arah' }, { value: 'dua', label: 'Dua arah' }] }
    ];

    function syncVisibility(vals) {
      var vis = VIS[vals.elem].slice();
      if (vals.elem === 'kolom-l') {
        if (vals.tieType === 'spiral') vis.push('dsp', 'fyt');
        else vis.push('ds');
      }
      ['fc', 'fy', 'fyt', 'b', 'h', 'D', 'B', 'L', 'cc', 'db', 'tieType', 'ds', 'dsp', 'arah'].forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = vis.indexOf(id) >= 0 ? '' : 'none';
      });
      // Default selimut yang lazim per elemen (hanya saat ganti elemen)
    }

    var CC_DEF = { 'balok': 40, 'kolom-p': 40, 'kolom-l': 40, 'pelat': 20, 'pilecap': 75 };

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'elem') {
        form.setValue('cc', CC_DEF[vals.elem]);
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

  function fmtCfg(r) {
    if (r.elem === 'balok') return r.n + 'D' + r.db;
    if (r.elem === 'kolom-p' || r.elem === 'kolom-l') return r.n + 'D' + r.db;
    return 'D' + r.db + '-' + r.sPakai;
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Penampang & tulangan minimum');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi material dan dimensi untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }

    if (r.elem === 'balok') {
      state.cap.set('As,min ' + UI.fmt(r.AsMin, 0) + ' mm² · ' + fmtCfg(r));
      results.appendChild(UI.heroRow([
        { label: 'As,min lentur', value: UI.fmt(r.AsMin, 1), unit: 'mm²' },
        { label: 'As pakai — ' + fmtCfg(r), value: UI.fmt(r.AsProv, 1), unit: 'mm²', tone: r.AsProv >= r.AsMin ? 'ok' : 'bad' },
        { label: 'ρmin', value: UI.fmt(r.rhoMin * 100, 3), unit: '%' }
      ]));
      results.appendChild(UI.rhead('Lentur (Ps. 9.6.1.2)'));
      results.appendChild(UI.kv('d (1 lapis)', UI.fmt(r.d, 1) + ' mm'));
      results.appendChild(UI.kv("0,25·√f'c/fy", UI.fmt(r.rho1 * 1000, 3) + ' ‰', r.govSqrt ? 'ok' : ''));
      results.appendChild(UI.kv('1,4/fy', UI.fmt(r.rho2 * 1000, 3) + ' ‰', r.govSqrt ? '' : 'ok'));
      results.appendChild(UI.kv('ρmin menentukan', UI.fmt(r.rhoMin * 100, 3) + ' %  (' + (r.govSqrt ? "0,25√f'c/fy" : '1,4/fy') + ')'));
      results.appendChild(UI.kv('As,min = ρmin·bw·d', UI.fmt(r.AsMin, 1) + ' mm²'));
      results.appendChild(UI.kv('Konfigurasi pakai', fmtCfg(r) + ' = ' + UI.fmt(r.AsProv, 1) + ' mm²', 'ok'));
      results.appendChild(UI.kv('Spasi bersih (≥ ' + UI.fmt(r.sClearMin, 0) + ')', UI.fmt(r.sClear, 0) + ' mm', r.sClear >= r.sClearMin ? 'ok' : 'bad'));
      results.appendChild(UI.rhead('Geser minimum (Ps. 9.6.3.4)'));
      results.appendChild(UI.kv('Av,min/s', UI.fmt(r.avPerS, 3) + ' mm²/mm'));
      results.appendChild(UI.kv('Av sengkang Ø' + r.ds + ' 2 kaki', UI.fmt(r.Av, 1) + ' mm²'));
      results.appendChild(UI.kv('s ≤ Av/(Av,min/s)', UI.fmt(r.sAv, 0) + ' mm'));
      results.appendChild(UI.kv('s ≤ min(d/2, 600)', UI.fmt(r.sMaxD, 0) + ' mm'));
      results.appendChild(UI.kv('Sengkang pakai', 'Ø' + r.ds + '-' + r.sPakai, 'ok'));
      results.appendChild(UI.note('Catatan Ps. 9.6.1.3',
        'As,min boleh diabaikan bila As terpasang ≥ <b>4/3 × As perlu</b> dari analisis. ' +
        'Av,min berlaku bila Vu > 0,5φVc (Ps. 9.6.3.1) — di luar itu sengkang boleh lebih renggang.'));
    } else if (r.elem === 'kolom-p' || r.elem === 'kolom-l') {
      state.cap.set('Ast,min ' + UI.fmt(r.AstMin, 0) + ' mm² · ' + fmtCfg(r));
      results.appendChild(UI.heroRow([
        { label: 'Ast,min = 1%·Ag', value: UI.fmt(r.AstMin, 1), unit: 'mm²' },
        { label: 'Ast pakai — ' + fmtCfg(r), value: UI.fmt(r.AsProv, 1), unit: 'mm²', tone: r.AsProv >= r.AstMin ? 'ok' : 'bad' },
        { label: 'ρ terpasang', value: UI.fmt(r.rhoProv * 100, 2), unit: '%', tone: r.rhoProv >= 0.01 ? 'ok' : 'bad' }
      ]));
      results.appendChild(UI.rhead('Longitudinal (Ps. 10.6.1.1)'));
      results.appendChild(UI.kv('Ag', UI.fmt(r.Ag, 0) + ' mm²'));
      results.appendChild(UI.kv('Ast,min = 0,01·Ag', UI.fmt(r.AstMin, 1) + ' mm²'));
      results.appendChild(UI.kv('Ast,maks = 0,08·Ag', UI.fmt(r.AstMax, 0) + ' mm²'));
      results.appendChild(UI.kv('Jumlah minimum batang', (r.elem === 'kolom-l' ? r.nMin : 4) + ' (Ps. 10.7.3.1)'));
      results.appendChild(UI.kv('Konfigurasi pakai', fmtCfg(r) + ' = ' + UI.fmt(r.AsProv, 1) + ' mm²', 'ok'));
      results.appendChild(UI.kv('ρ terpasang', UI.fmt(r.rhoProv * 100, 2) + ' %', r.rhoProv >= 0.01 ? 'ok' : 'bad'));
      results.appendChild(UI.kv('Spasi bersih (≥ ' + UI.fmt(r.sClearMin, 0) + ')', UI.fmt(r.sClear, 0) + ' mm', r.sClear >= r.sClearMin ? 'ok' : 'bad'));
      if (r.elem === 'kolom-l' && r.spiral) {
        results.appendChild(UI.rhead('Spiral minimum (Ps. 25.7.3)'));
        results.appendChild(UI.kv('Dc (inti, out-out)', UI.fmt(r.Dc, 0) + ' mm'));
        results.appendChild(UI.kv('Ach', UI.fmt(r.Ach, 0) + ' mm²'));
        results.appendChild(UI.kv("ρs,min = 0,45(Ag/Ach−1)f'c/fyt", UI.fmt(r.rhoS * 100, 3) + ' %'));
        results.appendChild(UI.kv('Pitch teoretis', UI.fmt(r.sPitch, 1) + ' mm'));
        results.appendChild(UI.kv('Spiral pakai', 'Ø' + r.dsp + '-' + r.sPitchPakai, 'ok'));
        results.appendChild(UI.kv('Pitch bersih (25–75)', UI.fmt(r.sPitchClear, 0) + ' mm', (r.sPitchClear >= 25 && r.sPitchClear <= 75) ? 'ok' : 'bad'));
      } else {
        results.appendChild(UI.rhead('Sengkang ikat minimum (Ps. 25.7.2)'));
        results.appendChild(UI.kv('Ø minimum', 'Ø' + r.tieDia + ' (D' + r.db + ' ≤ 32 → Ø10, > 32 → Ø13)'.replace('(D' + r.db, '(db'), r.ds >= r.tieDia ? 'ok' : 'bad'));
        results.appendChild(UI.kv('s ≤ min(16db, 48dt, sisi)', UI.fmt(r.sTie, 0) + ' mm'));
        results.appendChild(UI.kv('Sengkang pakai', 'Ø' + r.ds + '-' + r.sTiePakai, 'ok'));
      }
      results.appendChild(UI.note('Catatan',
        'ρmaks 8% termasuk sambungan lewatan — praktis dibatasi ±4% di zona sambungan agar tidak sesak. ' +
        'Persyaratan seismik (SRPMK/SRPMM, Ps. 18) lebih ketat dan belum dicakup tool ini.'));
    } else if (r.elem === 'pelat') {
      state.cap.set('As,min ' + UI.fmt(r.AsMin, 0) + ' mm²/m · ' + fmtCfg(r));
      results.appendChild(UI.heroRow([
        { label: 'As,min per meter', value: UI.fmt(r.AsMin, 1), unit: 'mm²/m' },
        { label: 'As pakai — ' + fmtCfg(r), value: UI.fmt(r.AsProv, 1), unit: 'mm²/m', tone: r.AsProv >= r.AsMin ? 'ok' : 'bad' },
        { label: 'ρmin', value: UI.fmt(r.rhoMin * 100, 2), unit: '%' }
      ]));
      results.appendChild(UI.rhead('Minimum (Ps. ' + (r.dua ? '8.6.1.1' : '7.6.1.1') + ' / 24.4.3.2)'));
      results.appendChild(UI.kv('ρmin', UI.fmt(r.rhoMin * 100, 2) + ' %  (' + (r.fy < 420 ? 'fy < 420 → 0,20%' : 'maks(0,0018·420/fy; 0,0014)') + ')'));
      results.appendChild(UI.kv('As,min = ρmin·1000·h', UI.fmt(r.AsMin, 1) + ' mm²/m'));
      results.appendChild(UI.kv('Spasi teoretis D' + r.db, UI.fmt(r.sTheo, 0) + ' mm'));
      results.appendChild(UI.kv('Spasi maks min(3h, 450)', UI.fmt(r.sMax, 0) + ' mm'));
      results.appendChild(UI.kv('Konfigurasi pakai', fmtCfg(r) + ' = ' + UI.fmt(r.AsProv, 1) + ' mm²/m', 'ok'));
      results.appendChild(UI.note('Catatan',
        'Berlaku per arah (tulangan susut-suhu arah tegak lurus tulangan utama memakai nilai yang sama, Ps. 24.4). ' +
        (r.dua ? 'Pelat dua arah: spasi pada penampang kritis ≤ min(2h, 450) = ' + UI.fmt(r.sMax2, 0) + ' mm (Ps. 8.7.2.2). ' : '') +
        'Tebal minimum pelat (Tabel 7.3.1.1 / 8.3.1.1) dicek terpisah.'));
    } else {
      state.cap.set('As,min ' + UI.fmt(r.AsMin, 0) + ' mm²/m · ' + fmtCfg(r));
      results.appendChild(UI.heroRow([
        { label: 'As,min/m tiap arah', value: UI.fmt(r.AsMin, 1), unit: 'mm²/m' },
        { label: 'As pakai — ' + fmtCfg(r), value: UI.fmt(r.AsProv, 1), unit: 'mm²/m', tone: r.AsProv >= r.AsMin ? 'ok' : 'bad' },
        { label: 'ρmin', value: UI.fmt(r.rhoMin * 100, 2), unit: '%' }
      ]));
      results.appendChild(UI.rhead('Minimum lentur (Ps. 13.3 → 7.6.1.1 / 8.6.1.1)'));
      results.appendChild(UI.kv('ρmin', UI.fmt(r.rhoMin * 100, 2) + ' %'));
      results.appendChild(UI.kv('As,min = ρmin·1000·h', UI.fmt(r.AsMin, 1) + ' mm²/m'));
      results.appendChild(UI.kv('Spasi teoretis D' + r.db, UI.fmt(r.sTheo, 0) + ' mm'));
      results.appendChild(UI.kv('Spasi maks min(3h, 450)', UI.fmt(r.sMax, 0) + ' mm'));
      results.appendChild(UI.kv('Konfigurasi pakai', fmtCfg(r) + ' = ' + UI.fmt(r.AsProv, 1) + ' mm²/m', 'ok'));
      results.appendChild(UI.rhead('Sebaran pada denah B × L'));
      results.appendChild(UI.kv('Arah sejajar B (tersebar di L)', r.nDirB + ' D' + r.db + ' = ' + UI.fmt(r.AsTotB, 0) + ' mm²'));
      results.appendChild(UI.kv('Arah sejajar L (tersebar di B)', r.nDirL + ' D' + r.db + ' = ' + UI.fmt(r.AsTotL, 0) + ' mm²'));
    }

    if (r.warn.length) {
      results.appendChild(UI.note('Peringatan',
        '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    }
    results.appendChild(UI.note('Referensi',
      'SNI 2847:2019 (adopsi ACI 318-19). Nilai di atas adalah <b>minimum absolut</b> — kebutuhan dari analisis ' +
      'beban (As,perlu) hampir selalu menentukan dan harus dicek terpisah. Persyaratan detailing seismik (Ps. 18) ' +
      'tidak dicakup. Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ================= KANVAS ================= */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint');
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data untuk melihat penampang.', w / 2, h / 2);
      return;
    }
    if (r.elem === 'balok') drawBalok(ctx, w, h, r);
    else if (r.elem === 'kolom-p') drawKolomP(ctx, w, h, r);
    else if (r.elem === 'kolom-l') drawKolomL(ctx, w, h, r);
    else if (r.elem === 'pelat') drawPelat(ctx, w, h, r);
    else drawPilecap(ctx, w, h, r);

    if (state.mouse && state.hoverText) {
      state.UI.canvasTip(ctx, { mx: state.mouse.x, my: state.mouse.y, w: w, h: h, text: state.hoverText });
    }
  }

  // Kotak penampang umum: kembalikan {x,y,sc} — padT >= 40 (pita .cap)
  function fitRect(w, h, bw, bh) {
    var padT = 44, padB = 52, padL = 74, padR = 44;
    var sc = Math.min((w - padL - padR) / bw, (h - padT - padB) / bh);
    return { x: (w - bw * sc + padL - padR) / 2, y: padT + (h - padT - padB - bh * sc) / 2, sc: sc };
  }

  function barCircle(ctx, x, y, rad, hot) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.2, rad), 0, Math.PI * 2);
    ctx.fillStyle = hot ? css('--amber') : css('--ink');
    ctx.fill();
  }

  function sectionRect(ctx, f, bw, bh) {
    ctx.fillStyle = css('--panel-solid');
    ctx.globalAlpha = 0.9;
    ctx.fillRect(f.x, f.y, bw * f.sc, bh * f.sc);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1.4;
    ctx.strokeRect(f.x, f.y, bw * f.sc, bh * f.sc);
  }

  function stirrupRect(ctx, f, bw, bh, cc) {
    var i = cc * f.sc;
    ctx.strokeStyle = css('--ink-dim');
    ctx.lineWidth = 1.4;
    roundRectPath(ctx, f.x + i, f.y + i, bw * f.sc - 2 * i, bh * f.sc - 2 * i, 5);
    ctx.stroke();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function inRect(mx, my, f, bw, bh) {
    return mx >= f.x && mx <= f.x + bw * f.sc && my >= f.y && my <= f.y + bh * f.sc;
  }

  function drawBalok(ctx, w, h, r) {
    var f = fitRect(w, h, r.bw, r.h);
    sectionRect(ctx, f, r.bw, r.h);
    stirrupRect(ctx, f, r.bw, r.h, r.cc);
    // batang bawah
    var yb = f.y + (r.h - r.cc - r.ds - r.db / 2) * f.sc;
    var x0 = f.x + (r.cc + r.ds + r.db / 2) * f.sc;
    var x1 = f.x + (r.bw - r.cc - r.ds - r.db / 2) * f.sc;
    var hot = state.mouse && inRect(state.mouse.x, state.mouse.y, f, r.bw, r.h);
    for (var i = 0; i < r.n; i++) {
      var x = r.n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (r.n - 1);
      barCircle(ctx, x, yb, r.db / 2 * f.sc, hot);
    }
    // garis d (dari serat atas ke pusat tulangan)
    var xd = f.x + r.bw * f.sc + 16;
    dimVert(ctx, xd, f.y, yb, css('--amber'), 'd ' + Math.round(r.d));
    dimLine(ctx, f.x, f.x + r.bw * f.sc, f.y + r.h * f.sc + 24, css('--ink-dim'), 'bw = ' + Math.round(r.bw));
    dimVert(ctx, f.x - 18, f.y, f.y + r.h * f.sc, css('--ink-dim'), 'h ' + Math.round(r.h));
    state.hoverText = hot ? ('As,min ' + r.AsMin.toFixed(0) + ' mm² · ' + r.n + 'D' + r.db + ' · ρ ' + (r.rhoMin * 100).toFixed(2) + '%') : null;
  }

  function drawKolomP(ctx, w, h, r) {
    var f = fitRect(w, h, r.b, r.h);
    sectionRect(ctx, f, r.b, r.h);
    stirrupRect(ctx, f, r.b, r.h, r.cc);
    var hot = state.mouse && inRect(state.mouse.x, state.mouse.y, f, r.b, r.h);
    var inset = (r.cc + r.ds + r.db / 2) * f.sc;
    var x0 = f.x + inset, x1 = f.x + r.b * f.sc - inset;
    var y0 = f.y + inset, y1 = f.y + r.h * f.sc - inset;
    var rad = r.db / 2 * f.sc, i;
    for (i = 0; i < r.layout.nx; i++) {          // baris atas & bawah
      var x = r.layout.nx === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (r.layout.nx - 1);
      barCircle(ctx, x, y0, rad, hot);
      barCircle(ctx, x, y1, rad, hot);
    }
    for (i = 1; i < r.layout.ny - 1; i++) {      // sisi kiri & kanan (tanpa sudut)
      var y = y0 + (y1 - y0) * i / (r.layout.ny - 1);
      barCircle(ctx, x0, y, rad, hot);
      barCircle(ctx, x1, y, rad, hot);
    }
    dimLine(ctx, f.x, f.x + r.b * f.sc, f.y + r.h * f.sc + 24, css('--ink-dim'), 'b = ' + Math.round(r.b));
    dimVert(ctx, f.x - 18, f.y, f.y + r.h * f.sc, css('--ink-dim'), 'h ' + Math.round(r.h));
    state.hoverText = hot ? ('Ast ' + r.AsProv.toFixed(0) + ' mm² · ' + r.n + 'D' + r.db + ' · ρ ' + (r.rhoProv * 100).toFixed(2) + '%') : null;
  }

  function drawKolomL(ctx, w, h, r) {
    var f = fitRect(w, h, r.D, r.D);
    var cxp = f.x + r.D / 2 * f.sc, cyp = f.y + r.D / 2 * f.sc, R = r.D / 2 * f.sc;
    ctx.fillStyle = css('--panel-solid');
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.stroke();
    // lingkar sengkang/spiral
    var Rt = (r.D / 2 - r.cc - r.dsp / 2) * f.sc;
    ctx.strokeStyle = css('--ink-dim'); ctx.lineWidth = 1.4;
    if (r.spiral) ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.arc(cxp, cyp, Rt, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    var hot = state.mouse && Math.hypot(state.mouse.x - cxp, state.mouse.y - cyp) <= R;
    var Rb = r.ringR * f.sc, rad = r.db / 2 * f.sc;
    for (var i = 0; i < r.n; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / r.n;
      barCircle(ctx, cxp + Rb * Math.cos(a), cyp + Rb * Math.sin(a), rad, hot);
    }
    dimLine(ctx, cxp - R, cxp + R, f.y + r.D * f.sc + 24, css('--ink-dim'), 'D = ' + Math.round(r.D));
    if (r.spiral) {
      ctx.fillStyle = css('--ink-dim');
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('spiral Ø' + r.dsp + '-' + r.sPitchPakai, cxp + R + 12, cyp);
    }
    state.hoverText = hot ? ('Ast ' + r.AsProv.toFixed(0) + ' mm² · ' + r.n + 'D' + r.db + ' · ρ ' + (r.rhoProv * 100).toFixed(2) + '%') : null;
  }

  function drawPelat(ctx, w, h, r) {
    var span = 1000;                                       // potongan selebar 1 m
    var f = fitRect(w, h, span, Math.max(r.h * 3, 260));   // beri ruang vertikal
    var sc = f.sc, x0 = f.x, y0 = f.y + (Math.max(r.h * 3, 260) - r.h) / 2 * sc;
    var hp = r.h * sc;
    ctx.fillStyle = css('--panel-solid');
    ctx.globalAlpha = 0.9; ctx.fillRect(x0, y0, span * sc, hp); ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.4;
    ctx.strokeRect(x0, y0, span * sc, hp);
    var hot = state.mouse && state.mouse.x >= x0 && state.mouse.x <= x0 + span * sc &&
      state.mouse.y >= y0 && state.mouse.y <= y0 + hp;
    // batang bawah dengan spasi s
    var cov = 20 * sc;
    var yb = y0 + hp - cov - r.db / 2 * sc;
    var nb = Math.floor(span / r.sPakai) + 1;
    var first = x0 + (span - (nb - 1) * r.sPakai) / 2 * sc;
    for (var i = 0; i < nb; i++) barCircle(ctx, first + i * r.sPakai * sc, yb, r.db / 2 * sc, hot);
    if (nb >= 2) dimLine(ctx, first, first + r.sPakai * sc, y0 + hp + 24, css('--amber'), 's = ' + r.sPakai);
    dimVert(ctx, x0 - 18, y0, y0 + hp, css('--ink-dim'), 'h ' + Math.round(r.h));
    ctx.fillStyle = css('--ink-dim'); ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('potongan selebar 1000 mm', x0 + span * sc / 2, y0 - 10);
    state.hoverText = hot ? ('As ' + r.AsProv.toFixed(0) + ' mm²/m · D' + r.db + '-' + r.sPakai) : null;
  }

  function drawPilecap(ctx, w, h, r) {
    var f = fitRect(w, h, r.B, Math.max(r.h * 2.1, r.B * 0.45));
    var sc = f.sc, x0 = f.x;
    var y0 = f.y + 8;
    var hp = r.h * sc;
    // pile cap
    ctx.fillStyle = css('--panel-solid');
    ctx.globalAlpha = 0.9; ctx.fillRect(x0, y0, r.B * sc, hp); ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.4;
    ctx.strokeRect(x0, y0, r.B * sc, hp);
    // dua stub tiang di bawah (konteks visual)
    var pw = Math.min(0.22 * r.B, 600) * sc, ph = Math.min(hp * 0.6, 46);
    [0.25, 0.75].forEach(function (q) {
      var px = x0 + q * r.B * sc - pw / 2;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(px, y0 + hp, pw, ph);
      ctx.globalAlpha = 1;
      ctx.strokeRect(px, y0 + hp, pw, ph);
    });
    var hot = state.mouse && state.mouse.x >= x0 && state.mouse.x <= x0 + r.B * sc &&
      state.mouse.y >= y0 && state.mouse.y <= y0 + hp;
    // batang bawah spasi s di antara selimut
    var yb = y0 + hp - (r.cc + r.db / 2) * sc;
    var nb = r.nDirL;                                     // batang sejajar L terlihat pada potongan B
    var innerW = (r.B - 2 * r.cc) * sc;
    var xs = x0 + r.cc * sc;
    for (var i = 0; i < nb; i++) {
      var x = nb === 1 ? xs + innerW / 2 : xs + innerW * i / (nb - 1);
      barCircle(ctx, x, yb, r.db / 2 * sc, hot);
    }
    dimLine(ctx, x0, x0 + r.B * sc, y0 + hp + ph + 22, css('--ink-dim'), 'B = ' + Math.round(r.B));
    dimVert(ctx, x0 - 18, y0, y0 + hp, css('--ink-dim'), 'h ' + Math.round(r.h));
    ctx.fillStyle = css('--ink-dim'); ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('potongan pile cap (arah B)', x0 + r.B * sc / 2, y0 - 10);
    state.hoverText = hot ? ('As ' + r.AsProv.toFixed(0) + ' mm²/m · D' + r.db + '-' + r.sPakai + ' · ' + r.nDirL + ' btg') : null;
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
    ctx.save(); ctx.translate(x - 10, (y1 + y2) / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.3.0';
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
      .replace(/ρ/g, 'rho').replace(/φ/g, 'phi').replace(/Ø/g, 'O').replace(/·/g, '*')
      .replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/²/g, '2').replace(/³/g, '3')
      .replace(/‰/g, 'o/oo').replace(/′/g, "'").replace(/’/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[×]/g, 'x')
      .replace(/±/g, '+/-').replace(/[^\x20-\x7E]/g, '?');
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

  var ELEM_LBL = { 'balok': 'BALOK', 'kolom-p': 'KOLOM PERSEGI', 'kolom-l': 'KOLOM LINGKARAN', 'pelat': 'PELAT (SLAB)', 'pilecap': 'PILE CAP' };

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('TULANGAN MINIMUM - ' + ELEM_LBL[r.elem]));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019', dt));
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR("f'c   Mutu beton", numR(r.fc, 1) + ' MPa'));
    L.push(rowR('fy    Mutu tul. utama', numR(r.fy, 0) + ' MPa'));

    if (r.elem === 'balok') {
      L.push(rowR('fyt   Mutu sengkang', numR(r.fyt, 0) + ' MPa'));
      L.push(rowR('bw x h', numR(r.bw, 0) + ' x ' + numR(r.h, 0) + ' mm'));
      L.push(rowR('cc / sengkang / db', numR(r.cc, 0) + ' / O' + r.ds + ' / D' + r.db));
      L.push('');
      L.push(' LENTUR MINIMUM (Ps. 9.6.1.2)');
      L.push(ruleR('-'));
      L.push(rowR('d = h - cc - ds - db/2', numR(r.d, 1) + ' mm'));
      L.push(rowR("0.25*sqrt(f'c)/fy", numR(r.rho1 * 1000, 3) + ' o/oo'));
      L.push(rowR('1.4/fy', numR(r.rho2 * 1000, 3) + ' o/oo'));
      L.push(rowR('rho_min menentukan', numR(r.rhoMin * 100, 3) + ' %'));
      L.push(rowR('As,min = rho*bw*d', numR(r.AsMin, 1) + ' mm2'));
      L.push('');
      L.push(' OUTPUT');
      L.push(ruleR('='));
      L.push(rowR('>> TULANGAN PAKAI', r.n + 'D' + r.db + ' = ' + numR(r.AsProv, 1) + ' mm2'));
      L.push(rowR('Spasi bersih (>= ' + numR(r.sClearMin, 0) + ')', numR(r.sClear, 0) + ' mm ' + (r.sClear >= r.sClearMin ? 'OK' : 'NG')));
      L.push(ruleR('='));
      L.push('');
      L.push(' GESER MINIMUM (Ps. 9.6.3.4)');
      L.push(ruleR('-'));
      L.push(rowR("Av,min/s = maks(0.062sqrt(f'c),0.35)*bw/fyt", ''));
      L.push(rowR('Av,min/s', numR(r.avPerS, 3) + ' mm2/mm'));
      L.push(rowR('Av (O' + r.ds + ', 2 kaki)', numR(r.Av, 1) + ' mm2'));
      L.push(rowR('s <= Av/(Av,min/s)', numR(r.sAv, 0) + ' mm'));
      L.push(rowR('s <= min(d/2, 600)', numR(r.sMaxD, 0) + ' mm'));
      L.push(rowR('>> SENGKANG PAKAI', 'O' + r.ds + '-' + r.sPakai));
    } else if (r.elem === 'kolom-p' || r.elem === 'kolom-l') {
      if (r.elem === 'kolom-p') {
        L.push(rowR('b x h', numR(r.b, 0) + ' x ' + numR(r.h, 0) + ' mm'));
      } else {
        L.push(rowR('D     Diameter kolom', numR(r.D, 0) + ' mm'));
        L.push(rowR('Transversal', r.spiral ? 'Spiral O' + r.dsp + ' (fyt ' + numR(r.fyt, 0) + ' MPa)' : 'Sengkang ikat O' + r.ds));
      }
      L.push(rowR('cc / db', numR(r.cc, 0) + ' / D' + r.db));
      L.push('');
      L.push(' LONGITUDINAL MINIMUM (Ps. 10.6.1.1)');
      L.push(ruleR('-'));
      L.push(rowR('Ag', numR(r.Ag, 0) + ' mm2'));
      L.push(rowR('Ast,min = 0.01*Ag', numR(r.AstMin, 1) + ' mm2'));
      L.push(rowR('Ast,maks = 0.08*Ag', numR(r.AstMax, 0) + ' mm2'));
      L.push(rowR('Jumlah minimum batang', (r.elem === 'kolom-l' ? r.nMin : 4) + ' (Ps. 10.7.3.1)'));
      L.push('');
      L.push(' OUTPUT');
      L.push(ruleR('='));
      L.push(rowR('>> TULANGAN PAKAI', r.n + 'D' + r.db + ' = ' + numR(r.AsProv, 1) + ' mm2'));
      L.push(rowR('rho terpasang', numR(r.rhoProv * 100, 2) + ' %'));
      L.push(rowR('Spasi bersih (>= ' + numR(r.sClearMin, 0) + ')', numR(r.sClear, 0) + ' mm ' + (r.sClear >= r.sClearMin ? 'OK' : 'NG')));
      L.push(ruleR('='));
      L.push('');
      if (r.elem === 'kolom-l' && r.spiral) {
        L.push(' SPIRAL MINIMUM (Ps. 25.7.3)');
        L.push(ruleR('-'));
        L.push(rowR('Dc (inti out-out)', numR(r.Dc, 0) + ' mm'));
        L.push(rowR('Ach', numR(r.Ach, 0) + ' mm2'));
        L.push(rowR("rho_s = 0.45(Ag/Ach-1)f'c/fyt", numR(r.rhoS * 100, 3) + ' %'));
        L.push(rowR('Pitch teoretis', numR(r.sPitch, 1) + ' mm'));
        L.push(rowR('>> SPIRAL PAKAI', 'O' + r.dsp + '-' + r.sPitchPakai));
        L.push(rowR('Pitch bersih (25-75)', numR(r.sPitchClear, 0) + ' mm'));
      } else {
        L.push(' SENGKANG IKAT MINIMUM (Ps. 25.7.2)');
        L.push(ruleR('-'));
        L.push(rowR('O minimum', 'O' + r.tieDia));
        L.push(rowR('s <= min(16db, 48dt, sisi)', numR(r.sTie, 0) + ' mm'));
        L.push(rowR('>> SENGKANG PAKAI', 'O' + r.ds + '-' + r.sTiePakai));
      }
    } else if (r.elem === 'pelat') {
      L.push(rowR('h     Tebal pelat', numR(r.h, 0) + ' mm'));
      L.push(rowR('Sistem', r.dua ? 'Dua arah' : 'Satu arah'));
      L.push(rowR('db', 'D' + r.db));
      L.push('');
      L.push(' MINIMUM (Ps. ' + (r.dua ? '8.6.1.1' : '7.6.1.1') + ' / 24.4.3.2)');
      L.push(ruleR('-'));
      L.push(rowR('rho_min', numR(r.rhoMin * 100, 2) + ' %'));
      L.push(rowR('As,min per meter', numR(r.AsMin, 1) + ' mm2/m'));
      L.push(rowR('Spasi teoretis D' + r.db, numR(r.sTheo, 0) + ' mm'));
      L.push(rowR('Spasi maks min(3h,450)', numR(r.sMax, 0) + ' mm'));
      L.push('');
      L.push(' OUTPUT');
      L.push(ruleR('='));
      L.push(rowR('>> TULANGAN PAKAI', 'D' + r.db + '-' + r.sPakai + ' = ' + numR(r.AsProv, 1) + ' mm2/m'));
      L.push(ruleR('='));
    } else {
      L.push(rowR('h     Tebal pile cap', numR(r.h, 0) + ' mm'));
      L.push(rowR('B x L (denah)', numR(r.B, 0) + ' x ' + numR(r.L, 0) + ' mm'));
      L.push(rowR('cc / db', numR(r.cc, 0) + ' / D' + r.db));
      L.push('');
      L.push(' MINIMUM (Ps. 13.3 -> 7.6.1.1 / 8.6.1.1)');
      L.push(ruleR('-'));
      L.push(rowR('rho_min', numR(r.rhoMin * 100, 2) + ' %'));
      L.push(rowR('As,min per meter/arah', numR(r.AsMin, 1) + ' mm2/m'));
      L.push(rowR('Spasi teoretis D' + r.db, numR(r.sTheo, 0) + ' mm'));
      L.push(rowR('Spasi maks min(3h,450)', numR(r.sMax, 0) + ' mm'));
      L.push('');
      L.push(' OUTPUT');
      L.push(ruleR('='));
      L.push(rowR('>> TULANGAN PAKAI', 'D' + r.db + '-' + r.sPakai + ' = ' + numR(r.AsProv, 1) + ' mm2/m'));
      L.push(rowR('Arah sejajar B (di L)', r.nDirB + ' D' + r.db + ' = ' + numR(r.AsTotB, 0) + ' mm2'));
      L.push(rowR('Arah sejajar L (di B)', r.nDirL + ' D' + r.db + ' = ' + numR(r.AsTotL, 0) + ' mm2'));
      L.push(ruleR('='));
    }

    if (r.warn.length) {
      L.push('');
      L.push(' CATATAN');
      L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Nilai minimum absolut - kebutuhan dari analisis beban');
    L.push(' (As,perlu) hampir selalu menentukan dan dicek terpisah.');
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
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast('Lengkapi material dan dimensi dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Tulangan-Minimum_' + r.elem + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Tulangan Minimum', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

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
