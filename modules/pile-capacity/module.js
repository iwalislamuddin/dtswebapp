/* ============================================================
   Civil Tools — modules/pile-capacity/module.js  (Tier 2, kanvas 2D)
   Daya dukung TIANG TUNGGAL (aksial tekan) — profil tanah BERLAPIS.
     Qu = Qp + Qs          (ujung + selimut)
     Q_izin = Qu / FS      (opsi: dikurangi berat sendiri tiang)

   Metode per-lapis dapat dipilih: STATIK (alpha/beta) atau EMPIRIS (SPT/Meyerhof).
   Ditambah cross-check DECOURT-QUARESMA (bila semua lapis tertanam punya N).

   1. SELIMUT (skin friction)  Qs = sum( keliling * dL * fs )
   ------------------------------------------------------------
     LEMPUNG, metode-alpha (API RP2A / tegangan total):
        psi = cu / sigma'v ;  alpha = 0.5*psi^-0.5 (psi<=1) atau 0.5*psi^-0.25 (psi>1), <=1
        fs = alpha * cu
     PASIR, metode-beta (tegangan efektif, Burland):
        K = cK*(1-sin phi) ;  delta = cDelta*phi
        fs = K * sigma'v * tan(delta)      (cK: bor 1.0 / pancang 1.4; cDelta: beton 0.8 / baja 0.6)
     SPT (Meyerhof, keduanya):  fs = nf * N  (nf: pancang 2 / bor 1)  [kPa]

   2. UJUNG (end bearing)  Qp = Ap * qp   (di lapis tempat ujung tiang berada)
   ------------------------------------------------------------
     LEMPUNG (statik):  qp = 9 * cu
     PASIR  (statik):   qp = sigma'v * Nq ,  Nq = e^(pi tan phi) tan^2(45+phi/2)
                        batas Meyerhof ql = 0.5 * pa * Nq * tan phi  (pa=100 kPa)
     SPT (Meyerhof):    qp = 40 * N * (L/D) <= 400*N (pasir) / 300*N (lempung/lanau) [kPa]

   3. DECOURT-QUARESMA (cross-check, butuh N di seluruh lapis tertanam)
   ------------------------------------------------------------
     Selimut: fs = 10*(Ns/3 + 1) kPa (Ns rata-rata sepanjang tiang)
     Ujung:   qp = C * Np ;  C = lempung 120 / pasir 400 kPa (Np ~ N di ujung)

   TIDAK termasuk: efisiensi KELOMPOK tiang, gesekan negatif (downdrag),
   beban lateral & cabut (uplift/tension), tekuk, penurunan tiang. Beban gempa.
   Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'pile-capacity';

  var GW = 9.81;                 // berat isi air (kN/m3)
  var PA = 100;                  // tekanan atmosfer (kPa)
  var FS_CAP = 120;              // batas lunak fs (kPa) — beri peringatan bila tercapai
  function D2R(d) { return d * Math.PI / 180; }

  var state = {};
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function defaultLayers() {
    return [
      { soil: 'clay', H: 4, gamma: 17, cu: 40, phi: 0, N: 6, method: 'static' },
      { soil: 'sand', H: 6, gamma: 18, cu: 0, phi: 32, N: 18, method: 'static' },
      { soil: 'sand', H: 8, gamma: 19, cu: 0, phi: 36, N: 35, method: 'static' }
    ];
  }

  /* ---------- Tegangan efektif vertikal di kedalaman z ---------- */
  function sigmaEffAt(z, layers, Dw) {
    var s = 0, zc = 0;
    for (var i = 0; i < layers.length; i++) {
      var top = zc, bot = zc + layers[i].H;
      if (z <= top) break;
      var b = Math.min(z, bot), a = top;
      // bagian di atas MAT (γ total)
      if (Dw > a) {
        var upTo = Math.min(b, Dw);
        s += layers[i].gamma * (upTo - a);
        a = upTo;
      }
      // bagian di bawah MAT (γ' = γ − γw)
      if (b > a) s += (layers[i].gamma - GW) * (b - a);
      zc = bot;
      if (z <= bot) break;
    }
    return s;
  }

  function prandtlNq(phiDeg) {
    var p = D2R(phiDeg);
    return Math.exp(Math.PI * Math.tan(p)) * Math.pow(Math.tan(Math.PI / 4 + p / 2), 2);
  }

  /* ---------- COMPUTE ---------- */
  function compute(g, layers) {
    var r = { warn: [], valid: false };
    var shape = g.shape || 'circular';
    var D = num(g.D), L = num(g.L), FS = num(g.FS), Dw = num(g.Dw);
    var ptype = g.ptype || 'driven', material = g.material || 'concrete';
    var inclW = String(g.inclW) === 'yes';

    if (!(D > 0)) { r.warn.push('Diameter/sisi tiang D harus > 0.'); return r; }
    if (!(L > 0)) { r.warn.push('Panjang tertanam L harus > 0.'); return r; }
    if (!(FS > 0)) { FS = 2.5; r.warn.push('FS tidak valid — dipakai 2,5.'); }
    if (Dw < 0) Dw = 0;
    if (!layers || !layers.length) { r.warn.push('Tambahkan minimal satu lapis tanah.'); return r; }

    // geometri penampang
    var perim, Ap;
    if (shape === 'square') { perim = 4 * D; Ap = D * D; }
    else { perim = Math.PI * D; Ap = Math.PI * D * D / 4; }

    // total kedalaman profil
    var totalH = 0; for (var k = 0; k < layers.length; k++) totalH += layers[k].H;
    var Leff = L;
    if (L > totalH + 1e-6) {
      Leff = totalH;
      r.warn.push('Panjang tiang L=' + L.toFixed(1) + ' m melebihi total profil tanah ' + totalH.toFixed(1) + ' m — ujung dianggap di dasar profil (' + totalH.toFixed(1) + ' m). Tambahkan lapis di bawah ujung.');
    }

    // koefisien beta
    var cK = (ptype === 'bored') ? 1.0 : 1.4;
    var cDelta = (material === 'steel') ? 0.6 : 0.8;
    var nfSPT = (ptype === 'bored') ? 1.0 : 2.0;

    /* ---- Selimut per lapis (dalam zona tertanam) ---- */
    var segs = [], Qs = 0, zc = 0, capHit = false;
    for (var i = 0; i < layers.length; i++) {
      var Ly = layers[i];
      var top = zc, bot = zc + Ly.H; zc = bot;
      if (top >= Leff - 1e-9) continue;
      var segTop = top, segBot = Math.min(bot, Leff);
      var dL = segBot - segTop;
      if (dL <= 1e-9) continue;
      var zmid = (segTop + segBot) / 2;
      var sv = sigmaEffAt(zmid, layers, Dw); if (sv < 1) sv = 1;
      var fs = 0, how = '';
      if (Ly.method === 'spt') {
        fs = nfSPT * num(Ly.N);
        how = 'SPT ' + nfSPT.toFixed(0) + 'N';
      } else if (Ly.soil === 'clay') {
        var cu = num(Ly.cu);
        var psi = cu / sv;
        var alpha = (psi <= 1) ? 0.5 * Math.pow(psi, -0.5) : 0.5 * Math.pow(psi, -0.25);
        if (alpha > 1) alpha = 1;
        fs = alpha * cu;
        how = 'alpha=' + alpha.toFixed(2);
      } else {
        var phi = num(Ly.phi);
        var K = cK * (1 - Math.sin(D2R(phi)));
        var delta = cDelta * phi;
        fs = K * sv * Math.tan(D2R(delta));
        how = 'beta K=' + K.toFixed(2) + ',d=' + delta.toFixed(0);
      }
      if (fs > FS_CAP) { fs = FS_CAP; capHit = true; }
      if (fs < 0) fs = 0;
      var Qsi = perim * dL * fs;
      Qs += Qsi;
      segs.push({ idx: i + 1, soil: Ly.soil, method: Ly.method, top: segTop, bot: segBot, dL: dL, sv: sv, fs: fs, Qs: Qsi, how: how });
    }
    if (capHit) r.warn.push('Sebagian fs dibatasi ke ' + FS_CAP + ' kPa (batas lunak konservatif) — periksa parameter kekuatan/pilih metode lain bila perlu.');

    /* ---- Ujung: cari lapis tempat ujung tiang ---- */
    var tipLayer = null, zc2 = 0, tipDepthInProfile = Math.min(Leff, totalH);
    for (var j = 0; j < layers.length; j++) {
      var t2 = zc2, b2 = zc2 + layers[j].H; zc2 = b2;
      if (tipDepthInProfile <= b2 + 1e-9) { tipLayer = layers[j]; break; }
    }
    if (!tipLayer) tipLayer = layers[layers.length - 1];

    var svTip = sigmaEffAt(Leff, layers, Dw);
    var qp = 0, qpHow = '', Nq = null, ql = null;
    if (tipLayer.method === 'spt') {
      var Ntip = num(tipLayer.N);
      var qpr = 40 * Ntip * (Leff / D);
      var cap = (tipLayer.soil === 'sand' ? 400 : 300) * Ntip;
      qp = Math.min(qpr, cap);
      qpHow = 'SPT 40N*L/D<=' + (tipLayer.soil === 'sand' ? '400' : '300') + 'N';
    } else if (tipLayer.soil === 'clay') {
      qp = 9 * num(tipLayer.cu);
      qpHow = '9*cu';
    } else {
      var phiT = num(tipLayer.phi);
      Nq = prandtlNq(phiT);
      var qpRaw = svTip * Nq;
      ql = 0.5 * PA * Nq * Math.tan(D2R(phiT));
      qp = Math.min(qpRaw, ql);
      qpHow = "sigma'v*Nq<=ql";
    }
    if (qp < 0) qp = 0;
    var Qp = Ap * qp;

    var Qu = Qp + Qs;
    // berat sendiri tiang (opsional)
    var gammaPile = 24;                       // beton (kN/m3)
    var Wp = Ap * Leff * gammaPile;
    var Qallow = Qu / FS - (inclW ? Wp : 0);

    /* ---- Decourt-Quaresma (cross-check) ---- */
    var dq = { active: false };
    var allN = true, sumN = 0, sumL = 0;
    for (var m = 0; m < segs.length; m++) {
      var Nl = num(layers[segs[m].idx - 1].N);
      if (!(Nl > 0)) { allN = false; break; }
      sumN += Nl * segs[m].dL; sumL += segs[m].dL;
    }
    var Ntip2 = num(tipLayer.N);
    if (allN && sumL > 0 && Ntip2 > 0) {
      var NsAvg = sumN / sumL;
      var fsDq = 10 * (NsAvg / 3 + 1);
      var QsDq = perim * Leff * fsDq;
      var Cdq = (tipLayer.soil === 'sand') ? 400 : 120;
      var qpDq = Cdq * Ntip2;
      var QpDq = Ap * qpDq;
      var QuDq = QpDq + QsDq;
      dq = {
        active: true, NsAvg: NsAvg, fsDq: fsDq, QsDq: QsDq, C: Cdq, Np: Ntip2,
        qpDq: qpDq, QpDq: QpDq, QuDq: QuDq, Qallow: QuDq / FS - (inclW ? Wp : 0)
      };
    }

    r.valid = true;
    r.shape = shape; r.D = D; r.L = L; r.Leff = Leff; r.FS = FS; r.Dw = Dw;
    r.ptype = ptype; r.material = material; r.inclW = inclW; r.Wp = Wp;
    r.perim = perim; r.Ap = Ap; r.totalH = totalH;
    r.cK = cK; r.cDelta = cDelta; r.nfSPT = nfSPT;
    r.segs = segs; r.Qs = Qs;
    r.tipLayer = tipLayer; r.svTip = svTip; r.qp = qp; r.qpHow = qpHow; r.Nq = Nq; r.ql = ql; r.Qp = Qp;
    r.Qu = Qu; r.Qallow = Qallow; r.dq = dq;
    r.layers = layers;

    /* ---- Peringatan ---- */
    if (Leff / D < 4) r.warn.push('L/D = ' + (Leff / D).toFixed(1) + ' < 4 — tiang pendek; qp lempung (Nc=9) & rumus tiang panjang mungkin tidak berlaku (cek daya dukung dangkal).');
    if (Dw >= totalH) r.warn.push('MAT (' + Dw.toFixed(1) + ' m) di bawah profil — dihitung tanpa pengaruh air (tegangan efektif = total).');
    r.warn.push('Berat sendiri tiang ' + (inclW ? 'DIKURANGKAN' : 'diabaikan') + ' dari Q_izin (Wp = ' + Wp.toFixed(0) + ' kN, γ beton 24 kN/m³).');
    if (dq.active) r.warn.push('Decourt-Quaresma ditampilkan sebagai pembanding empiris (faktor α,β=1,0). Selisih dengan metode statik/Meyerhof adalah wajar — gunakan penilaian teknik.');
    else r.warn.push('Decourt-Quaresma dilewati — isi N-SPT (>0) pada SEMUA lapis tertanam untuk pembanding empiris.');
    r.warn.push('Analisis TIANG TUNGGAL. TIDAK termasuk: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan tiang, beban gempa.');

    return r;
  }

  function shapeName(s) { return s === 'square' ? 'Persegi (pancang)' : 'Lingkaran (bor/spun)'; }
  function soilName(s) { return s === 'clay' ? 'Lempung' : 'Pasir'; }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('pc-style')) return;
    var s = document.createElement('style');
    s.id = 'pc-style';
    s.textContent =
      '.pc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.pc-canvas{position:relative;flex:1 1 52%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.pc-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}' +
      '.pc-layers{display:flex;flex-direction:column;gap:10px}' +
      '.pc-layer{border:1px solid var(--line);border-radius:9px;padding:9px 10px;background:var(--bg)}' +
      '.pc-lh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}' +
      '.pc-lh span{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-dim)}' +
      '.pc-del{background:transparent;border:1px solid var(--line);color:var(--ink-faint);border-radius:5px;width:22px;height:22px;cursor:pointer;line-height:1;font-size:12px}' +
      '.pc-del:hover{border-color:var(--bad);color:var(--bad)}' +
      '.pc-row{display:flex;gap:7px;margin-bottom:7px}' +
      '.pc-row:last-child{margin-bottom:0}' +
      '.pc-f{flex:1;min-width:0}' +
      '.pc-cap{font-size:9px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;display:block;font-family:"JetBrains Mono",monospace}' +
      '.pc-f .ck-input,.pc-f .ck-select{padding:6px 7px;font-size:12px;width:100%}' +
      '.pc-add{margin-top:12px}';
    document.head.appendChild(s);
  }

  /* ---------- Layer editor ---------- */
  function renderLayers() {
    var UI = state.UI, host = state.layersHost;
    host.innerHTML = '';
    state.layers.forEach(function (Ly, i) {
      var card = UI.el('div', 'pc-layer');
      var head = UI.el('div', 'pc-lh');
      head.appendChild(UI.el('span', null, 'Lapis ' + (i + 1)));
      var del = UI.el('button', 'pc-del', '✕'); del.type = 'button';
      del.title = 'Hapus lapis';
      del.addEventListener('click', function () {
        if (state.layers.length <= 1) { UI.toast('Minimal satu lapis', 'bad'); return; }
        state.layers.splice(i, 1); renderLayers(); recompute();
      });
      head.appendChild(del);
      card.appendChild(head);

      // Baris 1: jenis | tebal | gamma
      var r1 = UI.el('div', 'pc-row');
      r1.appendChild(field('Jenis', selectEl(['clay', 'sand'], ['Lempung', 'Pasir'], Ly.soil, function (v) {
        Ly.soil = v; renderLayers(); recompute();
      })));
      r1.appendChild(field('Tebal (m)', inputEl(Ly.H, 0.1, function (v) { Ly.H = v; recompute(); })));
      r1.appendChild(field('γ (kN/m³)', inputEl(Ly.gamma, 0.5, function (v) { Ly.gamma = v; recompute(); })));
      card.appendChild(r1);

      // Baris 2: cu/phi | N | metode
      var r2 = UI.el('div', 'pc-row');
      if (Ly.soil === 'clay') {
        r2.appendChild(field('cu (kPa)', inputEl(Ly.cu, 1, function (v) { Ly.cu = v; recompute(); })));
      } else {
        r2.appendChild(field('φ (deg)', inputEl(Ly.phi, 1, function (v) { Ly.phi = v; recompute(); })));
      }
      r2.appendChild(field('N-SPT', inputEl(Ly.N, 1, function (v) { Ly.N = v; recompute(); })));
      r2.appendChild(field('Metode', selectEl(['static', 'spt'], ['Statik (α/β)', 'SPT'], Ly.method, function (v) {
        Ly.method = v; recompute();
      })));
      card.appendChild(r2);

      host.appendChild(card);
    });

    function field(cap, node) {
      var f = UI.el('div', 'pc-f');
      f.appendChild(UI.el('span', 'pc-cap', cap));
      f.appendChild(node);
      return f;
    }
    function inputEl(val, step, onCh) {
      var inp = UI.el('input', 'ck-input'); inp.type = 'number'; inp.step = step; inp.value = val;
      inp.addEventListener('input', function () { onCh(parseFloat(inp.value) || 0); });
      return inp;
    }
    function selectEl(vals, labels, cur, onCh) {
      var sel = UI.el('select', 'ck-select');
      vals.forEach(function (v, k) {
        var o = UI.el('option'); o.value = v; o.textContent = labels[k];
        if (v === cur) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', function () { onCh(sel.value); });
      return sel;
    }
  }

  function recompute() { if (state.form) update(state.form.getValues(), state.results); }

  /* ---------- Render ---------- */
  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout wide-form');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Daya Dukung Tiang Tunggal'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas aksial tekan tiang tunggal pada profil tanah BERLAPIS. Qu = Qp (ujung) + Qs (selimut); Q_izin = Qu/FS. Metode per-lapis: statik (α lempung / β pasir) atau SPT (Meyerhof). Pembanding empiris Decourt-Quaresma.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'pc-work');
    var canvasHost = UI.el('div', 'pc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Profil tanah & tiang');
    var results = UI.el('div', 'pc-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Geometri & Jenis Tiang' },
      { type: 'select', id: 'shape', label: 'Bentuk penampang', value: 'circular',
        options: [{ value: 'circular', label: 'Lingkaran (bor/spun)' }, { value: 'square', label: 'Persegi (pancang)' }] },
      { type: 'number', id: 'D', label: 'D — diameter / sisi', unit: 'm', value: 0.4, min: 0.1, step: 0.05 },
      { type: 'number', id: 'L', label: 'L — panjang tertanam', unit: 'm', value: 12, min: 0.5, step: 0.5, hint: 'Dari permukaan tanah ke ujung tiang.' },
      { type: 'segment', id: 'ptype', label: 'Tipe pemasangan', value: 'driven',
        options: [{ value: 'driven', label: 'Pancang' }, { value: 'bored', label: 'Bor' }] },
      { type: 'select', id: 'material', label: 'Material tiang', value: 'concrete',
        options: [{ value: 'concrete', label: 'Beton (δ=0,8φ)' }, { value: 'steel', label: 'Baja (δ=0,6φ)' }],
        hint: 'Mempengaruhi δ pada metode-β (pasir).' },

      { type: 'group', label: 'Air Tanah & Keamanan' },
      { type: 'number', id: 'Dw', label: 'Muka air tanah (dari permukaan)', unit: 'm', value: 2, min: 0, step: 0.5, hint: 'Besar (≥ profil) = tanpa air. Di bawah MAT: γ′ = γ − 9,81.' },
      { type: 'number', id: 'FS', label: 'FS — angka keamanan', unit: '', value: 2.5, min: 1, step: 0.5, hint: 'SNI 8460: 2,5–3 (atau FS terpisah selimut/ujung).' },
      { type: 'segment', id: 'inclW', label: 'Berat sendiri tiang', value: 'no',
        options: [{ value: 'no', label: 'Abaikan' }, { value: 'yes', label: 'Kurangi' }] }
    ];

    var form = UI.buildForm(panel, schema, function (vals) { update(vals, results); });
    state.form = form;
    state.results = results;

    // Editor lapis tanah (kustom)
    var grp = UI.el('div', 'ck-grp');
    grp.appendChild(UI.el('h4', null, 'Profil Tanah Berlapis (atas → bawah)'));
    state.layersHost = UI.el('div', 'pc-layers');
    grp.appendChild(state.layersHost);
    var addBtn = UI.el('button', 'ck-btn ghost pc-add', '＋ Tambah lapis');
    addBtn.type = 'button';
    addBtn.addEventListener('click', function () {
      var last = state.layers[state.layers.length - 1] || { soil: 'sand', gamma: 18 };
      state.layers.push({ soil: last.soil, H: 3, gamma: last.gamma, cu: 40, phi: 30, N: 15, method: 'static' });
      renderLayers(); recompute();
    });
    grp.appendChild(addBtn);
    panel.appendChild(grp);

    // Laporan
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

    renderLayers();
    update(form.getValues(), results);
  }

  /* ---------- Update panel hasil ---------- */
  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals, state.layers);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Profil tanah & tiang');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri tiang & profil tanah untuk menghitung daya dukung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }

    state.cap.set(shapeName(r.shape).split(' ')[0] + ' D=' + r.D + ' m · L=' + r.Leff + ' m · Q_izin ' + UI.fmt(r.Qallow, 0) + ' kN');

    // Hero — Q izin
    var hero = UI.el('div', 'ck-hero');
    hero.appendChild(UI.el('div', 'k', 'Beban izin aksial Q_izin = Qu / FS' + (r.inclW ? ' − Wp' : '')));
    var vrow = UI.el('div'); vrow.style.cssText = 'display:flex; align-items:baseline; gap:24px; flex-wrap:wrap';
    vrow.appendChild(UI.el('div', 'v', UI.fmt(r.Qallow, 0) + ' <small>kN</small>'));
    var v2 = UI.el('div'); v2.style.cssText = "font-family:'JetBrains Mono',monospace; color:var(--ink-dim)";
    v2.innerHTML = '<div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase">Qu = Qp + Qs</div>' +
      '<div style="font-size:16px;font-weight:700;line-height:1.15;color:var(--ink)">' +
      UI.fmt(r.Qu, 0) + ' <small style="font-size:12px;font-weight:500;color:var(--ink-dim)">kN (FS ' + r.FS + ')</small></div>';
    vrow.appendChild(v2); hero.appendChild(vrow);
    results.appendChild(hero);

    results.appendChild(UI.el('div', 'ck-empty',
      'Qp = tahanan ujung · Qs = tahanan selimut · Qu = ultimit · Q_izin = beban kerja izin.'));

    // Ringkas kapasitas
    results.appendChild(UI.rhead('Kapasitas'));
    results.appendChild(UI.kv('Qs — selimut (skin friction)', UI.fmt(r.Qs, 1) + ' kN'));
    results.appendChild(UI.kv('Qp — ujung (end bearing)', UI.fmt(r.Qp, 1) + ' kN'));
    results.appendChild(UI.kv('Qu = Qp + Qs (ultimit)', UI.fmt(r.Qu, 1) + ' kN', 'ok'));
    if (r.inclW) results.appendChild(UI.kv('Wp — berat sendiri tiang', UI.fmt(r.Wp, 1) + ' kN'));
    results.appendChild(UI.kv('Q_izin = Qu/FS' + (r.inclW ? ' − Wp' : ''), UI.fmt(r.Qallow, 1) + ' kN', 'ok'));

    // Geometri
    results.appendChild(UI.rhead('Geometri tiang'));
    results.appendChild(UI.kv('Bentuk · pemasangan', shapeName(r.shape).split(' ')[0] + ' · ' + (r.ptype === 'bored' ? 'bor' : 'pancang')));
    results.appendChild(UI.kv('Keliling / luas ujung Ap', UI.fmt(r.perim, 3) + ' m / ' + UI.fmt(r.Ap, 4) + ' m²'));
    results.appendChild(UI.kv('L tertanam / (L/D)', UI.fmt(r.Leff, 2) + ' m / ' + (r.Leff / r.D).toFixed(1)));

    // Ujung
    results.appendChild(UI.rhead('Tahanan ujung (lapis ujung)'));
    results.appendChild(UI.kv('Lapis ujung', soilName(r.tipLayer.soil) + ' · ' + (r.tipLayer.method === 'spt' ? 'SPT' : 'statik')));
    results.appendChild(UI.kv("σ'v di ujung", UI.fmt(r.svTip, 1) + ' kPa'));
    if (r.Nq != null) results.appendChild(UI.kv('Nq / ql (batas)', r.Nq.toFixed(1) + ' / ' + UI.fmt(r.ql, 0) + ' kPa'));
    results.appendChild(UI.kv('qp — daya dukung ujung', UI.fmt(r.qp, 1) + ' kPa (' + r.qpHow + ')'));
    results.appendChild(UI.kv('Qp = Ap·qp', UI.fmt(r.Qp, 1) + ' kN', 'ok'));

    // Selimut per lapis
    results.appendChild(UI.rhead('Tahanan selimut per lapis'));
    r.segs.forEach(function (s) {
      results.appendChild(UI.kv(
        'L' + s.idx + ' ' + soilName(s.soil) + ' (' + s.top.toFixed(1) + '–' + s.bot.toFixed(1) + ' m)',
        'fs ' + UI.fmt(s.fs, 1) + ' kPa · Qs ' + UI.fmt(s.Qs, 0) + ' kN'));
    });
    results.appendChild(UI.kv('ΣQs — total selimut', UI.fmt(r.Qs, 1) + ' kN', 'ok'));

    // Decourt-Quaresma
    if (r.dq.active) {
      var d = r.dq;
      results.appendChild(UI.rhead('Pembanding — Decourt-Quaresma (SPT)'));
      results.appendChild(UI.kv('N rata-rata selimut', d.NsAvg.toFixed(1)));
      results.appendChild(UI.kv('fs = 10(N/3+1)', UI.fmt(d.fsDq, 1) + ' kPa → Qs ' + UI.fmt(d.QsDq, 0) + ' kN'));
      results.appendChild(UI.kv('qp = C·Np (C=' + d.C + ', Np=' + d.Np.toFixed(0) + ')', UI.fmt(d.qpDq, 0) + ' kPa → Qp ' + UI.fmt(d.QpDq, 0) + ' kN'));
      results.appendChild(UI.kv('Qu (Decourt) / Q_izin', UI.fmt(d.QuDq, 0) + ' / ' + UI.fmt(d.Qallow, 0) + ' kN'));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      '<b>Selimut</b>: lempung metode-α (API RP2A, fs=α·cu); pasir metode-β (fs=K·σ′v·tanδ, K=cK(1−sinφ), δ=cDelta·φ); SPT Meyerhof (fs=nf·N). ' +
      '<b>Ujung</b>: lempung qp=9·cu; pasir qp=σ′v·Nq≤ql (Meyerhof); SPT qp=40N·L/D≤400N. ' +
      '<b>Decourt-Quaresma</b>: fs=10(N/3+1), qp=C·Np — pembanding empiris. ' +
      '<b>TIDAK termasuk</b>: efisiensi kelompok, gesekan negatif, beban lateral/cabut, penurunan, gempa. ' +
      'Verifikasi oleh insinyur penanggung jawab (mis. SNI 8460:2017).'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result, faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi data untuk melihat profil tanah & tiang.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.56, w - 200);
    drawProfile(ctx, 0, 0, splitX, h, r);
    drawBars(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'Q_izin ' + state.UI.fmt(r.Qallow, 0) + ' kN'
      });
    }
  }

  function drawProfile(ctx, ox, oy, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), amber = css('--amber'), sage = css('--sage') || dim, sky = css('--sky') || dim;
    // padT >= 34: JANGAN gambar teks/panah di y < ~34 (pita .cap top:12px menempati
    // band ~0-28px & membentang sampai 58% lebar; cx tiang ada di dalam rentang itu).
    var padT = 64, padB = 30, padS = 40;
    var Wpx = w - 2 * padS, Hpx = h - padT - padB;

    var zBottom = Math.max(r.totalH, r.Leff);
    var yspan = zBottom * 1.02;
    var sc = Hpx / yspan;
    var Dpx = Math.max(10, Math.min(r.D * sc, Wpx * 0.28));
    var cx = ox + w * 0.44;                       // sumbu tiang agak ke kiri (ruang label kanan)
    var ySurf = oy + padT;
    function Y(d) { return ySurf + d * sc; }

    var xLeft = ox + padS, xRight = ox + w - padS;

    // lapisan tanah
    var zc = 0;
    r.layers.forEach(function (Ly, i) {
      var yT = Y(zc), yB = Y(zc + Ly.H); zc += Ly.H;
      var isClay = Ly.soil === 'clay';
      ctx.save();
      ctx.fillStyle = isClay ? sage : faint;
      ctx.globalAlpha = isClay ? 0.20 : 0.13;
      ctx.fillRect(xLeft, yT, xRight - xLeft, yB - yT);
      ctx.globalAlpha = 1;
      // batas lapis
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xLeft, yB); ctx.lineTo(xRight, yB); ctx.stroke();
      // arsir/tekstur
      ctx.globalAlpha = 0.35; ctx.strokeStyle = isClay ? sage : faint; ctx.lineWidth = 1;
      if (isClay) {
        for (var yy = yT + 6; yy < yB; yy += 8) { ctx.beginPath(); ctx.moveTo(xLeft, yy); ctx.lineTo(xRight, yy); ctx.stroke(); }
      } else {
        ctx.fillStyle = faint;
        for (var gy = yT + 5; gy < yB; gy += 7) for (var gx = xLeft + 5; gx < xRight; gx += 9) { ctx.beginPath(); ctx.arc(gx, gy, 0.7, 0, 6.28); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      // label lapis
      ctx.fillStyle = isClay ? sage : dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      var lbl = 'L' + (i + 1) + ' ' + (isClay ? 'Lempung cu' + num(Ly.cu) : 'Pasir φ' + num(Ly.phi));
      ctx.fillText(lbl, xLeft + 4, yT + 12);
      ctx.restore();
    });

    // permukaan tanah
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xLeft, ySurf); ctx.lineTo(xRight, ySurf); ctx.stroke();
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    for (var xx = xLeft; xx < xRight; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, ySurf); ctx.lineTo(xx - 6, ySurf - 6); ctx.stroke(); }

    // muka air tanah
    if (r.Dw < zBottom) {
      var yW = Y(r.Dw);
      ctx.save(); ctx.strokeStyle = sky; ctx.fillStyle = sky; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(xLeft, yW); ctx.lineTo(xRight, yW); ctx.stroke();
      // simbol segitiga
      ctx.beginPath(); ctx.moveTo(xRight - 22, yW); ctx.lineTo(xRight - 16, yW); ctx.lineTo(xRight - 19, yW + 5); ctx.closePath(); ctx.fill();
      ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText('MAT', xRight - 26, yW - 2); ctx.restore();
    }

    // tiang
    var yTip = Y(r.Leff);
    ctx.save();
    ctx.fillStyle = ink; ctx.globalAlpha = 0.9;
    ctx.fillRect(cx - Dpx / 2, ySurf - 8, Dpx, yTip - ySurf + 8);
    ctx.globalAlpha = 1;
    // ujung tiang (baji kecil untuk pancang)
    ctx.restore();

    // panah selimut (fs) di sepanjang tiang
    var fsMax = 1; r.segs.forEach(function (s) { fsMax = Math.max(fsMax, s.fs); });
    ctx.save();
    r.segs.forEach(function (s) {
      var yA = Y(s.top), yB2 = Y(s.bot);
      var nArr = Math.max(1, Math.round((yB2 - yA) / 22));
      var frac = s.fs / fsMax;
      var len = 8 + frac * 26;
      ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
      for (var a = 0; a < nArr; a++) {
        var yy = yA + (yB2 - yA) * (a + 0.5) / nArr;
        // kiri: panah menuju tiang (dari kiri ke kanan)
        var xs = cx - Dpx / 2 - len, xe = cx - Dpx / 2 - 2;
        ctx.beginPath(); ctx.moveTo(xs, yy); ctx.lineTo(xe, yy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe, yy); ctx.lineTo(xe - 5, yy - 3); ctx.lineTo(xe - 5, yy + 3); ctx.closePath(); ctx.fill();
        // kanan
        var xs2 = cx + Dpx / 2 + len, xe2 = cx + Dpx / 2 + 2;
        ctx.beginPath(); ctx.moveTo(xs2, yy); ctx.lineTo(xe2, yy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe2, yy); ctx.lineTo(xe2 + 5, yy - 3); ctx.lineTo(xe2 + 5, yy + 3); ctx.closePath(); ctx.fill();
      }
    });
    ctx.globalAlpha = 1; ctx.restore();

    // tahanan ujung (panah ke atas di bawah ujung)
    ctx.save();
    ctx.strokeStyle = sky; ctx.fillStyle = sky; ctx.lineWidth = 2;
    var yq = yTip + 26;
    ctx.beginPath(); ctx.moveTo(cx, yq); ctx.lineTo(cx, yTip + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 5, yTip + 11); ctx.lineTo(cx, yTip + 3); ctx.lineTo(cx + 5, yTip + 11); ctx.closePath(); ctx.fill();
    ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('qp', cx, yq + 10); ctx.restore();

    // beban di kepala tiang (seluruhnya di bawah pita .cap: panah y=[36..54], teks y=47)
    ctx.save(); ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, ySurf - 28); ctx.lineTo(cx, ySurf - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 4, ySurf - 17); ctx.lineTo(cx, ySurf - 9); ctx.lineTo(cx + 4, ySurf - 17); ctx.closePath(); ctx.fill();
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Q ' + state.UI.fmt(r.Qallow, 0) + ' kN', cx + 7, ySurf - 17); ctx.restore();

    // dimensi L (kanan) & D (di KIRI kepala tiang, di bawah pita .cap)
    dimVert(ctx, xRight - 6, ySurf, yTip, faint, 'L ' + r.Leff + ' m');
    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText('D ' + r.D + ' m', cx - Dpx / 2 - 6, ySurf - 3);
  }

  // Panel kanan: bar Qs/Qp/Qu + Decourt
  function drawBars(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var sage = css('--sage') || dim, sky = css('--sky') || dim, ink = css('--ink');
    var padL = 56, padR = 22, padT = 44, padB = 40;
    var gx0 = ox + padL, gx1 = ox + w - padR, gy0 = oy + padT, gy1 = oy + h - padB;

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KAPASITAS (kN)', gx0 - 4, oy + 22);

    var rows = [
      { lbl: 'Qs', val: r.Qs, col: amber, kind: 'skin' },
      { lbl: 'Qp', val: r.Qp, col: sky, kind: 'tip' },
      { lbl: 'Qu', val: r.Qu, col: amber, kind: 'stack', pri: true },
      { lbl: 'Q_izin', val: r.Qallow, col: sage, kind: 'allow' }
    ];
    if (r.dq.active) rows.push({ lbl: 'Qu·DQ', val: r.dq.QuDq, col: dim, kind: 'dq' });

    var vMax = 0; rows.forEach(function (o) { vMax = Math.max(vMax, o.val); });
    vMax = vMax * 1.15 || 1;
    function BX(v) { return gx0 + (gx1 - gx0) * Math.min(Math.max(v, 0) / vMax, 1); }

    var n = rows.length, gap = 13;
    var rowH = (gy1 - gy0 - gap * (n - 1)) / n;
    var bh = Math.min(28, rowH);
    rows.forEach(function (o, i) {
      var y = gy0 + i * (rowH + gap);
      ctx.fillStyle = line; ctx.globalAlpha = 0.4; ctx.fillRect(gx0, y, gx1 - gx0, bh); ctx.globalAlpha = 1;
      if (o.kind === 'stack' && r.Qu > 0) {
        // Qu = Qs (amber) + Qp (sky) tersusun
        ctx.fillStyle = amber; ctx.globalAlpha = 0.9; ctx.fillRect(gx0, y, BX(r.Qs) - gx0, bh);
        ctx.fillStyle = sky; ctx.globalAlpha = 0.85; ctx.fillRect(BX(r.Qs), y, BX(o.val) - BX(r.Qs), bh);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = o.col; ctx.globalAlpha = o.pri ? 0.95 : 0.7;
        ctx.fillRect(gx0, y, BX(o.val) - gx0, bh); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = o.pri ? amber : dim; ctx.font = (o.pri ? 'bold ' : '') + '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(o.lbl, gx0 - 6, y + bh / 2 + 3);
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(o.val.toFixed(0), BX(o.val) + 5, y + bh / 2 + 3);
    });

    // legenda tumpuk Qu
    var yL = gy1 + 14;
    ctx.fillStyle = amber; ctx.fillRect(gx0, yL - 7, 10, 8);
    ctx.fillStyle = sky; ctx.fillRect(gx0 + 52, yL - 7, 10, 8);
    ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Qs selimut', gx0 + 13, yL);
    ctx.fillText('Qp ujung', gx0 + 65, yL);

    // FS note
    var yb = oy + h - 6;
    ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = faint;
    ctx.fillText('FS = ' + r.FS + (r.dq.active ? ' · DQ = Decourt-Quaresma' : ''), gx0 - 4, yb);
  }

  function dimVert(ctx, x, y1, y2, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    [[y1, 1], [y2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(x, a[0]); ctx.lineTo(x - 3, a[0] + a[1] * 6); ctx.lineTo(x + 3, a[0] + a[1] * 6); ctx.closePath(); ctx.fill();
    });
    if (!label) return;
    ctx.save(); ctx.translate(x - 9, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2);
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
      .replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/Ω/g, 'Omega').replace(/·/g, '*')
      .replace(/μ/g, 'mu').replace(/σ/g, 'sigma').replace(/Δ/g, 'd').replace(/Σ/g, 'sum').replace(/α/g, 'alpha')
      .replace(/β/g, 'beta').replace(/δ/g, 'delta').replace(/₀/g, '0').replace(/²/g, '2').replace(/³/g, '3')
      .replace(/⁴/g, '4').replace(/½/g, '0.5').replace(/√/g, 'sqrt').replace(/×/g, 'x').replace(/′/g, "'")
      .replace(/’/g, "'").replace(/°/g, 'deg').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≈/g, '~')
      .replace(/→/g, '->').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('DAYA DUKUNG TIANG TUNGGAL (AKSIAL)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Metode statik (alpha/beta) + SPT + Decourt', dt));
    L.push('');
    L.push(' GEOMETRI & JENIS TIANG');
    L.push(ruleR('-'));
    L.push(rowR('Bentuk', tolatin(shapeName(r.shape))));
    L.push(rowR('Pemasangan / material', (r.ptype === 'bored' ? 'bor' : 'pancang') + ' / ' + r.material));
    L.push(rowR('D (diameter/sisi)', numR(r.D, 2) + ' m'));
    L.push(rowR('L tertanam / (L/D)', numR(r.Leff, 2) + ' m / ' + numR(r.Leff / r.D, 1)));
    L.push(rowR('Keliling / Ap', numR(r.perim, 3) + ' m / ' + numR(r.Ap, 4) + ' m2'));
    L.push(rowR('MAT / FS', numR(r.Dw, 1) + ' m / ' + numR(r.FS, 1)));
    L.push('');
    L.push(' PROFIL TANAH & SELIMUT (per lapis tertanam)');
    L.push(ruleR('-'));
    L.push(' Lps Jenis  z(m)      dL   fs(kPa)  Qs(kN)  metode');
    r.segs.forEach(function (s) {
      var zr = s.top.toFixed(1) + '-' + s.bot.toFixed(1);
      var lineTxt = ' ' + pad('' + s.idx, 3) + ' ' + pad(soilName(s.soil), 6) + ' ' + pad(zr, 9) + ' ' +
        pad(numR(s.dL, 1), 4) + ' ' + pad(numR(s.fs, 1), 8) + ' ' + pad(numR(s.Qs, 0), 7) + ' ' + tolatin(s.how);
      L.push(lineTxt);
    });
    L.push(rowR('sum Qs (selimut)', numR(r.Qs, 1) + ' kN'));
    L.push('');
    L.push(' TAHANAN UJUNG');
    L.push(ruleR('-'));
    L.push(rowR('Lapis ujung', soilName(r.tipLayer.soil) + ' / ' + (r.tipLayer.method === 'spt' ? 'SPT' : 'statik')));
    L.push(rowR("sigma'v di ujung", numR(r.svTip, 1) + ' kPa'));
    if (r.Nq != null) L.push(rowR('Nq / ql', numR(r.Nq, 1) + ' / ' + numR(r.ql, 0) + ' kPa'));
    L.push(rowR('qp (' + tolatin(r.qpHow) + ')', numR(r.qp, 1) + ' kPa'));
    L.push(rowR('Qp = Ap*qp', numR(r.Qp, 1) + ' kN'));
    L.push('');
    if (r.dq.active) {
      L.push(' PEMBANDING DECOURT-QUARESMA (SPT)');
      L.push(ruleR('-'));
      L.push(rowR('N rata2 selimut', numR(r.dq.NsAvg, 1)));
      L.push(rowR('fs=10(N/3+1) -> Qs', numR(r.dq.fsDq, 1) + ' kPa / ' + numR(r.dq.QsDq, 0) + ' kN'));
      L.push(rowR('qp=C*Np (C=' + r.dq.C + ',Np=' + numR(r.dq.Np, 0) + ')', numR(r.dq.qpDq, 0) + ' kPa'));
      L.push(rowR('Qu(DQ) / Q_izin(DQ)', numR(r.dq.QuDq, 0) + ' / ' + numR(r.dq.Qallow, 0) + ' kN'));
      L.push('');
    }
    L.push(' HASIL');
    L.push(ruleR('='));
    L.push(rowR('Qs (selimut)', numR(r.Qs, 1) + ' kN'));
    L.push(rowR('Qp (ujung)', numR(r.Qp, 1) + ' kN'));
    L.push(rowR('Qu = Qp + Qs (ultimit)', numR(r.Qu, 1) + ' kN'));
    if (r.inclW) L.push(rowR('Wp (berat sendiri)', numR(r.Wp, 1) + ' kN'));
    L.push(rowR('>> Q_IZIN = Qu/FS' + (r.inclW ? ' - Wp' : ''), numR(r.Qallow, 1) + ' kN'));
    L.push(ruleR('='));
    L.push('');
    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' Selimut: lempung alpha (API), pasir beta (K,delta), atau SPT');
    L.push(' Meyerhof. Ujung: 9cu / sigma_v*Nq<=ql / 40N*L/D. Decourt-Quaresma');
    L.push(' sebagai pembanding. TIDAK termasuk kelompok, downdrag, lateral,');
    L.push(' uplift, penurunan, gempa.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(centerR('Alat bantu; verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L.map(tolatin);
  }
  function pad(s, n) { s = '' + s; while (s.length < n) s += ' '; return s.slice(0, Math.max(n, s.length)); }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues(), state.layers);
    if (!r.valid) { UI.toast('Lengkapi data tiang & tanah dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Tiang_' + (r.shape === 'square' ? 'Persegi' : 'Bulat') + '_D' + r.D + '_L' + r.Leff + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Daya Dukung Tiang', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, canvas2d: runtime.canvas2d, mouse: null, layers: defaultLayers() };
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
