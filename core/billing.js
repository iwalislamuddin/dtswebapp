/* ============================================================
   Civil Tools — core/billing.js
   Berlangganan Premium via Midtrans Snap (popup embedded).

   ALUR (uang & status premium TIDAK PERNAH ditentukan browser):
     1. Pengguna pilih paket -> browser panggil Cloud Function
        `createSnapTransaction` (callable, butuh login) dengan planId saja.
     2. Function melihat harga paket dari tabel di SERVER, membuat dokumen
        `orders/{orderId}` (status 'pending'), lalu meminta Snap token ke
        Midtrans memakai SERVER KEY yang tak pernah sampai ke browser.
     3. Browser membuka popup Snap dengan token itu.
     4. Setelah dibayar, Midtrans memanggil webhook `midtransWebhook`;
        function memverifikasi signature, menandai order 'paid', dan
        memperpanjang `users/{uid}.premium` (satu-satunya penulis field itu).
     5. Browser tahu premium aktif lewat listener Firestore di core/auth.js
        — tidak ada polling, tidak ada status premium yang dipercaya dari
        sisi klien.

   Harga di file ini HANYA untuk tampilan. Sumber kebenaran ada di
   functions/index.js (PLANS) — keduanya harus diubah bersamaan.

   API publik (window.CivilBilling):
     enabled()        -> bool (config Midtrans sudah diisi & CivilAuth aktif)
     openPlans(intent)-> buka modal paket ('pdf' | 'save', memengaruhi teks)
     closePlans()
     plans            -> daftar paket (tampilan)
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.MIDTRANS_CONFIG || {};
  var configured = !!(CFG.clientKey && !/^GANTI/.test(CFG.clientKey));
  var REGION = 'asia-southeast2';           // sama dengan region deploy functions

  // Tampilan paket — harga WAJIB sama dengan PLANS di functions/index.js.
  var PLANS = [
    { id: 'p1',  months: 1,  label: '1 Bulan',   price: 14000,  note: null },
    { id: 'p3',  months: 3,  label: '3 Bulan',   price: 39000,  note: 'Hemat 7%' },
    { id: 'p12', months: 12, label: '12 Bulan',  price: 129000, note: 'Hemat 23%', best: true }
  ];

  var snapLoading = null;                    // Promise pemuatan snap.js (sekali saja)
  var busy = false;
  var awaitingPayment = false;               // true setelah popup Snap selesai dibayar
  var expiryAtOpen = null;                   // masa aktif saat modal dibuka (ms) — pembanding

  function UIk() { return window.CivilUI; }
  function CA() { return window.CivilAuth; }
  function toast(msg, kind) { if (UIk()) UIk().toast(msg, kind); }

  function rupiah(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

  function expiryMs() {
    var A = CA(), p = A && A.getPremium && A.getPremium();
    var e = p && p.expiresAt;
    return (e && e.getTime) ? e.getTime() : 0;
  }

  function tanggal(d) {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function enabled() {
    var A = CA();
    return !!(configured && A && A.enabled());
  }

  /* ---------- Muat snap.js saat dibutuhkan (bukan di setiap kunjungan) ---------- */
  function loadSnap() {
    if (window.snap) return Promise.resolve();
    if (snapLoading) return snapLoading;
    snapLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CFG.production
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js';
      s.setAttribute('data-client-key', CFG.clientKey);
      s.onload = resolve;
      s.onerror = function () { snapLoading = null; reject(new Error('Gagal memuat Midtrans Snap')); };
      document.head.appendChild(s);
    });
    return snapLoading;
  }

  /* ---------- Panggil Cloud Function ---------- */
  function createTransaction(planId) {
    if (typeof firebase === 'undefined' || !firebase.app().functions) {
      return Promise.reject(new Error('SDK Cloud Functions belum dimuat'));
    }
    var fn = firebase.app().functions(REGION).httpsCallable('createSnapTransaction');
    return fn({ planId: planId }).then(function (res) { return res.data; });
  }

  function friendlyFnError(err) {
    var code = (err && err.code) || '';
    if (code === 'functions/unauthenticated') return 'Sesi berakhir — masuk lagi lalu ulangi.';
    if (code === 'functions/not-found') return 'Layanan pembayaran belum di-deploy.';
    if (code === 'functions/internal') return 'Gagal membuat transaksi — coba lagi beberapa saat.';
    return (err && err.message) || 'Gagal memproses pembayaran.';
  }

  /* ---------- Modal paket (#sub-ov, markup di index.html) ---------- */
  var openImpl = function () {};
  var closeImpl = function () {};

  function wire() {
    var ov = document.getElementById('sub-ov');
    if (!ov) return;
    var UI = UIk();
    var closeBtn = document.getElementById('sub-close');
    var msgEl = document.getElementById('sub-msg');
    var listEl = document.getElementById('sub-plans');
    var statusEl = document.getElementById('sub-status');

    function close() { ov.classList.remove('show'); }

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.hidden = !msg;
      statusEl.classList.toggle('bad', kind === 'bad');
    }

    function setBusy(b) {
      busy = b;
      Array.prototype.forEach.call(listEl.querySelectorAll('button'), function (btn) { btn.disabled = b; });
    }

    function checkout(plan) {
      if (busy) return;
      setBusy(true);
      setStatus('Menyiapkan pembayaran…');
      Promise.all([loadSnap(), createTransaction(plan.id)]).then(function (r) {
        var data = r[1] || {};
        if (!data.token) throw new Error('Token pembayaran tidak diterima');
        setStatus('Menunggu pembayaran di jendela Midtrans…');
        window.snap.pay(data.token, {
          onSuccess: function () {
            setBusy(false);
            awaitingPayment = true;
            setStatus('Pembayaran diterima — mengaktifkan Premium…');
            // Aktivasi dilakukan webhook di server; listener Firestore di
            // core/auth.js yang akan memberi tahu saat premium menyala.
          },
          onPending: function () {
            setBusy(false);
            awaitingPayment = true;
            setStatus('Pembayaran belum selesai — Premium aktif otomatis begitu pembayaran terkonfirmasi.');
          },
          onError: function () {
            setBusy(false);
            setStatus('Pembayaran gagal — tidak ada dana yang terpotong.', 'bad');
          },
          onClose: function () {
            setBusy(false);
            setStatus('Jendela pembayaran ditutup sebelum selesai.');
          }
        });
      }).catch(function (err) {
        setBusy(false);
        setStatus(friendlyFnError(err), 'bad');
        console.error('Checkout gagal:', err);
      });
    }

    function renderPlans() {
      listEl.innerHTML = '';
      PLANS.forEach(function (plan) {
        var card = UI.el('button', 'sub-plan' + (plan.best ? ' best' : ''));
        card.type = 'button';
        var perMonth = Math.round(plan.price / plan.months);
        card.innerHTML =
          '<span class="sp-dur"></span>' +
          '<span class="sp-price"></span>' +
          '<span class="sp-per"></span>' +
          (plan.note ? '<span class="sp-note"></span>' : '');
        card.querySelector('.sp-dur').textContent = plan.label;
        card.querySelector('.sp-price').textContent = rupiah(plan.price);
        card.querySelector('.sp-per').textContent = rupiah(perMonth) + ' / bulan';
        if (plan.note) card.querySelector('.sp-note').textContent = plan.note;
        card.addEventListener('click', function () { checkout(plan); });
        listEl.appendChild(card);
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('show')) close();
    });

    openImpl = function (intent) {
      var A = CA();
      if (!A || !A.enabled()) { toast('Fitur akun belum aktif', 'bad'); return; }
      if (!A.getUser()) { A.openLogin(); return; }
      if (!configured) {
        toast('Pembayaran belum dikonfigurasi', 'bad');
        return;
      }
      // Sudah premium tetap boleh membeli — itu PERPANJANGAN. Server menambahkan
      // masa baru dari sisa yang ada (lihat midtransWebhook), jadi tidak ada
      // hari yang hangus. Tanpa jalur ini, pelanggan aktif tak punya cara
      // memperpanjang sebelum masa berlakunya habis.
      var p = A.getPremium();
      var aktif = A.isPremium() && p && p.expiresAt;
      if (msgEl) {
        msgEl.textContent = aktif
          ? 'Premium Anda aktif sampai ' + tanggal(p.expiresAt) + '. Paket yang dibeli sekarang ' +
            'ditambahkan dari tanggal itu — tidak ada sisa hari yang hangus.'
          : (intent === 'save'
            ? 'Simpan pekerjaan di akun Anda dan buka lagi kapan saja, lintas perangkat.'
            : 'Unduh laporan PDF vektor siap dokumentasi — tanpa batas, di semua tool.');
      }
      awaitingPayment = false;
      expiryAtOpen = expiryMs();
      setStatus('');
      renderPlans();
      ov.classList.add('show');
    };
    closeImpl = close;

    // Tutup otomatis hanya bila (a) kita memang sedang menunggu hasil bayar dan
    // (b) masa aktif benar-benar bertambah — bukan sekadar "sudah premium".
    // Tanpa syarat kedua, modal perpanjangan akan menutup diri saat dibuka.
    if (CA()) CA().onChange(function (user, premium) {
      if (!awaitingPayment || !ov.classList.contains('show')) return;
      if (premium && premium.active && expiryMs() > (expiryAtOpen || 0)) {
        awaitingPayment = false;
        close();
        toast(expiryAtOpen ? 'Premium diperpanjang — terima kasih!' : 'Premium aktif — terima kasih!', 'info');
      }
    });
  }

  window.CivilBilling = {
    enabled: enabled,
    plans: PLANS,
    openPlans: function (intent) { openImpl(intent); },
    closePlans: function () { closeImpl(); }
  };

  wire();
})();
