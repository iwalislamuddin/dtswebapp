/* ============================================================
   Civil Tools — core/orbit-controls.js  (Tier 3)
   Kontrol orbit kustom untuk kamera Three.js (r128), di-extract & disederhanakan
   dari pola staad-viewer.html. Lebih stabil daripada contoh OrbitControls bawaan
   dan tanpa dependensi tambahan (Three.js r128 tidak memuat contoh addon via CDN).

   Pakai:
     var ctrl = CivilOrbit.create(camera, domElement, { target:[0,0,0] });
     ctrl.update();     // panggil tiap frame (menerapkan damping)
     ctrl.dispose();    // WAJIB di module.unmount() — lepas semua listener

   Interaksi:
     - Drag kiri            : orbit (rotasi azimuth/polar)
     - Drag kanan / Shift   : pan (geser target)
     - Roda mouse           : dolly (zoom)
     - 1 jari (sentuh)      : orbit
     - 2 jari (sentuh)      : pinch zoom + pan
   ============================================================ */
(function () {
  'use strict';
  var THREE = window.THREE;

  function create(camera, dom, opts) {
    opts = opts || {};
    var target = new THREE.Vector3();
    if (opts.target) target.set(opts.target[0], opts.target[1], opts.target[2]);

    var minDistance = opts.minDistance != null ? opts.minDistance : 0.5;
    var maxDistance = opts.maxDistance != null ? opts.maxDistance : 5000;
    var minPolar = opts.minPolar != null ? opts.minPolar : 0.02;              // hampir dari atas
    var maxPolar = opts.maxPolar != null ? opts.maxPolar : Math.PI - 0.02;    // hampir dari bawah
    var rotSpeed = opts.rotateSpeed != null ? opts.rotateSpeed : 1.0;
    var panSpeed = opts.panSpeed != null ? opts.panSpeed : 1.0;
    var zoomSpeed = opts.zoomSpeed != null ? opts.zoomSpeed : 1.0;
    var damping = opts.damping != null ? opts.damping : 0.12;                 // 0 = tanpa inersia

    // Spherical (radius, phi=polar, theta=azimuth) relatif terhadap target.
    var sph = { radius: 10, phi: Math.PI / 3, theta: Math.PI / 4 };
    var sphDelta = { phi: 0, theta: 0 };
    var panOffset = new THREE.Vector3();
    var scale = 1;

    // Inisialisasi spherical dari posisi kamera saat ini.
    (function initFromCamera() {
      var off = new THREE.Vector3().subVectors(camera.position, target);
      sph.radius = Math.max(minDistance, Math.min(maxDistance, off.length() || 10));
      sph.theta = Math.atan2(off.x, off.z);
      sph.phi = Math.acos(Math.max(-1, Math.min(1, off.y / (sph.radius || 1))));
    })();

    var STATE = { NONE: -1, ROTATE: 0, PAN: 1 };
    var stateNow = STATE.NONE;
    var pointerLast = { x: 0, y: 0 };
    var touches = [];   // { id, x, y }
    var pinchDist = 0;

    function size() {
      var r = dom.getBoundingClientRect();
      return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    }

    /* ---------- gerakan ---------- */
    function rotate(dx, dy) {
      var s = size();
      sphDelta.theta -= 2 * Math.PI * dx / s.h * rotSpeed;   // pakai h agar seragam
      sphDelta.phi   -= 2 * Math.PI * dy / s.h * rotSpeed;
    }
    function pan(dx, dy) {
      var s = size();
      var off = new THREE.Vector3().subVectors(camera.position, target);
      var dist = off.length();
      // panjang layar-ke-dunia pada bidang target (kamera perspektif)
      var fov = (camera.fov || 50) * Math.PI / 180;
      var worldPerPx = 2 * dist * Math.tan(fov / 2) / s.h;
      var mx = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); // sumbu-x kamera
      var my = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); // sumbu-y kamera
      mx.multiplyScalar(-dx * worldPerPx * panSpeed);
      my.multiplyScalar(dy * worldPerPx * panSpeed);
      panOffset.add(mx).add(my);
    }
    function dolly(factor) { scale *= factor; }

    /* ---------- mouse ---------- */
    function onDown(e) {
      if (e.button === 2 || e.shiftKey) stateNow = STATE.PAN;
      else stateNow = STATE.ROTATE;
      pointerLast.x = e.clientX; pointerLast.y = e.clientY;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    }
    function onMove(e) {
      var dx = e.clientX - pointerLast.x, dy = e.clientY - pointerLast.y;
      pointerLast.x = e.clientX; pointerLast.y = e.clientY;
      if (stateNow === STATE.ROTATE) rotate(dx, dy);
      else if (stateNow === STATE.PAN) pan(dx, dy);
    }
    function onUp() {
      stateNow = STATE.NONE;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    function onWheel(e) {
      e.preventDefault();
      var f = Math.pow(0.95, zoomSpeed);
      if (e.deltaY < 0) dolly(f); else dolly(1 / f);
    }
    function onCtx(e) { e.preventDefault(); }   // matikan menu klik-kanan → pan

    /* ---------- sentuh ---------- */
    function copyTouches(e) {
      touches = [];
      for (var i = 0; i < e.touches.length; i++)
        touches.push({ x: e.touches[i].clientX, y: e.touches[i].clientY });
    }
    function onTouchStart(e) {
      copyTouches(e);
      if (touches.length === 2) {
        var dx = touches[0].x - touches[1].x, dy = touches[0].y - touches[1].y;
        pinchDist = Math.sqrt(dx * dx + dy * dy);
      }
      e.preventDefault();
    }
    function onTouchMove(e) {
      if (e.touches.length === 1 && touches.length >= 1) {
        var dx = e.touches[0].clientX - touches[0].x, dy = e.touches[0].clientY - touches[0].y;
        rotate(dx, dy);
      } else if (e.touches.length === 2 && touches.length === 2) {
        var ax = e.touches[0].clientX - e.touches[1].clientX;
        var ay = e.touches[0].clientY - e.touches[1].clientY;
        var d = Math.sqrt(ax * ax + ay * ay);
        if (pinchDist > 0) dolly(pinchDist / d);
        pinchDist = d;
        // pan dari pergerakan titik-tengah dua jari
        var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        var pcx = (touches[0].x + touches[1].x) / 2, pcy = (touches[0].y + touches[1].y) / 2;
        pan(cx - pcx, cy - pcy);
      }
      copyTouches(e);
      e.preventDefault();
    }
    function onTouchEnd(e) { copyTouches(e); pinchDist = 0; }

    dom.addEventListener('mousedown', onDown);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onCtx);
    dom.addEventListener('touchstart', onTouchStart, { passive: false });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);

    /* ---------- update per frame ---------- */
    var api = {
      target: target,
      update: function () {
        sph.theta += sphDelta.theta;
        sph.phi += sphDelta.phi;
        sph.phi = Math.max(minPolar, Math.min(maxPolar, sph.phi));
        sph.radius *= scale;
        sph.radius = Math.max(minDistance, Math.min(maxDistance, sph.radius));

        target.add(panOffset);

        var sinPhi = Math.sin(sph.phi);
        camera.position.set(
          target.x + sph.radius * sinPhi * Math.sin(sph.theta),
          target.y + sph.radius * Math.cos(sph.phi),
          target.z + sph.radius * sinPhi * Math.cos(sph.theta)
        );
        camera.lookAt(target);

        // damping (inersia) — sisakan sebagian delta untuk frame berikutnya
        if (damping > 0) {
          sphDelta.theta *= (1 - damping);
          sphDelta.phi *= (1 - damping);
          panOffset.multiplyScalar(1 - damping);
        } else {
          sphDelta.theta = 0; sphDelta.phi = 0; panOffset.set(0, 0, 0);
        }
        scale = 1;
      },
      // Set target & jarak, lalu terapkan segera (mis. auto-fit setelah geometri berubah).
      setView: function (t, radius) {
        if (t) target.set(t[0], t[1], t[2]);
        if (radius != null) sph.radius = Math.max(minDistance, Math.min(maxDistance, radius));
        this.update();
      },
      dispose: function () {
        dom.removeEventListener('mousedown', onDown);
        dom.removeEventListener('wheel', onWheel);
        dom.removeEventListener('contextmenu', onCtx);
        dom.removeEventListener('touchstart', onTouchStart);
        dom.removeEventListener('touchmove', onTouchMove);
        dom.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
    };
    return api;
  }

  window.CivilOrbit = { create: create };
})();
