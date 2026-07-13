/* ============================================================
   Civil Tools — assets/shell.js
   Router (hash-based) + module loader + lifecycle mount/unmount.
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
    // renderer 3D di-lazy-init nanti (core/renderer.js), tool pertama non-3D
    getRenderer: function () { return null; },
    // Handoff antar-tool: kirim nilai (mis. beban terfaktor) ke input tool tujuan.
    // Pengirim tak perlu tahu detail tujuan — cukup id + payload berkunci kuantitas.
    handoff: {
      send: function (targetId, payload, fromLabel) {
        try {
          sessionStorage.setItem('civiltools-handoff', JSON.stringify({
            to: targetId, from: fromLabel || null, payload: payload || {}, ts: Date.now()
          }));
        } catch (e) { /* sessionStorage bisa gagal di mode privat — abaikan */ }
        location.hash = '#' + targetId;
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
          btn.addEventListener('click', function () { location.hash = '#' + m.id; });
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
  function hydrateIcons() {
    REGISTRY.forEach(function (m) {
      if (!m.icon) return;
      var apply = function (svg) {
        var host = navList.querySelector('.nav-item[data-id="' + m.id + '"] .ico');
        if (host) host.innerHTML = svg;
      };
      if (iconCache[m.icon]) { apply(iconCache[m.icon]); return; }
      fetch(m.icon).then(function (r) { return r.ok ? r.text() : null; }).then(function (txt) {
        if (txt == null) return;
        txt = txt.trim();
        if (txt.slice(0, 4).toLowerCase() !== '<svg') return; // hanya terima SVG utuh
        iconCache[m.icon] = txt;
        apply(txt);
      }).catch(function () {});
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

  /* ---------- Welcome state ---------- */
  function showWelcome() {
    moduleRoot.innerHTML =
      '<div class="welcome">' +
        '<div>' +
          '<div class="w-mark">Alat Bantu Rekayasa Sipil</div>' +
          '<h1>EDFS Civil Tools</h1>' +
          '<p>Pilih sebuah tool di panel kiri untuk memulai. Setiap tool berjalan mandiri di dalam shell ini dan bisa dipasang sebagai aplikasi (PWA).</p>' +
        '</div>' +
      '</div>';
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
      unmountActive(); activeId = null; highlightNav(null); showWelcome(); return;
    }

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

  /* ---------- Routing ---------- */
  function onHashChange() {
    var id = location.hash.replace(/^#/, '');
    if (!id) { activeId = null; unmountActive(); highlightNav(null); showWelcome(); return; }
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

  /* ---------- Boot ---------- */
  renderNav();
  hydrateIcons();
  initTheme();
  initCollapse();
  initAbout();
  window.addEventListener('hashchange', onHashChange);
  onHashChange(); // buka tool dari hash (deep-link / PWA reopen) atau welcome
})();
