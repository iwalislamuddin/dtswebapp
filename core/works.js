/* ============================================================
   Civil Tools — core/works.js
   Fitur PREMIUM "Simpan Pekerjaan": simpan state input tool ke akun
   (Firestore `users/{uid}/savedWorks`), buka kembali kapan saja &
   lintas perangkat.

   PRINSIP: nol sentuhan ke modules/*. Semua tool sudah menyimpan nilai
   form-nya ke sessionStorage lewat CivilUI.stash (kunci
   `civiltools-state:{toolId}:{suffix}`) — file ini cukup memotret semua
   kunci milik tool aktif, mengirimnya ke cloud, lalu menulisnya kembali
   sebelum shell me-mount ulang tool tersebut. Jadi tool dengan stash
   tambahan (cpt-bearing/cpt-pile 'ta', pile-capacity 'layers') ikut
   tersimpan otomatis tanpa daftar khusus.

   State disimpan sebagai STRING JSON (field `stateJson`), bukan map
   bersarang — menghindari batasan Firestore (array di dalam array) dan
   membuat bentuk dokumen stabil walau schema form sebuah tool berubah.

   Bicara ke Firebase hanya lewat CivilAuth.db() (lihat core/auth.js).

   API publik (window.CivilWorks):
     open()            -> buka panel "Pekerjaan Saya" (lewat gate premium)
     close()
     saveCurrent(name) -> Promise, simpan tool aktif dengan nama tsb
   ============================================================ */
