/* ============================================================
   Civil Tools — core/canvas2d.js  (Tier 2)
   Helper kanvas 2D interaktif untuk tool non-3D.
   Mengurus: hi-DPI (devicePixelRatio), auto-resize (ResizeObserver),
   redraw ter-batch (rAF), dan pembersihan (destroy).

   Pakai:
     var h = CivilCanvas2D.create(containerEl, function(ctx, w, h){ ... });
     h.redraw();           // gambar ulang (mis. setelah input berubah)
     h.canvas;             // elemen <canvas> (untuk attach listener sendiri)
     h.destroy();          // WAJIB dipanggil di module.unmount()
   ============================================================ */
(function () {
  'use strict';

  function create(container, drawFn, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var cssW = 0, cssH = 0, dpr = 1;
    var destroyed = false;

    function resizeToContainer() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      var rect = container.getBoundingClientRect();
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      draw();
    }

    function draw() {
      if (destroyed) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // gambar dalam satuan CSS px
      ctx.clearRect(0, 0, cssW, cssH);
      if (drawFn) drawFn(ctx, cssW, cssH);
    }

    function redraw() {
      // Gambar sinkron — tidak bergantung rAF (yang di-throttle di tab background).
      if (destroyed) return;
      draw();
    }

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resizeToContainer);
      ro.observe(container);
    } else {
      window.addEventListener('resize', resizeToContainer);
    }

    // Repaint otomatis saat tema light/dark berganti (drawFn baca CSS var live)
    var mo = null;
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(function () { draw(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // init
    resizeToContainer();

    return {
      canvas: canvas,
      ctx: ctx,
      get width() { return cssW; },
      get height() { return cssH; },
      redraw: redraw,
      destroy: function () {
        destroyed = true;
        if (ro) ro.disconnect();
        else window.removeEventListener('resize', resizeToContainer);
        if (mo) mo.disconnect();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.CivilCanvas2D = { create: create };
})();
