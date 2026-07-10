/* ============================================================
   Civil Tools — core/steel-profiles.js
   Library database profil baja — dipakai bersama semua tool baja.
   Diekspos sebagai global window.SteelProfiles (zero build, no import).

   Filosofi data (dikonfirmasi bersama pengguna):
     - HOT-ROLLED (WF/IWF, UNP, Siku L)  -> nilai TABEL standar
         WF & Siku : JIS G3192  |  UNP : DIN 1026 (kanal U pasaran Indonesia)
     - HOLLOW (SHS, RHS, Pipa)           -> DIHITUNG dari geometri
         Pipa      : eksak  A=π/4(D²-d²), I=π/64(D⁴-d⁴)
         SHS/RHS   : geometris "sudut tajam" (radius sudut diabaikan;
                     A & I ≈ 2–5% > tabel pabrikan yang ber-radius)
     - COLD-FORMED (CNP kanal C berbibir) -> DIHITUNG (metode garis-tengah / linear AISI,
                     tebal t, radius sudut diabaikan)

   SATUAN tersimpan (konsisten tabel baja Indonesia):
     dimensi mm · A cm² · w kg/m · I cm⁴ · i (jari-jari girasi) cm · S cm³ · Z cm³
   Helper konversi ke SI (mm²/mm⁴) disediakan di bawah.

   ⚠️ Nilai tabel hot-rolled diisi dari tabel standar; nilai hollow/CNP dihitung
      idealisasi sudut tajam. VERIFIKASI terhadap sertifikat pabrik / katalog
      sebelum dipakai untuk gambar kerja atau konstruksi.

   Menambah / mengoreksi profil: cukup edit array di bawah — struktur terbuka.
   ============================================================ */
