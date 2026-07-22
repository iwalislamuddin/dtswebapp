/* ============================================================
   Civil Tools — modules/retaining-concrete/module.js  (Tier 2, kanvas 2D)
   Dinding Penahan Tanah (DPT) BETON BERTULANG — tipe kantilever.

   BENTUK: badan (stem) trapesium siku-siku, 2 opsi orientasi
   (sisi tegak ke tanah / sisi miring ke tanah — sama dengan tool
   DPT Batu Kali tetapi lebih tipis), tapak persegi dengan proyeksi
   depan (toe) & belakang (heel) BEBAS ≥ 0 — bisa menjorok ke luar,
   ke dalam, atau keduanya.

   ANALISIS DUA LAPIS:
   1) STABILITAS — beban LAYAN (tanpa faktor), identik gravitasi:
      Rankine bidang semu di tepi tumit (H' = H+tf+ws·tanβ, arah β),
      berat tanah di atas tumit ikut menahan, q hanya pendorong.
      Guling ≥ 2,0 · Geser ≥ 1,5 · e vs B/6 · qmax ≤ q_izin.
   2) PENULANGAN — beban TERFAKTOR U = 1,2D + 1,6H + 1,6L:
      Distribusi tumpu terfaktor qu(x) (trapesium/segitiga) dari
      SVu & SMu → momen/geser kantilever:
        STEM  (tul. vertikal muka tanah): Mu=1,6·cosβ·Ka(γH³/6+qH²/2)
        TOE   (tul. bawah): ∫[qu(x) − 1,2·γc·tf]·lengan dx (numerik)
        HEEL  (tul. atas) : ∫[1,2(γc·tf+γ1·hs)+1,6q − qu(x)]·lengan dx
      Lentur SNI 2847:2019: Rn → ρ → As; As,min lentur
      maks(0,25√fc′; 1,4)/fy·b·d (boleh 4/3·As,perlu);
      s ≤ min(3h; 450). Geser satu arah φVc = 0,75·0,17√fc′·b·d.
      Susut-suhu: stem horizontal 0,0020·Ag (2 muka), muka depan
      vertikal 0,0012·Ag, tapak memanjang 0,0018·Ag.

   BOQ: volume beton, ESTIMASI berat besi per set tulangan
   (belum termasuk overlap/stek/waste), luas bekisting.

   TIDAK termasuk: air tanah, gempa (Mononobe-Okabe), stabilitas
   global, penurunan, shear key, panjang penyaluran rinci (pakai
   tool Penyaluran Tulangan). Verifikasi insinyur (SNI 8460/2847).
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'retaining-concrete';

  var D2R = Math.PI / 180;
  var state = {};
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

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
     LENTUR SATU METER (mm, MPa) — SNI 2847:2019
     ============================================================ */
  function flexure(MukNm, d, hmm, db, fc, fy) {
    var out = { Mu: MukNm, d: d, ng: false, note: '' };
    var b = 1000, phi = 0.9;
    var AsReq = 0, rho = 0;
    if (MukNm > 0.005) {
      var Rn = MukNm * 1e6 / (phi * b * d * d);
      var disc = 1 - 2 * Rn / (0.85 * fc);
      if (disc <= 0) { out.ng = true; out.note = 'Penampang terlalu tipis (Rn terlalu besar) — perbesar tebal.'; return out; }
      rho = 0.85 * fc / fy * (1 - Math.sqrt(disc));
      AsReq = rho * b * d;
    }
    var AsMin = Math.max(0.25 * Math.sqrt(fc), 1.4) / fy * b * d;
    var AsUse = Math.max(AsReq, Math.min(AsMin, 4 / 3 * AsReq));
    if (AsUse < 1e-6) AsUse = AsMin;      // momen ~0: pasang minimum
    var Abar = Math.PI * db * db / 4;
    var s = Math.floor((1000 * Abar / AsUse) / 25) * 25;
    var sMax = Math.min(3 * hmm, 450);
    if (s > sMax) s = Math.floor(sMax / 25) * 25;
    if (s < 50) { out.ng = true; out.note = 'Spasi < 50 mm — pakai diameter lebih besar / pertebal penampang.'; s = 50; }
    var AsProv = 1000 * Abar / s;
    var a = AsProv * fy / (0.85 * fc * b);
    var beta1 = (fc <= 28) ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
    var c = a / beta1;
    var et = (c > 1e-9) ? 0.003 * (d - c) / c : 9;
    var phiMn = phi * AsProv * fy * (d - a / 2) / 1e6;
    out.AsReq = AsReq; out.AsMin = AsMin; out.AsUse = AsUse;
    out.db = db; out.s = s; out.AsProv = AsProv; out.phiMn = phiMn;
    out.dc = (MukNm > 0.005) ? MukNm / phiMn : 0;
    out.et = et;
    if (et < 0.005) { out.ng = true; out.note = 'εt = ' + et.toFixed(4) + ' < 0,005 (bukan terkendali tarik) — perbesar tebal/kurangi tulangan.'; }
    if (out.dc > 1) out.ng = true;
    return out;
  }

  /* ============================================================
     COMPUTE — kN, m, per meter panjang
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
    var gc = num(v.gammaC);
    var fc = num(v.fc), fy = num(v.fy);
    var covS = num(v.coverS), covF = num(v.coverF);
    var dbM = num(v.dbMain), dbD = num(v.dbDist);
    var FSotT = num(v.FSot) || 2.0, FSslT = num(v.FSsl) || 1.5;
    var Lw = num(v.Lwall);

    if (!(H > 0)) { r.warn.push('Tinggi badan H harus > 0.'); return r; }
    if (!(bTop > 0) || !(bBot > 0)) { r.warn.push('Tebal puncak & dasar stem harus > 0.'); return r; }
    if (bBot < bTop) { r.warn.push('Tebal dasar stem harus ≥ tebal puncak (trapesium siku-siku).'); return r; }
    if (!(tf > 0)) { r.warn.push('Tebal tapak tf harus > 0.'); return r; }
    if (toe < 0 || heel < 0) { r.warn.push('Proyeksi tapak tidak boleh negatif.'); return r; }
    if (!(g1 > 0) || !(gc > 0)) { r.warn.push('Berat isi tanah & beton harus > 0.'); return r; }
    if (!(phi1 > 0)) { r.warn.push('Sudut geser urugan φ₁ harus > 0 (urugan granular, c = 0).'); return r; }
    if (!(fc > 0) || !(fy > 0)) { r.warn.push('Mutu beton fc′ & baja fy harus > 0.'); return r; }
    if (beta < 0) beta = 0;
    if (beta >= phi1) { r.warn.push('Kemiringan lereng β harus < φ₁ (Rankine tidak terdefinisi).'); return r; }
    if (kf <= 0 || kf > 1) kf = 0.67;
    if (!(covS > 0)) covS = 50;
    if (!(covF > 0)) covF = 75;

    var B = toe + bBot + heel;
    var xb = toe + bBot;                                   // muka belakang stem di dasar
    var xw = (opsi === 'tegak') ? xb : (toe + bTop);       // puncak-belakang stem
    var ws = B - xw;                                       // lebar horizontal ke bidang semu
    var tanB = Math.tan(beta * D2R);
    var Hp = H + tf + ws * tanB;

    var Ka = kaRankine(phi1, beta);
    var cbeta = Math.cos(beta * D2R), sbeta = Math.sin(beta * D2R);
    var Pa = 0.5 * Ka * g1 * Hp * Hp;
    var Pq = Ka * q * Hp;
    var Pah = Pa * cbeta, Pav = Pa * sbeta;
    var Pqh = Pq * cbeta, Pqv = Pq * sbeta;
    var yPa = Hp / 3, yPq = Hp / 2;

    /* ---------- komponen berat: {nm, W, x, jenis 'c'|'s'|'q'} ---------- */
    var parts = [];
    if (opsi === 'tegak') {
      parts.push({ nm: 'Stem persegi', W: bTop * H * gc, x: xb - bTop / 2, j: 'c' });
      var bw = bBot - bTop;
      if (bw > 1e-9) parts.push({ nm: 'Stem segitiga (muka depan)', W: 0.5 * bw * H * gc, x: toe + 2 * bw / 3, j: 'c' });
    } else {
      parts.push({ nm: 'Stem persegi', W: bTop * H * gc, x: toe + bTop / 2, j: 'c' });
      var bw2 = bBot - bTop;
      if (bw2 > 1e-9) {
        parts.push({ nm: 'Stem segitiga (sisi tanah)', W: 0.5 * bw2 * H * gc, x: toe + bTop + bw2 / 3, j: 'c' });
        parts.push({ nm: 'Tanah di atas sisi miring', W: 0.5 * bw2 * H * g1, x: toe + bTop + 2 * bw2 / 3, j: 's' });
      }
    }
    if (heel > 1e-9) parts.push({ nm: 'Tanah di atas tumit', W: heel * H * g1, x: B - heel / 2, j: 's' });
    if (beta > 0.001 && ws > 1e-9) {
      var hW = ws * tanB;
      parts.push({ nm: 'Baji lereng di atas ws', W: 0.5 * ws * hW * g1, x: (B - ws) + 2 * ws / 3, j: 's' });
    }
    parts.push({ nm: 'Tapak beton', W: B * tf * gc, x: B / 2, j: 'c' });

    var sumW = 0, sumMw = 0;
    parts.forEach(function (p) { sumW += p.W; sumMw += p.W * p.x; });

    /* ---------- 1) STABILITAS (layan) ---------- */
    var sumV = sumW + Pav + Pqv;
    var Mr = sumMw + (Pav + Pqv) * B;
    var Mo = Pah * yPa + Pqh * yPq;
    var FSot = (Mo > 1e-9) ? Mr / Mo : 999;

    var Kp = kpRankine(phi2);
    var Pp = 0.5 * Kp * g2 * D * D + 2 * c2 * Math.sqrt(Kp) * D;
    var Fr = sumV * Math.tan(kf * phi2 * D2R) + kf * c2 * B;
    var FrTot = Fr + (usePp ? Pp : 0);
    var Ph = Pah + Pqh;
    var FSsl = (Ph > 1e-9) ? FrTot / Ph : 999;

    var xbar = (Mr - Mo) / sumV;
    var e = B / 2 - xbar;
    var qmax, qmin, tri = false;
    if (xbar <= 0) {
      qmax = Infinity; qmin = 0; tri = true;
      r.warn.push('Resultan layan jatuh di luar dasar (x̄ ≤ 0) — dinding GULING. Perbesar dimensi.');
    } else if (Math.abs(e) <= B / 6 + 1e-12) {
      qmax = sumV / B * (1 + 6 * e / B);
      qmin = sumV / B * (1 - 6 * e / B);
    } else if (e > 0) { tri = true; qmax = 2 * sumV / (3 * xbar); qmin = 0; }
    else { tri = true; qmax = 2 * sumV / (3 * (B - xbar)); qmin = 0; }
    var dcQ = (qall > 0 && isFinite(qmax)) ? qmax / qall : null;

    /* ---------- 2) TERFAKTOR U = 1,2D + 1,6H + 1,6L ---------- */
    var fD = 1.2, fH = 1.6, fL = 1.6;
    var sumVu = 0, sumMwu = 0;
    parts.forEach(function (p) { sumVu += fD * p.W; sumMwu += fD * p.W * p.x; });
    sumVu += fH * Pav + fL * Pqv;
    var Mru = sumMwu + (fH * Pav + fL * Pqv) * B;
    var Mou = fH * Pah * yPa + fL * Pqh * yPq;
    var xbaru = (Mru - Mou) / sumVu;
    var eu = B / 2 - xbaru;
    var quMaxV, quMinV, triU = false, LcU = B, quSideHeel = false;
    if (xbaru <= 0) { triU = true; quMaxV = 0; quMinV = 0; LcU = 0; }
    else if (Math.abs(eu) <= B / 6 + 1e-12) {
      quMaxV = sumVu / B * (1 + 6 * eu / B);
      quMinV = sumVu / B * (1 - 6 * eu / B);
    } else if (eu > 0) { triU = true; LcU = 3 * xbaru; quMaxV = 2 * sumVu / LcU; quMinV = 0; }
    else { triU = true; quSideHeel = true; LcU = 3 * (B - xbaru); quMaxV = 2 * sumVu / LcU; quMinV = 0; }

    function quAt(x) {          // tegangan tumpu terfaktor pada jarak x dari toe
      if (LcU <= 0) return 0;
      if (!triU) return quMaxV - (quMaxV - quMinV) * x / B;
      if (!quSideHeel) return (x <= LcU) ? quMaxV * (1 - x / LcU) : 0;
      return (x >= B - LcU) ? quMaxV * (1 - (B - x) / LcU) : 0;
    }

    /* ---------- desain STEM ---------- */
    var MuStem = fH * cbeta * Ka * (g1 * H * H * H / 6) + fL * cbeta * Ka * (q * H * H / 2);
    var VuStem = fH * cbeta * Ka * (g1 * H * H / 2) + fL * cbeta * Ka * (q * H);
    var dStem = bBot * 1000 - covS - dbM / 2;
    var stem = flexure(MuStem, dStem, bBot * 1000, dbM, fc, fy);
    stem.Vu = VuStem;
    stem.phiVc = 0.75 * 0.17 * Math.sqrt(fc) * 1000 * dStem / 1000;
    stem.dcV = VuStem / stem.phiVc;

    /* ---------- desain TOE (numerik, 200 pias) ---------- */
    var N = 200, MuToe = 0, VuToe = 0;
    if (toe > 1e-6) {
      var dx = toe / N;
      for (var i = 0; i < N; i++) {
        var x = (i + 0.5) * dx;
        var wnet = quAt(x) - fD * gc * tf;          // tanah di atas toe diabaikan (konservatif)
        MuToe += wnet * (toe - x) * dx;
        VuToe += wnet * dx;
      }
      if (MuToe < 0) MuToe = 0;
      if (VuToe < 0) VuToe = 0;
    }
    var dFoot = tf * 1000 - covF - dbM / 2;
    var toeD = flexure(MuToe, dFoot, tf * 1000, dbM, fc, fy);
    toeD.Vu = VuToe;
    toeD.phiVc = 0.75 * 0.17 * Math.sqrt(fc) * 1000 * dFoot / 1000;
    toeD.dcV = VuToe / toeD.phiVc;

    /* ---------- desain HEEL (numerik) ---------- */
    var MuHeel = 0, VuHeel = 0, heelSpan = B - xb;
    if (heelSpan > 1e-6) {
      var dx2 = heelSpan / N;
      for (var i2 = 0; i2 < N; i2++) {
        var x2 = xb + (i2 + 0.5) * dx2;
        var hs = H + Math.max(0, x2 - xw) * tanB;   // tinggi tanah di atas titik x2
        var wdn = fD * (gc * tf + g1 * hs) + fL * q - quAt(x2);
        MuHeel += wdn * (x2 - xb) * dx2;
        VuHeel += wdn * dx2;
      }
      if (MuHeel < 0) MuHeel = 0;
      if (VuHeel < 0) VuHeel = 0;
    }
    var heelD = flexure(MuHeel, dFoot, tf * 1000, dbM, fc, fy);
    heelD.Vu = VuHeel;
    heelD.phiVc = 0.75 * 0.17 * Math.sqrt(fc) * 1000 * dFoot / 1000;
    heelD.dcV = VuHeel / heelD.phiVc;

    /* ---------- susut-suhu / minimum ---------- */
    var tAvg = 0.5 * (bTop + bBot) * 1000;
    var AsH = 0.0020 * 1000 * tAvg;               // stem horizontal, total 2 muka
    var AsFv = 0.0012 * 1000 * tAvg;              // stem muka depan vertikal
    var AsFt = 0.0018 * 1000 * tf * 1000;         // tapak memanjang
    var AbD = Math.PI * dbD * dbD / 4;
    function spasi(AsNeed, Ab, hRef) {
      if (AsNeed < 1e-9) return 450;
      var s = Math.floor((1000 * Ab / AsNeed) / 25) * 25;
      var sMax = Math.min(3 * hRef, 450);
      if (s > sMax) s = Math.floor(sMax / 25) * 25;
      if (s < 50) s = 50;
      return s;
    }
    var sH = spasi(AsH / 2, AbD, tAvg);          // per muka (bagi 2)
    var sFv = spasi(AsFv, AbD, tAvg);
    var sFt = spasi(AsFt / 2, AbD, tf * 1000);   // atas+bawah tapak

    /* ---------- BOQ ---------- */
    var Astem = 0.5 * (bTop + bBot) * H;
    var Afoot = B * tf;
    var volM = Astem + Afoot;
    var volTot = (Lw > 0) ? volM * Lw : null;

    // estimasi besi: volume = As(mm²/m) ×1e-6 × panjang-set (m) per meter dinding
    var sets = [
      { nm: 'Stem vertikal muka tanah D' + dbM + '-' + stem.s, As: stem.AsProv, len: H + tf + 40 * dbM / 1000 },
      { nm: 'Stem vertikal muka depan D' + dbD + '-' + sFv, As: 1000 * AbD / sFv, len: H },
      { nm: 'Stem horizontal 2 muka D' + dbD + '-' + sH, As: 2 * 1000 * AbD / sH, len: H },
      { nm: 'Toe bawah D' + dbM + '-' + toeD.s, As: (toe > 0.01) ? toeD.AsProv : 0, len: toe + 40 * dbM / 1000 },
      { nm: 'Heel atas D' + dbM + '-' + heelD.s, As: (heelSpan > 0.01) ? heelD.AsProv : 0, len: heelSpan + 40 * dbM / 1000 },
      { nm: 'Tapak memanjang 2 lapis D' + dbD + '-' + sFt, As: 2 * 1000 * AbD / sFt, len: B }
    ];
    var steelM = 0;   // kg per meter dinding
    sets.forEach(function (s2) { s2.kg = s2.As * 1e-6 * s2.len * 7850; steelM += s2.kg; });
    var steelTot = (Lw > 0) ? steelM * Lw : null;
    var ratio = steelM / volM;
    var formM = 2 * H + 2 * tf;                   // m² bekisting per meter
    var formTot = (Lw > 0) ? formM * Lw : null;

    /* ---------- rakit hasil ---------- */
    r.valid = true;
    r.opsi = opsi; r.H = H; r.bTop = bTop; r.bBot = bBot; r.tf = tf;
    r.toe = toe; r.heel = heel; r.B = B; r.D = D; r.ws = ws; r.Hp = Hp; r.xb = xb; r.xw = xw;
    r.g1 = g1; r.phi1 = phi1; r.beta = beta; r.q = q;
    r.g2 = g2; r.phi2 = phi2; r.c2 = c2; r.qall = qall; r.kf = kf;
    r.usePp = usePp; r.gc = gc; r.fc = fc; r.fy = fy; r.covS = covS; r.covF = covF;
    r.dbM = dbM; r.dbD = dbD; r.Lw = Lw;
    r.Ka = Ka; r.Kp = Kp; r.Pa = Pa; r.Pq = Pq;
    r.Pah = Pah; r.Pav = Pav; r.Pqh = Pqh; r.Pqv = Pqv; r.yPa = yPa; r.yPq = yPq; r.Ph = Ph; r.Pp = Pp;
    r.parts = parts; r.sumW = sumW; r.sumV = sumV; r.Mr = Mr; r.Mo = Mo;
    r.xbar = xbar; r.e = e; r.tri = tri; r.qmax = qmax; r.qmin = qmin; r.dcQ = dcQ;
    r.FSot = FSot; r.FSsl = FSsl; r.FSotT = FSotT; r.FSslT = FSslT; r.Fr = Fr; r.FrTot = FrTot;
    r.sumVu = sumVu; r.Mru = Mru; r.Mou = Mou; r.xbaru = xbaru; r.eu = eu;
    r.quMax = quMaxV; r.quMin = quMinV; r.triU = triU; r.LcU = LcU; r.quSideHeel = quSideHeel;
    r.quAt = quAt;
    r.stem = stem; r.toeD = toeD; r.heelD = heelD;
    r.MuStem = MuStem; r.MuToe = MuToe; r.MuHeel = MuHeel;
    r.dStem = dStem; r.dFoot = dFoot;
    r.AsH = AsH; r.AsFv = AsFv; r.AsFt = AsFt; r.sH = sH; r.sFv = sFv; r.sFt = sFt;
    r.Astem = Astem; r.Afoot = Afoot; r.volM = volM; r.volTot = volTot;
    r.sets = sets; r.steelM = steelM; r.steelTot = steelTot; r.ratio = ratio;
    r.formM = formM; r.formTot = formTot;
    r.okOt = FSot >= FSotT; r.okSl = FSsl >= FSslT;
    r.okQ = (dcQ === null) ? null : dcQ <= 1;
    r.okE = Math.abs(e) <= B / 6 + 1e-12;
    r.okStem = !stem.ng && stem.dcV <= 1;
    r.okToe = (toe < 0.01) || (!toeD.ng && toeD.dcV <= 1);
    r.okHeel = (heelSpan < 0.01) || (!heelD.ng && heelD.dcV <= 1);

    // Peringatan
    if (!r.okOt) r.warn.push('FS guling ' + FSot.toFixed(2) + ' < ' + FSotT.toFixed(1) + ' — TIDAK AMAN; perpanjang heel (paling efektif).');
    if (!r.okSl) r.warn.push('FS geser ' + FSsl.toFixed(2) + ' < ' + FSslT.toFixed(1) + ' — TIDAK AMAN; pertimbangkan shear key / tambah tanam / aktifkan pasif.');
    if (!r.okE) r.warn.push('e = ' + e.toFixed(3) + ' m > B/6 = ' + (B / 6).toFixed(3) + ' m — resultan layan di luar inti tengah.');
    if (r.dcQ !== null && r.dcQ > 1) r.warn.push('qmax = ' + qmax.toFixed(1) + ' kPa > q_izin = ' + qall.toFixed(1) + ' kPa — daya dukung TIDAK memadai.');
    if (stem.ng) r.warn.push('STEM: ' + (stem.note || 'kapasitas lentur tidak cukup (D/C ' + stem.dc.toFixed(2) + ').'));
    if (stem.dcV > 1) r.warn.push('STEM: geser Vu ' + VuStem.toFixed(1) + ' kN > φVc ' + stem.phiVc.toFixed(1) + ' kN — pertebal dasar stem.');
    if (toeD.ng && toe > 0.01) r.warn.push('TOE: ' + (toeD.note || 'kapasitas lentur tidak cukup.'));
    if (toeD.dcV > 1 && toe > 0.01) r.warn.push('TOE: geser > φVc — pertebal tapak.');
    if (heelD.ng && heelSpan > 0.01) r.warn.push('HEEL: ' + (heelD.note || 'kapasitas lentur tidak cukup.'));
    if (heelD.dcV > 1 && heelSpan > 0.01) r.warn.push('HEEL: geser > φVc — pertebal tapak.');
    if (triU) r.warn.push('Distribusi tumpu TERFAKTOR segitiga (e_u > B/6) — kontak sebagian ' + LcU.toFixed(2) + ' m.');
    if (usePp) r.warn.push('Tahanan pasif diikutkan pada cek geser — pastikan tanah depan D = ' + D.toFixed(2) + ' m permanen.');
    r.warn.push('Cek panjang penyaluran & stek tulangan stem→tapak dengan tool Penyaluran Tulangan Tarik. Air tanah tidak dimodelkan — wajib drainase + suling-suling.');

    return r;
  }

  function opsiName(k) {
    return k === 'tegak' ? 'Opsi 1 — sisi tegak ke tanah' : 'Opsi 2 — sisi miring ke tanah';
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('rc-style')) return;
    var s = document.createElement('style');
    s.id = 'rc-style';
    s.textContent =
      '.rc-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.rc-canvas{position:relative;flex:1 1 50%;min-height:250px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.rc-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}' +
      '.rc-tbl{width:100%;border-collapse:collapse;margin:6px 0 2px;font-size:12.5px}' +
      '.rc-tbl th,.rc-tbl td{padding:5px 7px;text-align:right;border-bottom:1px solid var(--line)}' +
      '.rc-tbl th:first-child,.rc-tbl td:first-child{text-align:left}' +
      '.rc-tbl thead th{color:var(--ink-dim);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}' +
      '.rc-tbl td.ok{color:var(--green,#2e7d32);font-weight:600}' +
      '.rc-tbl td.bad{color:var(--red,#c62828);font-weight:600}' +
      '.rc-tbl tfoot td{font-weight:600;border-top:1.5px solid var(--ink-dim)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'DPT Beton Kantilever'));
    panel.appendChild(UI.el('div', 'sub', 'Dinding penahan tanah beton bertulang: stem trapesium siku-siku (2 opsi orientasi), tapak menjorok bebas (toe/heel). Stabilitas layan + penulangan stem-toe-heel dari tumpuan terfaktor (SNI 2847:2019) + BOQ beton, besi & bekisting.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'rc-work');
    var canvasHost = UI.el('div', 'rc-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Potongan dinding, tekanan & tulangan');
    var results = UI.el('div', 'rc-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var dbOpts = [13, 16, 19, 22, 25].map(function (d) { return { value: d, label: 'D' + d }; });
    var dbDOpts = [10, 13, 16].map(function (d) { return { value: d, label: 'D' + d }; });

    var schema = [
      { type: 'group', label: 'Bentuk & Geometri' },
      { type: 'segment', id: 'opsi', label: 'Orientasi stem trapesium', value: 'tegak',
        options: [{ value: 'tegak', label: 'Tegak ke tanah' }, { value: 'miring', label: 'Miring ke tanah' }] },
      { type: 'number', id: 'H', label: 'H — tinggi stem', unit: 'm', value: 3.0, min: 0.5, step: 0.1, hint: 'Dari atas tapak sampai puncak dinding.' },
      { type: 'number', id: 'bTop', label: 't_atas — tebal puncak stem', unit: 'm', value: 0.25, min: 0.15, step: 0.05 },
      { type: 'number', id: 'bBot', label: 't_bawah — tebal dasar stem', unit: 'm', value: 0.40, min: 0.15, step: 0.05, hint: '≥ t_atas. Umumnya H/12–H/10.' },
      { type: 'number', id: 'tf', label: 'tf — tebal tapak', unit: 'm', value: 0.40, min: 0.2, step: 0.05 },
      { type: 'number', id: 'toe', label: 'Proyeksi toe (depan)', unit: 'm', value: 0.8, min: 0, step: 0.05, hint: '0 = tapak tidak menjorok ke depan.' },
      { type: 'number', id: 'heel', label: 'Proyeksi heel (belakang)', unit: 'm', value: 1.5, min: 0, step: 0.05, hint: '0 = tapak tidak menjorok ke belakang.' },
      { type: 'number', id: 'D', label: 'D — kedalaman tanah depan', unit: 'm', value: 0.8, min: 0, step: 0.1 },

      { type: 'group', label: 'Tanah Urugan (belakang)' },
      { type: 'number', id: 'gamma1', label: 'γ₁ — berat isi urugan', unit: 'kN/m³', value: 18, min: 10, step: 0.5 },
      { type: 'number', id: 'phi1', label: 'φ₁ — sudut geser urugan', unit: '°', value: 30, min: 15, max: 45, step: 1, hint: 'Urugan granular, c₁ = 0.' },
      { type: 'number', id: 'beta', label: 'β — kemiringan lereng urugan', unit: '°', value: 0, min: 0, max: 40, step: 1 },
      { type: 'number', id: 'q', label: 'q — beban merata permukaan', unit: 'kPa', value: 10, min: 0, step: 1 },

      { type: 'group', label: 'Tanah Fondasi & Depan' },
      { type: 'number', id: 'gamma2', label: 'γ₂ — berat isi tanah fondasi', unit: 'kN/m³', value: 18, min: 10, step: 0.5 },
      { type: 'number', id: 'phi2', label: 'φ₂ — sudut geser tanah fondasi', unit: '°', value: 28, min: 0, max: 45, step: 1 },
      { type: 'number', id: 'c2', label: 'c₂ — kohesi tanah fondasi', unit: 'kPa', value: 10, min: 0, step: 1 },
      { type: 'number', id: 'qall', label: 'q_izin — daya dukung izin', unit: 'kPa', value: 150, min: 0, step: 10, hint: '0 = lewati cek daya dukung.' },
      { type: 'number', id: 'kf', label: 'k — faktor gesekan dasar', unit: '', value: 0.67, min: 0.3, max: 1, step: 0.01 },
      { type: 'segment', id: 'passive', label: 'Ikutkan tahanan pasif depan?', value: 'tidak',
        options: [{ value: 'tidak', label: 'Tidak' }, { value: 'ya', label: 'Ya' }] },

      { type: 'group', label: 'Material & Tulangan' },
      { type: 'number', id: 'gammaC', label: 'γc — berat isi beton', unit: 'kN/m³', value: 24, min: 20, step: 0.5 },
      { type: 'number', id: 'fc', label: "fc′ — mutu beton", unit: 'MPa', value: 25, min: 17, step: 1 },
      { type: 'number', id: 'fy', label: 'fy — mutu tulangan', unit: 'MPa', value: 420, min: 240, step: 10 },
      { type: 'select', id: 'dbMain', label: 'Diameter tulangan utama', value: 16, options: dbOpts },
      { type: 'select', id: 'dbDist', label: 'Diameter tulangan bagi/susut', value: 13, options: dbDOpts },
      { type: 'number', id: 'coverS', label: 'Selimut stem', unit: 'mm', value: 50, min: 30, step: 5 },
      { type: 'number', id: 'coverF', label: 'Selimut tapak', unit: 'mm', value: 75, min: 40, step: 5, hint: 'Cor kontak tanah: 75 mm (SNI 2847).' },

      { type: 'group', label: 'Kontrol & Volume' },
      { type: 'number', id: 'FSot', label: 'FS guling minimum', unit: '', value: 2.0, min: 1, step: 0.1 },
      { type: 'number', id: 'FSsl', label: 'FS geser minimum', unit: '', value: 1.5, min: 1, step: 0.1 },
      { type: 'number', id: 'Lwall', label: 'L — panjang dinding (BOQ)', unit: 'm', value: 10, min: 0, step: 1, hint: 'Untuk rekap BOQ total. 0 = per meter saja.' }
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
      state.cap.set('Potongan dinding, tekanan & tulangan');
      results.appendChild(UI.el('div', 'ck-empty', 'Lengkapi geometri, tanah & material untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    state.cap.set(opsiName(r.opsi) + ' · H=' + r.H + ' m · B=' + r.B.toFixed(2) + ' m');

    var maxDC = Math.max(r.stem.dc, r.stem.dcV, (r.toe > 0.01 ? Math.max(r.toeD.dc, r.toeD.dcV) : 0),
      (r.B - r.xb > 0.01 ? Math.max(r.heelD.dc, r.heelD.dcV) : 0));
    var okStruct = r.okStem && r.okToe && r.okHeel;

    results.appendChild(UI.heroRow([
      { label: 'FS Guling (≥' + r.FSotT.toFixed(1) + ')', value: UI.fmt(Math.min(r.FSot, 99), 2), unit: r.okOt ? 'OK' : 'NG', tone: r.okOt ? 'ok' : 'bad' },
      { label: 'FS Geser (≥' + r.FSslT.toFixed(1) + ')', value: UI.fmt(Math.min(r.FSsl, 99), 2), unit: r.okSl ? 'OK' : 'NG', tone: r.okSl ? 'ok' : 'bad' },
      { label: 'D/C struktur maks', value: UI.fmt(maxDC, 2), unit: okStruct ? 'OK' : 'NG', tone: okStruct ? 'ok' : 'bad' }
    ]));
    results.appendChild(UI.el('div', 'ck-empty',
      'B = ' + r.B.toFixed(2) + ' m · e = ' + r.e.toFixed(3) + ' m (' + (r.okE ? 'dalam' : 'LUAR') + ' B/6) · qmax = ' +
      (isFinite(r.qmax) ? UI.fmt(r.qmax, 1) : '∞') + ' kPa' + (r.dcQ !== null ? ' (D/C ' + r.dcQ.toFixed(2) + (r.okQ ? ' OK' : ' NG') + ')' : '') + '.'));

    // Stabilitas ringkas
    results.appendChild(UI.rhead('Stabilitas (beban layan)'));
    results.appendChild(UI.kv('Ka / H\' / Pa', r.Ka.toFixed(4) + ' / ' + r.Hp.toFixed(3) + ' m / ' + UI.fmt(r.Pa, 2) + ' kN/m'));
    results.appendChild(UI.kv('ΣPh pendorong / ΣV', UI.fmt(r.Ph, 2) + ' / ' + UI.fmt(r.sumV, 2) + ' kN/m'));
    results.appendChild(UI.kv('ΣMr / ΣMo (thd toe)', UI.fmt(r.Mr, 2) + ' / ' + UI.fmt(r.Mo, 2) + ' kN·m/m'));
    results.appendChild(UI.kv('FS guling', r.FSot.toFixed(2) + ' (≥ ' + r.FSotT.toFixed(1) + ')', r.okOt ? 'ok' : 'bad'));
    results.appendChild(UI.kv('FS geser', r.FSsl.toFixed(2) + ' (≥ ' + r.FSslT.toFixed(1) + ')' + (r.usePp ? ' — dgn pasif' : ''), r.okSl ? 'ok' : 'bad'));
    results.appendChild(UI.kv('e / B/6', r.e.toFixed(3) + ' / ' + (r.B / 6).toFixed(3) + ' m', r.okE ? 'ok' : 'bad'));
    results.appendChild(UI.kv('qmax / qmin (layan)', (isFinite(r.qmax) ? UI.fmt(r.qmax, 1) : '∞') + ' / ' + UI.fmt(r.qmin, 1) + ' kPa' + (r.tri ? ' (segitiga)' : '')));
    if (r.dcQ !== null) results.appendChild(UI.kv('qmax / q_izin', r.dcQ.toFixed(2), r.okQ ? 'ok' : 'bad'));

    // Tumpu terfaktor
    results.appendChild(UI.rhead('Tumpuan terfaktor (1,2D + 1,6H + 1,6L)'));
    results.appendChild(UI.kv('ΣVu / e_u', UI.fmt(r.sumVu, 2) + ' kN/m / ' + r.eu.toFixed(3) + ' m'));
    results.appendChild(UI.kv('qu,max / qu,min', UI.fmt(r.quMax, 1) + ' / ' + UI.fmt(r.quMin, 1) + ' kPa' + (r.triU ? ' (segitiga, kontak ' + r.LcU.toFixed(2) + ' m)' : '')));

    // Tabel tulangan
    results.appendChild(UI.rhead('Penulangan (SNI 2847:2019) — per meter'));
    var tbl = UI.el('table', 'rc-tbl');
    tbl.innerHTML = '<thead><tr><th>Lokasi</th><th>Mu<br>(kN·m)</th><th>d<br>(mm)</th><th>As perlu<br>(mm²)</th><th>Dipakai</th><th>φMn<br>(kN·m)</th><th>D/C</th></tr></thead>';
    var tb = document.createElement('tbody');
    function rowFlex(nm, f, active) {
      var tr = document.createElement('tr');
      if (!active) {
        tr.innerHTML = '<td>' + nm + '</td><td colspan="6" style="text-align:left;color:var(--ink-faint)">— (proyeksi 0)</td>';
      } else {
        var okF = !f.ng;
        tr.innerHTML = '<td>' + nm + '</td><td>' + f.Mu.toFixed(1) + '</td><td>' + f.d.toFixed(0) +
          '</td><td>' + Math.ceil(f.AsUse) + '</td><td>D' + f.db + '-' + f.s + '</td><td>' + f.phiMn.toFixed(1) +
          '</td><td class="' + (okF && f.dc <= 1 ? 'ok' : 'bad') + '">' + f.dc.toFixed(2) + (okF && f.dc <= 1 ? ' OK' : ' NG') + '</td>';
      }
      tb.appendChild(tr);
    }
    rowFlex('Stem (vert., muka tanah)', r.stem, true);
    rowFlex('Toe (tul. bawah)', r.toeD, r.toe > 0.01);
    rowFlex('Heel (tul. atas)', r.heelD, r.B - r.xb > 0.01);
    tbl.appendChild(tb);
    results.appendChild(tbl);

    // Geser
    results.appendChild(UI.rhead('Geser satu arah (φVc = 0,75·0,17·√fc′·b·d)'));
    function kvShear(nm, f, active) {
      if (!active) return;
      results.appendChild(UI.kv(nm, 'Vu ' + UI.fmt(f.Vu, 1) + ' / φVc ' + UI.fmt(f.phiVc, 1) + ' kN → D/C ' + f.dcV.toFixed(2), f.dcV <= 1 ? 'ok' : 'bad'));
    }
    kvShear('Stem (dasar)', r.stem, true);
    kvShear('Toe (muka stem)', r.toeD, r.toe > 0.01);
    kvShear('Heel (muka stem)', r.heelD, r.B - r.xb > 0.01);

    // Susut-suhu
    results.appendChild(UI.rhead('Tulangan bagi / susut-suhu'));
    results.appendChild(UI.kv('Stem horizontal (0,0020·Ag, 2 muka)', 'D' + r.dbD + '-' + r.sH + ' per muka'));
    results.appendChild(UI.kv('Stem muka depan vertikal (0,0012·Ag)', 'D' + r.dbD + '-' + r.sFv));
    results.appendChild(UI.kv('Tapak memanjang (0,0018·Ag, 2 lapis)', 'D' + r.dbD + '-' + r.sFt + ' per lapis'));

    // BOQ
    results.appendChild(UI.rhead('BOQ' + (r.Lw > 0 ? ' — L = ' + r.Lw + ' m' : ' — per meter')));
    var tbq = UI.el('table', 'rc-tbl');
    tbq.innerHTML = '<thead><tr><th>Item</th><th>Per m\'</th><th>Total</th></tr></thead>';
    var tbb = document.createElement('tbody');
    function rowB(nm, perM, tot) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + nm + '</td><td>' + perM + '</td><td>' + (tot === null ? '—' : tot) + '</td>';
      tbb.appendChild(tr);
    }
    rowB('Beton (stem + tapak)', UI.fmt(r.volM, 3) + ' m³', r.volTot === null ? null : UI.fmt(r.volTot, 2) + ' m³');
    rowB('Besi (estimasi)', UI.fmt(r.steelM, 1) + ' kg', r.steelTot === null ? null : UI.fmt(r.steelTot, 0) + ' kg');
    rowB('Rasio besi', UI.fmt(r.ratio, 0) + ' kg/m³', '');
    rowB('Bekisting (2 muka stem + sisi tapak)', UI.fmt(r.formM, 2) + ' m²', r.formTot === null ? null : UI.fmt(r.formTot, 1) + ' m²');
    tbq.appendChild(tbb);
    results.appendChild(tbq);

    var setHtml = '<ul style="margin:6px 0 0 16px">' + r.sets.map(function (s) {
      return '<li>' + s.nm + ' — ' + s.kg.toFixed(1) + ' kg/m\'</li>';
    }).join('') + '</ul>';
    results.appendChild(UI.note('Rincian estimasi besi (per meter dinding)', setHtml +
      '<div style="margin-top:6px">Belum termasuk overlap, stek, kursi tulangan & waste (tambah ±10–15%).</div>'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'Stabilitas: Rankine bidang semu di tepi tumit (beban layan), berat tanah di atas tumit menahan, q hanya pendorong. ' +
      'Penulangan: U = 1,2D + 1,6H + 1,6L (SNI 1727); distribusi tumpu terfaktor linier/segitiga; toe mengabaikan tanah di atasnya (konservatif); ' +
      'lentur & geser satu arah SNI 2847:2019, As,min lentur maks(0,25√fc′; 1,4)/fy·b·d, s ≤ min(3h; 450). ' +
      '<b>TIDAK termasuk</b>: air tanah, gempa, stabilitas global, penurunan, shear key, detail penyaluran. ' +
      'Verifikasi oleh insinyur penanggung jawab (SNI 8460:2017 & SNI 2847:2019).'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Lengkapi data untuk melihat potongan & tulangan.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.55, w - 210);
    drawSection(ctx, 0, 0, splitX, h, r);
    drawChecks(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'FS ot ' + r.FSot.toFixed(2) + ' · FS sl ' + r.FSsl.toFixed(2) + ' · stem D/C ' + r.stem.dc.toFixed(2)
      });
    }
  }

  function drawSection(ctx, ox, oy, w, h, r) {
    var ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var amber = css('--amber'), sage = css('--sage') || dim, olive = css('--olive') || dim;
    var red = css('--red') || '#c62828';

    var padT = 30, padB = 56, padS = 30;
    var backExt = Math.max(1.2, 0.6 * r.Hp);
    var frontExt = Math.max(0.9, 0.4 * r.Hp);
    var tanB = Math.tan(r.beta * D2R);
    var topRise = r.beta > 0 ? backExt * tanB : 0;
    var xspan = frontExt + r.B + backExt;
    var yspan = r.tf + r.H + topRise + 0.4;
    var sc = Math.min((w - 2 * padS) / xspan, (h - padT - padB) / yspan);
    var x0 = ox + padS + (w - 2 * padS - xspan * sc) / 2 + frontExt * sc;
    var yBase = oy + h - padB - Math.max(0, (h - padT - padB - yspan * sc) / 2);
    function X(wx) { return x0 + wx * sc; }
    function Y(wy) { return yBase - wy * sc; }

    var crest = r.tf + r.H;
    var xw = r.xw, xb = r.xb;

    // tanah urugan belakang
    ctx.save();
    ctx.fillStyle = sage; ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(X(xb), Y(r.tf));
    ctx.lineTo(X(xw), Y(crest));
    ctx.lineTo(X(r.B + backExt), Y(crest + (r.B + backExt - xw) * tanB));
    ctx.lineTo(X(r.B + backExt), Y(0));
    ctx.lineTo(X(r.B), Y(0)); ctx.lineTo(X(r.B), Y(r.tf));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sage; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(xw), Y(crest));
    ctx.lineTo(X(r.B + backExt), Y(crest + (r.B + backExt - xw) * tanB)); ctx.stroke();
    ctx.restore();

    // tanah depan
    if (r.D > 0.01) {
      ctx.save();
      ctx.fillStyle = sage; ctx.globalAlpha = 0.12;
      ctx.fillRect(X(-frontExt), Y(r.D), frontExt * sc, r.D * sc);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sage; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(-frontExt), Y(r.D)); ctx.lineTo(X(0), Y(r.D)); ctx.stroke();
      ctx.restore();
    }

    // beban merata q
    if (r.q > 0) {
      ctx.save();
      ctx.strokeStyle = olive; ctx.fillStyle = olive; ctx.lineWidth = 1;
      for (var xq = xw + 0.15; xq < r.B + backExt - 0.1; xq += Math.max(0.4, backExt / 5)) {
        var surfY = crest + (xq - xw) * tanB;
        ctx.beginPath(); ctx.moveTo(X(xq), Y(surfY + 0.45)); ctx.lineTo(X(xq), Y(surfY + 0.06)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(xq) - 3, Y(surfY + 0.18)); ctx.lineTo(X(xq), Y(surfY + 0.03)); ctx.lineTo(X(xq) + 3, Y(surfY + 0.18)); ctx.closePath(); ctx.fill();
      }
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('q=' + r.q + ' kPa', X(xw + 0.2), Y(crest + 0.62) - 2);
      ctx.restore();
    }

    // dinding beton (stem + tapak)
    var body;
    if (r.opsi === 'tegak') body = [[r.toe, r.tf], [xb, r.tf], [xb, crest], [xb - r.bTop, crest]];
    else body = [[r.toe, r.tf], [xb, r.tf], [r.toe + r.bTop, crest], [r.toe, crest]];
    var foot = [[0, 0], [r.B, 0], [r.B, r.tf], [0, r.tf]];
    ctx.save();
    ctx.fillStyle = ink; ctx.globalAlpha = 0.8;
    [body, foot].forEach(function (poly) {
      ctx.beginPath();
      poly.forEach(function (pt, i) { if (i === 0) ctx.moveTo(X(pt[0]), Y(pt[1])); else ctx.lineTo(X(pt[0]), Y(pt[1])); });
      ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // tulangan (garis kontras di dalam beton)
    ctx.save();
    ctx.strokeStyle = red; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95;
    var cS = Math.max(2, r.covS / 1000 * sc), cF = Math.max(2, r.covF / 1000 * sc);
    // stem muka tanah: vertikal dekat muka belakang, masuk ke tapak (bengkok ke toe)
    var xSteel = (r.opsi === 'tegak') ? (X(xb) - cS) : null;
    ctx.beginPath();
    if (r.opsi === 'tegak') {
      ctx.moveTo(xSteel, Y(crest) + 3);
      ctx.lineTo(xSteel, Y(0) - cF);
      ctx.lineTo(X(Math.max(0.08, r.toe * 0.3)), Y(0) - cF);
    } else {
      // muka tanah = sisi miring: ikuti kemiringan
      ctx.moveTo(X(r.toe + r.bTop) - cS, Y(crest) + 3);
      ctx.lineTo(X(xb) - cS, Y(r.tf) + 1);
      ctx.lineTo(X(xb) - cS, Y(0) - cF);
      ctx.lineTo(X(Math.max(0.08, r.toe * 0.3)), Y(0) - cF);
    }
    ctx.stroke();
    // toe bawah
    if (r.toe > 0.05) {
      ctx.beginPath();
      ctx.moveTo(X(0) + cF, Y(0) - cF);
      ctx.lineTo(X(Math.min(r.B, r.toe + r.bBot + 0.3)), Y(0) - cF);
      ctx.stroke();
    }
    // heel atas
    if (r.B - xb > 0.05) {
      ctx.beginPath();
      ctx.moveTo(X(Math.max(0, xb - 0.3)), Y(r.tf) + cF);
      ctx.lineTo(X(r.B) - cF, Y(r.tf) + cF);
      ctx.stroke();
    }
    ctx.restore();

    // diagram tekanan aktif pada bidang semu x=B
    ctx.save();
    var pMax = r.Ka * (r.g1 * r.Hp + r.q);
    var pScale = Math.max(0.5, 0.3 * r.Hp) / Math.max(pMax, 1);
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
    ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('Pa ' + r.Pa.toFixed(1) + ' kN/m', X(r.B) + 5, Y(r.yPa) - 7);
    ctx.restore();

    // distribusi tumpu TERFAKTOR di bawah tapak
    ctx.save();
    var qs = Math.max(r.quMax, 1);
    var qScale = 0.5 / qs;
    ctx.strokeStyle = olive; ctx.fillStyle = olive; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    var steps = 40;
    for (var i = 0; i <= steps; i++) {
      var xx = r.B * i / steps;
      ctx.lineTo(X(xx), Y(-r.quAt(xx) * qScale));
    }
    ctx.lineTo(X(r.B), Y(0));
    ctx.closePath();
    ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = r.quSideHeel ? 'right' : 'left';
    var xLbl = r.quSideHeel ? X(r.B) + 12 : X(0) - 12;
    ctx.fillText('qu,max ' + r.quMax.toFixed(0), xLbl, Y(-(r.quMax * qScale)) + 12);
    ctx.restore();

    // dimensi
    dimLine(ctx, X(0), X(r.B), yBase + 26, dim, 'B ' + r.B.toFixed(2) + ' m');
    if (r.toe > 0.05) dimLine(ctx, X(0), X(r.toe), yBase + 44, faint, 'toe ' + r.toe.toFixed(2));
    if (r.B - xb > 0.05) dimLine(ctx, X(xb), X(r.B), yBase + 44, faint, 'heel ' + r.heel.toFixed(2));
    dimVert(ctx, X(Math.min(0, r.toe) - 0.15) - 8, Y(crest), Y(r.tf), faint, 'H ' + r.H.toFixed(2) + ' m');
    ctx.fillStyle = faint; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(opsiName(r.opsi) + ' · tul. merah = utama', ox + w / 2, oy + h - 8);
  }

  function drawChecks(ctx, ox, oy, w, h, r) {
    var amber = css('--amber'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var ink = css('--ink'), red = css('--red') || '#c62828', green = css('--green') || css('--sage') || dim;
    var padL = 82, padR = 28, padT = 44, padB = 28;
    var gx0 = ox + padL, gx1 = ox + w - padR, gy0 = oy + padT, gy1 = oy + h - padB;

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KONTROL', gx0 - 4, oy + 22);

    var rows = [
      { nm: 'Guling', val: r.FSot, lim: r.FSotT, ok: r.okOt, txt: 'FS ' + r.FSot.toFixed(2) },
      { nm: 'Geser', val: r.FSsl, lim: r.FSslT, ok: r.okSl, txt: 'FS ' + r.FSsl.toFixed(2) },
      { nm: 'D.dukung', val: (r.dcQ !== null) ? r.dcQ : null, lim: 1, ok: r.okQ, inv: true,
        txt: (r.dcQ !== null) ? 'D/C ' + r.dcQ.toFixed(2) : 'q_izin = 0' },
      { nm: 'Stem', val: Math.max(r.stem.dc, r.stem.dcV), lim: 1, ok: r.okStem, inv: true,
        txt: 'D/C ' + Math.max(r.stem.dc, r.stem.dcV).toFixed(2) },
      { nm: 'Toe', val: (r.toe > 0.01) ? Math.max(r.toeD.dc, r.toeD.dcV) : null, lim: 1, ok: r.okToe, inv: true,
        txt: (r.toe > 0.01) ? 'D/C ' + Math.max(r.toeD.dc, r.toeD.dcV).toFixed(2) : '—' },
      { nm: 'Heel', val: (r.B - r.xb > 0.01) ? Math.max(r.heelD.dc, r.heelD.dcV) : null, lim: 1, ok: r.okHeel, inv: true,
        txt: (r.B - r.xb > 0.01) ? 'D/C ' + Math.max(r.heelD.dc, r.heelD.dcV).toFixed(2) : '—' }
    ];
    var n = rows.length, gap = 10;
    var rowH = (gy1 - gy0 - gap * (n - 1)) / n;
    var bh = Math.min(22, rowH);

    rows.forEach(function (row, i) {
      var y = gy0 + i * (rowH + gap);
      var span = row.inv ? 2 : Math.max(2 * row.lim, 3);
      function BX(v) { return gx0 + (gx1 - gx0) * Math.min(Math.max(v, 0) / span, 1); }
      ctx.fillStyle = line; ctx.globalAlpha = 0.4; ctx.fillRect(gx0, y, gx1 - gx0, bh); ctx.globalAlpha = 1;
      if (row.val !== null) {
        ctx.fillStyle = row.ok ? green : red; ctx.globalAlpha = 0.75;
        ctx.fillRect(gx0, y, BX(Math.min(row.val, span)) - gx0, bh); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = amber; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(BX(row.lim), y - 3); ctx.lineTo(BX(row.lim), y + bh + 3); ctx.stroke();
      ctx.fillStyle = dim; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(row.nm, gx0 - 6, y + bh / 2 + 3);
      ctx.fillStyle = ink; ctx.textAlign = 'left';
      ctx.fillText(row.txt + (row.ok === null || row.val === null ? '' : (row.ok ? ' OK' : ' NG')), gx0 + 6, y + bh / 2 + 3);
    });

    ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText('| batas — hijau OK, merah NG', gx0, gy1 + 14);
  }

  function dimLine(ctx, x1, x2, y, color, label) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    [[x1, 1], [x2, -1]].forEach(function (a) {
      ctx.beginPath(); ctx.moveTo(a[0], y); ctx.lineTo(a[0] + a[1] * 6, y - 3); ctx.lineTo(a[0] + a[1] * 6, y + 3); ctx.closePath(); ctx.fill();
    });
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
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
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—]/g, '-').replace(/ε/g, 'eps')
      .replace(/[₁₂]/g, function (m) { return m === '₁' ? '1' : '2'; })
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
    L.push(centerR('DPT BETON BERTULANG (KANTILEVER)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('Rankine + SNI 2847:2019', dt));
    L.push('');
    L.push(' GEOMETRI');
    L.push(ruleR('-'));
    L.push(rowR('Bentuk', tolatin(opsiName(r.opsi))));
    L.push(rowR('H stem / t_atas / t_bawah', numR(r.H, 2) + ' / ' + numR(r.bTop, 2) + ' / ' + numR(r.bBot, 2) + ' m'));
    L.push(rowR('Tapak: tebal / toe / heel', numR(r.tf, 2) + ' / ' + numR(r.toe, 2) + ' / ' + numR(r.heel, 2) + ' m'));
    L.push(rowR('B total / D tanam', numR(r.B, 2) + ' / ' + numR(r.D, 2) + ' m'));
    L.push(rowR("H' bidang semu", numR(r.Hp, 3) + ' m'));
    L.push('');
    L.push(' TANAH & MATERIAL');
    L.push(ruleR('-'));
    L.push(rowR('Urugan: g1 / phi1 / beta', numR(r.g1, 1) + ' / ' + numR(r.phi1, 0) + 'deg / ' + numR(r.beta, 0) + 'deg'));
    L.push(rowR('Beban merata q', numR(r.q, 1) + ' kPa'));
    L.push(rowR('Fondasi: g2 / phi2 / c2', numR(r.g2, 1) + ' / ' + numR(r.phi2, 0) + 'deg / ' + numR(r.c2, 1)));
    L.push(rowR('q_izin / k gesekan', numR(r.qall, 0) + ' kPa / ' + numR(r.kf, 2)));
    L.push(rowR("Beton fc' / baja fy", numR(r.fc, 0) + ' / ' + numR(r.fy, 0) + ' MPa'));
    L.push(rowR('Selimut stem / tapak', numR(r.covS, 0) + ' / ' + numR(r.covF, 0) + ' mm'));
    L.push('');
    L.push(' STABILITAS (BEBAN LAYAN)');
    L.push(ruleR('='));
    L.push(rowR('Ka / Pa / SPh', numR(r.Ka, 4) + ' / ' + numR(r.Pa, 2) + ' / ' + numR(r.Ph, 2)));
    L.push(rowR('SV / SMr / SMo', numR(r.sumV, 2) + ' / ' + numR(r.Mr, 2) + ' / ' + numR(r.Mo, 2)));
    L.push(rowR('>> FS guling (>= ' + numR(r.FSotT, 1) + ')', numR(r.FSot, 2) + (r.okOt ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push(rowR('>> FS geser (>= ' + numR(r.FSslT, 1) + ')', numR(r.FSsl, 2) + (r.okSl ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push(rowR('e / B-6', numR(r.e, 3) + ' / ' + numR(r.B / 6, 3) + ' m' + (r.okE ? ' (OK)' : ' (LUAR)')));
    L.push(rowR('qmax / qmin layan', numR(r.qmax, 1) + ' / ' + numR(r.qmin, 1) + ' kPa'));
    if (r.dcQ !== null) L.push(rowR('>> qmax/q_izin', numR(r.dcQ, 2) + (r.okQ ? ' (OK)' : ' (TIDAK AMAN)')));
    L.push('');
    L.push(' TUMPUAN TERFAKTOR (1.2D + 1.6H + 1.6L)');
    L.push(ruleR('-'));
    L.push(rowR('SVu / e_u', numR(r.sumVu, 2) + ' kN/m / ' + numR(r.eu, 3) + ' m'));
    L.push(rowR('qu,max / qu,min', numR(r.quMax, 1) + ' / ' + numR(r.quMin, 1) + ' kPa' + (r.triU ? ' (segitiga)' : '')));
    L.push('');
    L.push(' PENULANGAN (SNI 2847:2019) - PER METER');
    L.push(ruleR('='));
    function secFlex(nm, f, act) {
      if (!act) { L.push(rowR(nm, '- (proyeksi 0)')); return; }
      L.push(' ' + nm);
      L.push(rowR('   Mu / d', numR(f.Mu, 1) + ' kNm / ' + numR(f.d, 0) + ' mm'));
      L.push(rowR('   As perlu / As min', numR(f.AsUse, 0) + ' / ' + numR(f.AsMin, 0) + ' mm2'));
      L.push(rowR('   Dipakai', 'D' + f.db + '-' + f.s + ' (As ' + numR(f.AsProv, 0) + ' mm2)'));
      L.push(rowR('   phiMn / D-C', numR(f.phiMn, 1) + ' kNm / ' + numR(f.dc, 2) + (f.ng || f.dc > 1 ? ' (NG)' : ' (OK)')));
      L.push(rowR('   Vu / phiVc / D-C', numR(f.Vu, 1) + ' / ' + numR(f.phiVc, 1) + ' kN / ' + numR(f.dcV, 2) + (f.dcV <= 1 ? ' (OK)' : ' (NG)')));
      if (f.note) wrapR('   ! ' + tolatin(f.note), RW).forEach(function (ln) { L.push(ln); });
    }
    secFlex('STEM (vertikal muka tanah)', r.stem, true);
    secFlex('TOE (tulangan bawah)', r.toeD, r.toe > 0.01);
    secFlex('HEEL (tulangan atas)', r.heelD, r.B - r.xb > 0.01);
    L.push(ruleR('-'));
    L.push(rowR('Stem horizontal 2 muka', 'D' + r.dbD + '-' + r.sH + ' per muka'));
    L.push(rowR('Stem muka depan vertikal', 'D' + r.dbD + '-' + r.sFv));
    L.push(rowR('Tapak memanjang 2 lapis', 'D' + r.dbD + '-' + r.sFt + ' per lapis'));
    L.push(ruleR('='));
    L.push('');
    L.push(' BOQ' + (r.Lw > 0 ? ' (L = ' + numR(r.Lw, 0) + ' m)' : ' (PER METER)'));
    L.push(ruleR('-'));
    L.push(rowR('Beton per meter', numR(r.volM, 3) + ' m3/m'));
    if (r.volTot !== null) L.push(rowR('>> Beton total', numR(r.volTot, 2) + ' m3'));
    L.push(rowR('Besi estimasi per meter', numR(r.steelM, 1) + ' kg/m'));
    if (r.steelTot !== null) L.push(rowR('>> Besi total (est.)', numR(r.steelTot, 0) + ' kg'));
    L.push(rowR('Rasio besi', numR(r.ratio, 0) + ' kg/m3'));
    L.push(rowR('Bekisting per meter', numR(r.formM, 2) + ' m2/m'));
    if (r.formTot !== null) L.push(rowR('>> Bekisting total', numR(r.formTot, 1) + ' m2'));
    r.sets.forEach(function (s) {
      L.push(rowR('   ' + tolatin(s.nm), numR(s.kg, 1) + ' kg/m'));
    });
    L.push(' (Besi belum termasuk overlap/stek/waste, tambah 10-15%)');
    L.push('');
    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' Stabilitas beban layan; penulangan U=1.2D+1.6H+1.6L, distribusi');
    L.push(' tumpu terfaktor linier/segitiga; toe abaikan tanah di atas.');
    L.push(' TIDAK termasuk: air tanah, gempa, stabilitas global, shear key.');
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
    var base = 'DPT-Beton_H' + r.H + '_B' + r.B.toFixed(2) + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'DPT Beton Kantilever', category: 'Geoteknik', needsCanvas: true, needsRenderer: false },

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
