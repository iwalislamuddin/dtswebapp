/* ============================================================
   Civil Tools — modules/development-length/module.js  (Tier 2, kanvas 2D)
   Panjang penyaluran tulangan TARIK (straight bar) — SNI 2847:2019
   Persamaan umum Ps. 25.4.2.4a (bentuk SI, MPa) untuk tulangan ULIR:

     ld = [ fy·ψt·ψe·ψs·ψg / (1.1·λ·√f'c·((cb+Ktr)/db)) ] · db

   Batasan:
     √f'c ≤ 8.3 MPa                 (Ps. 25.4.1.4)
     (cb+Ktr)/db ≤ 2.5              (Ps. 25.4.2.4)
     ψt·ψe ≤ 1.7                    (Ps. 25.4.2.5)
     ld ≥ 300 mm                    (Ps. 25.4.2.1)

   Tulangan POLOS: Ps. 25.4.2 hanya berlaku untuk ulir/deformed. SNI 2847:2019
   mensyaratkan pengangkuran polos dengan KAIT standar. Praktik konservatif
   (mengacu code lama, bond polos ≈ ½ ulir): ld_polos = 2.0 × ld_ulir setara.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'development-length';

  // Ulir (deformed) — label 'D'; Polos (plain) — label 'Ø'
  var BARS_ULIR = [10, 13, 16, 19, 22, 25, 29, 32, 36].map(function (v) { return { v: v, l: 'D' + v }; });
  var BARS_POLOS = [8, 10, 12, 16, 19].map(function (v) { return { v: v, l: 'Ø' + v }; });
  var POLOS_FACTOR = 2.0;

  var state = {};

  function psiG(fy) { return fy <= 420 ? 1.0 : (fy <= 550 ? 1.15 : 1.3); }
  function psiS(db) { return db <= 19 ? 0.8 : 1.0; }
  function barOptions(type) {
    return (type === 'polos' ? BARS_POLOS : BARS_ULIR).map(function (b) {
      return { value: b.v, label: b.l + ' (' + b.v + ' mm)' };
    });
  }

  function compute(v) {
    var fc = v.fc, fy = v.fy, db = parseFloat(v.db);
    var psit = parseFloat(v.psit), psie = parseFloat(v.psie), lambda = parseFloat(v.lambda);
    var cb = v.cb;
    var Ktr = (v.ktrMode === 'calc')
      ? (40 * (v.Atr || 0)) / ((v.s || 1) * (v.n || 1))
      : 0;

    var r = { db: db, cb: cb, ok: true, warn: [] };
    if (!(fc > 0) || !(fy > 0) || !(cb > 0)) { r.valid = false; return r; }
    r.valid = true;

    r.polos = (v.barType === 'polos');
    r.polosFactor = r.polos ? POLOS_FACTOR : 1.0;

    r.psis = psiS(db);
    r.psig = psiG(fy);
    r.lambda = lambda;
    r.psit = psit; r.psie = psie;

    r.psite = psit * psie;
    if (r.psite > 1.7) { r.psite = 1.7; r.warn.push('Produk ψt·ψe dibatasi 1,7 (Ps. 25.4.2.5).'); }

    r.sqrtfc = Math.sqrt(fc);
    if (r.sqrtfc > 8.3) { r.sqrtfc = 8.3; r.warn.push('√f\'c dibatasi 8,3 MPa (Ps. 25.4.1.4).'); }

    r.Ktr = Ktr;
    r.ratio = (cb + Ktr) / db;
    if (r.ratio > 2.5) { r.ratio = 2.5; r.warn.push('(cb+Ktr)/db dibatasi 2,5 (Ps. 25.4.2.4).'); }

    r.ldBase = (fy * r.psite * r.psis * r.psig) / (1.1 * lambda * r.sqrtfc * r.ratio) * db;
    r.ld = r.ldBase * r.polosFactor;
    r.ldMin = false;
    if (r.ld < 300) { r.ld = 300; r.ldMin = true; }

    r.ldRound = Math.ceil(r.ld / 10) * 10;
    r.ldbratio = r.ld / db;
    return r;
  }

  /* ---------- CSS scoped module ---------- */
  function injectStyle() {
    if (document.getElementById('dl-style')) return;
    var s = document.createElement('style');
    s.id = 'dl-style';
    s.textContent =
      '.dl-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.dl-canvas{position:relative;flex:1 1 52%;min-height:200px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.dl-res{flex:1 1 48%;overflow-y:auto;padding:18px 24px 34px}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    // Panel form (kiri)
    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Panjang Penyaluran Tulangan Tarik'));
    panel.appendChild(UI.el('div', 'sub', 'Batang tarik lurus, ulir & polos — SNI 2847:2019 Ps. 25.4.2. Diagram & angka terhitung otomatis.'));
    layout.appendChild(panel);

    // Area kerja kanan: kanvas + hasil
    var work = UI.el('div', 'dl-work');
    var canvasHost = UI.el('div', 'dl-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Skema penyaluran tulangan');
    var results = UI.el('div', 'dl-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var schema = [
      { type: 'group', label: 'Material' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu baja', unit: 'MPa', value: 420, min: 240, step: 10 },

      { type: 'group', label: 'Tulangan' },
      { type: 'segment', id: 'barType', label: 'Jenis tulangan', value: 'ulir', options: [{ value: 'ulir', label: 'Ulir (D)' }, { value: 'polos', label: 'Polos (Ø)' }] },
      { type: 'select', id: 'db', label: 'Diameter batang', value: 19, options: barOptions('ulir') },

      { type: 'group', label: 'Faktor Modifikasi' },
      { type: 'segment', id: 'psit', label: 'ψt — posisi pengecoran', value: 1.0, options: [{ value: 1.0, label: 'Bawah 1.0' }, { value: 1.3, label: 'Atas 1.3' }] },
      { type: 'select', id: 'psie', label: 'ψe — pelapis', value: 1.0, options: [
        { value: 1.0, label: 'Tanpa pelapis / galvanis (1.0)' },
        { value: 1.5, label: 'Epoksi, selimut<3db / spasi<6db (1.5)' },
        { value: 1.2, label: 'Epoksi lainnya (1.2)' }
      ] },
      { type: 'segment', id: 'lambda', label: 'λ — jenis beton', value: 1.0, options: [{ value: 1.0, label: 'Normal 1.0' }, { value: 0.75, label: 'Ringan 0.75' }] },

      { type: 'group', label: 'Kekangan (confinement)' },
      { type: 'number', id: 'cb', label: 'cb — min(selimut ke pusat, ½ spasi)', unit: 'mm', value: 40, min: 5, step: 1 },
      { type: 'segment', id: 'ktrMode', label: 'Indeks tulangan transversal Ktr', value: 'zero', options: [{ value: 'zero', label: 'Ktr = 0 (konservatif)' }, { value: 'calc', label: 'Hitung Ktr' }] },
      { type: 'number', id: 'Atr', label: 'Atr — luas tul. transversal', unit: 'mm²', value: 0, min: 0, step: 1 },
      { type: 'number', id: 's', label: 's — spasi tul. transversal', unit: 'mm', value: 100, min: 1, step: 1 },
      { type: 'number', id: 'n', label: 'n — jumlah batang di bidang belah', unit: '', value: 1, min: 1, step: 1 }
    ];

    function syncKtrVisibility(vals) {
      var show = vals.ktrMode === 'calc';
      ['Atr', 's', 'n'].forEach(function (id) {
        var f = form.fields[id];
        if (f) f.node.closest('.ck-field').style.display = show ? '' : 'none';
      });
    }

    // Ganti daftar diameter saat jenis tulangan berubah (ulir ↔ polos)
    function setBarType(type) {
      var sel = form.fields.db.node;
      var cur = sel.value;
      var opts = barOptions(type);
      sel.innerHTML = '';
      opts.forEach(function (o) {
        var el = document.createElement('option');
        el.value = o.value; el.textContent = o.label;
        sel.appendChild(el);
      });
      var keep = opts.some(function (o) { return String(o.value) === String(cur); });
      sel.value = keep ? cur : String(type === 'polos' ? 16 : 19);
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'barType') { setBarType(vals.barType); vals = form.getValues(); }
      syncKtrVisibility(vals);
      update(vals, results);
    });
    state.form = form;
    state.results = results;

    // Tombol download report
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

    // Kanvas 2D (tier 2)
    if (state.canvas2d) {
      state.cv = state.canvas2d.create(canvasHost, drawScene);
      // interaksi hover: sorot batang & tampilkan label ld dekat kursor
      state.onMove = function (e) {
        var rect = state.cv.canvas.getBoundingClientRect();
        state.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        state.cv.redraw();
      };
      state.onLeave = function () { state.mouse = null; state.cv.redraw(); };
      state.cv.canvas.addEventListener('mousemove', state.onMove);
      state.cv.canvas.addEventListener('mouseleave', state.onLeave);
    }

    syncKtrVisibility(form.getValues());
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';

    if (!r.valid) {
      state.cap.set('Skema penyaluran tulangan');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi f\'c, fy, dan cb untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set('ld ' + UI.fmt(r.ldRound, 0) + ' mm · ' + (r.polos ? 'Ø' : 'D') + UI.fmt(r.db, 0));

    results.appendChild(UI.hero('ld — ' + (r.polos ? 'polos (Ø' + UI.fmt(r.db, 0) + ')' : 'ulir (D' + UI.fmt(r.db, 0) + ')'), UI.fmt(r.ldRound, 0), 'mm'));
    results.appendChild(UI.el('div', 'ck-empty', 'Nilai eksak ' + UI.fmt(r.ld, 1) + ' mm, dibulatkan ke atas per 10 mm. ld/db = ' + UI.fmt(r.ldbratio, 1) + '.'));

    results.appendChild(UI.rhead('Faktor terpakai'));
    results.appendChild(UI.kv('db', UI.fmt(r.db, 0) + ' mm'));
    results.appendChild(UI.kv('√f\'c', UI.fmt(r.sqrtfc, 3) + ' MPa'));
    results.appendChild(UI.kv('ψt · ψe (produk)', UI.fmt(r.psite, 2)));
    results.appendChild(UI.kv('ψs (ukuran batang)', UI.fmt(r.psis, 2)));
    results.appendChild(UI.kv('ψg (mutu baja)', UI.fmt(r.psig, 2)));
    results.appendChild(UI.kv('λ (jenis beton)', UI.fmt(r.lambda, 2)));
    results.appendChild(UI.kv('Ktr', UI.fmt(r.Ktr, 1)));
    results.appendChild(UI.kv('(cb + Ktr)/db', UI.fmt(r.ratio, 2)));
    if (r.polos) {
      results.appendChild(UI.kv('ld ulir setara', UI.fmt(Math.ceil(r.ldBase / 10) * 10, 0) + ' mm'));
      results.appendChild(UI.kv('Faktor polos', '× ' + UI.fmt(r.polosFactor, 1), 'bad'));
    }

    results.appendChild(UI.rhead('Kontrol'));
    results.appendChild(UI.kv('ld ≥ 300 mm', r.ldMin ? 'Dikontrol batas 300 mm' : 'OK (' + UI.fmt(r.ld, 0) + ' mm)', r.ldMin ? '' : 'ok'));

    if (r.polos) {
      results.appendChild(UI.note('Peringatan — tulangan polos',
        'SNI 2847:2019 Ps. 25.4.2 hanya menyediakan rumus <b>ld lurus untuk tulangan ulir</b>. Tulangan polos memiliki ' +
        'bond jauh lebih rendah dan <b>disyaratkan diangkur dengan kait standar</b>. Nilai di atas = <b>2,0 × ld ulir setara</b> ' +
        '(pendekatan konservatif mengacu praktik/code lama), bukan rumus resmi SNI 2847:2019 untuk polos lurus. ' +
        'Untuk desain final, gunakan kait/angkur mekanis.'));
    }

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada nilai yang terpotong batas.';
    results.appendChild(UI.note('Catatan batasan', warnHtml));

    results.appendChild(UI.note('Referensi',
      'Persamaan umum SNI 2847:2019 Ps. 25.4.2.4a — tulangan <b>ulir tarik lurus</b>. ' +
      'Tulangan <b>polos</b>: pendekatan 2× ld ulir (lihat peringatan di atas). ' +
      'Untuk kait standar (Ps. 25.4.3) atau tulangan tekan (Ps. 25.4.9) gunakan rumus tersendiri. ' +
      'Verifikasi cb dan Ktr sesuai detail penampang aktual sebelum dipakai untuk gambar kerja.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar diagram kanvas 2D ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), line = css('--line');

    if (!r || !r.valid) {
      ctx.fillStyle = faint;
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Masukkan data untuk melihat skema penyaluran.', w / 2, h / 2);
      return;
    }

    var padX = 46, stubFrac = 0.18;
    var ldPx = (w - 2 * padX) / (1 + stubFrac);
    var pxPerMm = ldPx / r.ld;
    var dbPx = Math.max(4, r.db * pxPerMm);
    var cbPx = Math.max(6, r.cb * pxPerMm);

    var faceX = padX + ldPx;            // muka beton (bidang cut)
    var tailX = padX;                   // ujung batang tertanam
    var stubX = faceX + ldPx * stubFrac; // ujung stub keluar beton
    var yc = Math.round(h * 0.46);      // sumbu batang

    // ---- Blok beton ----
    var concTop = yc - cbPx;
    var concBot = Math.min(h - 42, yc + Math.max(cbPx * 1.6, dbPx * 3 + 24));
    var concLeft = padX - 26;
    ctx.fillStyle = css('--panel-solid');
    ctx.globalAlpha = 0.9;
    ctx.fillRect(concLeft, concTop, faceX - concLeft, concBot - concTop);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = line; ctx.lineWidth = 1.2;
    ctx.strokeRect(concLeft, concTop, faceX - concLeft, concBot - concTop);
    // hatch muka beton (bidang cut)
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    for (var hx = concTop + 6; hx < concBot; hx += 9) {
      ctx.beginPath(); ctx.moveTo(faceX, hx); ctx.lineTo(faceX - 8, hx - 8); ctx.stroke();
    }
    // garis muka beton
    ctx.strokeStyle = dim; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(faceX, concTop); ctx.lineTo(faceX, concBot); ctx.stroke();

    // ---- Batang tulangan (ulir = ber-ulir, polos = mulus) ----
    var hover = state.mouse && Math.abs(state.mouse.y - yc) < dbPx / 2 + 8 && state.mouse.x > tailX - 6 && state.mouse.x < stubX + 6;
    ctx.fillStyle = hover ? amber : ink;
    roundBar(ctx, tailX, yc - dbPx / 2, stubX - tailX, dbPx, Math.min(dbPx / 2, 4));
    ctx.fill();
    if (!r.polos) {
      // ulir (ribs) — hanya untuk tulangan ulir
      ctx.strokeStyle = css('--bg2'); ctx.lineWidth = 1;
      for (var rx = tailX + 6; rx < stubX; rx += 7) {
        ctx.beginPath(); ctx.moveTo(rx, yc - dbPx / 2); ctx.lineTo(rx + 3, yc + dbPx / 2); ctx.stroke();
      }
    }

    // ---- Dimensi ld (di bawah batang) ----
    var dimY = concBot + 22;
    dimLine(ctx, tailX, faceX, dimY, amber, 'ld = ' + fmt0(r.ldRound) + ' mm');

    // ---- Dimensi cb (selimut ke pusat batang) ----
    dimVert(ctx, faceX + 16, concTop, yc, dim, 'cb ' + fmt0(r.cb));

    // ---- Label db pada stub ----
    ctx.fillStyle = dim; ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText((r.polos ? 'Ø' : 'D') + fmt0(r.db), stubX + 6, yc + 4);

    // ---- Readout hover (pill ber-posisi aman via helper bersama) ----
    if (hover && state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'ld/db = ' + r.ldbratio.toFixed(1)
      });
    }

    function fmt0(n) { return Math.round(n).toString(); }
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
    ctx.save(); ctx.translate(x + 10, (y1 + y2) / 2);
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(label, 0, 3); ctx.restore();
  }

  /* ---------- Report monospace (DOS-style) ---------- */
  var APP_VER = 'v0.2.0';
  var RW = 62;   // lebar konten report

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
      .replace(/ψ/g, 'psi').replace(/·/g, '*').replace(/√/g, 'sqrt').replace(/Ø/g, 'O')
      .replace(/′/g, "'").replace(/’/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[×]/g, 'x')
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

  function buildReport(vals, r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var polos = r.polos;
    var dbLbl = (polos ? 'O' : 'D') + r.db + ' (' + r.db + ' mm)';
    var psieLbl = ({ '1': 'Tanpa pelapis (1.0)', '1.5': 'Epoksi selimut<3db (1.5)', '1.2': 'Epoksi lainnya (1.2)' })[String(vals.psie)] || numR(r.psie, 1);
    var psitLbl = (String(vals.psit) === '1.3') ? 'Atas (1.3)' : 'Bawah (1.0)';
    var lamLbl = (String(vals.lambda) === '0.75') ? 'Ringan (0.75)' : 'Normal (1.0)';
    var ktrLbl = (vals.ktrMode === 'calc') ? 'Hitung' : 'Ktr = 0 (konservatif)';

    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('PANJANG PENYALURAN TULANGAN TARIK'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019 Ps. 25.4.2', dt));
    L.push('');
    L.push(' DESKRIPSI');
    L.push(ruleR('-'));
    L.push(' Panjang penyaluran (ld) tulangan tarik lurus. Persamaan');
    L.push(' umum Ps. 25.4.2.4a untuk tulangan ULIR. Tulangan POLOS');
    L.push(' pakai pendekatan konservatif ld = 2.0 x ld ulir setara');
    L.push(' (SNI mensyaratkan kait standar untuk polos).');
    L.push('');
    L.push(' INPUT DATA');
    L.push(ruleR('-'));
    L.push(rowR("f'c   Mutu beton", numR(vals.fc, 2) + ' MPa'));
    L.push(rowR('fy    Mutu baja', numR(vals.fy, 1) + ' MPa'));
    L.push(rowR('Jenis tulangan', polos ? 'Polos (O)' : 'Ulir (D)'));
    L.push(rowR('db    Diameter batang', dbLbl));
    L.push(rowR('psi_t Posisi pengecoran', psitLbl));
    L.push(rowR('psi_e Pelapis', psieLbl));
    L.push(rowR('lambda Jenis beton', lamLbl));
    L.push(rowR('cb    Selimut/setgh spasi', numR(r.cb, 0) + ' mm'));
    L.push(rowR('Ktr   Tul. transversal', ktrLbl));
    if (vals.ktrMode === 'calc') {
      L.push(rowR('  Atr', numR(vals.Atr, 0) + ' mm2'));
      L.push(rowR('  s  ', numR(vals.s, 0) + ' mm'));
      L.push(rowR('  n  ', numR(vals.n, 0)));
    }
    L.push('');
    L.push(' PERHITUNGAN');
    L.push(ruleR('-'));
    L.push(rowR('psi_s (ukuran batang)', numR(r.psis, 2)));
    L.push(rowR('psi_g (mutu baja)', numR(r.psig, 2)));
    L.push(rowR("sqrt(f'c)   (<= 8.3)", numR(r.sqrtfc, 3) + ' MPa'));
    L.push(rowR('psi_t*psi_e (<= 1.7)', numR(r.psite, 2)));
    L.push(rowR('Ktr dipakai', numR(r.Ktr, 1)));
    L.push(rowR('(cb+Ktr)/db (<= 2.5)', numR(r.ratio, 2)));
    L.push('');
    L.push(" ld = fy*psi_t*psi_e*psi_s*psi_g");
    L.push("      / (1.1*lambda*sqrt(f'c)*((cb+Ktr)/db)) * db");
    if (polos) {
      L.push(rowR('ld ulir setara', numR(r.ldBase, 1) + ' mm'));
      L.push(rowR('Faktor polos', 'x ' + numR(r.polosFactor, 1)));
    }
    L.push(rowR('ld (eksak)', numR(r.ld, 1) + ' mm'));
    L.push(rowR('ld / db', numR(r.ldbratio, 1)));
    L.push('');
    L.push(' OUTPUT');
    L.push(ruleR('='));
    L.push(rowR('>> ld PAKAI', numR(r.ldRound, 0) + ' mm'));
    L.push('    (dibulatkan ke atas per 10 mm)');
    L.push(rowR('Kontrol ld >= 300 mm', r.ldMin ? 'DIKONTROL BATAS 300' : 'OK'));
    L.push(ruleR('='));

    var notes = r.warn.slice();
    if (polos) notes.unshift('Tulangan polos: nilai = 2x ld ulir setara; gunakan kait standar untuk desain final.');
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
    return L.map(tolatin);
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var vals = state.form.getValues();
    var r = compute(vals);
    if (!r.valid) { UI.toast('Lengkapi f\'c, fy, dan cb dulu', 'bad'); return; }
    var lines = buildReport(vals, r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'Penyaluran-Tarik_' + (r.polos ? 'P' : 'D') + r.db + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Penyaluran Tulangan Tarik', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },

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
