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
    getRenderer: function () { return null; }
  };

  /* ---------- Render nav (grouped by kategori, urutan sesuai registry) ---------- */
  function renderNav() {
    navList.innerHTML = '';
    var cats = [];
    var byCat = {};
    REGISTRY.forEach(function (m) {
      if (!byCat[m.category]) { byCat[m.category] = []; cats.push(m.category); }
      byCat[m.category].push(m);
    });
    cats.forEach(function (cat) {
      navList.appendChild(UI.el('div', 'nav-cat', cat));
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
        navList.appendChild(btn);
      });
    });
  }

  function iconMarkup() {
    // ikon generik (module boleh punya icon.svg sendiri; di-load opsional nanti)
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/></svg>';
  }

  function highlightNav(id) {
    Array.prototype.forEach.call(navList.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('active', b.dataset.id === id);
    });
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

  /* ---------- Theme toggle ---------- */
  function initTheme() {
    var saved = localStorage.getItem('civiltools-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    var btn = document.getElementById('theme-toggle');
    function syncLabel() {
      if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀ Tema' : '☾ Tema';
    }
    syncLabel();
    if (btn) btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('civiltools-theme', next);
      btn.textContent = next === 'light' ? '☀ Tema' : '☾ Tema';
    });
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
  initTheme();
  initCollapse();
  initAbout();
  window.addEventListener('hashchange', onHashChange);
  onHashChange(); // buka tool dari hash (deep-link / PWA reopen) atau welcome
})();
