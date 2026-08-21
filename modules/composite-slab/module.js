/* ============================================================
   Civil Tools — modules/composite-slab/module.js  (Tier 2, kanvas 2D)
   SLAB BETON KOMPOSIT DI ATAS METAL DECK (bondek / smartdek)
   SNI 2847:2019 (beton) + SNI 1729:2020 / AISC 360 (shear connector) + prinsip SDI

   DUA TAHAP PEMBEBANAN:
   1) TAHAP KONSTRUKSI (dek sendirian, non-komposit) — dek jadi bekisting hilang
      yang memikul beton basah + beban hidup pekerja. Dicek: momen dek vs kapasitas
      pabrikan & lendutan ≤ L/180 (maks 20 mm, cegah ponding). Opsi TOPANGAN
      SEMENTARA di tengah bentang menggandakan jumlah tumpuan sementara → bentang
      konstruksi efektif jadi L/2 (momen ↓ 4×, lendutan ↓ 16×).
   2) TAHAP KOMPOSIT (beton mengeras) — dek + beton bekerja sama:
      - Momen POSITIF: dek berperan sebagai tulangan tarik (Ase·fyd), blok tekan
        beton 0,85f'c. φMn = φ·T·(dp − a/2). (Non-komposit → tulangan bawah biasa.)
      - Momen NEGATIF (di atas tumpuan menerus): beton tarik → butuh TULANGAN ATAS
        (dek diabaikan, lebar tekan = lebar rusuk dek di bawah).
      - Tulangan SUSUT-SUHU pada selimut beton di atas dek (SNI 0,0018; SDI min 0,00075).
      - LENDUTAN penampang transformasi retak (Branson Ie) dibanding L/250 & L/360.
      - SHEAR CONNECTOR (stud Ø atau tulangan ulir dilas) untuk mengembangkan aksi
        komposit / angkur ujung ke balok baja penumpu: Vh = min(Ase·fyd; 0,85f'c·Ac),
        Qn stud per AISC I8 (faktor dek Rg·Rp), jumlah per meter lari balok.

   Koefisien momen/lendutan (pendekatan menerus, w merata, bentang L):
     1 bentang        : M+ = wL²/8,   M− = 0,      δ = 5wL⁴/384EI
     1 bentang+topang : bentang efektif L/2 (perilaku propped-cantilever)
     2 bentang        : M+ = 9wL²/128, M− = wL²/8,  δ = wL⁴/185EI
     ≥3 bentang        : M+ ≈ wL²/11,  M− ≈ wL²/9,  δ ≈ wL⁴/145EI

   PENTING: properti dek (Ase, I, Mkap konstruksi) bersifat INDIKATIF dari geometri —
   WAJIB diverifikasi dengan tabel kapasitas resmi pabrikan (Lysaght Bondek™ /
   Smartdek™ dsb). Semua field dek dapat ditimpa manual. Verifikasi oleh insinyur
   penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'composite-slab';
  var GAMMA_C = 24, ES = 200000;
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }
  function beta1(fc) { return fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7); }
  function rhoTemp(fy) { return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014); }

  /* ------------------------------------------------------------------
     PROPERTI DEK DARI TABEL PABRIKAN (katalog Lysaght yang diunggah user)
     - heavy = LYSAGHT BONDEK / BONDEK II (re-entrant, tinggi 54 mm, rusuk 200 mm,
       cover 590–600 mm). Tabel 1.1 BONDEK II User Guide (Eurocode):
         Zx (10³ mm³/m), Ash=Ase (mm²/m), Ix (10⁴ mm⁴/m), dcb=titik berat dari
         bawah (mm), fy G550 (0,75 & 1,0) / G500 (1,2), massa kg/m².
     - light = LYSAGHT SMARTDEK (profil "W", cover efektif 960 mm). Section
       Properties Table SMARTDEK: A (mm²/m), Ix (mm⁴/m), Zx (mm³/m), massa kg/m²,
       fy 550 (0,70) / 450 (1,0 & 1,2). Tinggi profil ±50 mm (figur katalog).
     Semua nilai dapat ditimpa manual di form.
     ------------------------------------------------------------------ */
  var DECK = {
    heavy: {
      name: 'Bondek / Bondek II', hr: 54, pitch: 200, cover: 600, bc: 600,
      bmts: ['0.75', '1.0', '1.2'],
      t: {
        '0.75': { fy: 550, Ase: 1259, Ix: 479800, Zx: 12500, ye: 15.3, mass: 10.3 },
        '1.0':  { fy: 550, Ase: 1678, Ix: 640800, Zx: 16690, ye: 15.5, mass: 13.6 },
        '1.2':  { fy: 500, Ase: 2014, Ix: 769000, Zx: 20030, ye: 15.5, mass: 16.2 }
      }
    },
    light: {
      name: 'Smartdek', hr: 50, pitch: 320, cover: 960, bc: 500,
      bmts: ['0.70', '1.0', '1.2'],
      t: {
        '0.70': { fy: 550, Ase: 890,  Ix: 409375, Zx: 16974, ye: 26, mass: 7.38 },
        '1.0':  { fy: 450, Ase: 1270, Ix: 584791, Zx: 24357, ye: 26, mass: 10.34 },
        '1.2':  { fy: 450, Ase: 1524, Ix: 701979, Zx: 29330, ye: 26, mass: 12.33 }
      }
    }
  };
  // BMT terdekat yang tersedia untuk profil terpilih
  function nearestBmt(profile, bmt) {
    var d = DECK[profile] || DECK.heavy, keys = d.bmts, b = num(bmt);
    var best = keys[0], bd = Infinity;
    keys.forEach(function (k) { var dd = Math.abs(num(k) - b); if (dd < bd) { bd = dd; best = k; } });
    return best;
  }
  // properti dek + kapasitas momen konstruksi φMn = 0,9·fy·Zx
  function deckDefaults(profile, bmt) {
    var d = DECK[profile] || DECK.heavy;
    var key = nearestBmt(profile, bmt);
    var p = d.t[key];
    return {
      hr: d.hr, pitch: d.pitch, cover: d.cover, bc: d.bc,
      Ase: p.Ase, ye: p.ye, Ideck: p.Ix, fyd: p.fy, mass: p.mass, Zx: p.Zx,
      Mcap: +(0.9 * p.fy * p.Zx / 1e6).toFixed(2)   // kN·m/m
    };
  }

  // koefisien menerus permanen (tahap komposit)
  function coefPerm(spans) {
    if (spans <= 1) return { kP: 1 / 8, kN: 0, kD: 5 / 384, lbl: '1 bentang (sederhana)' };
    if (spans === 2) return { kP: 9 / 128, kN: 1 / 8, kD: 1 / 185, lbl: '2 bentang menerus' };
    return { kP: 1 / 11, kN: 1 / 9, kD: 1 / 145, lbl: '≥3 bentang menerus' };
  }

  /* desain tulangan lentur RC per meter — singly reinforced (tarik) */
  function designRC(Mu, b, d, fc, fy, db, h, asMinRho) {
    var o = { Mu: Mu, As: 0, tc: true, infeasible: false };
    var phi = 0.9;
    if (Mu > 0.005 && d > 0 && b > 0) {
      var Rn = Mu * 1e6 / (phi * b * d * d);
      var disc = 1 - 2 * Rn / (0.85 * fc);
      if (disc < 0) { o.infeasible = true; disc = 0; }
      var rho = (0.85 * fc / fy) * (1 - Math.sqrt(disc));
      o.As = rho * b * d;
      var a = o.As * fy / (0.85 * fc * b), c = a / beta1(fc);
      o.et = c > 0 ? 0.003 * (d - c) / c : Infinity;
      o.tc = o.et >= 0.005;
    }
    o.AsMin = (asMinRho !== undefined ? asMinRho : rhoTemp(fy)) * b * h;
    o.AsReq = Math.max(o.As, o.AsMin);
    o.govMin = o.AsReq > o.As + 1e-6;
    var Ab = Math.PI / 4 * db * db;
    var sMaxAbs = Math.min(3 * h, 450);
    var s = Math.floor((b * Ab / o.AsReq) / 25) * 25;
    var sMax = Math.floor(sMaxAbs / 25) * 25;
    if (s > sMax) s = sMax;
    if (s < 50) s = 50;
    o.s = s; o.sMax = sMaxAbs; o.db = db; o.b = b; o.d = d;
    o.AsProv = b * Ab / s;
    return o;
  }

  /* momen inersia retak transformasi (b, tulangan/dek As pada d) */
  function Icr(As, d, fc, b) {
    var Ec = 4700 * Math.sqrt(fc), n = Math.max(1, ES / Ec);
    var rn = n * As / (b * d);
    var kk = Math.sqrt(rn * rn + 2 * rn) - rn;
    var kd = kk * d;
    return { Icr: b * kd * kd * kd / 3 + n * As * (d - kd) * (d - kd), n: n, kd: kd };
  }

  /* ================= COMPUTE ================= */
  function compute(v) {
    var r = { warn: [], valid: false };
    var L = num(v.L), D = num(v.D);
    var spans = parseInt(v.spans, 10) || 1;
    var prop = v.prop || 'none';
    var comp = (v.composite || 'comp') === 'comp';
    var fc = num(v.fc), fy = num(v.fy);
    var SDL = num(v.SDL), LL = num(v.LL), cLL = num(v.cLL);
    var cover = num(v.cover), db = num(v.db), dbSt = num(v.dbSt), dbBot = num(v.dbBot);
    var hr = num(v.hr), Ase = num(v.Ase), ye = num(v.ye), Ideck = num(v.Ideck);
    var Mcap = num(v.Mcap), fyd = num(v.fyd), bc = num(v.bc);
    var conType = v.conType || 'stud', ds = num(v.ds), fuS = num(v.fuS);

    if (!(L > 0) || !(D > 0) || !(fc > 0) || !(fy > 0) || !(hr > 0)) return r;
    if (D <= hr + 10) { r.warn.push('Tebal slab D harus > tinggi rusuk dek + selimut (hr=' + hr + ' mm).'); }
    var dGeom = DECK[v.profile] || DECK.heavy;
    r.profile = v.profile; r.deckName = dGeom.name; r.pitch = dGeom.pitch; r.deckCover = dGeom.cover;
    Object.assign(r, { L: L, D: D, spans: spans, prop: prop, comp: comp, fc: fc, fy: fy,
      SDL: SDL, LL: LL, cLL: cLL, cover: cover, db: db, dbSt: dbSt, dbBot: dbBot,
      hr: hr, Ase: Ase, ye: ye, Ideck: Ideck, Mcap: Mcap, fyd: fyd, bc: bc,
      conType: conType, ds: ds, fuS: fuS });

    var tc = D - hr;                       // selimut beton di atas rusuk (mm)
    r.tc = tc;
    var DcAvg = D - 0.5 * hr;              // tebal beton rata-rata (mm)
    r.DcAvg = DcAvg;
    r.concSW = GAMMA_C * DcAvg / 1000;     // kN/m²
    r.deckSW = Ase * 7.70e-5;             // kN/m²
    r.permSW = r.concSW + r.deckSW;

    /* -------- TAHAP KONSTRUKSI (dek sendirian) -------- */
    var cc, Lc;
    if (prop === 'mid') { cc = { kP: 9 / 128, kN: 1 / 8, kD: 1 / 185 }; Lc = L / 2; }
    else { cc = coefPerm(spans); Lc = L; }
    r.Lc = Lc;
    r.wcServ = r.concSW + r.deckSW + cLL;
    r.wcDef = r.concSW + r.deckSW;         // beton basah (dead) saja utk lendutan (Lysaght)
    r.wcU = 1.2 * (r.concSW + r.deckSW) + 1.6 * cLL;
    r.McU = Math.max(cc.kP, cc.kN) * r.wcU * Lc * Lc;         // kN·m/m
    r.McCap = Mcap;
    r.cMomOK = Mcap > 0 ? r.McU <= Mcap : null;
    // lendutan dek di bawah berat beton basah (L/180 ≤ 20 mm, cegah ponding)
    r.dc = cc.kD * r.wcDef * Math.pow(Lc * 1000, 4) / (ES * Math.max(Ideck, 1)); // mm
    r.dcLim = Math.min(Lc * 1000 / 180, 20);
    r.cDefOK = r.dc <= r.dcLim;

    /* -------- TAHAP KOMPOSIT -------- */
    var cp = coefPerm(spans);
    r.coefLbl = cp.lbl;
    r.wD = r.permSW + SDL; r.wL = LL;
    r.wu = Math.max(1.4 * r.wD, 1.2 * r.wD + 1.6 * r.wL);
    r.gov14 = 1.4 * r.wD >= 1.2 * r.wD + 1.6 * r.wL;
    r.wSvc = r.wD + r.wL;
    r.Mpos = cp.kP * r.wu * L * L;
    r.Mneg = cp.kN * r.wu * L * L;

    // --- kapasitas momen positif ---
    var Ec = 4700 * Math.sqrt(fc); r.Ec = Ec;
    if (comp) {
      var dp = D - ye;                    // tinggi efektif ke titik berat dek
      r.dp = dp;
      var T = Ase * fyd;                  // N/m (gaya tarik dek leleh)
      var a = T / (0.85 * fc * 1000);
      r.aPos = a; r.Tpos = T / 1000;      // kN/m
      r.aInRib = a > tc;
      r.phiMnPos = 0.9 * T * (dp - a / 2) / 1e6;  // kN·m/m
      r.posOK = r.phiMnPos >= r.Mpos;
      r.posDCR = r.Mpos / r.phiMnPos;
    } else {
      // non-komposit: tulangan bawah RC (tarik di bawah, tekan penuh atas)
      var dBot = D - cover - dbBot / 2;
      r.dBot = dBot;
      r.asBot = designRC(r.Mpos, 1000, dBot, fc, fy, dbBot, D);
      r.phiMnPos = 0.9 * r.asBot.AsProv * fy * (dBot - r.asBot.AsProv * fy / (0.85 * fc * 1000) / 2) / 1e6;
      r.posOK = !r.asBot.infeasible;
    }

    // --- tulangan negatif (atas) di tumpuan menerus ---
    var dn = D - cover - db / 2;
    r.dn = dn;
    if (r.Mneg > 0.005) {
      r.asNeg = designRC(r.Mneg, bc, dn, fc, fy, db, D, 0.0018);
      r.negOK = !r.asNeg.infeasible;
    } else { r.asNeg = null; }

    // --- tulangan susut-suhu (selimut atas dek) ---
    r.AsStSNI = 0.0018 * 1000 * tc;
    r.AsStSDI = 0.00075 * 1000 * tc;
    r.AsSt = Math.max(r.AsStSNI, r.AsStSDI);
    var AbSt = Math.PI / 4 * dbSt * dbSt;
    var sSt = Math.floor((1000 * AbSt / r.AsSt) / 25) * 25;
    var sStMax = Math.floor(Math.min(5 * tc, 450) / 25) * 25;
    if (sSt > sStMax) sSt = sStMax; if (sSt < 50) sSt = 50;
    r.sSt = sSt; r.AsStProv = 1000 * AbSt / sSt;

    // --- lendutan komposit (retak, Branson) ---
    var Asdef, ddef, bdef;
    if (comp) { Asdef = Ase; ddef = r.dp; bdef = 1000; }
    else { Asdef = r.asBot.AsProv; ddef = r.dBot; bdef = 1000; }
    var icrObj = Icr(Asdef, ddef, fc, bdef);
    var Ig = 1000 * Math.pow(DcAvg, 3) / 12;
    var fr = 0.62 * Math.sqrt(fc), yt = DcAvg / 2;
    var Mcr = fr * Ig / yt / 1e6;                 // kN·m/m
    // beban lendutan: dipropi → seluruh D+L pada komposit; tanpa propi → SDL+LL saja
    r.wDefTot = (prop === 'mid') ? r.wSvc : (SDL + LL);
    r.wDefLL = LL;
    var Ma = cp.kP * r.wDefTot * L * L;
    var ratio = Ma > Mcr ? Math.pow(Mcr / Ma, 3) : 1;
    r.Ie = Ma > Mcr ? Math.min(Ig, ratio * Ig + (1 - ratio) * icrObj.Icr) : Ig;
    r.Ig = Ig; r.Icr = icrObj.Icr; r.Mcr = Mcr; r.MaDef = Ma; r.cracked = Ma > Mcr;
    r.dTot = cp.kD * r.wDefTot * Math.pow(L * 1000, 4) / (Ec * r.Ie);
    r.dLL = cp.kD * r.wDefLL * Math.pow(L * 1000, 4) / (Ec * r.Ie);
    r.lim250 = L * 1000 / 250; r.lim360 = L * 1000 / 360;
    r.defOK = r.dTot <= r.lim250 && r.dLL <= r.lim360;

    // --- shear connector ke balok baja penumpu (aksi komposit / angkur ujung) ---
    var Cc = 0.85 * fc * 1000 * tc;       // N/m (tekan selimut beton)
    var Tsteel = comp ? Ase * fyd : (r.asBot ? r.asBot.AsProv * fy : 0);
    r.Vh = Math.min(Tsteel, Cc) / 1000;   // kN/m
    r.Cc = Cc / 1000; r.Tsteel = Tsteel / 1000;
    var Asc = Math.PI / 4 * ds * ds;
    var Rg = 1.0, Rp = 0.6;               // dek tegak lurus balok (konservatif)
    r.Rg = Rg; r.Rp = Rp;
    if (conType === 'stud') {
      r.Qn = Math.min(0.5 * Asc * Math.sqrt(fc * Ec), Rg * Rp * fuS * Asc) / 1000; // kN
    } else {
      // tulangan ulir dilas (welded reinforcing anchor): geser leleh baja tulangan
      r.Qn = Math.min(0.5 * Asc * Math.sqrt(fc * Ec), 0.6 * fuS * Asc) / 1000; // kN
    }
    r.Nstud = r.Qn > 0 ? Math.ceil(r.Vh / r.Qn) : 0;      // per meter lari balok
    r.studSpace = r.Nstud > 0 ? Math.floor(1000 / r.Nstud / 25) * 25 : 0;

    r.valid = true;
    return r;
  }

  /* ================= KANVAS ================= */
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    if (!r || !r.valid) {
      ctx.fillStyle = css('--ink-faint'); ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('Masukkan bentang, tebal slab & profil dek.', w / 2, h / 2); return;
    }
    if (state.viewMode === 'span') drawSpan(ctx, w, h, r);
    else drawSection(ctx, w, h, r);
  }

  /* ---------- Potongan melintang slab + dek ---------- */
  function drawSection(ctx, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), sky = css('--sky') || '#30bced', line = css('--line');
    var margin = 78, availW = w - 2 * margin, availH = h - 150;
    // tampilkan 2 pitch dek (dimensi utama saja; lekukan kecil diabaikan)
    var pitch = r.pitch || 200, nP = 2, totW = pitch * nP;
    var sc = Math.min(availW / totW, availH / (r.D * 1.15));
    var x0 = (w - totW * sc) / 2, y0 = 66;
    var Dp = r.D * sc, tcp = r.tc * sc;
    var yTop = y0, yBot = y0 + Dp;
    var rib = pitch * sc;
    var reent = r.profile === 'heavy';                 // Bondek = re-entrant (dovetail)
    var hTop = (reent ? 0.30 : 0.52) * rib / 2;        // 1/2 lebar bukaan atas trough
    var hBot = (reent ? 0.46 : 0.30) * rib / 2;        // 1/2 lebar dasar trough

    // beton selimut atas (isi)
    ctx.fillStyle = 'rgba(120,140,90,0.10)';
    ctx.fillRect(x0, yTop, totW * sc, tcp);
    // trough beton (isi) + garis dek baja — trapesium sederhana per pitch
    function troughPath(cx) {
      ctx.moveTo(cx - hTop, yTop + tcp);
      ctx.lineTo(cx - hBot, yBot);
      ctx.lineTo(cx + hBot, yBot);
      ctx.lineTo(cx + hTop, yTop + tcp);
    }
    for (var i = 0; i < nP; i++) {
      var cx = x0 + (i + 0.5) * rib;
      ctx.fillStyle = 'rgba(120,140,90,0.10)';
      ctx.beginPath(); troughPath(cx); ctx.closePath(); ctx.fill();
    }
    // garis dek (baja) — soffit menerus
    ctx.strokeStyle = sky; ctx.lineWidth = 2.2; ctx.beginPath();
    ctx.moveTo(x0, yTop + tcp);
    for (var j = 0; j < nP; j++) {
      var cxj = x0 + (j + 0.5) * rib;
      ctx.lineTo(cxj - hTop, yTop + tcp);
      ctx.lineTo(cxj - hBot, yBot);
      ctx.lineTo(cxj + hBot, yBot);
      ctx.lineTo(cxj + hTop, yTop + tcp);
    }
    ctx.lineTo(x0 + totW * sc, yTop + tcp);
    ctx.stroke();
    // permukaan atas beton
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x0 + totW * sc, yTop); ctx.stroke();

    // tulangan susut/negatif (titik) dekat atas
    var covp = r.cover * sc;
    ctx.fillStyle = amber;
    var yBar = yTop + covp;
    for (var b = 0; b <= nP * 4; b++) {
      var xb = x0 + (b + 0.5) / (nP * 4) * totW * sc;
      ctx.beginPath(); ctx.arc(xb, yBar, 2.4, 0, 2 * Math.PI); ctx.fill();
    }

    // dimensi D, tc, hr
    ctx.strokeStyle = faint; ctx.lineWidth = 1; ctx.fillStyle = dim;
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    dimV(ctx, x0 - 14, yTop, yBot, 'D ' + r.D.toFixed(0));
    ctx.textAlign = 'left';
    dimV(ctx, x0 + totW * sc + 14, yTop, yTop + tcp, 'tc ' + r.tc.toFixed(0), true);
    dimV(ctx, x0 + totW * sc + 14, yTop + tcp, yBot, 'hr ' + r.hr.toFixed(0), true);
    // dimensi pitch (rusuk) horizontal di bawah
    var yP = yBot + 16;
    ctx.strokeStyle = faint; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yP); ctx.lineTo(x0 + rib, yP);
    ctx.moveTo(x0, yP - 3); ctx.lineTo(x0, yP + 3);
    ctx.moveTo(x0 + rib, yP - 3); ctx.lineTo(x0 + rib, yP + 3); ctx.stroke();
    ctx.fillStyle = dim; ctx.textAlign = 'center';
    ctx.fillText('pitch ' + r.pitch.toFixed(0), x0 + rib / 2, yP + 12);

    // label
    ctx.fillStyle = amber; ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('tul. susut/negatif D' + r.dbSt + '/D' + r.db + ' (atas)', w / 2, yTop - 8);
    ctx.fillStyle = sky;
    ctx.fillText((r.comp ? 'dek = tulangan tarik (Ase ' + r.Ase.toFixed(0) + ' mm²/m)' : 'dek = bekisting (non-komposit)') +
      ' · cover ' + r.deckCover.toFixed(0) + ' mm', w / 2, yP + 28);

    ctx.fillStyle = faint; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('Potongan melintang — ' + r.deckName + (reent ? ' (re-entrant)' : ' (profil W)'), w / 2, 20);
    ctx.fillStyle = r.comp ? (r.posOK ? '#3dd68c' : '#ff6b6b') : dim;
    ctx.textAlign = 'center'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('φMn+ ' + r.phiMnPos.toFixed(2) + ' ≥ Mu+ ' + r.Mpos.toFixed(2) + ' kN·m/m' + (r.comp ? (r.posOK ? '  OK' : '  NG') : ''), w / 2, h - 16);
  }

  function dimV(ctx, x, y1, y2, txt, right) {
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, y1); ctx.lineTo(x + 3, y1);
    ctx.moveTo(x - 3, y2); ctx.lineTo(x + 3, y2); ctx.stroke();
    ctx.save(); ctx.translate(right ? x + 6 : x - 6, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText(txt, 0, 0); ctx.restore();
  }

  /* ---------- Elevasi bentang + topangan + skema momen ---------- */
  function drawSpan(ctx, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), sky = css('--sky') || '#30bced';
    var nS = r.spans, margin = 60;
    var totW = w - 2 * margin, x0 = margin, yb = h * 0.42;
    var spanW = totW / nS;

    // garis slab
    ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0 + totW, yb); ctx.stroke();

    // tumpuan permanen (segitiga)
    function sup(x, perm) {
      ctx.fillStyle = perm ? ink : amber; ctx.strokeStyle = perm ? ink : amber;
      ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x - 7, yb + 13); ctx.lineTo(x + 7, yb + 13);
      ctx.closePath(); ctx.fill();
    }
    for (var i = 0; i <= nS; i++) sup(x0 + i * spanW, true);

    // topangan sementara (tengah tiap bentang) — garis putus + segitiga amber
    if (r.prop === 'mid') {
      ctx.setLineDash([4, 3]);
      for (var s = 0; s < nS; s++) {
        var xp = x0 + (s + 0.5) * spanW;
        ctx.strokeStyle = amber; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(xp, yb); ctx.lineTo(xp, yb + 26); ctx.stroke();
        sup(xp, false);
      }
      ctx.setLineDash([]);
    }

    // skema momen komposit (parabola per bentang) — positif ke bawah, negatif ke atas
    var mAmp = 46;
    ctx.strokeStyle = sky; ctx.lineWidth = 2;
    for (var sp = 0; sp < nS; sp++) {
      var xa = x0 + sp * spanW;
      ctx.beginPath();
      for (var t = 0; t <= 1.001; t += 0.05) {
        var mNorm;
        if (nS === 1) mNorm = 4 * t * (1 - t);                 // + saja
        else {
          // hogging di tumpuan interior, sagging di lapangan (skematik)
          var hog = (sp > 0 && t < 0.15) || (sp < nS - 1 && t > 0.85);
          mNorm = 4 * t * (1 - t) - 0.5 * (Math.pow(Math.abs(t - 0.5) * 2, 6));
          mNorm = 0.9 * (4 * t * (1 - t)) - (t < 0.5 && sp > 0 ? (1 - 2 * t) * 0.55 : 0) - (t > 0.5 && sp < nS - 1 ? (2 * t - 1) * 0.55 : 0);
        }
        var xx = xa + t * spanW, yy = yb + mNorm * mAmp;
        if (t === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    // label bentang & momen
    ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('L = ' + r.L.toFixed(2) + ' m × ' + nS + ' bentang', w / 2, yb + 52);
    ctx.fillStyle = sky;
    ctx.fillText('M+ ' + r.Mpos.toFixed(1) + ' kN·m/m' + (r.Mneg > 0.005 ? '   ·   M− ' + r.Mneg.toFixed(1) + ' kN·m/m' : ''), w / 2, yb + 68);

    // panel konstruksi
    var yc = h - 70;
    ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Tahap konstruksi (dek):', x0, yc);
    ctx.fillStyle = r.cMomOK === false ? '#ff6b6b' : dim;
    ctx.fillText('  Mu ' + r.McU.toFixed(2) + ' vs kap ' + r.McCap.toFixed(2) + ' kN·m/m' + (r.cMomOK === false ? '  NG' : (r.cMomOK ? '  OK' : '')), x0, yc + 15);
    ctx.fillStyle = r.cDefOK ? dim : '#ff6b6b';
    ctx.fillText('  δ ' + r.dc.toFixed(1) + ' vs batas ' + r.dcLim.toFixed(1) + ' mm (L/180≤20)' + (r.cDefOK ? '  OK' : '  NG') +
      (r.prop === 'mid' ? '  [bentang efektif L/2]' : ''), x0, yc + 30);

    ctx.fillStyle = faint; ctx.textAlign = 'center'; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('Elevasi bentang — tumpuan permanen (■) & topangan sementara (▲)', w / 2, 20);
  }

  /* ================= UI ================= */
  function injectStyle() {
    if (document.getElementById('cs-style')) return;
    var s = document.createElement('style'); s.id = 'cs-style';
    s.textContent =
      '.cs-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.cs-canvas{position:relative;flex:1 1 48%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.cs-res{flex:1 1 52%;overflow-y:auto;padding:18px 24px 34px}' +
      '.cs-viewseg{position:absolute;right:12px;top:10px;display:flex;z-index:4;border:1px solid var(--line);border-radius:8px;overflow:hidden}' +
      '.cs-viewseg button{background:var(--panel);color:var(--ink-dim);border:0;padding:5px 12px;font:600 12px "Space Grotesk",sans-serif;cursor:pointer}' +
      '.cs-viewseg button.active{background:var(--amber);color:var(--bg)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');
    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Slab Komposit + Metal Deck'));
    panel.appendChild(UI.el('div', 'sub', 'Slab beton di atas metal deck (bondek/smartdek): cek dek tahap konstruksi, kapasitas komposit, tulangan negatif & susut, lendutan, dan shear connector — SNI 2847:2019 + SNI 1729:2020.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'cs-work');
    var canvasHost = UI.el('div', 'cs-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Slab komposit');
    var results = UI.el('div', 'cs-res');
    work.appendChild(canvasHost); work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var dd = deckDefaults('heavy', 0.75);
    var schema = [
      { type: 'group', label: 'Geometri & bentang' },
      { type: 'number', id: 'L', label: 'L — bentang bersih', unit: 'm', value: 3, min: 1, step: 0.1 },
      { type: 'number', id: 'D', label: 'D — tebal total slab', unit: 'mm', value: 120, min: 80, step: 5 },
      { type: 'select', id: 'spans', label: 'Jumlah bentang', value: '2', options: [
        { value: '1', label: '1 (bentang tunggal)' }, { value: '2', label: '2 bentang' }, { value: '3', label: '≥3 bentang' }] },
      { type: 'select', id: 'prop', label: 'Topangan sementara', value: 'none', options: [
        { value: 'none', label: 'Tanpa topangan (unpropped)' }, { value: 'mid', label: 'Di tengah bentang (propped)' }],
        hint: 'Topangan tengah → bentang konstruksi efektif = L/2.' },
      { type: 'select', id: 'composite', label: 'Aksi struktur', value: 'comp', options: [
        { value: 'comp', label: 'Komposit (dek = tulangan)' }, { value: 'noncomp', label: 'Non-komposit (dek = bekisting)' }] },

      { type: 'group', label: 'Profil metal deck (data katalog Lysaght)' },
      { type: 'select', id: 'profile', label: 'Profil dek', value: 'heavy', options: [
        { value: 'heavy', label: 'Bondek / Bondek II (re-entrant 54 mm)' }, { value: 'light', label: 'Smartdek (profil W, cover 960)' }] },
      { type: 'select', id: 'bmt', label: 'Tebal baja dasar (BMT)', value: '0.75', options: [
        { value: '0.70', label: '0,70 mm (Smartdek)' }, { value: '0.75', label: '0,75 mm (Bondek)' }, { value: '1.0', label: '1,00 mm' }, { value: '1.2', label: '1,20 mm' }],
        hint: 'Otomatis menyesuaikan tabel penampang saat profil/BMT diganti.' },
      { type: 'number', id: 'hr', label: 'hr — tinggi rusuk dek', unit: 'mm', value: dd.hr, min: 20, step: 1 },
      { type: 'number', id: 'Ase', label: 'Ase — luas baja dek', unit: 'mm²/m', value: dd.Ase, min: 100, step: 10, hint: 'Terisi dari tabel pabrikan — bisa ditimpa.' },
      { type: 'number', id: 'ye', label: 'yc — titik berat dek dari bawah (dcb)', unit: 'mm', value: dd.ye, min: 5, step: 0.1 },
      { type: 'number', id: 'Ideck', label: 'Ix dek', unit: 'mm⁴/m', value: dd.Ideck, min: 1000, step: 1000 },
      { type: 'number', id: 'Mcap', label: 'φMn dek konstruksi (0,9·fy·Zx)', unit: 'kN·m/m', value: dd.Mcap, min: 0, step: 0.1, hint: 'Dari tabel Zx — bisa ditimpa dengan kapasitas resmi.' },
      { type: 'number', id: 'fyd', label: 'fyd — leleh baja dek', unit: 'MPa', value: dd.fyd, min: 250, step: 10 },
      { type: 'number', id: 'bc', label: 'Σ lebar bawah rusuk (tekan hogging)', unit: 'mm/m', value: dd.bc, min: 100, step: 10 },

      { type: 'group', label: 'Beban (belum terfaktor)' },
      { type: 'number', id: 'SDL', label: 'SDL — mati tambahan', unit: 'kN/m²', value: 1.5, min: 0, step: 0.1, hint: 'Selain berat sendiri slab+dek (dihitung otomatis).' },
      { type: 'number', id: 'LL', label: 'LL — beban hidup', unit: 'kN/m²', value: 2.5, min: 0, step: 0.1 },
      { type: 'number', id: 'cLL', label: 'Beban hidup konstruksi', unit: 'kN/m²', value: 1.0, min: 0, step: 0.1, hint: 'Pekerja + peralatan saat cor (SDI ~1,0).' },

      { type: 'group', label: 'Material & tulangan' },
      { type: 'number', id: 'fc', label: "f'c — mutu beton", unit: 'MPa', value: 25, min: 15, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tulangan', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'number', id: 'cover', label: 'Selimut atas', unit: 'mm', value: 20, min: 15, step: 5 },
      { type: 'select', id: 'db', label: 'Ø tul. negatif (atas)', value: '10', options: [8, 10, 13, 16].map(function (d) { return { value: '' + d, label: 'D' + d }; }) },
      { type: 'select', id: 'dbBot', label: 'Ø tul. bawah (non-komposit)', value: '10', options: [8, 10, 13, 16].map(function (d) { return { value: '' + d, label: 'D' + d }; }) },
      { type: 'select', id: 'dbSt', label: 'Ø tul. susut', value: '8', options: [6, 8, 10].map(function (d) { return { value: '' + d, label: 'D' + d }; }) },

      { type: 'group', label: 'Shear connector (ke balok baja)' },
      { type: 'select', id: 'conType', label: 'Tipe konektor', value: 'stud', options: [
        { value: 'stud', label: 'Shear stud (headed)' }, { value: 'rebar', label: 'Tulangan ulir dilas' }] },
      { type: 'select', id: 'ds', label: 'Ø konektor', value: '19', options: [13, 16, 19, 22].map(function (d) { return { value: '' + d, label: 'Ø' + d }; }) },
      { type: 'number', id: 'fuS', label: 'Fu konektor', unit: 'MPa', value: 450, min: 300, step: 10, hint: 'Stud Fu; tul. ulir gunakan fu tulangan.' }
    ];
    var form = UI.buildForm(panel, schema, function (vals, changed) {
      if (changed === 'profile' || changed === 'bmt') {
        var prof = form.getValues().profile;
        var snapped = nearestBmt(prof, form.getValues().bmt);
        if (String(snapped) !== String(form.getValues().bmt)) form.setValue('bmt', snapped);
        var d2 = deckDefaults(prof, snapped);
        form.setValue('hr', d2.hr); form.setValue('Ase', d2.Ase); form.setValue('ye', d2.ye);
        form.setValue('Ideck', d2.Ideck); form.setValue('Mcap', d2.Mcap); form.setValue('fyd', d2.fyd);
        form.setValue('bc', d2.bc);
        vals = form.getValues();
      }
      state.profile = vals.profile;
      update(vals, results);
    }, ID);
    state.form = form; state.results = results;
    state.profile = form.getValues().profile;

    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    // toggle Penampang / Bentang
    state.viewMode = 'section';
    var seg = UI.el('div', 'cs-viewseg');
    var modes = [['section', 'Penampang'], ['span', 'Bentang']];
    var vbtns = modes.map(function (m) {
      var b = UI.el('button', m[0] === state.viewMode ? 'active' : null, m[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.viewMode = m[0];
        vbtns.forEach(function (bb, i) { bb.classList.toggle('active', modes[i][0] === m[0]); });
        if (state.cv) state.cv.redraw();
      });
      seg.appendChild(b); return b;
    });
    canvasHost.appendChild(seg);

    if (state.canvas2d) state.cv = state.canvas2d.create(canvasHost, drawScene);
    update(form.getValues(), results);
  }

  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    results.innerHTML = '';
    if (!r.valid) {
      state.cap.set('Slab komposit');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi bentang, tebal slab & profil dek untuk menghitung.'));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set('D ' + UI.fmt(r.D, 0) + ' · L ' + UI.fmt(r.L, 2) + ' m × ' + r.spans + ' · wu ' + UI.fmt(r.wu, 1) + ' kN/m²');

    var posTone = r.posOK ? 'ok' : 'bad';
    results.appendChild(UI.heroRow([
      { label: r.comp ? 'φMn+ komposit' : 'φMn+ (tul. bawah)', value: UI.fmt(r.phiMnPos, 2), unit: 'kN·m/m', tone: posTone },
      { label: 'Mu+ perlu', value: UI.fmt(r.Mpos, 2), unit: 'kN·m/m' },
      { label: 'δ total', value: UI.fmt(r.dTot, 2), unit: 'mm', tone: r.defOK ? 'ok' : 'bad' }
    ]));

    // Profil dek (data katalog)
    results.appendChild(UI.rhead('Profil dek — ' + r.deckName + ' (katalog Lysaght)'));
    results.appendChild(UI.kv('Ase / Ix', UI.fmt(r.Ase, 0) + ' mm²/m · ' + UI.fmt(r.Ideck / 1e4, 1) + '·10⁴ mm⁴/m'));
    results.appendChild(UI.kv('fyd · hr · pitch · cover', UI.fmt(r.fyd, 0) + ' MPa · ' + UI.fmt(r.hr, 0) + ' · ' + UI.fmt(r.pitch, 0) + ' · ' + UI.fmt(r.deckCover, 0) + ' mm'));

    // Tahap konstruksi
    results.appendChild(UI.rhead('Tahap konstruksi — dek sebagai bekisting' + (r.prop === 'mid' ? ' (topangan tengah, Le=L/2)' : '')));
    results.appendChild(UI.kv('Berat beton basah (t rata ' + UI.fmt(r.DcAvg, 0) + ' mm)', UI.fmt(r.concSW, 2) + ' kN/m²'));
    results.appendChild(UI.kv('Berat dek', UI.fmt(r.deckSW, 3) + ' kN/m²'));
    results.appendChild(UI.kv('wu konstruksi (1,2D+1,6Lc)', UI.fmt(r.wcU, 2) + ' kN/m²'));
    results.appendChild(UI.kv('Mu dek vs φMn dek', UI.fmt(r.McU, 2) + ' / ' + UI.fmt(r.McCap, 2) + ' kN·m/m',
      r.cMomOK === false ? 'bad' : (r.cMomOK ? 'ok' : '')));
    results.appendChild(UI.kv('δ dek (beton basah) vs batas (L/180 ≤ 20 mm)', UI.fmt(r.dc, 1) + ' / ' + UI.fmt(r.dcLim, 1) + ' mm',
      r.cDefOK ? 'ok' : 'bad'));

    // Tahap komposit — momen & kapasitas positif
    results.appendChild(UI.rhead('Tahap komposit — momen positif (' + r.coefLbl + ')'));
    results.appendChild(UI.kv('Berat sendiri slab+dek / SDL / LL', UI.fmt(r.permSW, 2) + ' / ' + UI.fmt(r.SDL, 2) + ' / ' + UI.fmt(r.LL, 2) + ' kN/m²'));
    results.appendChild(UI.kv('wu = ' + (r.gov14 ? '1,4D' : '1,2D+1,6L'), UI.fmt(r.wu, 2) + ' kN/m²'));
    if (r.comp) {
      results.appendChild(UI.kv('dp (ke titik berat dek)', UI.fmt(r.dp, 0) + ' mm · a ' + UI.fmt(r.aPos, 1) + ' mm'));
      results.appendChild(UI.kv('Gaya tarik dek T = Ase·fyd', UI.fmt(r.Tpos, 0) + ' kN/m'));
      results.appendChild(UI.kv('φMn+ ≥ Mu+', UI.fmt(r.phiMnPos, 2) + ' ≥ ' + UI.fmt(r.Mpos, 2) + ' kN·m/m · D/C ' + UI.fmt(r.posDCR, 2), posTone));
      if (r.aInRib) results.appendChild(UI.kv('Catatan', 'a > tc — blok tekan masuk rusuk; tinjau lebih teliti', 'bad'));
    } else {
      results.appendChild(UI.kv('Tul. bawah (non-komposit) d ' + UI.fmt(r.dBot, 0), 'D' + r.dbBot + '-' + r.asBot.s + ' (As ' + UI.fmt(r.asBot.AsProv, 0) + ' mm²/m)' + (r.asBot.govMin ? ' As,min' : ''), r.asBot.infeasible ? 'bad' : 'ok'));
    }

    // Momen negatif
    results.appendChild(UI.rhead('Tulangan negatif (atas) di tumpuan'));
    if (r.asNeg) {
      results.appendChild(UI.kv('Mu− (lebar tekan rusuk ' + UI.fmt(r.bc, 0) + ' mm/m)', UI.fmt(r.Mneg, 2) + ' kN·m/m'));
      results.appendChild(UI.kv('Tulangan negatif (d ' + UI.fmt(r.dn, 0) + ')', 'D' + r.db + '-' + r.asNeg.s + ' (As ' + UI.fmt(r.asNeg.AsReq, 0) + ' mm²/m)' + (r.asNeg.govMin ? ' As,min' : ''), r.asNeg.infeasible ? 'bad' : 'ok'));
    } else {
      results.appendChild(UI.kv('Momen negatif', '— (bentang tunggal, tak menerus)'));
    }
    results.appendChild(UI.kv('Tul. susut-suhu (selimut tc ' + UI.fmt(r.tc, 0) + ' mm)', 'D' + r.dbSt + '-' + r.sSt + ' (As ' + UI.fmt(r.AsSt, 0) + ' mm²/m)'));

    // Lendutan
    results.appendChild(UI.rhead('Lendutan komposit — Ie retak (Branson)'));
    results.appendChild(UI.kv('Beban lendutan (' + (r.prop === 'mid' ? 'dipropi: D+L' : 'unpropped: SDL+LL') + ')', UI.fmt(r.wDefTot, 2) + ' kN/m²'));
    results.appendChild(UI.kv('Mcr / Ma', UI.fmt(r.Mcr, 1) + ' / ' + UI.fmt(r.MaDef, 1) + ' kN·m/m ' + (r.cracked ? '(retak)' : '(utuh)')));
    results.appendChild(UI.kv('Ie / Ig', UI.fmt(100 * r.Ie / r.Ig, 0) + '%'));
    results.appendChild(UI.kv('δ total vs L/250', UI.fmt(r.dTot, 2) + ' / ' + UI.fmt(r.lim250, 2) + ' mm', r.dTot <= r.lim250 ? 'ok' : 'bad'));
    results.appendChild(UI.kv('δ hidup vs L/360', UI.fmt(r.dLL, 2) + ' / ' + UI.fmt(r.lim360, 2) + ' mm', r.dLL <= r.lim360 ? 'ok' : 'bad'));

    // Shear connector
    results.appendChild(UI.rhead('Shear connector — aksi komposit / angkur ke balok baja'));
    results.appendChild(UI.kv('Vh = min(Ase·fyd ; 0,85f\'c·Ac)', UI.fmt(r.Vh, 0) + ' kN/m (T ' + UI.fmt(r.Tsteel, 0) + ' · C ' + UI.fmt(r.Cc, 0) + ')'));
    results.appendChild(UI.kv('Qn ' + (r.conType === 'stud' ? 'stud Ø' + r.ds : 'tul. ulir Ø' + r.ds) + ' (Rg·Rp ' + UI.fmt(r.Rg * r.Rp, 2) + ')', UI.fmt(r.Qn, 1) + ' kN/konektor'));
    results.appendChild(UI.kv('Jumlah konektor', UI.fmt(r.Nstud, 0) + ' bh/m lari balok · spasi ±' + UI.fmt(r.studSpace, 0) + ' mm'));

    if (r.warn.length) results.appendChild(UI.note('Peringatan',
      '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'));
    results.appendChild(UI.note('Metode & asumsi',
      'Dua tahap: (1) <b>konstruksi</b> — dek memikul beton basah + beban hidup pekerja sendirian; dicek momen vs kapasitas pabrikan & lendutan ≤ L/180 (≤20 mm). Topangan sementara di tengah membuat bentang efektif L/2. ' +
      '(2) <b>komposit</b> — pada momen positif dek berperan sebagai tulangan tarik (Ase·fyd, blok tekan 0,85f\'c); momen negatif di tumpuan didesain sebagai beton bertulang biasa (dek diabaikan, lebar tekan = Σ lebar bawah rusuk). ' +
      'Tulangan susut-suhu pada selimut beton di atas dek (SNI 0,0018·Ag; SDI min 0,00075). Lendutan memakai Ie retak (Branson) dibanding L/250 (total) & L/360 (hidup). ' +
      'Shear connector (stud headed atau tulangan ulir dilas) mengembangkan aksi komposit / angkur ujung ke balok baja penumpu: Vh = min(gaya leleh dek; tekan beton), Qn per AISC I8 dengan faktor dek Rg·Rp (dek ⟂ balok, konservatif). ' +
      '<b>Properti dek (Ase, Ix, Zx, dcb, fy, massa) diambil dari tabel katalog Lysaght — Bondek / Bondek II (re-entrant 54 mm, rusuk 200 mm) & Smartdek (profil W, cover 960 mm)</b>; φMn dek konstruksi = 0,9·fy·Zx. Semua field dek bisa ditimpa manual dengan angka proyek. ' +
      'Ilustrasi potongan disederhanakan (dimensi utama saja, lekukan kecil/emboss diabaikan). Verifikasi akhir dengan Design & Construction Manual pabrikan oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ================= REPORT ================= */
  var APP_VER = 'v0.7.2', RW = 62;
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function ruleR(c) { return ' ' + rep(c || '-', RW); }
  function centerR(t) { var s = Math.max(0, Math.floor((RW - t.length) / 2)); return ' ' + rep(' ', s) + t; }
  function rowR(label, value) {
    value = '' + value; var l = label + ' ', vv = ' ' + value;
    var d = RW - l.length - vv.length; if (d < 2) d = 2;
    return ' ' + l + rep('.', d) + vv;
  }
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }

  function figSection(r) {
    var ops = [], x0 = 150, y0 = 20;
    var pitchMM = r.pitch || 200, nP = 2;
    var sc = Math.min(230 / (pitchMM * nP), 88 / r.D);
    var pitch = pitchMM * sc, tcp = r.tc * sc, Dp = r.D * sc;
    var reent = r.profile === 'heavy';
    var hTop = (reent ? 0.30 : 0.52) * pitch / 2, hBot = (reent ? 0.46 : 0.30) * pitch / 2;
    // beton selimut atas
    ops.push({ t: 'rect', x: x0, y: y0, w: pitch * nP, h: tcp, lw: 0.3, g: 0.85 });
    // profil dek (soffit menerus, trough trapesium sederhana)
    var pts = [[x0, y0 + tcp]];
    for (var j = 0; j < nP; j++) {
      var cx = x0 + (j + 0.5) * pitch;
      pts.push([cx - hTop, y0 + tcp]); pts.push([cx - hBot, y0 + Dp]);
      pts.push([cx + hBot, y0 + Dp]); pts.push([cx + hTop, y0 + tcp]);
    }
    pts.push([x0 + pitch * nP, y0 + tcp]);
    ops.push({ t: 'poly', pts: pts, lw: 0.9, g: 0.1 });
    ops.push({ t: 'line', x1: x0, y1: y0, x2: x0 + pitch * nP, y2: y0, lw: 0.9, g: 0 });
    // dimensi
    ops.push({ t: 'text', x: x0 - 6, y: y0 + Dp / 2, s: 'D' + numR(r.D, 0), size: 6, align: 'r' });
    ops.push({ t: 'text', x: x0 + pitch * nP + 4, y: y0 + tcp, s: 'tc' + numR(r.tc, 0), size: 6, align: 'l' });
    ops.push({ t: 'text', x: x0 + pitch * nP + 4, y: y0 + Dp, s: 'hr' + numR(r.hr, 0), size: 6, align: 'l' });
    ops.push({ t: 'text', x: x0 + pitch / 2, y: y0 + Dp + 10, s: 'pitch ' + numR(r.pitch, 0), size: 5.5, align: 'c' });
    ops.push({ t: 'text', x: 264, y: y0 + Dp + 22, s: 'Gbr. 1  Potongan ' + r.deckName + ' - cover ' + numR(r.deckCover, 0) + ' mm (disederhanakan)', size: 7, align: 'c' });
    return { fig: { h: Math.ceil((Dp + 36) / 11.5), ops: ops, alt: 'Gbr. 1 Potongan slab komposit ' + r.deckName + ' - lihat versi PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('SLAB KOMPOSIT + METAL DECK'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019 / 1729:2020   ' + APP_VER, dt));
    L.push('');
    L.push(' INPUT'); L.push(ruleR('-'));
    L.push(rowR('Bentang L x jumlah', numR(r.L, 2) + ' m x ' + r.spans + ' (' + r.coefLbl + ')'));
    L.push(rowR('Tebal slab D / tc / hr', numR(r.D, 0) + ' / ' + numR(r.tc, 0) + ' / ' + numR(r.hr, 0) + ' mm'));
    L.push(rowR('Aksi / topangan', (r.comp ? 'Komposit' : 'Non-komposit') + ' / ' + (r.prop === 'mid' ? 'propped L/2' : 'unpropped')));
    L.push(rowR('Profil dek', r.deckName + ' (hr' + numR(r.hr, 0) + ' pitch' + numR(r.pitch, 0) + ' cover' + numR(r.deckCover, 0) + ')'));
    L.push(rowR('Dek Ase / fyd / Ix', numR(r.Ase, 0) + ' mm2/m / ' + numR(r.fyd, 0) + ' MPa / ' + numR(r.Ideck / 1e4, 1) + 'e4 mm4/m'));
    L.push(rowR("f'c / fy", numR(r.fc, 0) + ' / ' + numR(r.fy, 0) + ' MPa'));
    L.push(rowR('SDL / LL / Lc', numR(r.SDL, 2) + ' / ' + numR(r.LL, 2) + ' / ' + numR(r.cLL, 2) + ' kN/m2'));
    L.push('');
    L.push(figSection(r));
    L.push('');
    L.push(' TAHAP KONSTRUKSI (dek)'); L.push(ruleR('.'));
    L.push(rowR('Beton basah + dek', numR(r.concSW, 2) + ' + ' + numR(r.deckSW, 3) + ' kN/m2'));
    L.push(rowR('wu konstruksi', numR(r.wcU, 2) + ' kN/m2'));
    L.push(rowR('Mu dek / kap', numR(r.McU, 2) + ' / ' + numR(r.McCap, 2) + ' kNm/m' + (r.cMomOK === false ? ' NG' : ' OK')));
    L.push(rowR('delta dek / batas', numR(r.dc, 1) + ' / ' + numR(r.dcLim, 1) + ' mm' + (r.cDefOK ? ' OK' : ' NG')));
    L.push('');
    L.push(' TAHAP KOMPOSIT'); L.push(ruleR('.'));
    L.push(rowR('wu (' + (r.gov14 ? '1.4D' : '1.2D+1.6L') + ')', numR(r.wu, 2) + ' kN/m2'));
    L.push(rowR('Mu+ / Mu-', numR(r.Mpos, 2) + ' / ' + numR(r.Mneg, 2) + ' kNm/m'));
    if (r.comp) {
      L.push(rowR('dp / a / T', numR(r.dp, 0) + ' / ' + numR(r.aPos, 1) + ' mm / ' + numR(r.Tpos, 0) + ' kN/m'));
      L.push(rowR('phiMn+ / Mu+', numR(r.phiMnPos, 2) + ' / ' + numR(r.Mpos, 2) + ' kNm/m' + (r.posOK ? ' OK' : ' NG')));
    } else {
      L.push(rowR('Tul. bawah', 'D' + r.dbBot + '-' + r.asBot.s + ' As ' + numR(r.asBot.AsProv, 0)));
    }
    if (r.asNeg) L.push(rowR('Tul. negatif', 'D' + r.db + '-' + r.asNeg.s + ' As ' + numR(r.asNeg.AsReq, 0) + ' mm2/m'));
    L.push(rowR('Tul. susut', 'D' + r.dbSt + '-' + r.sSt + ' As ' + numR(r.AsSt, 0) + ' mm2/m'));
    L.push('');
    L.push(' LENDUTAN & KONEKTOR'); L.push(ruleR('.'));
    L.push(rowR('Ie/Ig', numR(100 * r.Ie / r.Ig, 0) + '% ' + (r.cracked ? '(retak)' : '(utuh)')));
    L.push(rowR('delta total / L250', numR(r.dTot, 2) + ' / ' + numR(r.lim250, 2) + ' mm' + (r.dTot <= r.lim250 ? ' OK' : ' NG')));
    L.push(rowR('delta LL / L360', numR(r.dLL, 2) + ' / ' + numR(r.lim360, 2) + ' mm' + (r.dLL <= r.lim360 ? ' OK' : ' NG')));
    L.push(rowR('Vh', numR(r.Vh, 0) + ' kN/m'));
    L.push(rowR((r.conType === 'stud' ? 'Stud O' : 'Tul.ulir O') + r.ds + ' Qn', numR(r.Qn, 1) + ' kN'));
    L.push(rowR('Jml konektor', numR(r.Nstud, 0) + ' bh/m lari (spasi ' + numR(r.studSpace, 0) + ' mm)'));
    L.push(''); L.push(' ' + rep('=', RW));
    L.push(' Properti dek indikatif - verifikasi tabel pabrikan.');
    L.push(centerR('Verifikasi oleh insinyur penanggung jawab.'));
    L.push(' ' + rep('=', RW));
    return L;
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi input dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var base = 'SlabKomposit_' + numR(r.L, 1) + 'm_D' + numR(r.D, 0) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ================= KONTRAK MODULE ================= */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Slab Komposit + Metal Deck', category: 'Beton Bertulang', needsCanvas: true, needsRenderer: false },
    mount: function (container, runtime) { state = { UI: runtime.UI, canvas2d: runtime.canvas2d }; render(container); },
    unmount: function () {
      if (state.cv) state.cv.destroy();
      state = {};
    }
  };
})();
