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
  function buildForm(container, schema, onChange) {
    var fields = {};      // id -> { get, set, type }
    var root = el('div', 'ck-form');
    var curGroup = null;

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
        inp.value = (item.value !== undefined) ? item.value : '';
        inp.addEventListener('input', function () { emit(item.id); });
        wrap.appendChild(inp);
        fields[item.id] = { type: 'number', get: function () { return parseFloat(inp.value); }, set: function (v) { inp.value = v; }, node: inp };

      } else if (item.type === 'select') {
        var sel = el('select', 'ck-select');
        item.options.forEach(function (o) {
          var opt = el('option');
          opt.value = o.value; opt.textContent = o.label;
          if (String(o.value) === String(item.value)) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () { emit(item.id); });
        wrap.appendChild(sel);
        fields[item.id] = { type: 'select', get: function () { return sel.value; }, set: function (v) { sel.value = v; }, node: sel };

      } else if (item.type === 'segment') {
        var seg = el('div', 'ck-seg');
        var val = { v: item.value !== undefined ? item.value : (item.options[0] && item.options[0].value) };
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
    function emit(id) { if (onChange) onChange(getValues(), id); }

    return {
      root: root,
      fields: fields,
      getValues: getValues,
      setValue: function (id, v) { if (fields[id]) { fields[id].set(v); } }
    };
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

  window.CivilUI = {
    toast: toast,
    roundRect: roundRect,
    disposeObject: disposeObject,
    fmt: fmt,
    el: el,
    buildForm: buildForm,
    hero: hero,
    kv: kv,
    rhead: rhead,
    note: note
  };
})();