(function () {
  'use strict';
  var RHO = 7.85e-3;            // kg/m per mm² luas (baja 7850 kg/m³)

  /* ---------- Builder profil HOT-ROLLED (nilai dari tabel) ----------
     shape 'I' (WF) : [name, H,B,tw,tf, A,w, Ix,Iy, ix,iy, Sx,Sy]
     shape 'C' (UNP): [name, H,B,tw,tf, A,w, Ix,Iy, ix,iy, Sx,Sy]
     shape 'L' (siku): [name, a,t, A,w, Ix(=Iy), ix(=iy), imin]   */
  function WF(a) {
    return { shape: 'I', name: a[0], H: a[1], B: a[2], tw: a[3], tf: a[4],
      A: a[5], w: a[6], Ix: a[7], Iy: a[8], ix: a[9], iy: a[10], Sx: a[11], Sy: a[12],
      imin: a[10], t: a[4], source: 'tabel' };
  }
  function UNP(a) {
    return { shape: 'C', name: a[0], H: a[1], B: a[2], tw: a[3], tf: a[4],
      A: a[5], w: a[6], Ix: a[7], Iy: a[8], ix: a[9], iy: a[10], Sx: a[11], Sy: a[12],
      imin: a[10], t: a[4], source: 'tabel' };
  }
  function LSIKU(a) {
    return { shape: 'L', name: a[0], H: a[1], B: a[1], a: a[1], t: a[2],
      A: a[3], w: a[4], Ix: a[5], Iy: a[5], ix: a[6], iy: a[6], Sx: a[7] || null, Sy: a[7] || null,
      imin: a[8], source: 'tabel' };
  }

  /* ---------- HOLLOW / COLD-FORMED (dihitung dari geometri) ---------- */
  // Pipa bundar: D luar, t. Eksak.
  function PIPE(D, t) {
    var d = D - 2 * t;
    var A = Math.PI / 4 * (D * D - d * d);                 // mm²
    var I = Math.PI / 64 * (Math.pow(D, 4) - Math.pow(d, 4)); // mm⁴
    var i = Math.sqrt(I / A);                               // mm
    var S = I / (D / 2);                                    // mm³
    var Z = (Math.pow(D, 3) - Math.pow(d, 3)) / 6;          // mm³
    return {
      shape: 'pipe', name: 'Ø' + D + '×' + t, D: D, t: t,
      A: A / 100, w: A * RHO, Ix: I / 1e4, Iy: I / 1e4, ix: i / 10, iy: i / 10,
      Sx: S / 1e3, Sy: S / 1e3, Zx: Z / 1e3, imin: i / 10, source: 'hitung', note: 'eksak'
    };
  }
  // SHS: a × a × t (sudut tajam)
  function SHS(a, t) { return RHS_(a, a, t, true); }
  // RHS: H (tinggi/sumbu-x kuat) × B × t (sudut tajam)
  function RHS(H, B, t) { return RHS_(H, B, t, false); }
  function RHS_(H, B, t, square) {
    var hi = H - 2 * t, bi = B - 2 * t;
    var A = H * B - hi * bi;                                        // mm²
    var Ix = (B * Math.pow(H, 3) - bi * Math.pow(hi, 3)) / 12;      // mm⁴
    var Iy = (H * Math.pow(B, 3) - hi * Math.pow(bi, 3)) / 12;
    var Sx = Ix / (H / 2), Sy = Iy / (B / 2);
    var Zx = (B * H * H - bi * hi * hi) / 4, Zy = (H * B * B - hi * bi * bi) / 4;
    var ix = Math.sqrt(Ix / A), iy = Math.sqrt(Iy / A);
    return {
      shape: 'box', name: (square ? a2(H) + '×' + a2(H) : a2(H) + '×' + a2(B)) + '×' + t,
      H: H, B: B, t: t, A: A / 100, w: A * RHO,
      Ix: Ix / 1e4, Iy: Iy / 1e4, ix: ix / 10, iy: iy / 10,
      Sx: Sx / 1e3, Sy: Sy / 1e3, Zx: Zx / 1e3, Zy: Zy / 1e3,
      imin: Math.min(ix, iy) / 10, source: 'hitung', note: 'geometris (sudut tajam)'
    };
  }
  function a2(n) { return (Math.round(n * 10) / 10); }

  // CNP kanal C berbibir (lip): H(web) × B(flens) × C(bibir/lip) × t.
  // Metode garis-tengah (linear AISI), radius sudut diabaikan. Simetris thd sumbu-x (mid-web).
  function CNP(H, B, C, t) {
    var Lw = H - t;                 // panjang midline web
    var Lf = B - t;                 // panjang midline flens
    var Lc = C - t / 2;             // panjang midline bibir
    var yf = (H - t) / 2;           // y flens (dari mid-web)
    var Aweb = t * Lw, Af = t * Lf, Ac = t * Lc;
    var A = Aweb + 2 * Af + 2 * Ac;
    // x̄ dari midline web (x=0); flens centroid Lf/2; bibir di x=Lf
    var xbar = (Aweb * 0 + 2 * Af * (Lf / 2) + 2 * Ac * Lf) / A;
    var ylip = yf - Lc / 2;
    // Ix (sumbu-x horizontal, mid-web) — sumbu kuat
    var Ix = t * Math.pow(Lw, 3) / 12
      + 2 * (Af * yf * yf)
      + 2 * (t * Math.pow(Lc, 3) / 12 + Ac * ylip * ylip);
    // Iy (sumbu-y vertikal thd centroid) — sumbu lemah
    var Iy = Aweb * xbar * xbar
      + 2 * (t * Math.pow(Lf, 3) / 12 + Af * Math.pow(Lf / 2 - xbar, 2))
      + 2 * (Ac * Math.pow(Lf - xbar, 2));
    var ix = Math.sqrt(Ix / A), iy = Math.sqrt(Iy / A);
    var Sx = Ix / (H / 2);
    var Sy = Iy / Math.max(xbar + t / 2, B - (xbar + t / 2));
    return {
      shape: 'C', name: 'C' + H + '×' + B + '×' + C + '×' + t,
      H: H, B: B, C: C, t: t, xbar: xbar / 10, A: A / 100, w: A * RHO,
      Ix: Ix / 1e4, Iy: Iy / 1e4, ix: ix / 10, iy: iy / 10,
      Sx: Sx / 1e3, Sy: Sy / 1e3, imin: Math.min(ix, iy) / 10,
      source: 'hitung', note: 'garis-tengah (linear, tanpa radius)'
    };
  }

  /* ============================================================
     TABEL HOT-ROLLED
     ============================================================ */

  // WF / IWF — JIS G3192.  [name, H,B,tw,tf, A,w, Ix,Iy, ix,iy, Sx,Sy]
  var DATA_WF = [
    ['100×50×5×7',        100, 50, 5,   7,    11.85, 9.30, 187, 14.8, 3.98, 1.12, 37.5, 5.91],
    ['125×60×6×8',        125, 60, 6,   8,    16.84, 13.2, 413, 29.2, 4.95, 1.32, 66.1, 9.73],
    ['150×75×5×7',        150, 75, 5,   7,    17.85, 14.0, 666, 49.5, 6.11, 1.66, 88.8, 13.2],
    ['175×90×5×8',        175, 90, 5,   8,    22.90, 18.0, 1210, 97.6, 7.26, 2.06, 138, 21.7],
    ['200×100×5.5×8',     200, 100, 5.5, 8,   27.16, 21.3, 1840, 134, 8.24, 2.22, 184, 26.8],
    ['250×125×6×9',       250, 125, 6,   9,    37.66, 29.6, 4050, 294, 10.4, 2.79, 324, 47.0],
    ['300×150×6.5×9',     300, 150, 6.5, 9,   46.78, 36.7, 7210, 508, 12.4, 3.29, 481, 67.7],
    ['350×175×7×11',      350, 175, 7,   11,   63.14, 49.6, 13600, 984, 14.7, 3.95, 775, 112],
    ['400×200×8×13',      400, 200, 8,   13,   84.12, 66.0, 23700, 1740, 16.8, 4.54, 1190, 174],
    ['450×200×9×14',      450, 200, 9,   14,   96.76, 76.0, 33500, 1870, 18.6, 4.40, 1490, 187],
    ['500×200×10×16',     500, 200, 10,  16,  114.2, 89.6, 47800, 2140, 20.5, 4.33, 1910, 214],
    ['600×200×11×17',     600, 200, 11,  17,  131.7, 103,  77600, 2280, 24.3, 4.16, 2590, 228],
    // Seri sayap lebar (sering dipakai kolom)
    ['200×200×8×12',      200, 200, 8,   12,   63.53, 49.9, 4720, 1600, 8.62, 5.02, 472, 160],
    ['250×250×9×14',      250, 250, 9,   14,   91.43, 71.8, 10800, 3650, 10.9, 6.32, 867, 292],
    ['300×300×10×15',     300, 300, 10,  15,  118.5, 93.0, 20200, 6750, 13.1, 7.55, 1350, 450],
    ['350×350×12×19',     350, 350, 12,  19,  173.9, 137,  40300, 13600, 15.2, 8.84, 2300, 776],
    ['400×400×13×21',     400, 400, 13,  21,  218.7, 172,  66600, 22400, 17.5, 10.1, 3330, 1120]
  ].map(WF);

  // UNP / Kanal U — DIN 1026.  [name, H,B,tw,tf, A,w, Ix,Iy, ix,iy, Sx,Sy]
  var DATA_UNP = [
    ['UNP 65',  65,  42, 5.5, 7.5, 9.03, 7.09, 57.5, 14.1, 2.52, 1.25, 17.7, 5.07],
    ['UNP 80',  80,  45, 6,   8,   11.0, 8.64, 106, 19.4, 3.10, 1.33, 26.5, 6.36],
    ['UNP 100', 100, 50, 6,   8.5, 13.5, 10.6, 206, 29.3, 3.91, 1.47, 41.2, 8.49],
    ['UNP 120', 120, 55, 7,   9,   17.0, 13.4, 364, 43.2, 4.62, 1.59, 60.7, 11.1],
    ['UNP 140', 140, 60, 7,   10,  20.4, 16.0, 605, 62.7, 5.45, 1.75, 86.4, 14.8],
    ['UNP 160', 160, 65, 7.5, 10.5, 24.0, 18.8, 925, 85.3, 6.21, 1.89, 116, 18.3],
    ['UNP 180', 180, 70, 8,   11,  28.0, 22.0, 1350, 114, 6.95, 2.02, 150, 22.4],
    ['UNP 200', 200, 75, 8.5, 11.5, 32.2, 25.3, 1910, 148, 7.70, 2.14, 191, 27.0],
    ['UNP 220', 220, 80, 9,   12.5, 37.4, 29.4, 2690, 197, 8.48, 2.30, 245, 33.6],
    ['UNP 240', 240, 85, 9.5, 13,  42.3, 33.2, 3600, 248, 9.22, 2.42, 300, 39.6],
    ['UNP 260', 260, 90, 10,  14,  48.3, 37.9, 4820, 317, 9.99, 2.56, 371, 47.7],
    ['UNP 280', 280, 95, 10,  15,  53.3, 41.8, 6280, 399, 10.9, 2.74, 448, 57.2],
    ['UNP 300', 300, 100, 10, 16,  58.8, 46.2, 8030, 495, 11.7, 2.90, 535, 67.8]
  ].map(UNP);

  // Siku sama kaki (L) — JIS G3192.  [name, a,t, A,w, Ix(=Iy), ix(=iy), imin]
  var DATA_L = [
    ['L 50×50×5',    50,  5,  4.80, 3.77, 11.1, 1.52, 0.98],
    ['L 50×50×6',    50,  6,  5.64, 4.43, 12.6, 1.50, 0.97],
    ['L 60×60×5',    60,  5,  5.80, 4.55, 19.6, 1.84, 1.17],
    ['L 60×60×6',    60,  6,  6.88, 5.42, 22.8, 1.82, 1.16],
    ['L 65×65×6',    65,  6,  7.53, 5.91, 29.4, 1.98, 1.26],
    ['L 70×70×6',    70,  6,  8.13, 6.38, 37.1, 2.14, 1.36],
    ['L 75×75×6',    75,  6,  8.73, 6.85, 46.1, 2.30, 1.46],
    ['L 75×75×9',    75,  9,  12.69, 9.96, 64.4, 2.25, 1.44],
    ['L 80×80×6',    80,  6,  9.33, 7.32, 56.4, 2.46, 1.57],
    ['L 90×90×7',    90,  7,  12.22, 9.59, 93.0, 2.76, 1.76],
    ['L 90×90×10',   90,  10, 17.00, 13.3, 125, 2.71, 1.74],
    ['L 100×100×7',  100, 7,  13.62, 10.7, 129, 3.08, 1.95],
    ['L 100×100×10', 100, 10, 19.00, 14.9, 175, 3.04, 1.95],
    ['L 100×100×13', 100, 13, 24.31, 19.1, 220, 3.00, 1.94],
    ['L 120×120×8',  120, 8,  18.76, 14.7, 258, 3.71, 2.35],
    ['L 130×130×9',  130, 9,  22.74, 17.9, 366, 4.01, 2.53],
    ['L 150×150×10', 150, 10, 29.21, 22.9, 627, 4.63, 2.95],
    ['L 150×150×12', 150, 12, 34.77, 27.3, 740, 4.61, 2.95],
    ['L 150×150×15', 150, 15, 42.74, 33.6, 888, 4.56, 2.92],
    ['L 200×200×15', 200, 15, 57.75, 45.3, 2180, 6.14, 3.93],
    ['L 200×200×20', 200, 20, 76.00, 59.7, 2820, 6.09, 3.90]
  ].map(LSIKU);

  /* ============================================================
     HOLLOW & COLD-FORMED (dihitung dari geometri)
     ============================================================ */
  var DATA_SHS = [];
  [[40,[2.3,3.2]],[50,[2.3,3.2,4.5]],[60,[2.3,3.2,4.5]],[75,[3.2,4.5,6]],
   [90,[3.2,4.5,6]],[100,[3.2,4.5,6,8]],[125,[4.5,6,9]],[150,[6,9,12]],
   [200,[6,9,12]],[250,[9,12]]].forEach(function (r) {
    r[1].forEach(function (t) { DATA_SHS.push(SHS(r[0], t)); });
  });

  var DATA_RHS = [];
  [[50,30,[2.3,3.2]],[75,45,[2.3,3.2,4.5]],[100,50,[3.2,4.5,6]],
   [125,75,[3.2,4.5,6]],[150,75,[4.5,6,9]],[150,100,[4.5,6,9]],
   [200,100,[6,9,12]],[250,150,[6,9,12]],[300,200,[9,12]]].forEach(function (r) {
    r[2].forEach(function (t) { DATA_RHS.push(RHS(r[0], r[1], t)); });
  });

  var DATA_PIPE = [];
  [[48.3,[2.8,3.2,3.7]],[60.3,[2.9,3.2,4.0]],[76.3,[3.2,4.0,5.0]],
   [88.9,[3.2,4.0,5.5]],[114.3,[3.5,4.5,6.0]],[139.8,[4.0,5.0,6.6]],
   [165.2,[5.0,6.6,7.1]],[216.3,[5.8,7.0,8.2]],[267.4,[6.6,7.9,9.3]],
   [318.5,[6.9,8.4,10.3]]].forEach(function (r) {
    r[1].forEach(function (t) { DATA_PIPE.push(PIPE(r[0], t)); });
  });

  var DATA_CNP = [];
  // [H, B, C(lip), thicknesses...]
  [[75,45,15,[1.6,2.0]],[100,50,20,[1.6,2.0,2.3]],[125,50,20,[2.0,2.3,3.2]],
   [150,65,20,[2.0,2.3,3.2]],[200,75,20,[2.3,3.2]]].forEach(function (r) {
    r[3].forEach(function (t) { DATA_CNP.push(CNP(r[0], r[1], r[2], t)); });
  });

  /* ============================================================
     REGISTRY TIPE + API
     ============================================================ */
  var DB = { WF: DATA_WF, UNP: DATA_UNP, L: DATA_L, SHS: DATA_SHS, RHS: DATA_RHS, PIPE: DATA_PIPE, CNP: DATA_CNP };

  var TYPES = [
    { key: 'WF',   name: 'WF / IWF',  full: 'Wide Flange (profil H/I)',   std: 'JIS G3192', src: 'tabel',  shape: 'I' },
    { key: 'UNP',  name: 'UNP',       full: 'Kanal U (channel)',          std: 'DIN 1026',  src: 'tabel',  shape: 'C' },
    { key: 'L',    name: 'Siku (L)',  full: 'Baja siku sama kaki',        std: 'JIS G3192', src: 'tabel',  shape: 'L' },
    { key: 'SHS',  name: 'SHS',       full: 'Hollow persegi',             std: 'geometris', src: 'hitung', shape: 'box' },
    { key: 'RHS',  name: 'RHS',       full: 'Hollow persegi panjang',     std: 'geometris', src: 'hitung', shape: 'box' },
    { key: 'PIPE', name: 'Pipa',      full: 'Hollow bundar (pipe)',       std: 'geometris', src: 'hitung', shape: 'pipe' },
    { key: 'CNP',  name: 'CNP',       full: 'Kanal C berbibir (ringan)',  std: 'garis-tengah', src: 'hitung', shape: 'C' }
  ];

  function list(type) { return DB[type] ? DB[type].slice() : []; }
  function get(type, name) {
    var arr = DB[type] || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].name === name) return arr[i];
    return null;
  }
  function typeInfo(type) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === type) return TYPES[i];
    return null;
  }
  // Konversi bantu ke SI untuk perhitungan tool
  function AgMm2(p) { return p.A * 100; }            // cm² -> mm²
  function rminMm(p) { return p.imin * 10; }          // cm -> mm
  // Tebal elemen yang lazim dilubangi baut (untuk luas neto)
  function tGov(type, p) {
    if (type === 'WF' || type === 'UNP') return p.tf;  // umumnya sambungan di sayap
    if (type === 'L') return p.t;
    if (type === 'PIPE') return p.t;
    return p.t;                                        // hollow / cnp
  }

  window.SteelProfiles = {
    types: TYPES,
    DB: DB,
    list: list,
    get: get,
    typeInfo: typeInfo,
    AgMm2: AgMm2,
    rminMm: rminMm,
    tGov: tGov,
    // ekspos builder bila perlu menambah profil terhitung dari luar
    build: { WF: WF, UNP: UNP, L: LSIKU, PIPE: PIPE, SHS: SHS, RHS: RHS, CNP: CNP }
  };
})();
