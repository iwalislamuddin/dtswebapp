/* ============================================================
   Civil Tools — assets/shell.js
   Router (path-based, History API) + module loader + lifecycle mount/unmount.
   Tiap tool = URL sendiri (/{id}) agar terindeks Google secara terpisah;
   <title>, meta description, canonical, & Open Graph diperbarui per tool.
   Shell TIDAK PERNAH diubah untuk menambah tool.
   ============================================================ */
(function () {
  'use strict';

  var REGISTRY = window.MODULE_REGISTRY || [];
  var UI = window.CivilUI;
  var navList = document.getElementById('nav-list');
  var moduleRoot = document.getElementById('module-root');

  var activeId = null;
  var activeModule = null;              // objek dari window.CivilModules[id]
  var loadedScripts = {};               // id -> true (script sudah di-inject)

  // Shared runtime dependency yang diberikan ke tiap module
  var runtime = {
    THREE: window.THREE || null,
    UI: UI,
    canvas2d: window.CivilCanvas2D || null,   // tier 2 — helper kanvas 2D
    steel: window.SteelProfiles || null,      // library profil baja (tool baja)
    orbit: window.CivilOrbit || null,         // tier 3 — kontrol orbit kamera
    // renderer 3D bersama (satu konteks WebGL) — lazy-init saat tool 3D pertama.
    // null bila core/renderer.js belum dimuat atau WebGL tidak tersedia.
    getRenderer: function () { return window.CivilRenderer ? window.CivilRenderer.get() : null; },
    // Handoff antar-tool: kirim nilai (mis. beban terfaktor) ke input tool tujuan.
    // Pengirim tak perlu tahu detail tujuan — cukup id + payload berkunci kuantitas.
    handoff: {
      send: function (targetId, payload, fromLabel) {
        try {
          sessionStorage.setItem('civiltools-handoff', JSON.stringify({
            to: targetId, from: fromLabel || null, payload: payload || {}, ts: Date.now()
          }));
        } catch (e) { /* sessionStorage bisa gagal di mode privat — abaikan */ }
        navigate(targetId);
      }
    }
  };

  /* ---------- Handoff inbox: isi form tool tujuan setelah mount ---------- */
  // Cocokkan payload.<kuantitas> → field lewat entry.accepts di registry, lalu
  // form.applyInputs() (dari window.CivilForms[id]). Dikonsumsi sekali pakai.
  function applyHandoff(id, entry) {
    if (!entry || !entry.accepts) return;
    var raw; try { raw = sessionStorage.getItem('civiltools-handoff'); } catch (e) { return; }
    if (!raw) return;
    var h; try { h = JSON.parse(raw); } catch (e) { try { sessionStorage.removeItem('civiltools-handoff'); } catch (_) {} return; }
    if (!h || h.to !== id) return;
    try { sessionStorage.removeItem('civiltools-handoff'); } catch (e) {}   // konsumsi sekali
    var form = (window.CivilForms || {})[id];
    if (!form || typeof form.applyInputs !== 'function') return;
    var inputs = {}, labels = [];
    Object.keys(entry.accepts).forEach(function (qty) {
      var val = h.payload ? h.payload[qty] : undefined;
      if (val != null && !isNaN(val)) { inputs[entry.accepts[qty]] = val; labels.push(entry.accepts[qty]); }
    });
    if (!labels.length) return;
    form.applyInputs(inputs);
    UI.toast(labels.join(', ') + ' diterima dari ' + (h.from || 'tool lain'), 'info');
  }

  /* ---------- Render nav (grouped by kategori, urutan sesuai registry) ---------- */
  // Setiap kategori = header toggle (dropdown). Status ciutkan disimpan per-kategori.
  var CHEVRON = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  function loadCollapsedCats() {
    try { return JSON.parse(localStorage.getItem('civiltools-navcats') || '[]'); }
    catch (e) { return []; }
  }
  function saveCollapsedCats(list) {
    try { localStorage.setItem('civiltools-navcats', JSON.stringify(list)); } catch (e) {}
  }

  function renderNav() {
    navList.innerHTML = '';
    var cats = [];
    var byCat = {};
    REGISTRY.forEach(function (m) {
      if (!byCat[m.category]) { byCat[m.category] = []; cats.push(m.category); }
      byCat[m.category].push(m);
    });
    var collapsed = loadCollapsedCats();
    cats.forEach(function (cat) {
      var sec = UI.el('div', 'nav-sec' + (collapsed.indexOf(cat) >= 0 ? ' collapsed' : ''));
      var head = UI.el('button', 'nav-cat');
      head.type = 'button';
      head.innerHTML = '<span class="nav-cat-txt">' + cat + '</span>' + CHEVRON;
      head.addEventListener('click', function () {
        var isCol = sec.classList.toggle('collapsed');
        var list = loadCollapsedCats();
        var i = list.indexOf(cat);
        if (isCol && i < 0) list.push(cat);
        else if (!isCol && i >= 0) list.splice(i, 1);
        saveCollapsedCats(list);
      });
      var items = UI.el('div', 'nav-cat-items');
      byCat[cat].forEach(function (m) {
        var disabled = (m.status === 'coming-soon');
        var btn = UI.el('button', 'nav-item' + (disabled ? ' disabled' : ''));
        btn.dataset.id = m.id;
        var badge = '';
        if (m.status === 'coming-soon') badge = '<span class="badge">soon</span>';
        else if (m.status === 'beta') badge = '<span class="badge beta">beta</span>';
        btn.innerHTML =
          '<span class="ico">' + iconMarkup(m) + '</span>' +
          '<span class="lbl">' + m.name + '</span>' + badge;
        if (!disabled) {
          btn.addEventListener('click', function () { navigate(m.id); });
        }
        items.appendChild(btn);
      });
      sec.appendChild(head);
      sec.appendChild(items);
      navList.appendChild(sec);
    });
  }

  function iconMarkup() {
    // ikon generik: placeholder awal + fallback (modul roadmap tanpa file icon.svg)
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/></svg>';
  }

  // Muat icon.svg milik tiap modul (bila terdaftar) lalu swap ke placeholder.
  // Async, di-cache, dan gagal-diam ke ikon generik (offline sebelum ter-cache / file hilang).
  // Ikon di-inline sebagai SVG agar stroke="currentColor" mengikuti tema.
  var iconCache = {};
  function fetchIcon(m, apply) {
    if (!m.icon) return;
    if (iconCache[m.icon]) { apply(iconCache[m.icon]); return; }
    fetch(m.icon).then(function (r) { return r.ok ? r.text() : null; }).then(function (txt) {
      if (txt == null) return;
      txt = txt.trim();
      if (txt.slice(0, 4).toLowerCase() !== '<svg') return; // hanya terima SVG utuh
      iconCache[m.icon] = txt;
      apply(txt);
    }).catch(function () {});
  }
  function hydrateIcons() {
    REGISTRY.forEach(function (m) {
      fetchIcon(m, function (svg) {
        var host = navList.querySelector('.nav-item[data-id="' + m.id + '"] .ico');
        if (host) host.innerHTML = svg;
      });
    });
  }

  function highlightNav(id) {
    var activeBtn = null;
    Array.prototype.forEach.call(navList.querySelectorAll('.nav-item'), function (b) {
      var on = b.dataset.id === id;
      b.classList.toggle('active', on);
      if (on) activeBtn = b;
    });
    // Ungkap kategori tool aktif bila sedang diciutkan (mis. dibuka via deep-link).
    if (activeBtn && activeBtn.closest) {
      var sec = activeBtn.closest('.nav-sec');
      if (sec) sec.classList.remove('collapsed');
    }
  }

  /* ---------- Halaman depan: launcher ikon tool per kategori ---------- */
  // Kartu klik = navigate(id). Ikon dihidrasi dari cache yang sama dengan nav.
  // Kategori 'Dev' (template internal) tidak ditampilkan.
  function showWelcome() {
    var cats = [], byCat = {};
    REGISTRY.forEach(function (m) {
      if (m.category === 'Dev') return;
      if (!byCat[m.category]) { byCat[m.category] = []; cats.push(m.category); }
      byCat[m.category].push(m);
    });
    var nActive = REGISTRY.filter(function (m) { return m.status === 'active'; }).length;

    var home = UI.el('div', 'home');
    var hd = UI.el('div', 'home-hd');
    hd.innerHTML =
      '<div class="w-mark">Alat Bantu Rekayasa Sipil</div>' +
      '<h1>EDFS Civil Tools</h1>' +
      '<p>' + nActive + ' kalkulator rekayasa sipil sesuai SNI — pilih tool untuk memulai. ' +
      'Setiap tool berjalan mandiri dan bisa dipasang sebagai aplikasi (PWA).</p>';
    home.appendChild(hd);

    cats.forEach(function (cat) {
      var sec = UI.el('div', 'home-cat');
      sec.appendChild(UI.el('h3', null, cat));
      var grid = UI.el('div', 'home-grid');
      byCat[cat].forEach(function (m) {
        var disabled = (m.status === 'coming-soon');
        var card = UI.el('button', 'home-card' + (disabled ? ' disabled' : ''));
        card.type = 'button';
        card.dataset.id = m.id;
        var badge = '';
        if (m.status === 'coming-soon') badge = '<span class="badge">soon</span>';
        else if (m.status === 'beta') badge = '<span class="badge beta">beta</span>';
        card.innerHTML =
          '<span class="hico">' + iconMarkup(m) + '</span>' +
          '<span class="hlbl">' + m.name + '</span>' + badge;
        if (!disabled) card.addEventListener('click', function () { navigate(m.id); });
        grid.appendChild(card);
        fetchIcon(m, function (svg) {
          var host = card.querySelector('.hico');
          if (host) host.innerHTML = svg;
        });
      });
      sec.appendChild(grid);
      home.appendChild(sec);
    });

    moduleRoot.innerHTML = '';
    moduleRoot.appendChild(home);
  }

  /* ---------- Sidebar auto-hide di halaman depan ---------- */
  // Halaman depan: nav DIPAKSA ciut (launcher sudah menampilkan semua tool).
  // Masuk tool: kembalikan sesuai preferensi tersimpan pengguna.
  function syncNav(isHome) {
    var app = document.getElementById('app');
    if (!app) return;
    if (isHome) app.classList.add('collapsed');
    else if (localStorage.getItem('civiltools-nav') !== 'collapsed') app.classList.remove('collapsed');
  }

  /* ---------- Module loader ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Gagal memuat ' + src)); };
      document.head.appendChild(s);
    });
  }

  function unmountActive() {
    if (activeModule && typeof activeModule.unmount === 'function') {
      try { activeModule.unmount(); } catch (e) { console.error('unmount error', e); }
    }
    activeModule = null;
    moduleRoot.innerHTML = '';
  }

  function activate(id) {
    var entry = REGISTRY.filter(function (m) { return m.id === id; })[0];
    if (!entry || entry.status === 'coming-soon' || !entry.entry) {
      unmountActive(); activeId = null; highlightNav(null); showWelcome(); syncNav(true);
      setMeta(null); trackPageView(); return;
    }

    setMeta(entry); trackPageView(); syncNav(false);

    // sudah aktif -> no-op
    if (id === activeId && activeModule) return;

    unmountActive();
    activeId = id;
    highlightNav(id);

    var doMount = function () {
      window.CivilModules = window.CivilModules || {};
      var mod = window.CivilModules[id];
      if (!mod || typeof mod.mount !== 'function') {
        UI.toast('Module "' + id + '" tidak mengekspos mount()', 'bad');
        showWelcome(); return;
      }
      activeModule = mod;
      try {
        mod.mount(moduleRoot, runtime);
        applyHandoff(id, entry);   // isi input bila ada nilai dikirim dari tool lain
      } catch (e) {
        console.error(e);
        UI.toast('Error saat memuat ' + id, 'bad');
        moduleRoot.innerHTML = '<div class="welcome"><p>Gagal memuat tool ini. Cek console.</p></div>';
      }
    };

    if (loadedScripts[id]) { doMount(); return; }

    moduleRoot.innerHTML = '<div class="welcome"><p>Memuat…</p></div>';
    loadScript(entry.entry).then(function () {
      loadedScripts[id] = true;
      doMount();
    }).catch(function (err) {
      console.error(err);
      UI.toast(err.message, 'bad');
      showWelcome();
    });
  }

  /* ---------- Routing (path-based, History API) ---------- */
  // URL kanonik SELALU ke domain produksi (biar konsisten walau diakses via
  // localhost / preview). Dipakai untuk <link rel=canonical> & og:url.
  var SITE = 'https://tools.dtsengineering.co.id';
  var DEFAULT_TITLE = 'EDFS Civil Tools — Alat Bantu Rekayasa Sipil (SNI)';
  var DEFAULT_DESC =
    'Kumpulan kalkulator rekayasa sipil sesuai SNI: beton bertulang, baja, ' +
    'geoteknik, dan kombinasi beban. Gratis, berjalan di browser, oleh PT. DTS Engineering.';

  // id tool dari path: "/beam-flexure" -> "beam-flexure" (abaikan slash & query)
  function currentId() {
    return location.pathname.replace(/^\/+|\/+$/g, '');
  }

  function setTag(attr, key, val) {
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (el) el.setAttribute('content', val);
  }

  // Perbarui title + meta description + canonical + Open Graph per tool.
  // entry=null -> halaman utama (nilai default situs).
  function setMeta(entry) {
    var seo = entry && entry.seo;
    var title = seo ? seo.title + ' — EDFS Civil Tools' : DEFAULT_TITLE;
    var desc  = seo ? seo.desc : DEFAULT_DESC;
    var url   = SITE + (entry && entry.id && entry.status !== 'coming-soon' ? '/' + entry.id : '/');
    document.title = title;
    setTag('name', 'description', desc);
    setTag('property', 'og:title', title);
    setTag('property', 'og:description', desc);
    setTag('property', 'og:url', url);
    setTag('name', 'twitter:title', title);
    setTag('name', 'twitter:description', desc);
    var can = document.head.querySelector('link[rel="canonical"]');
    if (can) can.setAttribute('href', url);
  }

  // GA4 SPA page_view: dikirim manual tiap rute (config memakai send_page_view:false).
  // No-op bila gtag belum dimuat (Measurement ID masih placeholder).
  function trackPageView() {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: location.href,
      page_path: location.pathname || '/'
    });
  }

  // Pindah tool via URL bersih (/{id}). id kosong/null -> halaman utama.
  function navigate(id) {
    var path = id ? '/' + id : '/';
    if (location.pathname !== path) history.pushState({ id: id || '' }, '', path);
    route();
  }

  function route() {
    var id = currentId();
    if (!id) {
      activeId = null; unmountActive(); highlightNav(null); showWelcome(); syncNav(true);
      setMeta(null); trackPageView(); return;
    }
    activate(id);
  }

  /* ---------- Theme dropdown (klik → 4 pilihan → apply) ---------- */
  function initTheme() {
    var THEMES = [
      { id: 'dark',  icon: '☾', name: 'Gelap' },
      { id: 'light', icon: '☀', name: 'Terang' },
      { id: 'black', icon: '●', name: 'Hitam' },
      { id: 'white', icon: '○', name: 'Putih' }
    ];
    var byId = {};
    THEMES.forEach(function (t) { byId[t.id] = t; });

    var btn = document.getElementById('theme-toggle');
    var pop = document.getElementById('theme-pop');
    var menu = document.getElementById('theme-menu');

    // Bangun opsi menu sekali
    if (pop) THEMES.forEach(function (t) {
      var o = UI.el('button', 'theme-opt');
      o.type = 'button';
      o.dataset.theme = t.id;
      o.setAttribute('role', 'menuitemradio');
      o.innerHTML = '<span class="ti">' + t.icon + '</span><span>' + t.name + '</span>';
      o.addEventListener('click', function () { apply(t.id); closeMenu(); });
      pop.appendChild(o);
    });

    var saved = localStorage.getItem('civiltools-theme');
    apply(byId[saved] ? saved : 'dark');

    function apply(id) {
      var t = byId[id] || THEMES[0];
      document.documentElement.setAttribute('data-theme', t.id);
      localStorage.setItem('civiltools-theme', t.id);
      if (btn) btn.textContent = t.icon + ' Tema';
      if (pop) Array.prototype.forEach.call(pop.children, function (o) {
        var on = o.dataset.theme === t.id;
        o.classList.toggle('active', on);
        o.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    function openMenu()  { if (pop) { pop.classList.add('show');    btn.setAttribute('aria-expanded', 'true'); } }
    function closeMenu() { if (pop) { pop.classList.remove('show'); btn.setAttribute('aria-expanded', 'false'); } }

    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop && pop.classList.contains('show')) closeMenu(); else openMenu();
    });
    // Tutup saat klik di luar / tekan Escape
    document.addEventListener('click', function (e) { if (menu && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---------- Collapse sidebar ---------- */
  function initCollapse() {
    var app = document.getElementById('app');
    var toggle = document.getElementById('nav-toggle');
    if (localStorage.getItem('civiltools-nav') === 'collapsed') app.classList.add('collapsed');
    if (toggle) toggle.addEventListener('click', function () {
      var collapsed = app.classList.toggle('collapsed');
      localStorage.setItem('civiltools-nav', collapsed ? 'collapsed' : 'expanded');
    });
  }

  /* ---------- About / Tentang modal ---------- */
  function initAbout() {
    var ov = document.getElementById('about-ov');
    var openBtn = document.getElementById('about-btn');
    var closeBtn = document.getElementById('about-close');
    if (!ov) return;
    function open() { ov.classList.add('show'); }
    function close() { ov.classList.remove('show'); }
    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  /* ---------- Judul nav = link ke halaman depan (SPA, tanpa reload) ---------- */
  function initHomeLink() {
    var a = document.getElementById('nav-home');
    if (a) a.addEventListener('click', function (e) { e.preventDefault(); navigate(''); });
  }

  /* ---------- Boot ---------- */
  renderNav();
  hydrateIcons();
  initTheme();
  initCollapse();
  initAbout();
  initHomeLink();
  // Back-compat: tautan/PWA lama memakai "#id". Bila datang dengan hash dan
  // path masih root, konversi ke URL bersih "/id" tanpa menambah history.
  (function migrateHash() {
    var h = location.hash.replace(/^#/, '');
    if (h && !currentId()) history.replaceState({ id: h }, '', '/' + h);
  })();

  window.addEventListener('popstate', route);
  route(); // buka tool dari path (deep-link / PWA reopen) atau welcome
})();