(function () {
  'use strict';

  var PREFIX = 'civiltools-state:';
  var LIMIT = 100;                 // batas wajar daftar pekerjaan
  var loadedWork = null;           // { id, name, toolId } — pekerjaan yang sedang dibuka
  var pendingDelete = null;        // id yang menunggu konfirmasi hapus (klik kedua)

  function UIk() { return window.CivilUI; }
  function CA() { return window.CivilAuth; }
  function toast(msg, kind) { if (UIk()) UIk().toast(msg, kind); }

  /* ---------- Snapshot & restore state tool (sessionStorage) ---------- */
  function stateKeys(toolId) {
    var p = PREFIX + toolId + ':', out = [];
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(p) === 0) out.push(k);
      }
    } catch (e) { /* mode privat */ }
    return out;
  }

  function snapshot(toolId) {
    var p = PREFIX + toolId + ':', st = {};
    stateKeys(toolId).forEach(function (k) {
      try { st[k.slice(p.length)] = sessionStorage.getItem(k); } catch (e) {}
    });
    return st;                     // nilai tetap string JSON mentah — tak perlu parse
  }

  function restoreState(toolId, st) {
    var p = PREFIX + toolId + ':';
    stateKeys(toolId).forEach(function (k) {            // bersihkan state lama tool ini
      try { sessionStorage.removeItem(k); } catch (e) {}
    });
    Object.keys(st || {}).forEach(function (suffix) {
      var v = st[suffix];
      if (typeof v !== 'string') v = JSON.stringify(v);  // toleran bila dokumen lama
      try { sessionStorage.setItem(p + suffix, v); } catch (e) {}
    });
  }

  /* ---------- Gate premium ---------- */
  // Guest -> modal masuk. Sudah masuk tapi belum premium -> modal bridging.
  function requirePremium(intent) {
    var A = CA();
    if (!A || !A.enabled()) { toast('Fitur akun belum aktif', 'bad'); return false; }
    if (!A.getUser()) { A.openLogin(); return false; }
    if (!A.isPremium()) { A.openPaywall({ intent: intent || 'save' }); return false; }
    return true;
  }

  /* ---------- Firestore ---------- */
  function col() {
    var A = CA(), db = A && A.db(), u = A && A.getUser();
    if (!db || !u) return null;
    return db.collection('users').doc(u.uid).collection('savedWorks');
  }

  function stamp() { return firebase.firestore.FieldValue.serverTimestamp(); }

  function friendlyDbError(err) {
    var code = (err && err.code) || '';
    if (code === 'permission-denied') return 'Akses ditolak — pastikan Firestore Rules sudah di-publish.';
    if (code === 'unavailable') return 'Tidak dapat menghubungi server — cek koneksi internet.';
    return (err && err.message) || 'Terjadi kesalahan, coba lagi.';
  }

  function toolName(id) {
    var reg = window.MODULE_REGISTRY || [];
    for (var i = 0; i < reg.length; i++) if (reg[i].id === id) return reg[i].name;
    return id;
  }

  function currentTool() {
    return (window.CivilShell && window.CivilShell.currentId()) || null;
  }

  function saveCurrent(name) {
    var c = col();
    var toolId = currentTool();
    if (!c) return Promise.reject(new Error('Belum masuk'));
    if (!toolId) return Promise.reject(new Error('Buka salah satu tool dulu sebelum menyimpan'));
    var st = snapshot(toolId);
    if (!Object.keys(st).length) return Promise.reject(new Error('Belum ada input pada tool ini untuk disimpan'));
    return c.add({
      toolId: toolId,
      toolName: toolName(toolId),
      name: (name || '').trim() || (toolName(toolId) + ' — tanpa nama'),
      stateJson: JSON.stringify(st),
      createdAt: stamp(),
      updatedAt: stamp()
    });
  }

  function updateWork(workId, toolId) {
    var c = col();
    if (!c) return Promise.reject(new Error('Belum masuk'));
    var st = snapshot(toolId);
    if (!Object.keys(st).length) return Promise.reject(new Error('Belum ada input pada tool ini untuk disimpan'));
    return c.doc(workId).update({ stateJson: JSON.stringify(st), updatedAt: stamp() });
  }

  function listWorks() {
    var c = col();
    if (!c) return Promise.reject(new Error('Belum masuk'));
    return c.orderBy('updatedAt', 'desc').limit(LIMIT).get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) {
        var v = d.data() || {};
        out.push({
          id: d.id, toolId: v.toolId, toolName: v.toolName, name: v.name,
          stateJson: v.stateJson,
          updatedAt: (v.updatedAt && v.updatedAt.toDate) ? v.updatedAt.toDate() : null
        });
      });
      return out;
    });
  }

  function deleteWork(id) {
    var c = col();
    if (!c) return Promise.reject(new Error('Belum masuk'));
    return c.doc(id).delete();
  }

  /* ---------- Buka pekerjaan: tulis state lalu mount ulang tool ---------- */
  function openWork(w) {
    var st;
    try { st = JSON.parse(w.stateJson || '{}'); } catch (e) { st = {}; }
    restoreState(w.toolId, st);
    loadedWork = { id: w.id, name: w.name, toolId: w.toolId };
    if (window.CivilShell) window.CivilShell.openTool(w.toolId, { force: true });
    toast('"' + w.name + '" dibuka', 'info');
  }

  /* ---------- Panel "Pekerjaan Saya" (#works-ov, markup di index.html) ---------- */
  var openImpl = function () {};
  var closeImpl = function () {};

  function fmtDate(d) {
    if (!d) return 'baru saja';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function wire() {
    var ov = document.getElementById('works-ov');
    if (!ov) return;
    var UI = UIk();
    var closeBtn = document.getElementById('works-close');
    var saveBox = document.getElementById('works-save');
    var toolEl = document.getElementById('works-save-tool');
    var nameEl = document.getElementById('works-name');
    var saveBtn = document.getElementById('works-save-btn');
    var updateBtn = document.getElementById('works-update-btn');
    var hintEl = document.getElementById('works-hint');
    var listEl = document.getElementById('works-list');

    function close() { ov.classList.remove('show'); pendingDelete = null; }

    function setHint(msg) {
      if (!hintEl) return;
      hintEl.textContent = msg || '';
      hintEl.hidden = !msg;
    }

    function renderList(works) {
      listEl.innerHTML = '';
      if (!works.length) {
        listEl.appendChild(UI.el('div', 'works-empty',
          'Belum ada pekerjaan tersimpan. Isi salah satu tool, lalu simpan dari panel ini.'));
        return;
      }
      works.forEach(function (w) {
        var row = UI.el('div', 'work-item' + (loadedWork && loadedWork.id === w.id ? ' active' : ''));
        var open = UI.el('button', 'work-open');
        open.type = 'button';
        open.innerHTML = '<span class="work-name"></span><span class="work-meta"></span>';
        open.querySelector('.work-name').textContent = w.name;
        open.querySelector('.work-meta').textContent =
          (w.toolName || toolName(w.toolId)) + ' · ' + fmtDate(w.updatedAt);
        open.addEventListener('click', function () { close(); openWork(w); });

        var del = UI.el('button', 'work-del');
        del.type = 'button';
        del.title = 'Hapus pekerjaan';
        del.textContent = '×';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          if (pendingDelete !== w.id) {          // klik pertama = minta konfirmasi
            pendingDelete = w.id;
            del.textContent = 'Hapus?';
            del.classList.add('confirm');
            return;
          }
          del.disabled = true;
          deleteWork(w.id).then(function () {
            pendingDelete = null;
            if (loadedWork && loadedWork.id === w.id) loadedWork = null;
            toast('Pekerjaan dihapus', 'info');
            refresh();
          }).catch(function (err) {
            del.disabled = false;
            toast(friendlyDbError(err), 'bad');
          });
        });

        row.appendChild(open);
        row.appendChild(del);
        listEl.appendChild(row);
      });
    }

    function syncSaveBox() {
      var toolId = currentTool();
      if (!toolId) {
        saveBox.hidden = true;
        setHint('Sedang di halaman depan — buka salah satu tool untuk menyimpan pekerjaan baru.');
        return;
      }
      saveBox.hidden = false;
      setHint('');
      toolEl.textContent = toolName(toolId);
      nameEl.value = '';
      var canUpdate = loadedWork && loadedWork.toolId === toolId;
      updateBtn.hidden = !canUpdate;
      if (canUpdate) updateBtn.textContent = 'Perbarui "' + loadedWork.name + '"';
    }

    function refresh() {
      listEl.innerHTML = '';
      listEl.appendChild(UI.el('div', 'works-empty', 'Memuat…'));
      listWorks().then(renderList).catch(function (err) {
        listEl.innerHTML = '';
        listEl.appendChild(UI.el('div', 'works-empty', friendlyDbError(err)));
      });
    }

    if (saveBtn) saveBtn.addEventListener('click', function () {
      var toolId = currentTool();
      var nm = (nameEl.value || '').trim() || (toolName(toolId) + ' — tanpa nama');
      saveBtn.disabled = true;
      saveCurrent(nameEl.value).then(function (ref) {
        loadedWork = { id: ref.id, name: nm, toolId: toolId };
        saveBtn.disabled = false;
        toast('Pekerjaan tersimpan', 'info');
        syncSaveBox();
        refresh();
      }).catch(function (err) {
        saveBtn.disabled = false;
        toast(friendlyDbError(err), 'bad');
      });
    });

    if (nameEl) nameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
    });

    if (updateBtn) updateBtn.addEventListener('click', function () {
      if (!loadedWork) return;
      updateBtn.disabled = true;
      updateWork(loadedWork.id, loadedWork.toolId).then(function () {
        updateBtn.disabled = false;
        toast('"' + loadedWork.name + '" diperbarui', 'info');
        refresh();
      }).catch(function (err) {
        updateBtn.disabled = false;
        toast(friendlyDbError(err), 'bad');
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('show')) close();
    });

    openImpl = function () {
      if (!requirePremium('save')) return;
      pendingDelete = null;
      syncSaveBox();
      ov.classList.add('show');
      refresh();
      if (!saveBox.hidden && nameEl) nameEl.focus();
    };
    closeImpl = close;

    // Ganti akun / keluar -> tutup panel & lupakan pekerjaan yang sedang dibuka.
    if (CA()) CA().onChange(function (user) {
      if (!user) { loadedWork = null; close(); }
    });
  }

  /* ---------- Tombol nav "Pekerjaan Saya" ---------- */
  function wireNavButton() {
    var btn = document.getElementById('works-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { openImpl(); });
    // Aksen bintang mengikuti status premium (pola sama dengan acct-btn).
    if (CA()) CA().onChange(function (user, premium) {
      btn.classList.toggle('premium', !!(premium && premium.active));
    });
  }

  window.CivilWorks = {
    open: function () { openImpl(); },
    close: function () { closeImpl(); },
    saveCurrent: saveCurrent
  };

  wire();
  wireNavButton();
})();
