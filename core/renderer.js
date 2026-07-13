/* ============================================================
   Civil Tools — core/renderer.js  (Tier 3)
   Factory THREE.WebGLRenderer BERSAMA (satu konteks WebGL untuk seluruh app).
   Satu <canvas> dipindah-pindah antar container tool 3D — mencegah kebocoran
   konteks WebGL saat berganti tool (browser membatasi jumlah konteks aktif).

   Diakses module lewat runtime.getRenderer() (shell menyambungkan ke sini).

   Pola pemakaian di module 3D:
     var R = runtime.getRenderer();          // lazy-init sekali; null bila WebGL gagal
     R.mount(viewportEl);                     // pindahkan canvas ke viewport + amati resize
     R.onResize = function (w, h) { ... };    // module perbarui camera.aspect di sini
     R.start(function () {                     // loop rAF; module render scene-nya sendiri
       controls.update();
       R.renderer.render(scene, camera);
     });
     ...
     // di unmount():
     R.stop(); R.unmount();                   // hentikan loop + copot canvas (renderer TETAP hidup)

   Renderer & konteks TIDAK di-dispose saat pindah tool — hanya scene/geometry/
   material milik module yang wajib di-dispose (pakai runtime.UI.disposeObject).
   ============================================================ */
(function () {
  'use strict';
  var THREE = window.THREE;
  var shared = null;   // controller singleton

  function build() {
    if (!THREE || !THREE.WebGLRenderer) return null;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      console.error('WebGL tidak tersedia:', e);
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;

    var canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';   // biar orbit-controls kelola gestur sentuh

    var host = null;          // container tool aktif
    var ro = null;            // ResizeObserver
    var rafId = 0;
    var frameFn = null;

    function applySize() {
      if (!host) return;
      var r = host.getBoundingClientRect();
      var w = Math.max(1, Math.floor(r.width));
      var h = Math.max(1, Math.floor(r.height));
      renderer.setSize(w, h, false);     // false = jangan set style (kita pakai 100%)
      if (ctrl.onResize) ctrl.onResize(w, h);
    }

    var ctrl = {
      renderer: renderer,
      canvas: canvas,
      onResize: null,

      // Pindahkan canvas ke viewport tool aktif + mulai amati resize.
      mount: function (container) {
        host = container;
        container.appendChild(canvas);
        if (typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(applySize);
          ro.observe(container);
        } else {
          window.addEventListener('resize', applySize);
        }
        applySize();
      },

      // Copot canvas dari viewport (dipanggil di module.unmount). Renderer tetap hidup.
      unmount: function () {
        this.stop();
        if (ro) { ro.disconnect(); ro = null; }
        else window.removeEventListener('resize', applySize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host = null;
        this.onResize = null;
      },

      // Loop rAF. frameFn dipanggil tiap frame (module update controls + render).
      start: function (fn) {
        frameFn = fn;
        var loop = function () {
          rafId = requestAnimationFrame(loop);
          if (frameFn) frameFn();
        };
        if (!rafId) rafId = requestAnimationFrame(loop);
      },
      stop: function () {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        frameFn = null;
      },
      resize: applySize   // manual, mis. setelah viewport berubah ukuran secara eksplisit
    };
    return ctrl;
  }

  // Lazy singleton — dibangun saat tool 3D pertama meminta. null bila WebGL gagal.
  function get() {
    if (shared === null) shared = build();
    return shared;
  }

  window.CivilRenderer = { get: get };
})();
