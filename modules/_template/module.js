/* ============================================================
   Civil Tools — modules/_template/module.js
   Starter kit. Copy folder ini untuk bikin module baru.
   Kontrak WAJIB: window.CivilModules[id] = { meta, mount, unmount }
   ============================================================ */
(function () {
  'use strict';
  window.CivilModules = window.CivilModules || {};

  var ID = '_template';
  var state = {};   // simpan referensi internal untuk dibersihkan di unmount()

  window.CivilModules[ID] = {
    meta: { id: ID, name: 'Template Demo', category: 'Dev', needsRenderer: false },

    // container: elemen DOM kosong dari shell
    // runtime: { THREE, UI, getRenderer }
    mount: function (container, runtime) {
      var UI = runtime.UI;
      container.innerHTML =
        '<div class="welcome"><div>' +
          '<div class="w-mark">Module Template</div>' +
          '<h1>Hello, module 👋</h1>' +
          '<p>Kontrak mount/unmount berjalan. Duplikat folder <code>_template</code>, ' +
          'ganti ID, isi <code>mount()</code> dengan form + hasil pakai <code>runtime.UI</code>.</p>' +
        '</div></div>';

      // contoh listener yang harus dibersihkan saat unmount
      state.onResize = function () { /* no-op demo */ };
      window.addEventListener('resize', state.onResize);
      if (UI) UI.toast('Template dimuat', 'info');
    },

    unmount: function () {
      // WAJIB: hapus listener, batalkan rAF, dispose Three.js, kosongkan container
      if (state.onResize) window.removeEventListener('resize', state.onResize);
      state = {};
    }
  };
})();
