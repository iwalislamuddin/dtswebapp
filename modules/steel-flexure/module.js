/* ============================================================
   Civil Tools — modules/steel-flexure/module.js  (Tier 2, kanvas 2D)
   Kapasitas lentur balok baja — SNI 1729:2020 (mengadopsi AISC 360-16), Bab F

   Keadaan batas kekuatan lentur Mn (kekuatan nominal), DFBK & ASD:
     DFBK: φb·Mn  → φb = 0.90        ASD: Mn/Ωb  → Ωb = 1.67

   PENAMPANG & PASAL YANG DIIMPLEMENTASI
   ------------------------------------------------------------
   F2  — I dwi-simetris & KANAL, sumbu kuat, sayap & badan KOMPAK:
         (a) Leleh:  Mn = Mp = Fy·Zx
         (b) Tekuk torsi-lateral (LTB):
             Lp = 1.76·ry·√(E/Fy)
             Lr = 1.95·rts·(E/0.7Fy)·√[ Jc/(Sx·ho) + √((Jc/(Sx·ho))² + 6.76(0.7Fy/E)²) ]
             Lb≤Lp → Mp ; Lp<Lb≤Lr → Cb[Mp−(Mp−0.7FySx)(Lb−Lp)/(Lr−Lp)]≤Mp ;
             Lb>Lr → Fcr·Sx≤Mp, Fcr = Cbπ²E/(Lb/rts)²·√(1+0.078(Jc/(Sx·ho))(Lb/rts)²)
   F3  — I dwi-simetris, badan kompak, SAYAP non-kompak/langsing (FLB):
             non-kompak: Mn=Mp−(Mp−0.7FySx)(λ−λpf)/(λrf−λpf)
             langsing:   Mn=0.9E·kc·Sx/λ²  (kc=4/√(h/tw), 0.35..0.76)
         Mn sumbu-kuat = min(LTB, FLB).  Badan non-kompak/langsing (F4/F5) → PERINGATAN.
   F6  — I & kanal, SUMBU LEMAH: Mn=min(Fy·Zy, 1.6·Fy·Sy); FLB sayap; TANPA LTB.
   F7  — HSS persegi/kotak (SHS/RHS/box): Mp=Fy·Z; tekuk lokal sayap & badan;
         LTB (F7.4) untuk kotak dalam-sempit.
   F8  — HSS bundar (Pipa): Mp=Fy·Z; D/t non-kompak/langsing → Fcr·S.

   J & Cw (untuk LTB) DIHITUNG dari geometri:
     I  : J=⅓[2·bf·tf³+(d−2tf)·tw³] (thin-wall tanpa fillet → konservatif), Cw=Iy·ho²/4, c=1.
     Kanal: Cw=(ho²·bf³·tf/12)·(3·bf·tf+2·ho·tw)/(6·bf·tf+ho·tw) (pendekatan),
            c=(ho/2)·√(Iy/Cw).
   Zx/Zy WF & UNP dihitung dari geometri (tak ada di tabel library):
     Zx=bf·tf·(d−tf)+tw·(d−2tf)²/4 ; Zy=tf·bf²/2+(d−2tf)·tw²/4 (I).

   Klasifikasi kekompakan (Tabel B4.1b) dihitung per elemen.

   TIDAK termasuk (diberi peringatan eksplisit bila relevan):
     - Badan non-kompak/langsing I (F4/F5 Rpc/Rpg) — hanya diperingatkan.
     - Sudut tunggal (F10) & penampang tak-simetris/CNP (F12): butuh sumbu utama &
       pusat geser (belum di library). Ditampilkan LELEH ELASTIS indikatif Mn=Fy·Sx
       + peringatan "bukan untuk desain akhir".
     - Geser (Bab G), lendutan, tekuk badan lokal akibat beban terpusat.

   Data profil dari library core/steel-profiles.js.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'steel-flexure';

  var E_MOD = 200000;                 // MPa
  var G_MOD = 77200;                  // MPa
  var PHI_B = 0.90, OMEGA_B = 1.67;

  // Mutu baja: [label, Fy, Fu] (MPa)
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
  // Faktor modifikasi tekuk lateral Cb (kasus umum, tumpuan terkekang lateral)
  var CBPRESET = [
    ['Momen seragam / konservatif  (Cb=1,0)', 1.0],
    ['Balok sederhana + beban merata  (Cb=1,14)', 1.14],
    ['Balok sederhana + beban titik tengah  (Cb=1,32)', 1.32],
    ['Kantilever ujung terbeban  (Cb=1,0)', 1.0],
    ['Manual (isi Cb sendiri)', 0]
  ];

  var state = {};
  var SP = null;

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /* ---------- Klasifikasi elemen (Tabel B4.1b, lentur) ---------- */
  // return { cls:'kompak'|'nonkompak'|'langsing', lam, lp, lr }
  function classify(lam, lp, lr) {
    var cls = (lam <= lp) ? 'kompak' : (lam <= lr ? 'nonkompak' : 'langsing');
    return { cls: cls, lam: lam, lp: lp, lr: lr };
  }

  /* ============================================================
     GEOMETRI TURUNAN — properti yang tak tersedia di tabel
     ============================================================ */
  // I / kanal: kembalikan Zx, Zy, J, Cw, ho, rts, c
  function torsProps(p, type) {
    var d = p.H, bf = p.B, tw = p.tw, tf = p.tf;
    var Sx = p.Sx * 1e3;              // cm³ → mm³
    var Iy = p.Iy * 1e4;              // cm⁴ → mm⁴
    var ho = d - tf;                  // jarak titik-berat sayap
    var J = (2 * bf * Math.pow(tf, 3) + (d - 2 * tf) * Math.pow(tw, 3)) / 3;
    var Zx = bf * tf * (d - tf) + tw * Math.pow(d - 2 * tf, 2) / 4;
    var Zy = tf * bf * bf / 2 + (d - 2 * tf) * tw * tw / 4;
    var Cw, c;
    if (type === 'WF') {
      Cw = Iy * ho * ho / 4; c = 1;
    } else { // kanal (UNP)
      Cw = (ho * ho * Math.pow(bf, 3) * tf / 12) *
           (3 * bf * tf + 2 * ho * tw) / (6 * bf * tf + ho * tw);
      c = (ho / 2) * Math.sqrt(Iy / Cw);
    }
    var rts = Math.sqrt(Math.sqrt(Iy * Cw) / Sx);
    return { Zx: Zx, Zy: Zy, J: J, Cw: Cw, ho: ho, rts: rts, c: c, Sx: Sx, Iy: Iy };
  }

  /* ============================================================
     F2 / F3 — I dwi-simetris & kanal, SUMBU KUAT
     ============================================================ */
  function flexImajor(p, type, Fy, Lb, Cb) {
    var kE = Math.sqrt(E_MOD / Fy);
    var d = p.H, bf = p.B, tw = p.tw, tf = p.tf;
    var tp = torsProps(p, type);
    var Sx = tp.Sx, ry = p.iy * 10, ho = tp.ho, rts = tp.rts, J = tp.J, c = tp.c;
    var Zx = tp.Zx;
    var Mp = Fy * Zx;                                   // N·mm
    var Mr = 0.7 * Fy * Sx;                             // batas plastis (0.7Fy·Sx)

    // Klasifikasi sayap & badan (lentur)
    var lamF = (type === 'WF') ? (bf / 2) / tf : bf / tf;   // WF: b/2tf ; kanal: b/tf
    var flange = classify(lamF, 0.38 * kE, 1.0 * kE);
    var hw = d - 2 * tf;
    var web = classify(hw / tw, 3.76 * kE, 5.70 * kE);

    // (1) LTB — F2
    var Lp = 1.76 * ry * kE;
    var jcSxho = J * c / (Sx * ho);
    var Lr = 1.95 * rts * (E_MOD / (0.7 * Fy)) *
             Math.sqrt(jcSxho + Math.sqrt(jcSxho * jcSxho + 6.76 * Math.pow(0.7 * Fy / E_MOD, 2)));
    var Mn_ltb, ltbMode;
    if (Lb <= Lp) { Mn_ltb = Mp; ltbMode = 'Plastis (Lb ≤ Lp)'; }
    else if (Lb <= Lr) {
      Mn_ltb = Cb * (Mp - (Mp - Mr) * (Lb - Lp) / (Lr - Lp));
      Mn_ltb = Math.min(Mn_ltb, Mp); ltbMode = 'LTB inelastis (Lp < Lb ≤ Lr)';
    } else {
      var lamb = Lb / rts;
      var Fcr = Cb * Math.PI * Math.PI * E_MOD / (lamb * lamb) *
                Math.sqrt(1 + 0.078 * jcSxho * lamb * lamb);
      Mn_ltb = Math.min(Fcr * Sx, Mp); ltbMode = 'LTB elastis (Lb > Lr)';
    }

    // (2) FLB — F3 (bila sayap non-kompak/langsing)
    var Mn_flb = Mp, flbMode = 'sayap kompak';
    if (flange.cls === 'nonkompak') {
      Mn_flb = Mp - (Mp - Mr) * (lamF - flange.lp) / (flange.lr - flange.lp);
      flbMode = 'FLB non-kompak';
    } else if (flange.cls === 'langsing') {
      var kc = 4 / Math.sqrt(hw / tw); kc = Math.max(0.35, Math.min(0.76, kc));
      Mn_flb = 0.9 * E_MOD * kc * Sx / (lamF * lamF);
      flbMode = 'FLB langsing';
    }

    var Mn, gov;
    if (Mn_flb < Mn_ltb) { Mn = Mn_flb; gov = 'Tekuk lokal sayap (F3)'; }
    else { Mn = Mn_ltb; gov = (ltbMode.indexOf('Plastis') === 0) ? 'Leleh / plastis (F2)' : 'Tekuk torsi-lateral (F2)'; }

    return {
      axis: 'x', section: (type === 'WF' ? 'F2/F3' : 'F2'),
      Fy: Fy, Zx: Zx, Sx: Sx, Mp: Mp, Mr: Mr, Mn: Mn, gov: gov,
      ry: ry, rts: rts, ho: ho, J: J, Cw: tp.Cw, c: c,
      Lb: Lb, Lp: Lp, Lr: Lr, Cb: Cb, ltb: true, ltbMode: ltbMode,
      Mn_ltb: Mn_ltb, Mn_flb: Mn_flb, flbMode: flbMode,
      flange: flange, web: web, lamF: lamF
    };
  }

  /* ============================================================
     F6 — I (& kanal, hanya WF didukung penuh), SUMBU LEMAH
     ============================================================ */
  function flexIminor(p, Fy) {
    var kE = Math.sqrt(E_MOD / Fy);
    var bf = p.B, tf = p.tf, d = p.H, tw = p.tw;
    var tp = torsProps(p, 'WF');
    var Zy = tp.Zy, Sy = p.Sy * 1e3;
    var MpCap = 1.6 * Fy * Sy;
    var Mp = Math.min(Fy * Zy, MpCap);
    var lamF = (bf / 2) / tf;
    var flange = classify(lamF, 0.38 * kE, 1.0 * kE);
    var Mn, gov, flbMode;
    if (flange.cls === 'kompak') { Mn = Mp; gov = 'Leleh (F6)'; flbMode = 'sayap kompak'; }
    else if (flange.cls === 'nonkompak') {
      Mn = Mp - (Mp - 0.7 * Fy * Sy) * (lamF - flange.lp) / (flange.lr - flange.lp);
      gov = 'Tekuk lokal sayap (F6)'; flbMode = 'FLB non-kompak';
    } else {
      var Fcr = 0.69 * E_MOD / (lamF * lamF);
      Mn = Fcr * Sy; gov = 'Tekuk lokal sayap langsing (F6)'; flbMode = 'FLB langsing';
    }
    return {
      axis: 'y', section: 'F6', Fy: Fy, Zy: Zy, Sy: Sy, Mp: Mp, MpCap: MpCap,
      Mn: Mn, gov: gov, ltb: false, flange: flange, lamF: lamF, flbMode: flbMode
    };
  }

  /* ============================================================
     F7 — HSS persegi / kotak (SHS/RHS/box)
     ============================================================ */
  function flexBox(p, axis, Fy, Lb, Cb) {
    var kE = Math.sqrt(E_MOD / Fy);
    var t = p.t;
    // orientasi: sumbu kuat pakai H sbg tinggi; sumbu lemah tukar peran B<->H
    var Hd = (axis === 'x') ? p.H : p.B;
    var Bd = (axis === 'x') ? p.B : p.H;
    var Z = ((axis === 'x') ? p.Zx : p.Zy) * 1e3;   // cm³ → mm³
    var S = ((axis === 'x') ? p.Sx : p.Sy) * 1e3;
    var Mp = Fy * Z;

    // sayap (tegak lurus sumbu lentur) lebar rata b = Bd − 3t ; badan h = Hd − 3t
    var bflat = Math.max(1, Bd - 3 * t), hflat = Math.max(1, Hd - 3 * t);
    var flange = classify(bflat / t, 1.12 * kE, 1.40 * kE);
    var web = classify(hflat / t, 2.42 * kE, 5.70 * kE);

    // Tekuk lokal sayap (F7.2)
    var Mn_f = Mp;
    if (flange.cls === 'nonkompak') {
      Mn_f = Mp - (Mp - Fy * S) * (3.57 * (bflat / t) * Math.sqrt(Fy / E_MOD) - 4.0);
      Mn_f = Math.min(Mn_f, Mp);
    } else if (flange.cls === 'langsing') {
      var be = 1.92 * t * Math.sqrt(E_MOD / Fy) * (1 - 0.38 / (bflat / t) * Math.sqrt(E_MOD / Fy));
      be = Math.min(be, bflat);
      Mn_f = Fy * S * (be / bflat);   // pendekatan konservatif lebar efektif (F7.2)
    }
    // Tekuk lokal badan (F7.3)
    var Mn_w = Mp;
    if (web.cls === 'nonkompak') {
      Mn_w = Mp - (Mp - Fy * S) * (0.305 * (hflat / t) * Math.sqrt(Fy / E_MOD) - 0.738);
      Mn_w = Math.min(Mn_w, Mp);
    } else if (web.cls === 'langsing') {
      Mn_w = Fy * S; // pendekatan (F7.3 badan langsing jarang untuk HSS pasaran)
    }

    // LTB kotak (F7.4) — HANYA penampang persegi-panjang lentur sumbu kuat (H>B).
    // Untuk kotak bujursangkar (SHS, H=B) atau lentur sumbu lemah, LTB TIDAK berlaku
    // (kekakuan lateral = kekakuan lentur → tak ada reduksi torsi-lateral).
    var ltb = false, Lp = 0, Lr = 0, Mn_ltb = Mp, ltbMode = '', ry = p.iy * 10, Jbox = 0, Mr = 0.7 * Fy * S;
    if (axis === 'x' && Lb > 0 && p.H > p.B) {
      var A = p.A * 100;                          // mm²
      var a = p.B - t, b = p.H - t;
      Jbox = 2 * t * a * a * b * b / (a + b);     // torsi tabung tertutup (thin-wall)
      Lp = 0.13 * E_MOD * ry * Math.sqrt(Jbox * A) / Mp;
      Lr = 2 * E_MOD * ry * Math.sqrt(Jbox * A) / (0.7 * Fy * S);
      ltb = true;
      if (Lb <= Lp) { Mn_ltb = Mp; ltbMode = 'Plastis (Lb ≤ Lp)'; }
      else if (Lb <= Lr) {
        Mn_ltb = Cb * (Mp - (Mp - Mr) * (Lb - Lp) / (Lr - Lp));
        Mn_ltb = Math.min(Mn_ltb, Mp); ltbMode = 'LTB inelastis';
      } else {
        Mn_ltb = 2 * E_MOD * Cb * Math.sqrt(Jbox * A) / (Lb / ry);
        Mn_ltb = Math.min(Mn_ltb, Mp); ltbMode = 'LTB elastis';
      }
    }

    // Kandidat leleh/plastis lebih dulu → saat seri (semua = Mp, penampang kompak)
    // keadaan batas dilaporkan sebagai leleh, bukan tekuk lokal.
    var cands = [
      { m: Mn_ltb, g: ltb && ltbMode.indexOf('Plastis') !== 0 ? 'LTB kotak (F7.4)' : 'Leleh / plastis (F7.1)' },
      { m: Mn_f, g: 'Tekuk lokal sayap (F7.2)' },
      { m: Mn_w, g: 'Tekuk lokal badan (F7.3)' }
    ];
    var min = cands[0];
    cands.forEach(function (cc) { if (cc.m < min.m) min = cc; });

    return {
      axis: axis, section: 'F7', Fy: Fy, Z: Z, S: S, Mp: Mp, Mr: Mr, Mn: min.m, gov: min.g,
      flange: flange, web: web, bflat: bflat, hflat: hflat, Mn_f: Mn_f, Mn_w: Mn_w,
      ltb: ltb, Lb: Lb, Lp: Lp, Lr: Lr, Cb: Cb, Mn_ltb: Mn_ltb, ltbMode: ltbMode,
      ry: ry, J: Jbox
    };
  }

  /* ============================================================
     F8 — HSS bundar (Pipa)
     ============================================================ */
  function flexPipe(p, Fy) {
    var Dt = p.D / p.t;
    var lp = 0.07 * E_MOD / Fy, lr = 0.31 * E_MOD / Fy, lmax = 0.45 * E_MOD / Fy;
    var Z = p.Zx * 1e3, S = p.Sx * 1e3;
    var Mp = Fy * Z, Mn, gov;
    var cls;
    if (Dt <= lp) { Mn = Mp; cls = 'kompak'; gov = 'Leleh (F8.1)'; }
    else if (Dt <= lr) { Mn = (0.021 * E_MOD / Dt + Fy) * S; cls = 'nonkompak'; gov = 'Tekuk lokal (F8.2)'; }
    else { var Fcr = 0.33 * E_MOD / Dt; Mn = Fcr * S; cls = 'langsing'; gov = 'Tekuk lokal langsing (F8.3)'; }
    return {
      axis: 'x', section: 'F8', Fy: Fy, Z: Z, S: S, Mp: Mp, Mn: Math.min(Mn, Mp), gov: gov,
      ltb: false, Dt: Dt, lp: lp, lr: lr, lmax: lmax, cls: cls
    };
  }

  /* ============================================================
     F10/F12 (indikatif) — siku tunggal & CNP (tak-simetris)
     ============================================================ */
  function flexOther(p, type, Fy) {
    var S = p.Sx * 1e3;
    var My = Fy * S;              // leleh elastis (indikatif)
    return {
      axis: 'x', section: (type === 'L' ? 'F10*' : 'F12*'), Fy: Fy, S: S,
      Mp: My, Mn: My, gov: 'Leleh elastis (indikatif)', ltb: false, indicative: true
    };
  }

  /* ============================================================
     COMPUTE — dispatch
     ============================================================ */
  function compute(v) {
    var r = { warn: [], valid: false };
    var type = v.ptype, name = v.psize;
    var p = SP.get(type, name);
    if (!p) { r.warn.push('Profil belum dipilih.'); return r; }
    var ti = SP.typeInfo(type);
    var Fy = num(v.Fy);
    if (!(Fy > 0)) { r.warn.push('Fy harus > 0.'); return r; }

    var axis = v.axis || 'x';
    var Lb = num(v.Lb), Cb;
    if (String(v.Cbpreset) === '0') Cb = num(v.Cbval); else Cb = num(v.Cbpreset);
    if (!(Cb > 0)) { Cb = 1.0; }

    var f;
    if (type === 'WF') {
      f = (axis === 'y') ? flexIminor(p, Fy) : flexImajor(p, type, Fy, Lb, Cb);
    } else if (type === 'UNP') {
      if (axis === 'y') {
        r.warn.push('Sumbu lemah kanal (UNP) bersifat tak-simetris (pusat geser ≠ centroid) — F6 untuk kanal butuh properti yang belum tersedia di library. Gunakan sumbu KUAT, atau verifikasi terpisah. Ditampilkan sumbu kuat.');
        f = flexImajor(p, type, Fy, Lb, Cb);
      } else {
        f = flexImajor(p, type, Fy, Lb, Cb);
      }
    } else if (type === 'SHS' || type === 'RHS') {
      f = flexBox(p, axis, Fy, Lb, Cb);
    } else if (type === 'PIPE') {
      f = flexPipe(p, Fy);
    } else { // L, CNP
      f = flexOther(p, type, Fy);
    }

    if (!(f.Mn > 0)) { r.warn.push('Perhitungan Mn gagal — periksa properti profil.'); return r; }

    var Mn = f.Mn / 1e6;            // N·mm → kN·m
    var Mp = f.Mp / 1e6;
    var phiMn = PHI_B * Mn;
    var Ma_cap = Mn / OMEGA_B;

    // demand
    var Mu = num(v.Mu), MaDem = num(v.Ma);
    var dcL = (Mu > 0) ? Mu / phiMn : null;
    var dcA = (MaDem > 0) ? MaDem / Ma_cap : null;

    r.valid = true;
    r.p = p; r.type = type; r.ti = ti; r.name = name; r.axis = axis;
    r.f = f; r.Mn = Mn; r.Mp = Mp; r.phiMn = phiMn; r.Ma = Ma_cap;
    r.Mu = Mu; r.MaDem = MaDem; r.dcL = dcL; r.dcA = dcA;
    r.Cb = Cb; r.Lb = Lb;

    // Peringatan
    if (f.web && f.web.cls !== 'kompak')
      r.warn.push('Badan penampang ' + f.web.cls.toUpperCase() + ' (h/tw = ' + f.web.lam.toFixed(1) + ' > λp ' + f.web.lp.toFixed(1) + ') — provisi badan non-kompak/langsing (F4/F5, faktor Rpc/Rpg) TIDAK diterapkan penuh; Mn di atas berpotensi tidak konservatif.');
    if (f.flange && f.flange.cls === 'langsing')
      r.warn.push('Sayap LANGSING (λ = ' + f.lamF.toFixed(1) + ' > λr) — kekuatan diatur tekuk lokal sayap; verifikasi tekuk lokal & lebar efektif.');
    if (f.section === 'F7' && (f.flange.cls === 'langsing' || (f.web && f.web.cls === 'langsing')))
      r.warn.push('HSS dengan elemen langsing — perhitungan lebar/luas efektif (F7) dipakai pendekatan konservatif; verifikasi terpisah.');
    if (f.indicative)
      r.warn.push('Penampang ' + ti.name + ' (tak-simetris / sudut tunggal): kekuatan lentur AISC F10 (siku, sumbu utama & LTB) / F12 (tak-simetris) butuh sumbu utama & pusat geser yang BELUM ada di library. Yang ditampilkan hanya LELEH ELASTIS Mn=Fy·Sx (indikatif) — BUKAN untuk desain akhir; LTB & tekuk lokal belum diperhitungkan.');
    if (f.section === 'F8' && f.Dt > f.lmax)
      r.warn.push('D/t = ' + f.Dt.toFixed(1) + ' > 0,45E/Fy (' + f.lmax.toFixed(0) + ') — di luar batas terapan lentur HSS bundar (F8). Hasil tidak berlaku.');
    if (type === 'CNP')
      r.warn.push('Profil CNP (cold-formed) sepenuhnya diatur SNI 7971 / AISI (lebar efektif, tekuk distorsi) — hasil di sini hanya indikasi kasar.');
    if (f.ltb && f.Lb <= 0)
      r.warn.push('Lb = 0 (dianggap terkekang penuh) → kapasitas = kekuatan plastis Mp tanpa reduksi LTB. Isi Lb (panjang tak-terkekang lateral) untuk cek tekuk torsi-lateral.');
    if (dcL !== null && dcL > 1) r.warn.push('DFBK: Mu/φMn = ' + dcL.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.');
    if (dcA !== null && dcA > 1) r.warn.push('ASD: Ma/(Mn/Ω) = ' + dcA.toFixed(2) + ' > 1,0 — kapasitas TERLAMPAUI.');
    if (p.source === 'hitung' && !f.indicative)
      r.warn.push('Properti profil ' + ti.name + ' DIHITUNG dari geometri (' + (p.note || '') + '); verifikasi terhadap katalog pabrikan.');

    return r;
  }

  /* ---------- CSS scoped ---------- */
  function injectStyle() {
    if (document.getElementById('sf-style')) return;
    var s = document.createElement('style');
    s.id = 'sf-style';
    s.textContent =
      '.sf-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.sf-canvas{position:relative;flex:1 1 50%;min-height:230px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(120% 120% at 30% 0%, var(--bg2), var(--bg))}' +
      '.sf-res{flex:1 1 50%;overflow-y:auto;padding:18px 24px 34px}';
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
    panel.appendChild(UI.el('h2', null, 'Balok Baja (Lentur)'));
    panel.appendChild(UI.el('div', 'sub', 'Kapasitas lentur φMn / Mn/Ω — SNI 1729:2020 (AISC 360-16) Bab F. Leleh/plastis, tekuk torsi-lateral (LTB), dan tekuk lokal sayap/badan; klasifikasi kekompakan otomatis. Profil dari library baja; penampang & kurva Mn–Lb tergambar.'));
    layout.appendChild(panel);

    var work = UI.el('div', 'sf-work');
    var canvasHost = UI.el('div', 'sf-canvas');
    state.cap = UI.canvasCap(canvasHost, 'Penampang & kurva Mn–Lb');
    var results = UI.el('div', 'sf-res');
    work.appendChild(canvasHost);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);

    var typeOpts = SP.types.map(function (t) { return { value: t.key, label: t.name + ' — ' + t.full }; });
    var sizeOpts = SP.list('WF').map(function (p) { return { value: p.name, label: p.name }; });
    var gradeOpts = GRADES.map(function (g, i) { return { value: String(i), label: g[0] }; });
    // value 'cant' unik utk kantilever (Cb=1,0) agar tak bentrok preset lain
    var cbOpts = CBPRESET.map(function (u, i) { return { value: (i === 3 ? 'cant' : String(u[1])), label: u[0] }; });

    var schema = [
      { type: 'group', label: 'Profil (library baja)' },
      { type: 'select', id: 'ptype', label: 'Tipe profil', value: 'WF', options: typeOpts },
      { type: 'select', id: 'psize', label: 'Ukuran', value: sizeOpts[8] ? sizeOpts[8].value : sizeOpts[0].value, options: sizeOpts },
      { type: 'segment', id: 'axis', label: 'Sumbu lentur', value: 'x',
        options: [{ value: 'x', label: 'Kuat (x-x)' }, { value: 'y', label: 'Lemah (y-y)' }] },

      { type: 'group', label: 'Mutu Baja' },
      { type: 'select', id: 'grade', label: 'Mutu', value: '0', options: gradeOpts },
      { type: 'number', id: 'Fy', label: 'Fy — tegangan leleh', unit: 'MPa', value: 240, min: 100, step: 5, hint: 'E = 200.000 MPa, G = 77.200 MPa (tetap).' },

      { type: 'group', label: 'Kekangan Lateral (LTB)' },
      { type: 'number', id: 'Lb', label: 'Lb — panjang tak-terkekang lateral', unit: 'mm', value: 3000, min: 0, step: 100, hint: 'Jarak antar kekangan lateral sayap tekan. 0 = terkekang penuh (Mn = Mp).' },
      { type: 'select', id: 'Cbpreset', label: 'Faktor tekuk lateral Cb', value: '1', options: cbOpts },
      { type: 'number', id: 'Cbval', label: 'Cb manual', unit: '', value: 1.0, min: 1.0, max: 3.0, step: 0.01, hint: 'Cb=1,0 konservatif. Cb memperhitungkan gradien momen pada segmen tak-terkekang.' },

      { type: 'group', label: 'Beban (momen)' },
      { type: 'number', id: 'Mu', label: 'Mu — momen terfaktor (DFBK)', unit: 'kN·m', value: 0, min: 0, step: 5, hint: '0 = lewati rasio D/C.' },
      { type: 'number', id: 'Ma', label: 'Ma — momen layan (ASD)', unit: 'kN·m', value: 0, min: 0, step: 5, hint: '0 = lewati rasio D/C.' }
    ];

    function ltbApplies(vals) {
      var t = vals.ptype, ax = vals.axis;
      // SHS (bujursangkar) dikecualikan dari LTB (F7.4); RHS hanya sumbu kuat.
      return (t === 'WF' && ax === 'x') || (t === 'UNP') || (t === 'RHS' && ax === 'x');
    }
    function axisApplies(vals) {
      // sumbu lentur hanya relevan utk WF & box; pipa/siku/cnp: sumbu kuat saja
      return vals.ptype === 'WF' || vals.ptype === 'SHS' || vals.ptype === 'RHS';
    }
    function syncVisibility(vals) {
      var manualCb = String(vals.Cbpreset) === '0';
      var showLtb = ltbApplies(vals);
      [['Cbval', manualCb && showLtb], ['Lb', showLtb], ['Cbpreset', showLtb]].forEach(function (a) {
        var f = state.form.fields[a[0]]; if (f) f.node.closest('.ck-field').style.display = a[1] ? '' : 'none';
      });
      var af = state.form.fields.axis;
      if (af) af.node.closest('.ck-field').style.display = axisApplies(vals) ? '' : 'none';
    }

    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      if (changedId === 'ptype') {
        fillSizes(vals.ptype);
        if (!axisApplies(vals)) form.setValue('axis', 'x');
        vals = form.getValues();
      }
      if (changedId === 'grade') {
        var g = GRADES[parseInt(vals.grade, 10)];
        if (g && g[1] > 0) { form.setValue('Fy', g[1]); vals = form.getValues(); }
      }
      syncVisibility(vals);
      update(vals, results);
    }, ID);   // ID → daftar ke window.CivilForms utk terima handoff (Kombinasi Beban → Mu)
    state.form = form;
    state.results = results;

    // Isi daftar ukuran sesuai tipe profil terpulihkan (persistensi input),
    // lalu terapkan ulang ukuran tersimpan bila masih ada di daftar.
    fillSizes(form.getValues().ptype || 'WF', schema[2].value);
    form.restore('psize');

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
      state.cap.set('Penampang & kurva Mn–Lb');
      results.appendChild(UI.el('div', 'ck-empty', 'Pilih profil, mutu baja & panjang tak-terkekang untuk menghitung.'));
      if (r.warn && r.warn.length) results.appendChild(UI.note('Periksa input', r.warn.join(' ')));
      if (state.cv) state.cv.redraw();
      return;
    }
    var p = r.p, f = r.f;
    var axLbl = r.axis === 'y' ? 'y-y (lemah)' : 'x-x (kuat)';
    state.cap.set(r.ti.name + '  ·  ' + p.name + '  ·  phiMn ' + r.phiMn.toFixed(1) + ' kN.m · ' + f.section);

    results.appendChild(UI.heroRow([
      { label: 'φMn DFBK — ' + axLbl, value: UI.fmt(r.phiMn, 1), unit: 'kN·m' },
      { label: 'Mn/Ω (ASD)', value: UI.fmt(r.Ma, 1), unit: 'kN·m' },
      (r.dcL !== null)
        ? { label: 'Mu/φMn', value: UI.fmt(r.dcL, 2), unit: r.dcL <= 1 ? 'OK' : 'NG', tone: r.dcL <= 1 ? 'ok' : 'bad' }
        : { label: 'Mn nominal', value: UI.fmt(r.phiMn / 0.9, 1), unit: 'kN·m' }
    ]));
    results.appendChild(UI.el('div', 'ck-empty', 'Menentukan: ' + f.gov + '.'));

    results.appendChild(UI.rhead('Profil & penampang'));
    results.appendChild(UI.kv('Tipe', r.ti.name + ' — ' + r.ti.full));
    results.appendChild(UI.kv('Ukuran', p.name));
    results.appendChild(UI.kv('Berat', UI.fmt(p.w, 1) + ' kg/m'));
    results.appendChild(UI.kv('Sumbu lentur', axLbl + ' — pasal ' + f.section));
    if (f.Zx !== undefined) results.appendChild(UI.kv('Zx (modulus plastis, hitung)', UI.fmt(f.Zx / 1e3, 1) + ' cm³'));
    if (f.Zy !== undefined) results.appendChild(UI.kv('Zy (modulus plastis, hitung)', UI.fmt(f.Zy / 1e3, 1) + ' cm³'));
    if (f.Z !== undefined) results.appendChild(UI.kv('Z (modulus plastis)', UI.fmt(f.Z / 1e3, 1) + ' cm³'));
    if (f.Sx !== undefined) results.appendChild(UI.kv('Sx (modulus elastis)', UI.fmt(f.Sx / 1e3, 1) + ' cm³'));
    if (f.Sy !== undefined) results.appendChild(UI.kv('Sy (modulus elastis)', UI.fmt(f.Sy / 1e3, 1) + ' cm³'));
    if (f.S !== undefined && f.Sx === undefined) results.appendChild(UI.kv('S (modulus elastis)', UI.fmt(f.S / 1e3, 1) + ' cm³'));

    // Klasifikasi kekompakan
    if (f.flange || f.web) {
      results.appendChild(UI.rhead('Kekompakan (Tabel B4.1b)'));
      if (f.flange) results.appendChild(UI.kv('Sayap — λ / λp / λr',
        f.flange.lam.toFixed(1) + ' / ' + f.flange.lp.toFixed(1) + ' / ' + f.flange.lr.toFixed(1) + ' → ' + f.flange.cls,
        f.flange.cls === 'kompak' ? 'ok' : (f.flange.cls === 'langsing' ? 'bad' : '')));
      if (f.web) results.appendChild(UI.kv('Badan — λ / λp / λr',
        f.web.lam.toFixed(1) + ' / ' + f.web.lp.toFixed(1) + ' / ' + f.web.lr.toFixed(1) + ' → ' + f.web.cls,
        f.web.cls === 'kompak' ? 'ok' : (f.web.cls === 'langsing' ? 'bad' : '')));
    }
    if (f.section === 'F8') {
      results.appendChild(UI.rhead('Kekompakan (F8 — HSS bundar)'));
      results.appendChild(UI.kv('D/t', f.Dt.toFixed(1) + ' → ' + f.cls, f.cls === 'kompak' ? 'ok' : (f.cls === 'langsing' ? 'bad' : '')));
      results.appendChild(UI.kv('λp / λr (0,07E/Fy · 0,31E/Fy)', f.lp.toFixed(1) + ' / ' + f.lr.toFixed(1)));
    }

    // LTB
    if (f.ltb) {
      results.appendChild(UI.rhead('Tekuk torsi-lateral (LTB)'));
      results.appendChild(UI.kv('Lb (tak-terkekang)', UI.fmt(r.Lb, 0) + ' mm'));
      results.appendChild(UI.kv('Cb', UI.fmt(r.Cb, 2)));
      results.appendChild(UI.kv('Lp (batas plastis)', UI.fmt(f.Lp, 0) + ' mm', r.Lb <= f.Lp ? 'ok' : ''));
      results.appendChild(UI.kv('Lr (batas inelastis)', UI.fmt(f.Lr, 0) + ' mm'));
      results.appendChild(UI.kv('Zona', f.ltbMode));
      if (f.rts) results.appendChild(UI.kv('rts / ho', UI.fmt(f.rts / 10, 2) + ' / ' + UI.fmt(f.ho / 10, 2) + ' cm'));
      if (f.J !== undefined) results.appendChild(UI.kv('J (torsi, hitung)', UI.fmt(f.J / 1e4, 2) + ' cm⁴'));
      if (f.Cw) results.appendChild(UI.kv('Cw (warping, hitung)', UI.fmt(f.Cw / 1e6, 0) + ' cm⁶' + (r.type === 'UNP' ? ' (pendekatan kanal)' : '')));
      if (f.c !== undefined && r.type === 'UNP') results.appendChild(UI.kv('c (faktor kanal)', UI.fmt(f.c, 3)));
      results.appendChild(UI.kv('Mn dari LTB', UI.fmt(f.Mn_ltb / 1e6, 1) + ' kN·m'));
      if (f.Mn_flb !== undefined && f.flbMode !== 'sayap kompak')
        results.appendChild(UI.kv('Mn dari FLB (' + f.flbMode + ')', UI.fmt(f.Mn_flb / 1e6, 1) + ' kN·m'));
    }
    if (f.section === 'F7') {
      results.appendChild(UI.kv('Mn tekuk lokal sayap', UI.fmt(f.Mn_f / 1e6, 1) + ' kN·m'));
      results.appendChild(UI.kv('Mn tekuk lokal badan', UI.fmt(f.Mn_w / 1e6, 1) + ' kN·m'));
    }

    results.appendChild(UI.rhead('Kekuatan lentur nominal'));
    results.appendChild(UI.kv('Mp = Fy·Z (plastis penuh)', UI.fmt(r.Mp, 1) + ' kN·m'));
    results.appendChild(UI.kv('Keadaan batas menentukan', f.gov, 'ok'));
    results.appendChild(UI.kv('Mn (nominal)', UI.fmt(r.Mn, 1) + ' kN·m'));
    results.appendChild(UI.kv('φMn (DFBK, φb=0,90)', UI.fmt(r.phiMn, 1) + ' kN·m', 'ok'));
    if (r.dcL !== null) results.appendChild(UI.kv('Mu / φMn', r.dcL.toFixed(2), r.dcL <= 1 ? 'ok' : 'bad'));
    results.appendChild(UI.kv('Mn/Ω (ASD, Ωb=1,67)', UI.fmt(r.Ma, 1) + ' kN·m', 'ok'));
    if (r.dcA !== null) results.appendChild(UI.kv('Ma / (Mn/Ω)', r.dcA.toFixed(2), r.dcA <= 1 ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan — penampang kompak, LTB & tekuk lokal dalam batas.';
    results.appendChild(UI.note('Catatan', warnHtml));

    results.appendChild(UI.note('Referensi & asumsi',
      'SNI 1729:2020 (adopsi AISC 360-16) Bab F. <b>F2</b> I/kanal sumbu kuat kompak: Mp=Fy·Zx & LTB (Lp, Lr, Cb). ' +
      '<b>F3</b> sayap non-kompak/langsing (FLB). <b>F6</b> sumbu lemah I. <b>F7</b> HSS persegi (tekuk lokal sayap/badan + LTB kotak). <b>F8</b> HSS bundar. ' +
      'φb=0,90 (DFBK), Ωb=1,67 (ASD); E=200.000, G=77.200 MPa. Zx/Zy WF & UNP serta J/Cw dihitung dari geometri (J tanpa fillet → konservatif; Cw kanal pendekatan). ' +
      '<b>TIDAK termasuk</b>: badan non-kompak/langsing penuh (F4/F5), siku tunggal (F10) & tak-simetris/CNP (F12) selain leleh indikatif, geser (Bab G), lendutan, tekuk badan akibat beban terpusat. ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

    if (state.cv) state.cv.redraw();
  }

  /* ---------- Gambar penampang + kurva Mn–Lb ---------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawScene(ctx, w, h) {
    var r = state.result;
    var faint = css('--ink-faint');
    if (!r || !r.valid) {
      ctx.fillStyle = faint; ctx.font = '13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Pilih profil untuk melihat penampang & kurva Mn–Lb.', w / 2, h / 2);
      return;
    }
    var splitX = Math.min(w * 0.44, w - 240);
    drawSection(ctx, 0, 0, splitX, h, r);
    if (r.f.ltb) drawLTBCurve(ctx, splitX, 0, w - splitX, h, r);
    else drawCapBar(ctx, splitX, 0, w - splitX, h, r);

    if (state.mouse) {
      state.UI.canvasTip(ctx, {
        mx: state.mouse.x, my: state.mouse.y, w: w, h: h,
        text: 'DFBK phiMn ' + r.phiMn.toFixed(1) + ' kN.m · ' + r.f.section
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
    var W = dimW * sc, H = dimH * sc;

    ctx.save();
    ctx.fillStyle = ink; ctx.strokeStyle = line; ctx.lineWidth = 1;

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
      ctx.rect(cx - W / 2 + tb, cy - H / 2 + tb, W - 2 * tb, H - 2 * tb);
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

    // Sumbu lentur (netral) + panah momen skematik
    ctx.save();
    ctx.strokeStyle = amber; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.3; ctx.setLineDash([6, 4]);
    if (r.axis === 'y') { ctx.beginPath(); ctx.moveTo(cx, cy - H / 2 - 12); ctx.lineTo(cx, cy + H / 2 + 12); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(cx - W / 2 - 12, cy); ctx.lineTo(cx + W / 2 + 12, cy); ctx.stroke(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // tanda sayap tekan (atas) untuk sumbu kuat
    if (r.axis === 'x' && (p.shape === 'I' || p.shape === 'C')) {
      ctx.fillStyle = amber; ctx.globalAlpha = 0.18;
      ctx.fillRect(cx - W / 2, cy - H / 2, W, p.tf * sc);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = amber; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('lentur sumbu ' + (r.axis === 'y' ? 'y-y' : 'x-x'), cx, cy - H / 2 - 16);
    ctx.restore();

    dimLine(ctx, cx - W / 2, cx + W / 2, cy + H / 2 + 20, dim, (p.shape === 'pipe' ? 'D ' : 'b ') + Math.round(dimW));
    dimVert(ctx, cx - W / 2 - 14, cy - H / 2, cy + H / 2, faint, (p.shape === 'pipe' ? '' : 'h ') + Math.round(dimH));
  }

  // Kurva Mn vs Lb (F2 / F7): plateau Mp → Lp, garis ke Mr di Lr, ekor elastis
  function drawLTBCurve(ctx, ox, oy, w, h, r) {
    var f = r.f;
    var amber = css('--amber'), ink = css('--ink'), dim = css('--ink-dim'), faint = css('--ink-faint');
    var line = css('--line'), sage = css('--sage') || dim;
    var padT = 42, padB = 40, padL = 50, padR = 20;
    var gx0 = ox + padL, gx1 = ox + w - padR;
    var gy0 = oy + padT, gy1 = oy + h - padB;
    var gw = gx1 - gx0, gh = gy1 - gy0;

    var Mp = f.Mp / 1e6, Mr = (f.Mr || 0.7 * (f.Sx || f.S) * f.Fy) / 1e6;
    var Lp = f.Lp, Lr = f.Lr, Cb = r.Cb || 1;
    var xMax = Math.max(Lr * 1.35, r.Lb * 1.15, Lp * 2);
    var yMax = Mp * 1.05;
    function X(L) { return gx0 + gw * Math.min(L / xMax, 1); }
    function Y(M) { return gy1 - gh * Math.min(M / yMax, 1); }

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KURVA Mn (kN.m) vs Lb (mm)', gx0, oy + 22);

    // sumbu
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx0, gy0); ctx.lineTo(gx0, gy1); ctx.lineTo(gx1, gy1); ctx.stroke();
    // grid Mp & Mr
    [[Mp, 'Mp ' + Mp.toFixed(0)], [Mr, 'Mr ' + Mr.toFixed(0)]].forEach(function (g) {
      ctx.strokeStyle = line; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(gx0, Y(g[0])); ctx.lineTo(gx1, Y(g[0])); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = faint; ctx.textAlign = 'right'; ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(g[1], gx0 - 4, Y(g[0]) + 3);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = faint;
    ctx.fillText('0', gx0, gy1 + 13);
    ctx.fillText(String(Math.round(xMax)), gx1, gy1 + 13);

    // kurva Mn(Lb)
    function MnAt(L) {
      if (L <= Lp) return Mp;
      if (L <= Lr) return Math.min(Cb * (Mp - (Mp - Mr) * (L - Lp) / (Lr - Lp)), Mp);
      // elastis
      if (f.rts) {
        var lamb = L / f.rts, jc = f.J * f.c / (f.Sx * f.ho);
        var Fcr = Cb * Math.PI * Math.PI * E_MOD / (lamb * lamb) * Math.sqrt(1 + 0.078 * jc * lamb * lamb);
        return Math.min(Fcr * f.Sx / 1e6, Mp);
      }
      // box elastis
      var A = r.p.A * 100;
      return Math.min(2 * E_MOD * Cb * Math.sqrt(f.J * A) / (L / f.ry) / 1e6, Mp);
    }
    ctx.strokeStyle = sage; ctx.lineWidth = 2; ctx.beginPath();
    var first = true;
    for (var L = 0; L <= xMax; L += Math.max(1, xMax / 200)) {
      var px = X(L), py = Y(MnAt(L));
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // garis Lp & Lr
    [[Lp, 'Lp'], [Lr, 'Lr']].forEach(function (g) {
      if (g[0] > xMax) return;
      ctx.strokeStyle = faint; ctx.globalAlpha = 0.7; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(g[0]), gy0); ctx.lineTo(X(g[0]), gy1); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = faint; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(g[1] + ' ' + Math.round(g[0]), X(g[0]), gy1 + 24);
    });

    // titik operasi Lb
    var opx = X(r.Lb), opy = Y(r.Mn);
    ctx.strokeStyle = amber; ctx.globalAlpha = 0.55; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(opx, gy1); ctx.lineTo(opx, opy); ctx.lineTo(gx0, opy); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = amber; ctx.beginPath(); ctx.arc(opx, opy, 4.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css('--bg'); ctx.lineWidth = 1.4; ctx.stroke();
    var right = opx > gx0 + gw * 0.6;
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillStyle = amber; ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('Mn ' + r.Mn.toFixed(0), right ? opx - 8 : opx + 8, opy - 6);
    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Lb ' + Math.round(r.Lb), right ? opx - 8 : opx + 8, opy + 8);

    // demand
    if (r.Mu > 0) {
      ctx.strokeStyle = css('--sky') || dim; ctx.globalAlpha = 0.8; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(gx0, Y(r.Mu / PHI_B)); ctx.lineTo(gx1, Y(r.Mu / PHI_B)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = css('--sky') || dim; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('Mu/φ ' + (r.Mu / PHI_B).toFixed(0), gx0 + 4, Y(r.Mu / PHI_B) - 3);
    }

    var yB = oy + h - 8;
    ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = amber;
    ctx.fillText('phiMn = ' + r.phiMn.toFixed(1) + ' kN.m', gx0, yB);
    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText(f.ltbMode || f.gov, gx1, yB);
  }

  // Bar kapasitas (kasus tanpa LTB: sumbu lemah, pipa, box-lemah)
  function drawCapBar(ctx, ox, oy, w, h, r) {
    var f = r.f;
    var amber = css('--amber'), dim = css('--ink-dim'), faint = css('--ink-faint'), line = css('--line');
    var sage = css('--sage') || dim, sky = css('--sky') || dim;
    var padL = 70, padR = 24, padT = 46, padB = 44;
    var gx0 = ox + padL, gx1 = ox + w - padR, gy0 = oy + padT, gy1 = oy + h - padB;

    ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = faint;
    ctx.fillText('KAPASITAS LENTUR (kN.m)', ox + padL, oy + 22);

    var Mp = r.Mp, Mn = r.Mn, phiMn = r.phiMn, Ma = r.Ma;
    var demL = r.Mu > 0 ? r.Mu : 0, demA = r.MaDem > 0 ? r.MaDem : 0;
    var xMax = Math.max(Mp, phiMn, demL, demA) * 1.12 || 1;
    function BX(m) { return gx0 + (gx1 - gx0) * Math.min(m / xMax, 1); }

    var bars = [
      { lbl: 'Mp', v: Mp, c: sage },
      { lbl: 'Mn', v: Mn, c: dim },
      { lbl: 'φMn', v: phiMn, c: amber },
      { lbl: 'Mn/Ω', v: Ma, c: sky }
    ];
    var n = bars.length, gap = 10;
    var bh = Math.min(30, (gy1 - gy0 - gap * (n - 1)) / n);
    bars.forEach(function (b, i) {
      var y = gy0 + i * (bh + gap);
      ctx.fillStyle = line; ctx.globalAlpha = 0.4; ctx.fillRect(gx0, y, gx1 - gx0, bh); ctx.globalAlpha = 1;
      ctx.fillStyle = b.c; ctx.fillRect(gx0, y, BX(b.v) - gx0, bh);
      ctx.fillStyle = faint; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText(b.lbl, gx0 - 6, y + bh / 2 + 3);
      ctx.fillStyle = css('--ink'); ctx.textAlign = 'left';
      ctx.fillText(b.v.toFixed(1), BX(b.v) + 6, y + bh / 2 + 3);
    });

    // garis demand
    [[demL, 'Mu', amber], [demA, 'Ma', sky]].forEach(function (d) {
      if (!d[0]) return;
      ctx.strokeStyle = d[2]; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(BX(d[0]), gy0 - 6); ctx.lineTo(BX(d[0]), gy1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = d[2]; ctx.font = '8px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(d[1], BX(d[0]), gy0 - 9);
    });

    var yB = oy + h - 8;
    ctx.textAlign = 'left'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = amber;
    ctx.fillText('phiMn = ' + phiMn.toFixed(1) + ' kN.m', ox + padL, yB);
    ctx.fillStyle = dim; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText(f.gov, gx1, yB);
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
  function numR(n, dp) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(dp === undefined ? 2 : dp); }
  function tolatin(s) {
    return String(s)
      .replace(/φ/g, 'phi').replace(/Ω/g, 'Omega').replace(/Σ/g, 'sum').replace(/·/g, '*')
      .replace(/²/g, '2').replace(/³/g, '3').replace(/⁴/g, '4').replace(/⁶/g, '6')
      .replace(/√/g, 'sqrt').replace(/×/g, 'x').replace(/Ø/g, 'dia')
      .replace(/λ/g, 'lambda').replace(/π/g, 'pi').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/≠/g, '!=').replace(/[–—]/g, '-').replace(/′/g, "'").replace(/[^\x20-\x7E]/g, '?');
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

  // Gbr. 1 — kurva Mn vs Lb (LTB: plastis / inelastis / elastis) + titik desain
  function figLTB(r) {
    var F = window.CivilReport.fig;
    var f = r.f, ops = [];
    var px0 = 96, pw = 360, top = 12, ph = 165, bot = top + ph;
    var Mp = f.Mp / 1e6, Mr = (f.Mr || 0.7 * (f.Sx || f.S) * f.Fy) / 1e6;
    var Lp = f.Lp, Lr = f.Lr, Cb = r.Cb || 1;
    var xMax = Math.max(Lr * 1.35, r.Lb * 1.15, Lp * 2);
    var yMax = Mp * 1.1;
    function X(Lb) { return px0 + Math.min(Lb / xMax, 1) * pw; }
    function Y(M) { return top + (yMax - M) / yMax * ph; }
    function MnAt(Lb) {
      if (Lb <= Lp) return Mp;
      if (Lb <= Lr) return Math.min(Cb * (Mp - (Mp - Mr) * (Lb - Lp) / (Lr - Lp)), Mp);
      if (f.rts) {
        var lamb = Lb / f.rts, jc = f.J * f.c / (f.Sx * f.ho);
        var Fcr = Cb * Math.PI * Math.PI * E_MOD / (lamb * lamb) * Math.sqrt(1 + 0.078 * jc * lamb * lamb);
        return Math.min(Fcr * f.Sx / 1e6, Mp);
      }
      var A = r.p.A * 100;
      return Math.min(2 * E_MOD * Cb * Math.sqrt(f.J * A) / (Lb / f.ry) / 1e6, Mp);
    }
    // grid + tick
    var stM = F.niceStep(yMax, 5);
    for (var tm = 0; tm <= yMax; tm += stM) {
      ops.push({ t: 'line', x1: px0, y1: Y(tm), x2: px0 + pw, y2: Y(tm), lw: 0.3, g: 0.85 });
      ops.push({ t: 'text', x: px0 - 5, y: Y(tm) + 2.3, s: String(Math.round(tm)), size: 6.5, align: 'r', g: 0.3 });
    }
    var stL = F.niceStep(xMax, 5);
    for (var tl = 0; tl <= xMax; tl += stL) {
      ops.push({ t: 'line', x1: X(tl), y1: top, x2: X(tl), y2: bot, lw: 0.3, g: 0.85 });
      ops.push({ t: 'text', x: X(tl), y: bot + 10, s: String(Math.round(tl)), size: 6.5, align: 'c', g: 0.3 });
    }
    ops.push({ t: 'line', x1: px0, y1: top, x2: px0, y2: bot, lw: 0.9 });
    ops.push({ t: 'line', x1: px0, y1: bot, x2: px0 + pw, y2: bot, lw: 0.9 });
    ops.push({ t: 'text', x: px0, y: top - 4, s: 'Mn (kN.m)', size: 7 });
    ops.push({ t: 'text', x: px0 + pw / 2, y: bot + 21, s: 'Lb (mm)', size: 7, align: 'c' });
    // garis Mp, Mr, Lp, Lr
    [[Mp, 'Mp=' + numR(Mp, 0)], [Mr, 'Mr=' + numR(Mr, 0)]].forEach(function (g2) {
      ops.push({ t: 'line', x1: px0, y1: Y(g2[0]), x2: px0 + pw, y2: Y(g2[0]), lw: 0.4, g: 0.55, dash: [2, 3] });
      ops.push({ t: 'text', x: px0 + pw + 4, y: Y(g2[0]) + 2.3, s: g2[1], size: 6, g: 0.35 });
    });
    [[Lp, 'Lp'], [Lr, 'Lr']].forEach(function (g3) {
      if (g3[0] > xMax) return;
      ops.push({ t: 'line', x1: X(g3[0]), y1: top, x2: X(g3[0]), y2: bot, lw: 0.5, g: 0.45, dash: [4, 3] });
      ops.push({ t: 'text', x: X(g3[0]), y: top - 3, s: g3[1] + '=' + numR(g3[0], 0), size: 6, align: 'c', g: 0.35 });
    });
    // kurva Mn(Lb)
    var pts = [];
    for (var i = 0; i <= 90; i++) {
      var Lb2 = xMax * i / 90;
      pts.push([X(Lb2), Y(MnAt(Lb2))]);
    }
    ops.push({ t: 'poly', pts: pts, lw: 1.2 });
    // titik desain (Lb, Mn)
    F.cross(ops, X(r.Lb), Y(r.Mn), 'Lb=' + numR(r.Lb, 0) + ', Mn=' + numR(r.Mn, 0));
    var yCap = bot + 32;
    ops.push({ t: 'text', x: 264, y: yCap, s: 'Gbr. 1  Kurva Mn-Lb (LTB ' + tolatin(r.p.name) +
      ', Cb=' + numR(Cb, 2) + ') - zona: ' + tolatin(f.ltbMode), size: 7.5, align: 'c' });
    return { fig: { h: Math.ceil((yCap + 10) / 11.5), ops: ops,
      alt: 'Gbr. 1 Kurva Mn vs Lb - lihat versi PDF' } };
  }

  function buildReport(r) {
    var now = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var dt = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
    var p = r.p, f = r.f;
    var axLbl = r.axis === 'y' ? 'y-y (lemah)' : 'x-x (kuat)';
    var L = [];
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS CIVIL TOOLS'));
    L.push(centerR('BALOK BAJA - KAPASITAS LENTUR'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 1729:2020 Bab F (DFBK & ASD)', dt));
    L.push('');
    L.push(' PROFIL');
    L.push(ruleR('-'));
    L.push(rowR('Tipe', tolatin(r.ti.name + ' - ' + r.ti.full)));
    L.push(rowR('Ukuran', tolatin(p.name)));
    L.push(rowR('Sumbu lentur', tolatin(axLbl + ' (pasal ' + f.section + ')')));
    L.push(rowR('Berat', numR(p.w, 1) + ' kg/m'));
    if (f.Zx !== undefined) L.push(rowR('Zx (plastis, hitung)', numR(f.Zx / 1e3, 1) + ' cm3'));
    if (f.Zy !== undefined) L.push(rowR('Zy (plastis, hitung)', numR(f.Zy / 1e3, 1) + ' cm3'));
    if (f.Z !== undefined) L.push(rowR('Z (plastis)', numR(f.Z / 1e3, 1) + ' cm3'));
    if (f.Sx !== undefined) L.push(rowR('Sx (elastis)', numR(f.Sx / 1e3, 1) + ' cm3'));
    if (f.Sy !== undefined) L.push(rowR('Sy (elastis)', numR(f.Sy / 1e3, 1) + ' cm3'));
    if (f.S !== undefined && f.Sx === undefined) L.push(rowR('S (elastis)', numR(f.S / 1e3, 1) + ' cm3'));
    L.push('');
    L.push(' MUTU BAJA');
    L.push(ruleR('-'));
    L.push(rowR('Fy', numR(r.f.Fy, 0) + ' MPa'));
    L.push(rowR('E / G', numR(E_MOD, 0) + ' / ' + numR(G_MOD, 0) + ' MPa'));
    L.push('');
    if (f.flange || f.web) {
      L.push(' KEKOMPAKAN (Tabel B4.1b)');
      L.push(ruleR('-'));
      if (f.flange) L.push(rowR('Sayap lam/lp/lr', numR(f.flange.lam, 1) + ' / ' + numR(f.flange.lp, 1) + ' / ' + numR(f.flange.lr, 1) + ' (' + f.flange.cls + ')'));
      if (f.web) L.push(rowR('Badan lam/lp/lr', numR(f.web.lam, 1) + ' / ' + numR(f.web.lp, 1) + ' / ' + numR(f.web.lr, 1) + ' (' + f.web.cls + ')'));
      L.push('');
    }
    if (f.section === 'F8') {
      L.push(' KEKOMPAKAN (F8 - HSS bundar)');
      L.push(ruleR('-'));
      L.push(rowR('D/t', numR(f.Dt, 1) + ' (' + f.cls + ')'));
      L.push(rowR('lp / lr', numR(f.lp, 1) + ' / ' + numR(f.lr, 1)));
      L.push('');
    }
    if (f.ltb) {
      L.push(' TEKUK TORSI-LATERAL (LTB)');
      L.push(ruleR('-'));
      L.push(rowR('Lb', numR(r.Lb, 0) + ' mm'));
      L.push(rowR('Cb', numR(r.Cb, 2)));
      L.push(rowR('Lp', numR(f.Lp, 0) + ' mm'));
      L.push(rowR('Lr', numR(f.Lr, 0) + ' mm'));
      L.push(rowR('Zona', tolatin(f.ltbMode)));
      if (f.J !== undefined) L.push(rowR('J (hitung)', numR(f.J / 1e4, 2) + ' cm4'));
      if (f.Cw) L.push(rowR('Cw (hitung' + (r.type === 'UNP' ? ', pendekatan' : '') + ')', numR(f.Cw / 1e6, 0) + ' cm6'));
      L.push(rowR('Mn (LTB)', numR(f.Mn_ltb / 1e6, 1) + ' kN.m'));
      if (f.Mn_flb !== undefined && f.flbMode !== 'sayap kompak') L.push(rowR('Mn (FLB ' + tolatin(f.flbMode) + ')', numR(f.Mn_flb / 1e6, 1) + ' kN.m'));
      L.push('');
      if (r.Lb > 0 && f.Lr > f.Lp) { L.push(figLTB(r)); L.push(''); }
    }
    if (f.section === 'F7') {
      L.push(' TEKUK LOKAL (F7)');
      L.push(ruleR('-'));
      L.push(rowR('Mn sayap (F7.2)', numR(f.Mn_f / 1e6, 1) + ' kN.m'));
      L.push(rowR('Mn badan (F7.3)', numR(f.Mn_w / 1e6, 1) + ' kN.m'));
      L.push('');
    }
    L.push(' OUTPUT — DFBK (LRFD)');
    L.push(ruleR('='));
    L.push(rowR('Mp = Fy*Z (plastis)', numR(r.Mp, 1) + ' kN.m'));
    L.push(rowR('Keadaan batas menentukan', tolatin(f.gov)));
    L.push(rowR('Mn (nominal)', numR(r.Mn, 1) + ' kN.m'));
    L.push(rowR('>> phi*Mn (phi_b 0.90)', numR(r.phiMn, 1) + ' kN.m'));
    if (r.dcL !== null) L.push(rowR('   Mu/phiMn', numR(r.dcL, 2) + (r.dcL <= 1 ? ' (OK)' : ' (LEBIH)')));
    L.push(ruleR('='));
    L.push('');
    L.push(' OUTPUT — ASD');
    L.push(ruleR('='));
    L.push(rowR('>> Mn/Omega (Omega_b 1.67)', numR(r.Ma, 1) + ' kN.m'));
    if (r.dcA !== null) L.push(rowR('   Ma/(Mn/O)', numR(r.dcA, 2) + (r.dcA <= 1 ? ' (OK)' : ' (LEBIH)')));
    L.push(ruleR('='));
    L.push('');
    var notes = r.warn.slice();
    if (notes.length) {
      L.push(' CATATAN'); L.push(ruleR('-'));
      notes.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
      L.push('');
    }
    L.push(' F2/F3 I & kanal sumbu kuat (LTB+FLB), F6 sumbu lemah, F7 HSS');
    L.push(' persegi, F8 HSS bundar. F4/F5 badan langsing, F10/F12 siku &');
    L.push(' tak-simetris, geser (Bab G) & lendutan TIDAK termasuk.');
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
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi data profil, mutu & Lb dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Balok-Baja_' + r.ti.name.replace(/[^\w]/g, '') + '_' + r.name.replace(/[^\w]/g, '') + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Balok Baja (Lentur)', category: 'Baja', needsCanvas: true, needsRenderer: false },

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
