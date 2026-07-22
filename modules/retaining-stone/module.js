/* ============================================================
   Civil Tools — modules/retaining-stone/module.js  (Tier 2, kanvas 2D)
   Dinding Penahan Tanah (DPT) PASANGAN BATU KALI — tipe gravitasi.

   BENTUK (badan trapesium siku-siku + tapak persegi):
     Opsi 1 'tegak'  : sisi TEGAK menghadap tanah (belakang),
                       sisi miring di muka bebas (depan).
     Opsi 2 'miring' : sisi MIRING menghadap tanah (belakang),
                       sisi tegak di muka bebas (depan).
   Tapak (shoe) persegi panjang: proyeksi depan (toe) & belakang
   (heel) bebas ≥ 0.

   TEKANAN TANAH — Rankine (c urugan = 0):
     Ka = cosβ·(cosβ−√(cos²β−cos²φ))/(cosβ+√(cos²β−cos²φ))
     Bekerja pada BIDANG VERTIKAL SEMU di tepi belakang tapak,
     tinggi H' = H + tf + ws·tanβ, arah sejajar lereng β
     (komponen Pah = Pa·cosβ, Pav = Pa·sinβ di x = B).
     Beban merata q → tekanan Ka·q setinggi H' (dianggap sejajar β).
     Berat tanah di atas tumit + baji di atas sisi miring ikut menahan.
     Beban merata q TIDAK dihitung sebagai penahan (konservatif).

   STABILITAS (beban layan, tanpa faktor):
     Guling  : FS = ΣM_penahan / ΣM_guling  (thd ujung toe) ≥ 2,0
     Geser   : FS = [ΣV·tan(k·φ2) + k·c2·B + Pp(ops)] / ΣPah ≥ 1,5
               Pp Rankine = ½Kp·γ2·D² + 2·c2·√Kp·D (opsional, sering
               diabaikan karena tanah depan bisa tergali).
     Daya dukung: x̄=(ΣMr−ΣMo)/ΣV, e=B/2−x̄;
               e≤B/6 → q=ΣV/B·(1±6e/B); e>B/6 → segitiga q=2ΣV/(3x̄).
               Kontrol qmax ≤ q_izin (input, mis. dari tool Daya Dukung).

   VOLUME: badan trapesium + tapak, per meter & total panjang L.

   TIDAK termasuk: air tanah/tekanan hidrostatik (beri drainase +
   lubang suling-suling!), gempa (Mononobe-Okabe), stabilitas global
   lereng, penurunan. Verifikasi insinyur (SNI 8460:2017).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'retaining-stone';

  var D2R = Math.PI / 180;
  var state = {};
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /* ---------- Koefisien tekanan tanah ---------- */
  function kaRankine(phiDeg, betaDeg) {
    var phi = phiDeg * D2R, beta = betaDeg * D2R;
    var cb = Math.cos(beta), cp = Math.cos(phi);
    if (betaDeg <= 0.001) return Math.pow(Math.tan(Math.PI / 4 - phi / 2), 2);
    var s = Math.sqrt(Math.max(0, cb * cb - cp * cp));
    return cb * (cb - s) / (cb + s);
  }
  function kpRankine(phiDeg) {
    return Math.pow(Math.tan(Math.PI / 4 + phiDeg * D2R / 2), 2);
  }

  /* ============================================================
     COMPUTE — semua dalam kN, m, per meter panjang dinding
     Koordinat x: 0 di UJUNG DEPAN tapak (toe), positif ke arah tanah.
     ============================================================ */
  function compute(v) {
    var r = { warn: [], valid: false };
    var opsi = v.opsi || 'tegak';
    var H = num(v.H), bTop = num(v.bTop), bBot = num(v.bBot);
    var tf = num(v.tf), toe = num(v.toe), heel = num(v.heel);
    var D = num(v.D);
    var g1 = num(v.gamma1), phi1 = num(v.phi1), beta = num(v.beta), q = num(v.q);
    var g2 = num(v.gamma2), phi2 = num(v.phi2), c2 = num(v.c2);
    var qall = num(v.qall), kf = num(v.kf);
    var usePp = String(v.passive) === 'ya';
    var gw = num(v.gammaW);
    var FSotT = num(v.FSot) || 2.0, FSslT = num(v.FSsl) || 1.5;
    var Lw = num(v.Lwall);

    if (!(H > 0)) { r.warn.push('Tinggi badan H harus > 0.'); return r; }
    if (!(bTop > 0) || !(bBot > 0)) { r.warn.push('Lebar puncak & dasar badan harus > 0.'); return r; }
    if (bBot < bTop) { r.warn.push('Lebar dasar badan (b_bawah) harus ≥ lebar puncak (b_atas) untuk trapesium siku-siku.'); return r; }
    if (!(tf > 0)) { r.warn.push('Tebal tapak tf harus > 0.'); return r; }
    if (toe < 0 || heel < 0) { r.warn.push('Proyeksi tapak tidak boleh negatif.'); return r; }
    if (!(g1 > 0) || !(gw > 0)) { r.warn.push('Berat isi tanah urugan & pasangan harus > 0.'); return r; }
    if (!(phi1 > 0)) { r.warn.push('Sudut geser tanah urugan φ harus > 0 (urugan granular, c = 0).'); return r; }
    if (beta < 0) beta = 0;
    if (beta >= phi1) { r.warn.push('Kemiringan lereng β harus < φ urugan (Rankine tidak terdefinisi).'); return r; }
    if (kf <= 0 || kf > 1) kf = 0.67;

    var B = toe + bBot + heel;

    // Lebar horizontal dari puncak-belakang badan ke bidang vertikal semu (x=B)
    var ws = (opsi === 'tegak') ? heel : (heel + (bBot - bTop));
    var Hp = H + tf + ws * Math.tan(beta * D2R);   // H' bidang semu

    var Ka = kaRankine(phi1, beta);
    var cbeta = Math.cos(beta * D2R), sbeta = Math.sin(beta * D2R);
    var Pa = 0.5 * Ka * g1 * Hp * Hp;      // resultan tanah (miring β)
    var Pq = Ka * q * Hp;                  // resultan beban merata (miring β)
    var Pah = Pa * cbeta, Pav = Pa * sbeta;
    var Pqh = Pq * cbeta, Pqv = Pq * sbeta;
    var yPa = Hp / 3, yPq = Hp / 2;        // lengan dari dasar tapak

    /* ---------- Komponen berat (nama, W kN/m, x m dari toe) ---------- */
    var parts = [];
    var xBackBot = toe + bBot;             // muka belakang badan di dasar
    var Astem;
    if (opsi === 'tegak') {
      // badan: persegi [xBackBot−bTop, xBackBot] + segitiga muka depan
      parts.push({ nm: 'Badan persegi', W: bTop * H * gw, x: xBackBot - bTop / 2 });
      var bw = bBot - bTop;
      if (bw > 1e-9) parts.push({ nm: 'Badan segitiga (muka depan)', W: 0.5 * bw * H * gw, x: toe + 2 * bw / 3 });
      // tanah di atas tumit (persegi setinggi H)
      if (heel > 1e-9) parts.push({ nm: 'Tanah di atas tumit', W: heel * H * g1, x: B - heel / 2 });
    } else {
      // muka depan tegak di x=toe; belakang miring dari (toe+bBot,0) ke (toe+bTop,H)
      parts.push({ nm: 'Badan persegi', W: bTop * H * gw, x: toe + bTop / 2 });
      var bw2 = bBot - bTop;
      if (bw2 > 1e-9) {
        parts.push({ nm: 'Badan segitiga (sisi tanah)', W: 0.5 * bw2 * H * gw, x: toe + bTop + bw2 / 3 });
        parts.push({ nm: 'Tanah di atas sisi miring', W: 0.5 * bw2 * H * g1, x: toe + bTop + 2 * bw2 / 3 });
      }
      if (heel > 1e-9) parts.push({ nm: 'Tanah di atas tumit', W: heel * H * g1, x: B - heel / 2 });
    }
    // baji lereng di atas puncak dinding (bila β>0), lebar ws
    if (beta > 0.001 && ws > 1e-9) {
      var hW = ws * Math.tan(beta * D2R);
      parts.push({ nm: 'Baji lereng di atas ws', W: 0.5 * ws * hW * g1, x: (B - ws) + 2 * ws / 3 });
    }
    parts.push({ nm: 'Tapak (shoe)', W: B * tf * gw, x: B / 2 });

    var sumW = 0, sumMw = 0;
    parts.forEach(function (p) { sumW += p.W; sumMw += p.W * p.x; });

    var sumV = sumW + Pav + Pqv;
    var Mr = sumMw + (Pav + Pqv) * B;         // momen penahan thd toe
    var Mo = Pah * yPa + Pqh * yPq;           // momen guling thd toe

    var FSot = (Mo > 1e-9) ? Mr / Mo : 999;

    // geser
    var Kp = kpRankine(phi2);
    var Pp = 0.5 * Kp * g2 * D * D + 2 * c2 * Math.sqrt(Kp) * D;
    var Fr = sumV * Math.tan(kf * phi2 * D2R) + kf * c2 * B;
    var FrTot = Fr + (usePp ? Pp : 0);
    var Ph = Pah + Pqh;
    var FSsl = (Ph > 1e-9) ? FrTot / Ph : 999;

    // daya dukung
    var xbar = (Mr - Mo) / sumV;
    var e = B / 2 - xbar;
    var qmax, qmin, tri = false;
    if (xbar <= 0) {
      qmax = Infinity; qmin = 0; tri = true;
      r.warn.push('Resultan jatuh di luar dasar tapak (x̄ ≤ 0) — dinding GULING. Perbesar dimensi.');
    } else if (Math.abs(e) <= B / 6 + 1e-12) {
      qmax = sumV / B * (1 + 6 * e / B);
      qmin = sumV / B * (1 - 6 * e / B);
    } else if (e > 0) {
      tri = true; qmax = 2 * sumV / (3 * xbar); qmin = 0;
    } else { // e < -B/6 (resultan ke arah tumit) — jarang
      tri = true; qmax = 2 * sumV / (3 * (B - xbar)); qmin = 0;
    }
    var dcQ = (qall > 0 && isFinite(qmax)) ? qmax / qall : null;

    // volume
    Astem = 0.5 * (bTop + bBot) * H;
    var Afoot = B * tf;
    var volM = Astem + Afoot;                  // m³ per m'
    var volTot = (Lw > 0) ? volM * Lw : null;

    r.valid = true;
    r.opsi = opsi; r.H = H; r.bTop = bTop; r.bBot = bBot; r.tf = tf;
    r.toe = toe; r.heel = heel; r.B = B; r.D = D; r.ws = ws; r.Hp = Hp;
    r.g1 = g1; r.phi1 = phi1; r.beta = beta; r.q = q;
    r.g2 = g2; r.phi2 = phi2; r.c2 = c2; r.qall = qall; r.kf = kf;
    r.usePp = usePp; r.gw = gw; r.Lw = Lw;
    r.Ka = Ka; r.Kp = Kp;
    r.Pa = Pa; r.Pq = Pq; r.Pah = Pah; r.Pav = Pav; r.Pqh = Pqh; r.Pqv = Pqv;
    r.yPa = yPa; r.yPq = yPq; r.Ph = Ph; r.Pp = Pp;
    r.parts = parts; r.sumW = sumW; r.sumV = sumV;
    r.Mr = Mr; r.Mo = Mo; r.xbar = xbar; r.e = e; r.tri = tri;
    r.qmax = qmax; r.qmin = qmin; r.dcQ = dcQ;
    r.FSot = FSot; r.FSsl = FSsl; r.FSotT = FSotT; r.FSslT = FSslT;
    r.Fr = Fr; r.FrTot = FrTot;
    r.Astem = Astem; r.Afoot = Afoot; r.volM = volM; r.volTot = volTot;
    r.okOt = FSot >= FSotT; r.okSl = FSsl >= FSslT;
    r.okQ = (dcQ === null) ? null : dcQ <= 1;
    r.okE = Math.abs(e) <= B / 6 + 1e-12;

    // Peringatan
    if (!r.okOt) r.warn.push('FS guling ' + FSot.toFixed(2) + ' < ' + FSotT.toFixed(1) + ' — TIDAK AMAN terhadap guling.');
    if (!r.okSl) r.warn.push('FS geser ' + FSsl.toFixed(2) + ' < ' + FSslT.toFixed(1) + ' — TIDAK AMAN terhadap geser' + (usePp ? '' : ' (coba aktifkan tahanan pasif atau tambah kedalaman tanam)') + '.');
    if (!r.okE) r.warn.push('e = ' + e.toFixed(3) + ' m > B/6 = ' + (B / 6).toFixed(3) + ' m — resultan di luar inti tengah; sebagian dasar terangkat (distribusi segitiga). Untuk pasangan batu sebaiknya e ≤ B/6.');
    if (r.dcQ !== null && r.dcQ > 1) r.warn.push('qmax = ' + qmax.toFixed(1) + ' kPa > q_izin = ' + qall.toFixed(1) + ' kPa — daya dukung TIDAK memadai.');
    if (usePp) r.warn.push('Tahanan pasif diikutkan pada cek geser — pastikan tanah depan setebal D = ' + D.toFixed(2) + ' m PERMANEN (tidak akan tergali/tererosi).');
    if (bBot / H < 0.4) r.warn.push('b_bawah/H = ' + (bBot / H).toFixed(2) + ' < 0,4 — proporsi badan gravitasi umumnya 0,4–0,7·H; periksa kembali.');
    r.warn.push('Air tanah TIDAK dimodelkan — wajib sediakan drainase & lubang suling-suling (weep hole) agar tekanan hidrostatik tidak bekerja.');

    return r;
  }

  function opsiName(k) {
    return k === 'tegak' ? 'Opsi 1 — sisi tegak ke tanah' : 'Opsi 2 — sisi miring ke tanah';
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('rs-style')) return;
    var s = document.createElement('style');
    s.id = 'rs-style';
    s.textContent =
      '.rs-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.rs-canvas{position:relative;flex:1 1 52%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.rs-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}' +
      '.rs-tbl{width:100%;border-collapse:collapse;margin:6px 0 2px;font-size:12.5px}' +
      '.rs-tbl th,.rs-tbl td{padding:5px 8px;text-align:right;border-bottom:1px solid var(--line)}' +
      '.rs-tbl th:first-child,.rs-tbl td:first-child{text-align:left}' +
      '.rs-tbl thead th{color:var(--ink-dim);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}' +
      '.rs-tbl tfoot td{font-weight:600;border-top:1.5px solid var(--ink-dim)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'DPT Batu Kali (Gravitasi)'));
    panel.appendChild(UI.el('div', 'sub', 'Dinding penahan tanah pasangan batu kali: badan trapesium siku-siku (2 opsi orientasi) + tapak persegi. Tekanan Rankine (lereng β, beban merata q), cek guling, geser, daya dukung (e, qmax/qmin) & volume pasangan.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'rs-work');
    var canvasHost = UI.el('div', 'rs-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Potongan dinding & diagram tekanan');
    var results = UI.el('div', 'rs-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Bentuk & Geometri' },
      { type: 'segment', id: 'opsi', label: 'Orientasi badan trapesium', value: 'tegak',
        options: [{ value: 'tegak', label: 'Tegak ke tanah' }, { value: 'miring', label: 'Miring ke tanah' }],
      },
      { type: 'number', id: 'H', label: 'H — tinggi badan dinding', unit: 'm', value: 3.0, min: 0.5, step: 0.1, hint: 'Dari atas tapak sampai puncak dinding.' },
      { type: 'number', id: 'bTop', label: 'b_atas — lebar puncak', unit: 'm', value: 0.5, min: 0.2, step: 0.05 },
      { type: 'number', id: 'bBot', label: 'b_bawah — lebar dasar badan', unit: 'm', value: 1.8, min: 0.2, step: 0.05, hint: 'Trapesium siku-siku: b_bawah ≥ b_atas. Umumnya 0,4–0,7·H.' },
      { type: 'number', id: 'tf', label: 'tf — tebal tapak', unit: 'm', value: 0.6, min: 0.2, step: 0.05 },
      { type: 'number', id: 'toe', label: 'Proyeksi tapak depan (toe)', unit: 'm', value: 0.3, min: 0, step: 0.05 },
      { type: 'number', id: 'heel', label: 'Proyeksi tapak belakang (heel)', unit: 'm', value: 0.3, min: 0, step: 0.05 },
      { type: 'number', id: 'D', label: 'D — kedalaman tanah depan', unit: 'm', value: 0.8, min: 0, step: 0.1, hint: 'Dari permukaan tanah depan ke dasar tapak (tanam).' },

      { type: 'group', label: 'Tanah Urugan (belakang)' },
      { type: 'number', id: 'gamma1', label: 'γ₁ — berat isi urugan', unit: 'kN/m³', value: 18, min: 10, step: 0.5 },
      { type: 'number', id: 'phi1', label: 'φ₁ — sudut geser urugan', unit: '°', value: 30, min: 15, max: 45, step: 1, hint: 'Urugan granular, kohesi diabaikan (c₁ = 0).' },
      { type: 'number', id: 'beta', label: 'β — kemiringan lereng urugan', unit: '°', value: 0, min: 0, max: 40, step: 1, hint: '0 = datar. Harus < φ₁.' },
      { type: 'number', id: 'q', label: 'q — beban merata permukaan', unit: 'kPa', value: 10, min: 0, step: 1, hint: 'Beban lalu lintas/timbunan di atas urugan.' },

      { type: 'group', label: 'Tanah Fondasi & Depan' },
      { type: 'number', id: 'gamma2', label: 'γ₂ — berat isi tanah fondasi', unit: 'kN/m³', value: 18, min: 10, step: 0.5 },
      { type: 'number', id: 'phi2', label: 'φ₂ — sudut geser tanah fondasi', unit: '°', value: 28, min: 0, max: 45, step: 1 },
      { type: 'number', id: 'c2', label: 'c₂ — kohesi tanah fondasi', unit: 'kPa', value: 10, min: 0, step: 1 },
      { type: 'number', id: 'qall', label: 'q_izin — daya dukung izin', unit: 'kPa', value: 150, min: 0, step: 10, hint: 'Dari tool Daya Dukung Tanah / penyelidikan tanah. 0 = lewati cek.' },
      { type: 'number', id: 'kf', label: 'k — faktor gesekan dasar', unit: '', value: 0.67, min: 0.3, max: 1, step: 0.01, hint: 'μ = tan(k·φ₂), adhesi = k·c₂ (Das: k = ½–⅔).' },
      { type: 'segment', id: 'passive', label: 'Ikutkan tahanan pasif depan?', value: 'tidak',
        options: [{ value: 'tidak', label: 'Tidak' }, { value: 'ya', label: 'Ya' }] },

      { type: 'group', label: 'Material & Kontrol' },
      { type: 'number', id: 'gammaW', label: 'γ_pas — berat isi pasangan batu', unit: 'kN/m³', value: 22, min: 15, step: 0.5, hint: 'Pasangan batu kali + mortar ≈ 22 kN/m³.' },
      { type: 'number', id: 'FSot', label: 'FS guling minimum', unit: '', value: 2.0, min: 1, step: 0.1 },
      { type: 'number', id: 'FSsl', label: 'FS geser minimum', unit: '', value: 1.5, min: 1, step: 0.1 },
      { type: 'number', id: 'Lwall', label: 'L — panjang dinding (volume)', unit: 'm', value: 10, min: 0, step: 1, hint: 'Untuk rekap volume total. 0 = per meter saja.' }
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
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Potongan dinding & diagram tekanan');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri & parameter tanah untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set(opsiName(r.opsi) + ' · H=' + r.H + ' m · B=' + r.B.toFixed(2) + ' m');

    results.appendChild(UI.heroRow([
      { label: 'FS Guling (≥' + r.FSotT.toFixed(1) + ')', value: UI.fmt(Math.min(r.FSot, 99), 2), unit: r.okOt ? 'OK' : 'NG', tone: r.okOt ? 'ok' : 'bad' },
      { label: 'FS Geser (≥' + r.FSslT.toFixed(1) + ')', value: UI.fmt(Math.min(r.FSsl, 99), 2), unit: r.okSl ? 'OK' : 'NG', tone: r.okSl ? 'ok' : 'bad' },
      (r.dcQ !== null)
        ? { label: 'qmax / q_izin', value: UI.fmt(r.dcQ, 2), unit: r.okQ ? 'OK' : 'NG', tone: r.okQ ? 'ok' : 'bad' }
        : { label: 'qmax', value: isFinite(r.qmax) ? UI.fmt(r.qmax, 1) : '—', unit: 'kPa' }
    ]));
    results.appendChild(UI.el('div', 'ck-empty',
      'B = ' + r.B.toFixed(2) + ' m · e = ' + r.e.toFixed(3) + ' m (' + (r.okE ? 'dalam' : 'LUAR') + ' inti B/6 = ' + (r.B / 6).toFixed(3) + ' m) · Volume ' + UI.fmt(r.volM, 3) + ' m³/m\'.'));

    // Tekanan tanah
    results.appendChild(UI.rhead('Tekanan tanah (Rankine)'));
    results.appendChild(UI.kv('Ka (φ=' + r.phi1.toFixed(0) + '°, β=' + r.beta.toFixed(0) + '°)', r.Ka.toFixed(4)));
    results.appendChild(UI.kv('H\' bidang semu (tepi tumit)', r.Hp.toFixed(3) + ' m'));
    results.appendChild(UI.kv('Pa = ½·Ka·γ·H\'²', UI.fmt(r.Pa, 2) + ' kN/m (∠β)'));
    results.appendChild(UI.kv('Pah / Pav', UI.fmt(r.Pah, 2) + ' / ' + UI.fmt(r.Pav, 2) + ' kN/m'));
    if (r.q > 0) results.appendChild(UI.kv('Pq = Ka·q·H\' → Pqh / Pqv', UI.fmt(r.Pqh, 2) + ' / ' + UI.fmt(r.Pqv, 2) + ' kN/m'));
    results.appendChild(UI.kv('ΣPh (pendorong)', UI.fmt(r.Ph, 2) + ' kN/m'));
    if (r.usePp) results.appendChild(UI.kv('Pp pasif depan (D=' + r.D.toFixed(2) + ' m)', UI.fmt(r.Pp, 2) + ' kN/m'));

    // Tabel berat
    results.appendChild(UI.rhead('Komponen berat & momen penahan (thd toe)'));
    var tbl = UI.el('table', 'rs-tbl');
    tbl.innerHTML = '<thead><tr><th>Komponen</th><th>W (kN/m)</th><th>x (m)</th><th>M (kN·m/m)</th></tr></thead>';
    var tb = document.createElement('tbody');
    r.parts.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + p.nm + '</td><td>' + p.W.toFixed(2) + '</td><td>' + p.x.toFixed(3) + '</td><td>' + (p.W * p.x).toFixed(2) + '</td>';
      tb.appendChild(tr);
    });
    if (r.Pav + r.Pqv > 0.005) {
      var trv = document.createElement('tr');
      trv.innerHTML = '<td>Pav + Pqv (komponen vertikal)</td><td>' + (r.Pav + r.Pqv).toFixed(2) + '</td><td>' + r.B.toFixed(3) + '</td><td>' + ((r.Pav + r.Pqv) * r.B).toFixed(2) + '</td>';
      tb.appendChild(trv);
    }
    tbl.appendChild(tb);
    var tfoot = document.createElement('tfoot');
    tfoot.innerHTML = '<tr><td>ΣV / ΣMr</td><td>' + r.sumV.toFixed(2) + '</td><td></td><td>' + r.Mr.toFixed(2) + '</td></tr>';
    tbl.appendChild(tfoot);
    results.appendChild(tbl);

    // Stabilitas
    results.appendChild(UI.rhead('Cek stabilitas'));
    results.appendChild(UI.kv('ΣM guling = Pah·H\'/3 + Pqh·H\'/2', UI.fmt(r.Mo, 2) + ' kN·m/m'));
    results.appendChild(UI.kv('FS guling = ΣMr / ΣMo', r.FSot.toFixed(2) + ' (≥ ' + r.FSotT.toFixed(1) + ')', r.okOt ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Tahanan geser dasar', UI.fmt(r.Fr, 2) + (r.usePp ? ' + Pp ' + UI.fmt(r.Pp, 2) : '') + ' kN/m'));
    results.appendChild(UI.kv('FS geser = ΣFr / ΣPh', r.FSsl.toFixed(2) + ' (≥ ' + r.FSslT.toFixed(1) + ')', r.okSl ? 'ok' : 'bad'));
    results.appendChild(UI.kv('x̄ = (ΣMr−ΣMo)/ΣV → e = B/2−x̄', r.xbar.toFixed(3) + ' m → e = ' + r.e.toFixed(3) + ' m', r.okE ? 'ok' : 'bad'));
    results.appendChild(UI.kv('qmax / qmin', (isFinite(r.qmax) ? UI.fmt(r.qmax, 1) : '∞') + ' / ' + UI.fmt(r.qmin, 1) + ' kPa' + (r.tri ? ' (segitiga)' : '')));
    if (r.dcQ !== null) results.appendChild(UI.kv('qmax / q_izin', r.dcQ.toFixed(2), r.okQ ? 'ok' : 'bad'));

    // Volume
    results.appendChild(UI.rhead('Volume pasangan batu'));
    results.appendChild(UI.kv('Badan trapesium ' + r.bTop + '/' + r.bBot + '×' + r.H + ' m', UI.fmt(r.Astem, 3) + ' m³/m\''));
    results.appendChild(UI.kv('Tapak ' + r.B.toFixed(2) + '×' + r.tf + ' m', UI.fmt(r.Afoot, 3) + ' m³/m\''));
    results.appendChild(UI.kv('Total per meter panjang', UI.fmt(r.volM, 3) + ' m³/m\'', 'ok'));
    if (r.volTot !== null) results.appendChild(UI.kv('Total L = ' + r.Lw + ' m', UI.fmt(r.volTot, 2) + ' m³', 'ok'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'Tekanan aktif Rankine pada bidang vertikal semu di tepi tumit tapak, resultan miring β; urugan granular c = 0. ' +
      'Berat tanah di atas tumit & baji di atas sisi miring ikut menahan; beban merata q hanya sebagai pendorong (konservatif). ' +
      'Geser dasar μ = tan(k·φ₂) + adhesi k·c₂ (Das). Pasif Rankine opsional. ' +
      'Distribusi tegangan dasar linier (trapesium/segitiga). ' +
      '<b>TIDAK termasuk</b>: air tanah, gempa (Mononobe-Okabe), stabilitas global lereng, penurunan. ' +
      'Verifikasi oleh insinyur penanggung jawab (SNI 8460:2017).'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function wallPolys(r) {
    // titik-titik badan & tapak dalam koordinat dunia (x dari toe, y dari dasar tapak)
    var xb = r.toe + r.bBot;
    var body;
    if (r.opsi === 'tegak') {
      body = [[r.toe, r.tf], [xb, r.tf], [xb, r.tf + r.H], [xb - r.bTop, r.tf + r.H]];
    } else {
      body = [[r.toe, r.tf], [xb, r.tf], [r.toe + r.bTop, r.tf + r.H], [r.toe, r.tf + r.H]];
    }
    var foot = [[0, 0], [r.B, 0], [r.B, r.tf], [0, r.tf]];
    return { body: body, foot: foot };
  }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi data untuk melihat potongan & diagram tekanan.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.55, w - 210);
    drawSection(ctx, 0, 0, splitX, h, r);
    drawChecks(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'FS guling ' + r.FSot.toFixed(2) + ' · FS geser ' + r.FSsl.toFixed(2) +
          (isFinite(r.qmax) ? ' · qmax ' + r.qmax.toFixed(0) + ' kPa' : '')
      });
    }
  }

  function drawSection(ctx, ox, oy, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), amber = css('--amber'), sage = css('--sage') || dim;
    var olive = css('--olive') || dim;

    var padT = 30, padB = 56, padS = 30;
    var backExt = Math.max(1.2, 0.7 * r.Hp);           // tanah belakang tergambar
    var frontExt = Math.max(0.9, 0.45 * r.Hp);
    var topRise = r.beta > 0 ? backExt * Math.tan(r.beta * D2R) : 0;
    var xspan = frontExt + r.B + backExt;
    var yspan = r.tf + r.H + topRise + 0.4;
    var sc = Math.min((w - 2 * padS) / xspan, (h - padT - padB) / yspan);
    var x0 = ox + padS + (w - 2 * padS - xspan * sc) / 2 + frontExt * sc;  // x dunia 0 (toe) di px
    var yBase = oy + h - padB - Math.max(0, (h - padT - padB - yspan * sc) / 2);
    function X(wx) { return x0 + wx * sc; }
    function Y(wy) { return yBase - wy * sc; }

    var crest = r.tf + r.H;
    var xw = (r.opsi === 'tegak') ? (r.toe + r.bBot) : (r.toe + r.bTop);  // puncak-belakang badan

    // --- tanah urugan belakang (polygon dari muka belakang dinding ke kanan) ---
    var p = wallPolys(r);
    ctx.save();
    ctx.fillStyle = sage; ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(X(r.toe + r.bBot), Y(r.tf));
    if (r.opsi === 'miring') ctx.lineTo(X(xw), Y(crest)); else ctx.lineTo(X(xw), Y(crest));
    // permukaan: dari puncak-belakang naik β ke kanan
    ctx.lineTo(X(r.B + backExt), Y(crest + (r.B + backExt - xw) * Math.tan(r.beta * D2R)));
    ctx.lineTo(X(r.B + backExt), Y(0));
    ctx.lineTo(X(r.B), Y(0)); ctx.lineTo(X(r.B), Y(r.tf));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // garis permukaan urugan
    ctx.strokeStyle = sage; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(xw), Y(crest));
    ctx.lineTo(X(r.B + backExt), Y(crest + (r.B + backExt - xw) * Math.tan(r.beta * D2R))); ctx.stroke();
    ctx.restore();

    // --- tanah depan (sampai elevasi D dari dasar) ---
    if (r.D > 0.01) {
      ctx.save();
      ctx.fillStyle = sage; ctx.globalAlpha = 0.12;
      ctx.fillRect(X(-frontExt), Y(r.D), (frontExt) * sc, r.D * sc);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sage; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(-frontExt), Y(r.D)); ctx.lineTo(X(0), Y(r.D)); ctx.stroke();
      ctx.restore();
    }

    // --- beban merata q ---
    if (r.q > 0) {
      ctx.save();
      ctx.strokeStyle = olive; ctx.fillStyle = olive; ctx.lineWidth = 1;
      var qy0 = crest + (0.15 * r.Hp > 0.35 ? 0.35 : 0.15 * r.Hp) + 0.25;
      for (var xq = xw + 0.15; xq < r.B + backExt - 0.1; xq += Math.max(0.4, backExt / 5)) {
        var surfY = crest + (xq - xw) * Math.tan(r.beta * D2R);
        ctx.beginPath(); ctx.moveTo(X(xq), Y(surfY + 0.45)); ctx.lineTo(X(xq), Y(surfY + 0.06)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(xq) - 3, Y(surfY + 0.18)); ctx.lineTo(X(xq), Y(surfY + 0.03)); ctx.lineTo(X(xq) + 3, Y(surfY + 0.18)); ctx.closePath(); ctx.fill();
      }
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('q=' + r.q + ' kPa', X(xw + 0.2), Y(crest + 0.62) - 2);
      ctx.restore();
    }

    // --- dinding (badan + tapak) dengan tekstur batu ---
    ctx.save();
    ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
    [p.body, p.foot].forEach(function (poly) {
      ctx.beginPath();
      poly.forEach(function (pt, i) { if (i === 0) ctx.moveTo(X(pt[0]), Y(pt[1])); else ctx.lineTo(X(pt[0]), Y(pt[1])); });
      ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // tekstur "batu" — elips acak deterministik
    ctx.strokeStyle = css('--bg'); ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var minX = Math.min(r.toe, 0), maxX = r.B;
    for (var i = 0; i < 46; i++) {
      var rx = minX + rnd() * (maxX - minX), ry = rnd() * (r.tf + r.H);
      // dalam badan?
      var inFoot = ry < r.tf && rx > 0 && rx < r.B;
      var inBody = false;
      if (ry >= r.tf && ry <= crest) {
        var t = (ry - r.tf) / r.H;
        var xl, xr;
        if (r.opsi === 'tegak') { xl = r.toe + t * (r.bBot - r.bTop); xr = r.toe + r.bBot; }
        else { xl = r.toe; xr = r.toe + r.bBot - t * (r.bBot - r.bTop); }
        inBody = rx > xl + 0.08 && rx < xr - 0.08;
      }
      if (!inFoot && !inBody) continue;
      ctx.beginPath();
      ctx.ellipse(X(rx), Y(ry), 3 + rnd() * 4, 2 + rnd() * 3, rnd() * Math.PI, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // --- diagram tekanan aktif pada bidang semu x=B ---
    ctx.save();
    var pMax = r.Ka * (r.g1 * r.Hp + r.q);                  // kPa di dasar
    var pScale = Math.max(0.55, 0.32 * r.Hp) / Math.max(pMax, 1);  // m gambar per kPa
    ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(X(r.B), Y(r.Hp));
    ctx.lineTo(X(r.B + r.Ka * r.q * pScale), Y(r.Hp));
    ctx.lineTo(X(r.B + pMax * pScale), Y(0));
    ctx.lineTo(X(r.B), Y(0));
    ctx.stroke();
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(X(r.B), Y(r.Hp));
    ctx.lineTo(X(r.B + r.Ka * r.q * pScale), Y(r.Hp));
    ctx.lineTo(X(r.B + pMax * pScale), Y(0));
    ctx.lineTo(X(r.B), Y(0));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // panah resultan Pa
    var yR = r.yPa;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(r.B) + 34, Y(yR) + 34 * Math.tan(r.beta * D2R)); ctx.lineTo(X(r.B) + 2, Y(yR)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(r.B) + 10, Y(yR) - 4); ctx.lineTo(X(r.B) + 1, Y(yR)); ctx.lineTo(X(r.B) + 10, Y(yR) + 5); ctx.closePath(); ctx.fill();
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Pa ' + r.Pa.toFixed(1) + ' kN/m', X(r.B) + 6, Y(yR) - 7);
    ctx.restore();

    // --- distribusi tegangan dasar ---
    ctx.save();
    var qs = Math.max(isFinite(r.qmax) ? r.qmax : 0, r.qall || 0, 1);
    var qScale = 0.5 / qs;   // 0.5 m gambar untuk tegangan max
    var contact = r.tri ? Math.min(3 * Math.max(r.xbar, 0.01), r.B) : r.B;
    ctx.strokeStyle = olive; ctx.fillStyle = olive; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(0), Y(-(isFinite(r.qmax) ? r.qmax : qs) * qScale));
    ctx.lineTo(X(contact), Y(-(r.tri ? 0 : r.qmin) * qScale));
    if (contact < r.B) ctx.lineTo(X(r.B), Y(0));
    ctx.lineTo(X(r.B), Y(0));
    ctx.closePath();
    ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    if (isFinite(r.qmax)) ctx.fillText('qmax ' + r.qmax.toFixed(0), X(0) - 12, Y(-(r.qmax * qScale)) + 12);
    if (!r.tri) { ctx.textAlign = 'right'; ctx.fillText('qmin ' + r.qmin.toFixed(0), X(r.B) + 14, Y(-(r.qmin * qScale)) + 12); }
    // resultan & inti tengah
    ctx.strokeStyle = amber; ctx.fillStyle = amber; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(r.xbar), Y(0.55)); ctx.lineTo(X(r.xbar), Y(0.06)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(r.xbar) - 4, Y(0.2)); ctx.lineTo(X(r.xbar), Y(0.02)); ctx.lineTo(X(r.xbar) + 4, Y(0.2)); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillText('R', X(r.xbar), Y(0.62));
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    [r.B / 3, 2 * r.B / 3].forEach(function (xk) {
      ctx.beginPath(); ctx.moveTo(X(xk), Y(0)); ctx.lineTo(X(xk), Y(0.14)); ctx.stroke();
    });
    ctx.restore();

    // --- dimensi ---
    dimLine(ctx, X(0), X(r.B), yBase + 26, dim, 'B ' + r.B.toFixed(2) + ' m');
    dimVert(ctx, X(r.B + Math.max(0.5, 0.36 * r.Hp) + pMax * pScale) + 8, Y(r.Hp), Y(0), faint, "H' " + r.Hp.toFixed(2) + ' m');
    dimVert(ctx, X(Math.min(0, r.toe) - 0.15) - 8, Y(crest), Y(r.tf), faint, 'H ' + r.H.toFixed(2) + ' m');
    ctx.fillStyle = faint; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(opsiName(r.opsi), ox + w / 2, oy + h - 8);
  }

  // Bar cek: FS guling, FS geser, daya dukung
  function drawChecks(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var ink = css('--ink'), red = css('--red') || '#c0392b', green = css('--green') || css('--sage') || dim;
    var padL = 86, padR = 30, padT = 44, padB = 30;
    var gx0 = ox + padL, gx1 = ox + w - padR, gy0 = oy + padT, gy1 = oy + h - padB;

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KONTROL STABILITAS', gx0 - 4, oy + 22);

    var rows = [
      { nm: 'Guling', val: r.FSot, lim: r.FSotT, ok: r.okOt, txt: 'FS ' + r.FSot.toFixed(2) },
      { nm: 'Geser', val: r.FSsl, lim: r.FSslT, ok: r.okSl, txt: 'FS ' + r.FSsl.toFixed(2) },
      { nm: 'D.dukung', val: (r.dcQ !== null) ? r.dcQ : null, lim: 1, ok: r.okQ, inv: true,
        txt: (r.dcQ !== null) ? ('D/C ' + r.dcQ.toFixed(2)) : 'q_izin = 0' },
      { nm: 'e ≤ B/6', val: Math.abs(r.e) / (r.B / 6), lim: 1, ok: r.okE, inv: true,
        txt: 'e ' + r.e.toFixed(3) + ' m' }
    ];
    var n = rows.length, gap = 14;
    var rowH = (gy1 - gy0 - gap * (n - 1)) / n;
    var bh = Math.min(26, rowH);

    rows.forEach(function (row, i) {
      var y = gy0 + i * (rowH + gap);
      var span = row.inv ? 2 : Math.max(2 * row.lim, 3);   // skala penuh bar
      function BX(v) { return gx0 + (gx1 - gx0) * Math.min(Math.max(v, 0) / span, 1); }
      // trek
      ctx.fillStyle = line; ctx.globalAlpha = 0.4; ctx.fillRect(gx0, y, gx1 - gx0, bh); ctx.globalAlpha = 1;
      if (row.val !== null) {
        var vv = Math.min(row.val, span);
        ctx.fillStyle = row.ok ? green : red; ctx.globalAlpha = 0.75;
        ctx.fillRect(gx0, y, BX(vv) - gx0, bh); ctx.globalAlpha = 1;
      }
      // garis batas
      ctx.strokeStyle = amber; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(BX(row.lim), y - 3); ctx.lineTo(BX(row.lim), y + bh + 3); ctx.stroke();
      // label
      ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(row.nm, gx0 - 6, y + bh / 2 + 3);
      ctx.fillStyle = ink; ctx.textAlign = 'left';
      ctx.fillText(row.txt + (row.ok === null ? '' : (row.ok ? ' OK' : ' NG')), gx0 + 6, y + bh / 2 + 3);
    });

    ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('| batas (FS min / D-C 1,0) — bar hijau OK, merah NG', gx0, gy1 + 16);
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
  var APP_VER = 'v0.5.0';
  var RW = 62;
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
    return String(s)
      .replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/β/g, 'beta').replace(/·/g, '*')
      .replace(/Σ/g, 'S').replace(/²/g, '2').replace(/³/g, '3').replace(/½/g, '0.5')
      .replace(/√/g, 'sqrt').replace(/×/g, 'x').replace(/′/g, "'").replace(/°/g, 'deg')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/[₁₂]/g, function (m) { return m === '₁' ? '1' : '2'; })
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
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('DPT PASANGAN BATU KALI (GRAVITASI)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Rankine + stabilitas', dt));
    L.push('');
    L.push(' GEOMETRI');
    L.push(ruleR('-'));
    L.push(rowR('Bentuk', tolatin(opsiName(r.opsi))));
    L.push(rowR('H badan / b_atas / b_bawah', numR(r.H, 2) + ' / ' + numR(r.bTop, 2) + ' / ' + numR(r.bBot, 2) + ' m'));
    L.push(rowR('Tapak: tebal / toe / heel', numR(r.tf, 2) + ' / ' + numR(r.toe, 2) + ' / ' + numR(r.heel, 2) + ' m'));
    L.push(rowR('B (lebar tapak total)', numR(r.B, 2) + ' m'));
    L.push(rowR('D tanam depan', numR(r.D, 2) + ' m'));
    L.push(rowR("H' bidang semu", numR(r.Hp, 3) + ' m'));
    L.push('');
    L.push(' PARAMETER TANAH & MATERIAL');
    L.push(ruleR('-'));
    L.push(rowR('Urugan: gamma1 / phi1 / beta', numR(r.g1, 1) + ' / ' + numR(r.phi1, 0) + 'deg / ' + numR(r.beta, 0) + 'deg'));
    L.push(rowR('Beban merata q', numR(r.q, 1) + ' kPa'));
    L.push(rowR('Fondasi: gamma2 / phi2 / c2', numR(r.g2, 1) + ' / ' + numR(r.phi2, 0) + 'deg / ' + numR(r.c2, 1)));
    L.push(rowR('q_izin / k gesekan dasar', numR(r.qall, 0) + ' kPa / ' + numR(r.kf, 2)));
    L.push(rowR('gamma pasangan batu', numR(r.gw, 1) + ' kN/m3'));
    L.push('');
    L.push(' TEKANAN TANAH (RANKINE)');
    L.push(ruleR('-'));
    L.push(rowR('Ka / Kp', numR(r.Ka, 4) + ' / ' + numR(r.Kp, 2)));
    L.push(rowR('Pa (miring beta)', numR(r.Pa, 2) + ' kN/m'));
    L.push(rowR('Pah / Pav', numR(r.Pah, 2) + ' / ' + numR(r.Pav, 2) + ' kN/m'));
    L.push(rowR('Pqh / Pqv (beban merata)', numR(r.Pqh, 2) + ' / ' + numR(r.Pqv, 2) + ' kN/m'));
    L.push(rowR('SPh pendorong', numR(r.Ph, 2) + ' kN/m'));
    if (r.usePp) L.push(rowR('Pp pasif (dipakai)', numR(r.Pp, 2) + ' kN/m'));
    L.push('');
    L.push(' KOMPONEN BERAT (thd toe)');
    L.push(ruleR('-'));
    L.push(' Komponen                          W(kN/m)   x(m)    M(kNm)');
    function pad(x, wd) { x = '' + x; while (x.length < wd) x = ' ' + x; return x; }
    r.parts.forEach(function (pp) {
      var nm = tolatin(pp.nm); if (nm.length > 30) nm = nm.slice(0, 30); while (nm.length < 30) nm += ' ';
      L.push(' ' + nm + pad(pp.W.toFixed(2), 9) + pad(pp.x.toFixed(3), 8) + pad((pp.W * pp.x).toFixed(2), 9));
    });
    if (r.Pav + r.Pqv > 0.005) {
      var nm2 = 'Pav + Pqv (vertikal)'; while (nm2.length < 30) nm2 += ' ';
      L.push(' ' + nm2 + pad((r.Pav + r.Pqv).toFixed(2), 9) + pad(r.B.toFixed(3), 8) + pad(((r.Pav + r.Pqv) * r.B).toFixed(2), 9));
    }
    L.push(rowR('SV / SMr', numR(r.sumV, 2) + ' kN/m / ' + numR(r.Mr, 2) + ' kNm/m'));
    L.push('');
    L.push(' CEK STABILITAS');
    L.push(ruleR('='));
    L.push(rowR('SMo guling', numR(r.Mo, 2) + ' kNm/m'));
    L.push(rowR('>> FS guling (>= ' + numR(r.FSotT, 1) + ')', numR(r.FSot, 2) + (r.okOt ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push(rowR('Tahanan geser dasar', numR(r.FrTot, 2) + ' kN/m'));
    L.push(rowR('>> FS geser (>= ' + numR(r.FSslT, 1) + ')', numR(r.FSsl, 2) + (r.okSl ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push(rowR('xbar / e / B-6', numR(r.xbar, 3) + ' / ' + numR(r.e, 3) + ' / ' + numR(r.B / 6, 3) + ' m'));
    L.push(rowR('   e dalam inti tengah?', r.okE ? 'YA (OK)' : 'TIDAK (NG)'));
    L.push(rowR('qmax / qmin', numR(r.qmax, 1) + ' / ' + numR(r.qmin, 1) + ' kPa' + (r.tri ? ' (segitiga)' : '')));
    if (r.dcQ !== null) L.push(rowR('>> qmax/q_izin', numR(r.dcQ, 2) + (r.okQ ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push(ruleR('='));
    L.push('');
    L.push(' VOLUME PASANGAN');
    L.push(ruleR('-'));
    L.push(rowR('Badan / tapak per meter', numR(r.Astem, 3) + ' / ' + numR(r.Afoot, 3) + ' m3'));
    L.push(rowR('>> Total per meter', numR(r.volM, 3) + ' m3/m'));
    if (r.volTot !== null) L.push(rowR('>> Total L=' + numR(r.Lw, 0) + ' m', numR(r.volTot, 2) + ' m3'));
    L.push('');
    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' Rankine bidang semu di tepi tumit; urugan c=0; q hanya pendorong.');
    L.push(' TIDAK termasuk: air tanah, gempa, stabilitas global, penurunan.');
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
    if (!r.valid) { UI.toast('Lengkapi data dinding & tanah dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'DPT-BatuKali_H' + r.H + '_B' + r.B.toFixed(2) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'DPT Batu Kali', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
