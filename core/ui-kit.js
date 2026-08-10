/* ============================================================
   Civil Tools — core/ui-kit.js
   Helper UI reusable dipakai bersama semua module.
   Diekspos sebagai global window.CivilUI (zero build, no import).
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Toast ---------- */
  function toast(msg, kind) {
    // kind: undefined (success/green) | 'info' (amber) | 'bad' (red)
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = kind ? kind : ''; }, 2600);
  }

  /* ---------- Canvas rounded-rect (dari staad-viewer, dipakai label 3D) ---------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------- Dispose Three.js object tree (cegah bocor WebGL) ---------- */
  function disposeObject(o) {
    if (!o || !o.traverse) return;
    o.traverse(function (c) {
      if (c.geometry && c.geometry.dispose) c.geometry.dispose();
      if (c.material) {
        var mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function (m) {
          if (m.map && m.map.dispose) m.map.dispose();
          if (m.dispose) m.dispose();
        });
      }
    });
  }

  /* ============================================================
     PERSISTENSI INPUT PER TOOL (sessionStorage)
     Nilai input terakhir tiap tool disimpan sementara agar saat pengguna
     kembali ke tool yang sama (dalam satu sesi tab) form menampilkan nilai
     terakhir yang diedit, bukan default. Scope = id tool aktif, di-set shell
     (window.CivilStateScope) sebelum mount(). buildForm memakai suffix 'form'
     otomatis; module dengan input kustom (textarea CPT, tabel lapis tanah)
     pakai CivilUI.stash.load/save dengan suffix sendiri.
     ============================================================ */
  function stateKey(suffix) {
    var scope = window.CivilStateScope;
    return scope ? 'civiltools-state:' + scope + ':' + (suffix || 'x') : null;
  }
  function stashLoad(suffix) {
    var k = stateKey(suffix); if (!k) return null;
    try { var raw = sessionStorage.getItem(k); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }   // mode privat / data korup → abaikan
  }
  function stashSave(suffix, obj) {
    var k = stateKey(suffix); if (!k) return;
    try { sessionStorage.setItem(k, JSON.stringify(obj)); } catch (e) {}
  }

  /* ---------- Number helpers ---------- */
  function fmt(n, dp) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    dp = (dp === undefined) ? 2 : dp;
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /* ============================================================
     FORM GENERATOR
     buildForm(container, schema, onChange) -> { getValues, setValue, fields, root }

     schema: array of items. Item.type:
       'group'   -> { type:'group', label }            (section header)
       'number'  -> { type:'number', id, label, unit, value, min, max, step, hint }
       'select'  -> { type:'select', id, label, options:[{value,label}], value }
       'segment' -> { type:'segment', id, label, options:[{value,label}], value }
     onChange(values, changedId) dipanggil tiap input berubah (live calc).
     ============================================================ */
  function buildForm(container, schema, onChange, formId) {
    var fields = {};      // id -> { get, set, type }
    var root = el('div', 'ck-form');
    var curGroup = null;
    // Nilai tersimpan dari kunjungan terakhir ke tool ini (scope di-set shell).
    var saved = stashLoad('form') || {};
    function savedValid(id, opts) {
      var v = saved[id];
      if (v === undefined || v === null) return false;
      if (opts) return opts.some(function (o) { return String(o.value) === String(v); });
      return isFinite(v);
    }

    schema.forEach(function (item) {
      if (item.type === 'group') {
        curGroup = el('div', 'ck-grp');
        curGroup.appendChild(el('h4', null, item.label));
        root.appendChild(curGroup);
        return;
      }
      var host = curGroup || root;
      var wrap = el('div', 'ck-field');
      if (item.label) {
        var lab = el('label', null, item.label + (item.unit ? ' <span class="unit">(' + item.unit + ')</span>' : ''));
        wrap.appendChild(lab);
      }

      if (item.type === 'number') {
        var inp = el('input', 'ck-input');
        inp.type = 'number';
        if (item.min !== undefined) inp.min = item.min;
        if (item.max !== undefined) inp.max = item.max;
        inp.step = (item.step !== undefined) ? item.step : 'any';
        inp.value = savedValid(item.id) ? saved[item.id] : ((item.value !== undefined) ? item.value : '');
        inp.addEventListener('input', function () { emit(item.id); });
        wrap.appendChild(inp);
        fields[item.id] = { type: 'number', get: function () { return parseFloat(inp.value); }, set: function (v) { inp.value = v; }, node: inp };

      } else if (item.type === 'select') {
        var sel = el('select', 'ck-select');
        var selInit = savedValid(item.id, item.options) ? saved[item.id] : item.value;
        item.options.forEach(function (o) {
          var opt = el('option');
          opt.value = o.value; opt.textContent = o.label;
          if (String(o.value) === String(selInit)) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () { emit(item.id); });
        wrap.appendChild(sel);
        fields[item.id] = { type: 'select', get: function () { return sel.value; }, set: function (v) { sel.value = v; }, node: sel };

      } else if (item.type === 'segment') {
        var seg = el('div', 'ck-seg');
        var val = { v: savedValid(item.id, item.options) ? saved[item.id]
          : (item.value !== undefined ? item.value : (item.options[0] && item.options[0].value)) };
        item.options.forEach(function (o) {
          var b = el('button', String(o.value) === String(val.v) ? 'active' : null, o.label);
          b.type = 'button';
          b.addEventListener('click', function () {
            val.v = o.value;
            Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('active'); });
            b.classList.add('active');
            emit(item.id);
          });
          seg.appendChild(b);
        });
        wrap.appendChild(seg);
        fields[item.id] = { type: 'segment', get: function () { return val.v; }, set: function (v) {
          val.v = v;
          Array.prototype.forEach.call(seg.children, function (c, i) {
            c.classList.toggle('active', String(item.options[i].value) === String(v));
          });
        }, node: seg };
      }

      if (item.hint) wrap.appendChild(el('div', 'ck-field-hint', item.hint));
      host.appendChild(wrap);
    });

    container.appendChild(root);

    function getValues() {
      var out = {};
      Object.keys(fields).forEach(function (id) { out[id] = fields[id].get(); });
      return out;
    }
    // Simpan SETELAH onChange agar field yang di-set module di dalam handler
    // (mis. grade → Fy) ikut terekam konsisten.
    function persist() { stashSave('form', getValues()); }
    function emit(id) { if (onChange) onChange(getValues(), id); persist(); }

    var api = {
      root: root,
      fields: fields,
      getValues: getValues,
      // Nilai tersimpan mentah — dipakai module utk memulihkan field yang
      // opsinya diisi dinamis setelah buildForm (mis. ukuran profil baja).
      saved: saved,
      // Terapkan ulang nilai tersimpan utk satu field (aman: select/segment
      // hanya bila opsinya ada). Panggil setelah module mengisi ulang opsi.
      restore: function (id) {
        var f = fields[id];
        if (!f || saved[id] === undefined || saved[id] === null) return;
        if (f.type === 'select') {
          var s = String(saved[id]);
          var ok = Array.prototype.some.call(f.node.options, function (o) { return o.value === s; });
          if (ok) f.node.value = s;
        } else { f.set(saved[id]); }
      },
      setValue: function (id, v) { if (fields[id]) { fields[id].set(v); } },
      // Isi beberapa field sekaligus lalu picu hitung-ulang (dipakai handoff "kirim ke tool lain").
      applyInputs: function (obj) {
        Object.keys(obj).forEach(function (id) { if (fields[id]) fields[id].set(obj[id]); });
        if (onChange) onChange(getValues(), '__handoff__');
        persist();
      }
    };
    // Modul penerima handoff memanggil buildForm dengan formId → shell bisa isi input via window.CivilForms[id].
    if (formId) { window.CivilForms = window.CivilForms || {}; window.CivilForms[formId] = api; }
    return api;
  }

  /* ============================================================
     RESULT HELPERS — bikin panel hasil konsisten antar tool
     ============================================================ */
  function hero(label, value, unit) {
    var h = el('div', 'ck-hero');
    h.appendChild(el('div', 'k', label));
    h.appendChild(el('div', 'v', value + (unit ? ' <small>' + unit + '</small>' : '')));
    return h;
  }
  // heroRow(items) -> baris 2–3 kartu hero sejajar. Kartu pertama = utama (amber),
  // kartu berikutnya = pendukung (muted). Tiap item: {label, value, unit?, tone?, sub?}
  //   tone: 'ok' | 'bad'  -> warnai nilai
  //   sub : true|false    -> paksa gaya utama/muted (default: index>0 = muted)
  function heroRow(items) {
    items = items || [];
    var row = el('div', 'ck-hero-row');
    items.forEach(function (it, i) {
      if (!it) return;
      var sub = (it.sub !== undefined) ? it.sub : (i > 0);
      var h = el('div', 'ck-hero' + (sub ? ' sub' : ''));
      h.appendChild(el('div', 'k', it.label));
      h.appendChild(el('div', 'v' + (it.tone ? ' ' + it.tone : ''),
        it.value + (it.unit ? ' <small>' + it.unit + '</small>' : '')));
      row.appendChild(h);
    });
    return row;
  }
  function kv(k, v, state) {
    var row = el('div', 'ck-kv');
    row.appendChild(el('span', 'k', k));
    row.appendChild(el('span', 'v' + (state ? ' ' + state : ''), v));
    return row;
  }
  function rhead(text) { return el('div', 'ck-rhead', text); }
  function note(title, html) {
    var n = el('div', 'ck-note');
    if (title) n.appendChild(el('b', null, title));
    n.appendChild(el('div', null, html));
    return n;
  }

  /* ============================================================
     KANVAS — helper judul & tooltip SERAGAM (cegah tumpukan teks)

     Standar konsisten antar tool kanvas 2D:
       1. canvasCap(host) -> label judul HTML di pojok kiri-atas kanvas.
          PENDEK & DINAMIS (panggil .set(teks) tiap state). Ini SATU-SATUNYA
          teks di pita atas — modul TIDAK menggambar judul/readout lain di sana.
       2. canvasTip(ctx, opts) -> pill hover ber-posisi AMAN otomatis:
          turun ke bawah kursor bila dekat atas (hindari pita judul),
          clamp ke tepi kanvas. Semua tool memakai ini, bukan pill sendiri.
     ============================================================ */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function canvasCap(host, initialText) {
    var node = el('div', 'cap', undefined);
    node.textContent = initialText || '';
    host.appendChild(node);
    return { el: node, set: function (t) { node.textContent = t == null ? '' : t; } };
  }

  // opts: { mx, my, w, h, text, topBand?, bg?, fg?, font? }
  function canvasTip(ctx, o) {
    if (!o || o.text == null || o.text === '') return;
    var band = (o.topBand != null) ? o.topBand : 30;   // pita judul yang direservasi (px)
    ctx.save();
    ctx.font = o.font || '11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'alphabetic';
    var tw = ctx.measureText(o.text).width;
    var bx = Math.min(Math.max(o.mx + 12, 8), Math.max(8, o.w - tw - 20));
    // dekat atas -> di bawah kursor; selain itu -> di atas kursor
    var by = (o.my < band + 18) ? o.my + 28 : o.my - 12;
    by = Math.max(band + 14, Math.min(by, o.h - 10));
    ctx.fillStyle = o.bg || cssVar('--amber');
    roundRect(ctx, bx - 6, by - 13, tw + 12, 20, 5); ctx.fill();
    ctx.fillStyle = o.fg || cssVar('--bg');
    ctx.textAlign = 'left';
    ctx.fillText(o.text, bx, by + 1);
    ctx.restore();
  }

  /* ============================================================
     SLIDER SKALA DEFORMASI — overlay kanvas reusable
     Semua tool berdiagram deformasi memakai slider ini agar besar
     tampilan tak bergantung auto-scale ekstrim. Kontrak seragam:
       - tool simpan state.deformPct (persen dimensi model, default 4)
       - drawDeform pakai target = (deformPct/100)·dimModel, mag=target/dmax
       - slider hanya tampil di mode 'Deformasi' (tool panggil .show(bool))
       - drawDeform panggil .setReadout('×N') tiap gambar.
     ============================================================ */
  function injectDefStyle() {
    if (document.getElementById('ck-defslider-style')) return;
    var s = document.createElement('style'); s.id = 'ck-defslider-style';
    s.textContent =
      '.ck-defslider{position:absolute;right:12px;top:46px;z-index:4;display:flex;align-items:center;gap:8px;' +
        'background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:5px 10px;' +
        'font:600 11px "Space Grotesk",sans-serif;color:var(--ink-dim);box-shadow:0 2px 6px rgba(0,0,0,.12)}' +
      '.ck-defslider input[type=range]{width:110px;accent-color:var(--amber);cursor:pointer;margin:0}' +
      '.ck-defslider-val{font:600 11px "JetBrains Mono",monospace;color:var(--ink);min-width:44px;text-align:right}';
    document.head.appendChild(s);
  }
  // deformSlider(host, { value?, min?, max?, step?, label?, onInput(v) }) -> control
  function deformSlider(host, opts) {
    opts = opts || {};
    injectDefStyle();
    var min = opts.min != null ? opts.min : 0.5;
    var max = opts.max != null ? opts.max : 20;
    var step = opts.step != null ? opts.step : 0.5;
    var val = opts.value != null ? opts.value : 4;
    var wrap = el('div', 'ck-defslider');
    var lab = el('span', 'ck-defslider-lab', opts.label || 'Skala');
    var input = el('input'); input.type = 'range';
    input.min = min; input.max = max; input.step = step; input.value = val;
    input.title = 'Skala perbesaran deformasi (% dimensi model)';
    var read = el('span', 'ck-defslider-val', '');
    wrap.appendChild(lab); wrap.appendChild(input); wrap.appendChild(read);
    input.addEventListener('input', function () { if (opts.onInput) opts.onInput(parseFloat(input.value)); });
    host.appendChild(wrap);
    return {
      el: wrap,
      get: function () { return parseFloat(input.value); },
      set: function (v) { input.value = v; },
      setReadout: function (t) { read.textContent = t == null ? '' : t; },
      show: function (b) { wrap.style.display = b ? '' : 'none'; }
    };
  }

  window.CivilUI = {
    toast: toast,
    deformSlider: deformSlider,
    stash: { load: stashLoad, save: stashSave },
    roundRect: roundRect,
    disposeObject: disposeObject,
    fmt: fmt,
    el: el,
    buildForm: buildForm,
    hero: hero,
    heroRow: heroRow,
    kv: kv,
    rhead: rhead,
    note: note,
    canvasCap: canvasCap,
    canvasTip: canvasTip
  };
})();
