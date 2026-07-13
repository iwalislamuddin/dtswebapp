/* ============================================================
   Civil Tools — modules/anchor-bolt-group/module.js  (Tier 3, Three.js / WebGL)
   Anchor Bolt Group — angkur cor-di-tempat (cast-in) menahan TARIK + MOMEN.
   Referensi: ACI 318-19 Ch. 17 (adopsi SNI 2847:2019 Ps. 17) — "anchoring to concrete".

   Cakupan v1 (TARIK):
     - Distribusi gaya baut elastis: Ti = Nu/n + Mx·xi/Σxi² + My·yi/Σyi²
       (pelat kaku, baut elastis tarik/tekan — model pendahuluan yang disederhanakan).
     - Kuat baja tarik per angkur  : Nsa = Ase·futa            (φ=0,75)
     - Jebol beton (breakout) grup : Ncbg = (ANc/ANco)·ψec·ψed·ψc·ψcp·Nb  (ACI 17.6.2)
         Nb = kc·λa·√f'c·hef^1,5 (kc=10 cast-in), ANco = 9·hef²
     - Visual 3D: blok beton, pelat dasar, baut silinder, KERUCUT BREAKOUT tiap
       baut (proyeksi 1,5·hef di permukaan), overlap antar-kerucut di-highlight
       (indikasi perilaku grup), vektor gaya tarik per baut, klik baut → inspektur.

   TIDAK termasuk (increment berikutnya): GESER (baja/breakout/pryout), cabut
   (pullout 17.6.3), pecah sisi (side-face blowout 17.6.4), angkur pasca-pasang
   (post-installed), tulangan angkur (anchor reinforcement), neutral-axis beton
   (model bearing pelat). Verifikasi oleh insinyur penanggung jawab.
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};
  var ID = 'anchor-bolt-group';
  var THREE = window.THREE;
  var state = {};

  function num(x) { x = parseFloat(x); return isFinite(x) ? x : 0; }

  /* ============================================================
     KALKULASI (ACI 318-19 Ch. 17 — tarik)
     ============================================================ */
  function compute(v) {
    var r = { valid: false, warn: [] };
    var nx = Math.max(1, Math.round(num(v.nx)));
    var ny = Math.max(1, Math.round(num(v.ny)));
    var sx = num(v.sx), sy = num(v.sy);            // spasi mm
    var da = num(v.da), hef = num(v.hef);          // mm
    var fc = num(v.fc), futa = num(v.futa);        // MPa
    var Ase = num(v.Ase);                          // mm² (luas tarik efektif per baut)
    var ca = num(v.ca);                            // mm — jarak tepi (grup ke tepi beton, semua sisi)
    var ha = num(v.ha);                            // mm — tebal elemen beton
    var Nu = num(v.Nu);                            // kN (+ tarik)
    var Mx = num(v.Mx), My = num(v.My);            // kN·m
    var cond = v.cond || 'B';                      // 'A' (ada tul. suplemen) | 'B'
    var crack = v.crack || 'cracked';              // 'cracked' | 'uncracked'

    var n = nx * ny;
    r.nx = nx; r.ny = ny; r.sx = sx; r.sy = sy; r.n = n;
    r.da = da; r.hef = hef; r.fc = fc; r.futa = futa; r.Ase = Ase;
    r.ca = ca; r.ha = ha; r.Nu = Nu; r.Mx = Mx; r.My = My; r.cond = cond; r.crack = crack;

    /* --- posisi baut (mm), pusat = centroid grup --- */
    var xs = [], ys = [], bolts = [];
    for (var i = 0; i < nx; i++) xs.push((i - (nx - 1) / 2) * sx);
    for (var j = 0; j < ny; j++) ys.push((j - (ny - 1) / 2) * sy);
    var Sxx = 0, Syy = 0;
    xs.forEach(function (x) { Sxx += x * x * ny; });     // Σxi² seluruh baut
    ys.forEach(function (y) { Syy += y * y * nx; });
    r.Sxx = Sxx; r.Syy = Syy;

    /* --- distribusi gaya baut elastis (kN) --- */
    // Ti = Nu/n + Mx·(xi[m])/Σxi²[m²] + My·(yi[m])/Σyi²[m²]
    var SxxM = Sxx / 1e6, SyyM = Syy / 1e6;               // m²
    var Tmax = -Infinity, sumTt = 0;
    var exNum = 0, eyNum = 0;                             // untuk eksentrisitas resultan tarik
    for (var a = 0; a < nx; a++) for (var b = 0; b < ny; b++) {
      var xi = xs[a], yi = ys[b];
      var Tmoi = (SxxM > 0 ? Mx * (xi / 1000) / SxxM : 0);
      var Tmoj = (SyyM > 0 ? My * (yi / 1000) / SyyM : 0);
      var Ti = Nu / n + Tmoi + Tmoj;                     // kN (+tarik)
      bolts.push({ x: xi, y: yi, T: Ti });
      if (Ti > Tmax) Tmax = Ti;
      if (Ti > 0) { sumTt += Ti; exNum += Ti * (xi / 1000); eyNum += Ti * (yi / 1000); }
    }
    r.bolts = bolts; r.Tmax = Tmax; r.sumTt = sumTt;

    /* --- kuat baja tarik per angkur (17.6.1) --- */
    var Nsa = Ase * futa / 1000;                          // kN
    var phiNsa = 0.75 * Nsa;
    r.Nsa = Nsa; r.phiNsa = phiNsa;
    r.dcSteel = phiNsa > 0 ? Tmax / phiNsa : Infinity;

    /* --- jebol beton grup (17.6.2) --- */
    var lam = 1.0, kc = 10;                               // beton normal, cast-in
    var Nb = kc * lam * Math.sqrt(Math.max(0, fc)) * Math.pow(hef, 1.5) / 1000;  // kN
    var ANco = 9 * hef * hef;                             // mm²
    var eff = Math.min(1.5 * hef, ca > 0 ? ca : 1.5 * hef);   // proyeksi efektif per sisi
    var Wx = (nx - 1) * sx, Wy = (ny - 1) * sy;
    var ANc = (Wx + 2 * eff) * (Wy + 2 * eff);
    ANc = Math.min(ANc, n * ANco);                       // batas atas
    var ratioA = ANco > 0 ? ANc / ANco : 0;

    // ψed,N (tepi)
    var caMin = ca > 0 ? ca : 1.5 * hef;
    var psiEd = (caMin >= 1.5 * hef) ? 1.0 : (0.7 + 0.3 * caMin / (1.5 * hef));
    // ψc,N (retak)
    var psiC = (crack === 'uncracked') ? 1.25 : 1.0;
    // ψcp,N = 1.0 (cast-in)
    var psiCp = 1.0;
    // ψec,N (eksentrisitas resultan tarik, dua arah)
    var ex = sumTt > 0 ? Math.abs(exNum / sumTt) : 0;     // m
    var ey = sumTt > 0 ? Math.abs(eyNum / sumTt) : 0;
    var lim = 1.5 * hef / 1000;                           // m
    var psiEcX = 1 / (1 + ex / lim); if (psiEcX > 1) psiEcX = 1;
    var psiEcY = 1 / (1 + ey / lim); if (psiEcY > 1) psiEcY = 1;
    var psiEc = psiEcX * psiEcY;

    var Ncbg = ratioA * psiEc * psiEd * psiC * psiCp * Nb;   // kN
    var phiC = (cond === 'A') ? 0.75 : 0.70;                 // ACI Table 17.5.3 (breakout tarik, cast-in)
    var phiNcbg = phiC * Ncbg;

    r.Nb = Nb; r.ANco = ANco; r.ANc = ANc; r.ratioA = ratioA;
    r.psiEd = psiEd; r.psiC = psiC; r.psiCp = psiCp; r.psiEc = psiEc; r.ex = ex * 1000; r.ey = ey * 1000;
    r.Ncbg = Ncbg; r.phiC = phiC; r.phiNcbg = phiNcbg; r.eff = eff;
    r.dcConc = phiNcbg > 0 ? sumTt / phiNcbg : Infinity;

    /* --- overlap kerucut (spasi < 3·hef → perilaku grup) --- */
    var minGap = Infinity;
    for (var p = 0; p < bolts.length; p++) for (var q = p + 1; q < bolts.length; q++) {
      var dx = bolts[p].x - bolts[q].x, dy = bolts[p].y - bolts[q].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < minGap) minGap = d;
    }
    r.minSpacing = isFinite(minGap) ? minGap : 0;
    r.overlap = isFinite(minGap) && minGap < 3 * hef;      // kerucut 1,5hef saling tumpang

    r.govDC = Math.max(r.dcSteel, r.dcConc);
    r.gov = (r.dcSteel >= r.dcConc) ? 'baja' : 'beton (breakout)';
    r.valid = true;

    /* --- peringatan --- */
    if (sumTt <= 0)
      r.warn.push('Tidak ada baut tertarik (Nu tekan & momen kecil) — cek breakout tarik tidak menentukan. Geser & tekan/bearing di luar cakupan v1.');
    if (Mx !== 0 && Sxx === 0) r.warn.push('Mx > 0 tetapi hanya 1 baris baut arah-X (Σxi²=0) — grup tak dapat menahan momen arah ini secara elastis.');
    if (My !== 0 && Syy === 0) r.warn.push('My > 0 tetapi hanya 1 kolom baut arah-Y (Σyi²=0) — grup tak dapat menahan momen arah ini.');
    if (r.overlap)
      r.warn.push('Kerucut breakout tumpang-tindih (spasi ' + r.minSpacing.toFixed(0) + ' mm < 3·hef = ' + (3 * hef).toFixed(0) + ' mm) — kapasitas grup < Σ kapasitas tunggal; sudah tercermin di ANc/ANco = ' + r.ratioA.toFixed(2) + '.');
    if (caMin < 1.5 * hef)
      r.warn.push('Jarak tepi ca = ' + caMin.toFixed(0) + ' mm < 1,5·hef = ' + (1.5 * hef).toFixed(0) + ' mm — efek tepi mengurangi kapasitas (ψed = ' + psiEd.toFixed(2) + ').');
    if (ha > 0 && ha < 1.5 * hef)
      r.warn.push('Tebal beton ha = ' + ha.toFixed(0) + ' mm < 1,5·hef — kemungkinan breakout tembus / perlu tinjauan hef,maks (ACI 17.6.2.1.2). Tidak dikoreksi otomatis di v1.');
    if (r.dcSteel > 1) r.warn.push('D/C baja = ' + r.dcSteel.toFixed(2) + ' > 1 — baut leleh/putus. Perbesar diameter atau jumlah baut.');
    if (r.dcConc > 1) r.warn.push('D/C breakout beton = ' + r.dcConc.toFixed(2) + ' > 1 — perbesar hef, spasi, jarak tepi, atau pasang tulangan angkur.');

    return r;
  }

  /* ============================================================
     SCENE 3D
     ============================================================ */
  var S = 0.01;   // faktor skala mm → satuan scene (400 mm → 4 unit)

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function colHex(name, fallback) { var c = css(name); return c ? new THREE.Color(c) : new THREE.Color(fallback); }

  function buildScene() {
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    cam.position.set(6, 5, 8);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    var dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    var dir2 = new THREE.DirectionalLight(0xffffff, 0.25);
    dir2.position.set(-6, 4, -5);
    scene.add(dir2);

    var group = new THREE.Group();     // konten yang di-rebuild tiap input berubah
    scene.add(group);

    state.scene = scene; state.cam = cam; state.contentGroup = group;
    return { scene: scene, cam: cam, group: group };
  }

  // Bangun ulang geometri dari hasil hitung.
  function rebuild(r) {
    var g = state.contentGroup;
    if (!g) return;
    // buang isi lama
    state.UI.disposeObject(g);
    while (g.children.length) g.remove(g.children[0]);
    state.boltMeshes = [];

    if (!r || !r.valid) return;

    var cAmber = colHex('--amber', '#f28f3b');
    var cBlue = colHex('--blue', '#30bced');
    var cOk = colHex('--ok', '#88b08a');
    var cBad = colHex('--bad', '#e5694f');
    var cInk = colHex('--ink-dim', '#acb89b');
    var cLine = colHex('--line', '#2b3123');

    var hef = r.hef, da = r.da;
    var Wx = (r.nx - 1) * r.sx, Wy = (r.ny - 1) * r.sy;
    var eff = r.eff;
    var blockW = (Wx + 2 * Math.max(eff, r.ca || eff)) ;
    var blockD = (Wy + 2 * Math.max(eff, r.ca || eff));
    blockW = Math.max(blockW, Wx + 3 * da + 2 * (r.ca || 1.5 * hef));
    blockD = Math.max(blockD, Wy + 3 * da + 2 * (r.ca || 1.5 * hef));
    var blockH = Math.max(r.ha || 0, hef * 1.4);

    /* --- blok beton (semi-transparan, permukaan atas di y=0) --- */
    var concGeo = new THREE.BoxGeometry(blockW * S, blockH * S, blockD * S);
    var concMat = new THREE.MeshStandardMaterial({
      color: cLine, transparent: true, opacity: 0.16, roughness: 0.95, metalness: 0,
      depthWrite: false, side: THREE.DoubleSide
    });
    var conc = new THREE.Mesh(concGeo, concMat);
    conc.position.y = -blockH * S / 2;
    g.add(conc);
    // rangka tepi blok
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(concGeo),
      new THREE.LineBasicMaterial({ color: cInk, transparent: true, opacity: 0.35 }));
    edges.position.copy(conc.position);
    g.add(edges);

    /* --- grid permukaan --- */
    var gridSize = Math.max(blockW, blockD) * S * 1.4;
    var grid = new THREE.GridHelper(gridSize, 16, cLine, cLine);
    grid.material.transparent = true; grid.material.opacity = 0.25;
    grid.position.y = 0.001;
    g.add(grid);

    /* --- pelat dasar --- */
    var plateW = Wx + 3 * da, plateD = Wy + 3 * da, plateT = Math.max(12, da * 0.8);
    var plateMat = new THREE.MeshStandardMaterial({ color: cInk, roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.55 });
    var plate = new THREE.Mesh(new THREE.BoxGeometry(plateW * S, plateT * S, plateD * S), plateMat);
    plate.position.y = plateT * S / 2;
    g.add(plate);

    /* --- per baut: silinder + kerucut breakout + lingkaran proyeksi + vektor --- */
    var coneMatBase = { transparent: true, opacity: 0.13, roughness: 1, metalness: 0, side: THREE.DoubleSide, depthWrite: false };
    var absMax = 0;
    r.bolts.forEach(function (bt) { absMax = Math.max(absMax, Math.abs(bt.T)); });

    r.bolts.forEach(function (bt, idx) {
      var px = bt.x * S, pz = bt.y * S;

      // silinder baut: dari atas pelat (+120mm) turun ke -hef
      var topY = (plateT + 120) * S, botY = -hef * S;
      var len = topY - botY;
      var boltMat = new THREE.MeshStandardMaterial({ color: (bt.T > 0 ? cAmber : cInk), roughness: 0.35, metalness: 0.7 });
      var bolt = new THREE.Mesh(new THREE.CylinderGeometry(da * S / 2, da * S / 2, len, 20), boltMat);
      bolt.position.set(px, (topY + botY) / 2, pz);
      bolt.userData = { boltIndex: idx };
      g.add(bolt);
      state.boltMeshes.push(bolt);

      // mur/kepala baut (heks disederhanakan → silinder pendek lebih besar)
      var nutMat = new THREE.MeshStandardMaterial({ color: cInk, roughness: 0.4, metalness: 0.6 });
      var nut = new THREE.Mesh(new THREE.CylinderGeometry(da * S * 0.9, da * S * 0.9, da * S * 0.6, 6), nutMat);
      nut.position.set(px, topY - da * S * 0.3, pz);
      nut.userData = { boltIndex: idx };
      g.add(nut);

      // kerucut breakout: apex di -hef, radius 1,5·hef di permukaan (y=0)
      var coneR = 1.5 * hef * S, coneH = hef * S;
      var coneGeo = new THREE.ConeGeometry(coneR, coneH, 40, 1, true);
      coneGeo.rotateX(Math.PI);                       // apex ke bawah
      var isT = bt.T > 0;
      var coneCol = r.overlap ? cAmber : cBlue;
      var coneMat = new THREE.MeshStandardMaterial(Object.assign({ color: coneCol }, coneMatBase));
      coneMat.opacity = isT ? 0.15 : 0.05;
      var cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(px, -coneH / 2, pz);
      g.add(cone);

      // lingkaran proyeksi 1,5hef di permukaan
      var ringGeo = new THREE.RingGeometry(coneR * 0.985, coneR, 48);
      var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: coneCol, transparent: true, opacity: isT ? 0.6 : 0.25, side: THREE.DoubleSide
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, 0.002, pz);
      g.add(ring);

      // vektor gaya tarik (panah ke atas) ∝ T
      if (bt.T > 0 && absMax > 0) {
        var arrowLen = (0.6 + 1.6 * bt.T / absMax);      // satuan scene
        var arr = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(px, topY, pz), arrowLen, cBad.getHex(), arrowLen * 0.28, da * S * 1.2);
        g.add(arr);
      }
    });

    // sumbu kecil di origin
    var axes = new THREE.AxesHelper(Math.max(blockW, blockD) * S * 0.35);
    axes.material.transparent = true; axes.material.opacity = 0.5;
    g.add(axes);

    // auto-fit kamera
    var reach = Math.max(blockW, blockD, hef * 2, 1.5 * hef * 2) * S;
    state.fitRadius = reach * 1.7;
    if (state.controls) state.controls.setView([0, -hef * S * 0.3, 0], state.fitRadius);

    highlightSelection();
  }

  function highlightSelection() {
    if (!state.boltMeshes) return;
    var cAmber = colHex('--amber', '#f28f3b'), cInk = colHex('--ink-dim', '#acb89b'), cOk = colHex('--ok', '#88b08a');
    var r = state.result;
    state.boltMeshes.forEach(function (m, i) {
      var T = r && r.bolts[i] ? r.bolts[i].T : 0;
      var base = T > 0 ? cAmber : cInk;
      if (i === state.selected) m.material.color.copy(cOk);
      else m.material.color.copy(base);
      m.material.emissive = new THREE.Color(i === state.selected ? 0x224422 : 0x000000);
    });
  }

  /* ============================================================
     RENDER DOM + WIRING
     ============================================================ */
  function injectStyle() {
    if (document.getElementById('abg-style')) return;
    var s = document.createElement('style');
    s.id = 'abg-style';
    s.textContent =
      '.abg-work{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}' +
      '.abg-view{position:relative;flex:1 1 58%;min-height:240px;border-bottom:1px solid var(--line);' +
        'background:radial-gradient(130% 130% at 30% 0%, var(--bg2), var(--bg));overflow:hidden}' +
      '.abg-hint{position:absolute;right:10px;bottom:8px;font:10px "JetBrains Mono",monospace;color:var(--ink-faint);' +
        'pointer-events:none;text-align:right;line-height:1.5}' +
      '.abg-res{flex:1 1 42%;overflow-y:auto;padding:16px 22px 30px}' +
      '.abg-nofit{position:absolute;left:10px;bottom:8px}' +
      '.abg-fitbtn{font:11px "Space Grotesk",sans-serif;background:var(--panel-solid);color:var(--ink-dim);' +
        'border:1px solid var(--line);border-radius:7px;padding:4px 9px;cursor:pointer}' +
      '.abg-fitbtn:hover{border-color:var(--amber);color:var(--amber)}';
    document.head.appendChild(s);
  }

  function render(container) {
    var UI = state.UI;
    injectStyle();
    container.innerHTML = '';
    var layout = UI.el('div', 'ck-layout');

    var panel = UI.el('div', 'ck-panel');
    panel.appendChild(UI.el('h2', null, 'Anchor Bolt Group'));
    panel.appendChild(UI.el('div', 'sub', 'Grup baut angkur cor-di-tempat menahan tarik + momen — ' +
      'ACI 318-19 Ch. 17 (SNI 2847:2019 Ps. 17). Kuat baja & jebol beton (breakout) grup dengan ' +
      'visual kerucut breakout 3D. Putar: seret · Zoom: roda · Geser: klik-kanan. Klik baut untuk detail.'));
    layout.appendChild(panel);

    var schema = [
      { type: 'group', label: 'Pola Baut' },
      { type: 'number', id: 'nx', label: 'Jumlah baris (arah X)', value: 2, min: 1, step: 1 },
      { type: 'number', id: 'ny', label: 'Jumlah kolom (arah Y)', value: 2, min: 1, step: 1 },
      { type: 'number', id: 'sx', label: 'Spasi arah X', unit: 'mm', value: 250, min: 0, step: 10 },
      { type: 'number', id: 'sy', label: 'Spasi arah Y', unit: 'mm', value: 250, min: 0, step: 10 },

      { type: 'group', label: 'Angkur & Beton' },
      { type: 'number', id: 'da', label: 'Diameter baut da', unit: 'mm', value: 24, min: 6, step: 1, hint: 'Ase efektif diperkirakan ≈ 0,58·da² (dapat diubah di bawah).' },
      { type: 'number', id: 'Ase', label: 'Luas tarik efektif Ase', unit: 'mm²', value: 353, min: 1, step: 1 },
      { type: 'number', id: 'hef', label: 'Kedalaman tanam hef', unit: 'mm', value: 375, min: 20, step: 10 },
      { type: 'number', id: 'ca', label: 'Jarak tepi ca (semua sisi)', unit: 'mm', value: 600, min: 0, step: 10, hint: '0 atau ≥1,5·hef = tanpa efek tepi.' },
      { type: 'number', id: 'ha', label: 'Tebal beton ha', unit: 'mm', value: 600, min: 0, step: 10 },
      { type: 'number', id: 'fc', label: "Mutu beton f'c", unit: 'MPa', value: 25, min: 10, step: 1 },
      { type: 'number', id: 'futa', label: 'Kuat tarik baut futa', unit: 'MPa', value: 400, min: 100, step: 10 },
      { type: 'segment', id: 'crack', label: 'Kondisi beton', value: 'cracked', options: [
        { value: 'cracked', label: 'Retak (ψc=1,0)' }, { value: 'uncracked', label: 'Tak retak (1,25)' } ] },
      { type: 'segment', id: 'cond', label: 'Kondisi φ (breakout)', value: 'B', options: [
        { value: 'B', label: 'B — tanpa tul. (0,70)' }, { value: 'A', label: 'A — ada tul. (0,75)' } ] },

      { type: 'group', label: 'Beban Terfaktor (di centroid grup)' },
      { type: 'number', id: 'Nu', label: 'Tarik aksial Nu', unit: 'kN', value: 120, step: 5, hint: 'Positif = tarik. Tekan (negatif) ditahan bearing (di luar cakupan).' },
      { type: 'number', id: 'Mx', label: 'Momen Mx (gradien arah X)', unit: 'kN·m', value: 20, step: 5 },
      { type: 'number', id: 'My', label: 'Momen My (gradien arah Y)', unit: 'kN·m', value: 0, step: 5 }
    ];

    var results = UI.el('div', 'abg-res');
    var form = UI.buildForm(panel, schema, function (vals, changedId) {
      // da → auto-isi Ase (kecuali user sedang mengubah Ase sendiri)
      if (changedId === 'da') {
        var est = Math.round(0.58 * num(vals.da) * num(vals.da));
        form.setValue('Ase', est);
        vals.Ase = est;
      }
      update(vals, results);
    }, ID);
    state.form = form;
    state.results = results;

    // Tombol laporan
    var repGrp = UI.el('div', 'ck-grp');
    repGrp.appendChild(UI.el('h4', null, 'Laporan'));
    var btnPdf = UI.el('button', 'ck-btn', '⬇  Download PDF');
    var btnTxt = UI.el('button', 'ck-btn ghost', 'Download Teks (.txt)');
    btnTxt.style.marginTop = '8px';
    btnPdf.addEventListener('click', function () { doDownload('pdf'); });
    btnTxt.addEventListener('click', function () { doDownload('txt'); });
    repGrp.appendChild(btnPdf); repGrp.appendChild(btnTxt);
    panel.appendChild(repGrp);

    // Area 3D + hasil
    var work = UI.el('div', 'abg-work');
    var view = UI.el('div', 'abg-view');
    state.cap = UI.canvasCap(view, 'Anchor bolt group');
    view.appendChild(UI.el('div', 'abg-hint', 'seret: putar · roda: zoom<br>klik-kanan: geser · klik baut: detail'));
    var fitWrap = UI.el('div', 'abg-nofit');
    var fitBtn = UI.el('button', 'abg-fitbtn', '⟲ Reset tampilan');
    fitBtn.addEventListener('click', function () {
      if (state.controls && state.fitRadius) state.controls.setView([0, -state.result.hef * S * 0.3, 0], state.fitRadius);
    });
    fitWrap.appendChild(fitBtn); view.appendChild(fitWrap);
    work.appendChild(view);
    work.appendChild(results);
    layout.appendChild(work);
    container.appendChild(layout);
    state.view = view;

    // Inisialisasi renderer 3D
    var R = state.runtime.getRenderer ? state.runtime.getRenderer() : null;
    if (!R) {
      view.appendChild(UI.el('div', 'ck-empty', 'WebGL tidak tersedia di browser ini — visual 3D dinonaktifkan. Hasil numerik tetap dihitung.'));
    } else {
      state.R = R;
      var sc = buildScene();
      R.mount(view);
      R.onResize = function (w, h) { sc.cam.aspect = w / Math.max(1, h); sc.cam.updateProjectionMatrix(); };
      state.controls = state.runtime.orbit.create(sc.cam, R.canvas, {
        target: [0, 0, 0], minDistance: 0.5, maxDistance: 400, damping: 0.12
      });
      // seleksi baut (bedakan klik vs drag)
      state.down = null;
      state.onDown = function (e) { state.down = { x: e.clientX, y: e.clientY }; };
      state.onUp = function (e) {
        if (!state.down) return;
        var moved = Math.abs(e.clientX - state.down.x) + Math.abs(e.clientY - state.down.y);
        state.down = null;
        if (moved > 5) return;            // drag → bukan seleksi
        pickBolt(e);
      };
      R.canvas.addEventListener('mousedown', state.onDown);
      R.canvas.addEventListener('mouseup', state.onUp);

      state.raycaster = new THREE.Raycaster();
      // repaint warna material saat tema berganti
      state.themeObs = new MutationObserver(function () { rebuild(state.result); });
      state.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      R.start(function () {
        if (state.controls) state.controls.update();
        R.renderer.render(sc.scene, sc.cam);
      });
    }

    update(form.getValues(), results);
  }

  function pickBolt(e) {
    if (!state.R || !state.raycaster || !state.boltMeshes) return;
    var rect = state.R.canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    state.raycaster.setFromCamera(ndc, state.cam);
    var hits = state.raycaster.intersectObjects(state.boltMeshes, false);
    if (hits.length) {
      var idx = hits[0].object.userData.boltIndex;
      state.selected = (state.selected === idx) ? -1 : idx;
    } else {
      state.selected = -1;
    }
    highlightSelection();
    renderInspector();
  }

  /* ---------- panel hasil ---------- */
  function update(vals, results) {
    var UI = state.UI;
    var r = compute(vals);
    state.result = r;
    state.selected = -1;
    results.innerHTML = '';

    var dc = r.govDC;
    state.cap.set(r.n + ' baut · D/C ' + (isFinite(dc) ? dc.toFixed(2) : '—') + ' · menentukan: ' + r.gov);

    results.appendChild(UI.hero('D/C menentukan (' + r.gov + ')', isFinite(dc) ? UI.fmt(dc, 2) : '—',
      dc <= 1 ? 'OK' : 'NG'));

    results.appendChild(UI.rhead('Gaya baut (elastis)'));
    results.appendChild(UI.kv('Jumlah baut n', r.n + ' (' + r.nx + '×' + r.ny + ')'));
    results.appendChild(UI.kv('Tarik baut maks Tmax', UI.fmt(r.Tmax, 1) + ' kN', r.Tmax > 0 ? 'ok' : ''));
    results.appendChild(UI.kv('Σ tarik (baut tertarik)', UI.fmt(r.sumTt, 1) + ' kN'));

    results.appendChild(UI.rhead('Kuat baja tarik (per angkur · 17.6.1)'));
    results.appendChild(UI.kv('Nsa = Ase·futa', UI.fmt(r.Nsa, 1) + ' kN'));
    results.appendChild(UI.kv('φNsa (φ=0,75)', UI.fmt(r.phiNsa, 1) + ' kN'));
    results.appendChild(UI.kv('D/C baja = Tmax/φNsa', isFinite(r.dcSteel) ? UI.fmt(r.dcSteel, 2) : '—',
      r.dcSteel <= 1 ? 'ok' : 'bad'));

    results.appendChild(UI.rhead('Jebol beton grup (17.6.2)'));
    results.appendChild(UI.kv('Nb = 10·√f\'c·hef^1,5', UI.fmt(r.Nb, 1) + ' kN'));
    results.appendChild(UI.kv('ANc / ANco', UI.fmt(r.ANc, 0) + ' / ' + UI.fmt(r.ANco, 0) + ' = ' + r.ratioA.toFixed(2)));
    results.appendChild(UI.kv('ψec · ψed · ψc · ψcp', r.psiEc.toFixed(2) + ' · ' + r.psiEd.toFixed(2) + ' · ' + r.psiC.toFixed(2) + ' · ' + r.psiCp.toFixed(2)));
    results.appendChild(UI.kv('Ncbg', UI.fmt(r.Ncbg, 1) + ' kN'));
    results.appendChild(UI.kv('φNcbg (φ=' + r.phiC.toFixed(2) + ')', UI.fmt(r.phiNcbg, 1) + ' kN'));
    results.appendChild(UI.kv('D/C breakout = ΣTt/φNcbg', isFinite(r.dcConc) ? UI.fmt(r.dcConc, 2) : '—',
      r.dcConc <= 1 ? 'ok' : 'bad'));

    var warnHtml = r.warn.length
      ? '<ul style="margin:6px 0 0 16px">' + r.warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul>'
      : 'Tidak ada catatan khusus.';
    results.appendChild(UI.note('Catatan', warnHtml));
    results.appendChild(UI.note('Referensi & asumsi',
      'ACI 318-19 Ch. 17 (adopsi SNI 2847:2019 Ps. 17), angkur <b>cast-in</b>, beton normal (λ=1). ' +
      'Distribusi gaya baut <b>elastis pelat-kaku</b> (Ti = Nu/n + Mx·xi/Σxi² + My·yi/Σyi²) — pendahuluan, ' +
      'bukan model bearing-beton dengan sumbu netral. Nb = 10·λ·√f\'c·hef^1,5. <b>Cakupan v1: TARIK saja</b> — ' +
      'geser, cabut (pullout), pecah sisi (side-face blowout), pryout, dan tulangan angkur belum disertakan. ' +
      'Verifikasi oleh insinyur penanggung jawab.'));

    // inspektur baut
    results.appendChild(UI.rhead('Inspektur Baut'));
    state.inspector = UI.el('div', 'ck-empty', 'Klik sebuah baut di tampilan 3D untuk melihat gaya & D/C baut tersebut.');
    results.appendChild(state.inspector);

    rebuild(r);
  }

  function renderInspector() {
    var UI = state.UI, r = state.result;
    if (!state.inspector) return;
    if (state.selected == null || state.selected < 0 || !r) {
      state.inspector.className = 'ck-empty';
      state.inspector.innerHTML = 'Klik sebuah baut di tampilan 3D untuk melihat gaya & D/C baut tersebut.';
      return;
    }
    var bt = r.bolts[state.selected];
    var dcS = r.phiNsa > 0 ? bt.T / r.phiNsa : Infinity;
    state.inspector.className = '';
    state.inspector.innerHTML =
      '<div class="ck-kv"><span class="k">Baut #' + (state.selected + 1) + ' (x,y)</span><span class="v">' +
        bt.x.toFixed(0) + ', ' + bt.y.toFixed(0) + ' mm</span></div>' +
      '<div class="ck-kv"><span class="k">Gaya baut T</span><span class="v ' + (bt.T > 0 ? 'ok' : '') + '">' +
        UI.fmt(bt.T, 1) + ' kN ' + (bt.T > 0 ? '(tarik)' : '(tekan)') + '</span></div>' +
      '<div class="ck-kv"><span class="k">D/C baja baut ini</span><span class="v ' + (dcS <= 1 ? 'ok' : 'bad') + '">' +
        (bt.T > 0 && isFinite(dcS) ? UI.fmt(dcS, 2) : '—') + '</span></div>';
  }

  /* ============================================================
     LAPORAN monospace
     ============================================================ */
  var APP_VER = 'v0.1.0', RW = 62;
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
    return String(s).replace(/·/g, '*').replace(/²/g, '2').replace(/√/g, 'sqrt').replace(/×/g, 'x')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[–—−]/g, '-').replace(/′/g, "'")
      .replace(/ψ/g, 'psi').replace(/Σ/g, 'sum').replace(/φ/g, 'phi').replace(/[^\x20-\x7E]/g, '?');
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
    L.push(centerR('ANCHOR BOLT GROUP - TARIK (ACI 318-19 Ch.17)'));
    L.push(' ' + rep('=', RW));
    L.push(rowR('SNI 2847:2019 Ps. 17 (cast-in)', dt));
    L.push('');
    L.push(' KONFIGURASI'); L.push(ruleR('-'));
    L.push(rowR('Pola baut', r.nx + ' x ' + r.ny + ' = ' + r.n + ' baut'));
    L.push(rowR('Spasi X / Y', numR(r.sx, 0) + ' / ' + numR(r.sy, 0) + ' mm'));
    L.push(rowR('Diameter da / Ase', numR(r.da, 0) + ' mm / ' + numR(r.Ase, 0) + ' mm2'));
    L.push(rowR('hef', numR(r.hef, 0) + ' mm'));
    L.push(rowR('Jarak tepi ca / tebal ha', numR(r.ca, 0) + ' / ' + numR(r.ha, 0) + ' mm'));
    L.push(rowR("f'c / futa", numR(r.fc, 0) + ' / ' + numR(r.futa, 0) + ' MPa'));
    L.push(rowR('Kondisi beton', r.crack === 'uncracked' ? 'Tak retak (psic=1.25)' : 'Retak (psic=1.0)'));
    L.push('');
    L.push(' BEBAN TERFAKTOR (centroid grup)'); L.push(ruleR('-'));
    L.push(rowR('Nu (tarik)', numR(r.Nu, 1) + ' kN'));
    L.push(rowR('Mx / My', numR(r.Mx, 1) + ' / ' + numR(r.My, 1) + ' kN*m'));
    L.push('');
    L.push(' GAYA BAUT (elastis)'); L.push(ruleR('-'));
    L.push(rowR('Tarik baut maks Tmax', numR(r.Tmax, 1) + ' kN'));
    L.push(rowR('Sum tarik (baut tertarik)', numR(r.sumTt, 1) + ' kN'));
    L.push('');
    L.push(' KUAT BAJA TARIK (17.6.1)'); L.push(ruleR('='));
    L.push(rowR('Nsa = Ase*futa', numR(r.Nsa, 1) + ' kN'));
    L.push(rowR('phiNsa (phi=0.75)', numR(r.phiNsa, 1) + ' kN'));
    L.push(rowR('>> D/C baja', numR(r.dcSteel, 2) + (r.dcSteel <= 1 ? ' OK' : ' NG')));
    L.push('');
    L.push(' JEBOL BETON GRUP (17.6.2)'); L.push(ruleR('='));
    L.push(rowR('Nb = 10*sqrt(fc)*hef^1.5', numR(r.Nb, 1) + ' kN'));
    L.push(rowR('ANc / ANco', numR(r.ANc, 0) + ' / ' + numR(r.ANco, 0)));
    L.push(rowR('  rasio ANc/ANco', numR(r.ratioA, 2)));
    L.push(rowR('psi_ec / psi_ed', numR(r.psiEc, 2) + ' / ' + numR(r.psiEd, 2)));
    L.push(rowR('psi_c / psi_cp', numR(r.psiC, 2) + ' / ' + numR(r.psiCp, 2)));
    L.push(rowR('Ncbg', numR(r.Ncbg, 1) + ' kN'));
    L.push(rowR('phiNcbg (phi=' + numR(r.phiC, 2) + ')', numR(r.phiNcbg, 1) + ' kN'));
    L.push(rowR('>> D/C breakout', numR(r.dcConc, 2) + (r.dcConc <= 1 ? ' OK' : ' NG')));
    L.push(ruleR('='));
    L.push(rowR('>> D/C MENENTUKAN (' + r.gov + ')', numR(r.govDC, 2)));
    L.push(ruleR('='));

    if (r.warn.length) {
      L.push(''); L.push(' CATATAN'); L.push(ruleR('-'));
      r.warn.forEach(function (w) { wrapR(' - ' + tolatin(w), RW).forEach(function (ln) { L.push(ln); }); });
    }
    L.push('');
    L.push(' Cakupan v1: TARIK saja (baja + breakout beton grup). Geser, pullout,');
    L.push(' side-face blowout, pryout, tul. angkur BELUM disertakan.');
    L.push(' Distribusi gaya baut elastis pelat-kaku (pendahuluan).');
    L.push(' Verifikasi oleh insinyur penanggung jawab.');
    L.push('');
    L.push(' ' + rep('=', RW));
    L.push(centerR('EDFS Civil Tools ' + APP_VER + '  -  DTS Engineering'));
    L.push(' ' + rep('=', RW));
    return L.map(tolatin);
  }

  function doDownload(fmt) {
    var UI = state.UI;
    if (!window.CivilReport) { UI.toast('Modul report belum siap', 'bad'); return; }
    var r = compute(state.form.getValues());
    if (!r.valid) { UI.toast('Lengkapi input dulu', 'bad'); return; }
    var lines = buildReport(r);
    var d = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    var base = 'Anchor-Bolt-Group_' + r.nx + 'x' + r.ny + '_' + stamp;
    if (fmt === 'pdf') { window.CivilReport.downloadPDF(base + '.pdf', lines); UI.toast('Report PDF diunduh', 'info'); }
    else { window.CivilReport.downloadText(base + '.txt', lines); UI.toast('Report teks diunduh', 'info'); }
  }

  /* ============================================================
     KONTRAK MODULE
     ============================================================ */
  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Anchor Bolt Group', category: 'Sambungan', needsCanvas: false, needsRenderer: true },

    mount: function (container, runtime) {
      state = { UI: runtime.UI, runtime: runtime, selected: -1, boltMeshes: [] };
      render(container);
    },

    unmount: function () {
      if (state.R) {
        if (state.onDown) state.R.canvas.removeEventListener('mousedown', state.onDown);
        if (state.onUp) state.R.canvas.removeEventListener('mouseup', state.onUp);
        state.R.stop();
        state.R.unmount();
      }
      if (state.controls) state.controls.dispose();
      if (state.themeObs) state.themeObs.disconnect();
      if (state.scene) state.UI.disposeObject(state.scene);
      state = {};
    }
  };
})();
