/* ============================================================
   Civil Tools — core/auth.js
   Akun (login/signup) + status premium, via Firebase Auth + Firestore
   (SDK "compat" dimuat lewat CDN <script> di index.html — pola sama
   seperti Three.js, tanpa bundler).

   SATU-SATUNYA file yang bicara ke Firebase. report.js, shell.js, dan
   modul manapun cukup panggil window.CivilAuth — tak pernah tahu
   detail Firebase. Config diisi di index.html (window.FIREBASE_CONFIG),
   sama seperti pola window.GA4_MEASUREMENT_ID.

   Selama FIREBASE_CONFIG masih placeholder, seluruh fitur akun
   nonaktif diam-diam (app tetap penuh sebagai kalkulator gratis) —
   aman di-deploy sebelum project Firebase benar-benar dibuat.

   API publik (window.CivilAuth):
     enabled()            -> bool, true bila config sudah diisi & SDK termuat
     onChange(fn)          -> fn(user, premium) dipanggil tiap perubahan auth/premium
                               (langsung sekali saat didaftar) + dgn nilai current.
                               Return unsubscribe().
     getUser()             -> objek user Firebase saat ini atau null
     isPremium()           -> bool
     getPremium()           -> { active, plan, expiresAt, lastOrderId }
     signUp(email,pass)    -> Promise
     signIn(email,pass)    -> Promise
     signInWithGoogle()    -> Promise
     signOut()             -> Promise
     openLogin()           -> tampilkan modal masuk/daftar (#auth-ov)
     closeLogin()
     openPaywall(opts)     -> tampilkan modal bridging premium (#paywall-ov)
                               opts.intent: 'pdf' | 'save' (ubah teks pesan)
     closePaywall()
     db()                   -> instance Firestore (dipakai fitur simpan-pekerjaan, Fase B)
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.FIREBASE_CONFIG || {};
  var enabled = !!(CFG.apiKey && !/^GANTI/.test(CFG.apiKey));

  var app = null, auth = null, firestoreDb = null;
  var currentUser = null;
  var premiumState = { active: false, plan: null, expiresAt: null, lastOrderId: null };
  var userDocUnsub = null;
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(currentUser, premiumState); } catch (e) { console.error(e); }
    });
  }

  function watchUserDoc(uid) {
    if (userDocUnsub) { userDocUnsub(); userDocUnsub = null; }
    if (!firestoreDb || !uid) return;
    userDocUnsub = firestoreDb.collection('users').doc(uid).onSnapshot(function (snap) {
      var d = snap.data() || {};
      premiumState = d.premium || { active: false, plan: null, expiresAt: null, lastOrderId: null };
      notify();
    }, function (err) { console.error('CivilAuth: gagal memantau status premium', err); });
  }

  function ensureUserDoc(user) {
    var ref = firestoreDb.collection('users').doc(user.uid);
    return ref.get().then(function (snap) {
      if (snap.exists) return;
      return ref.set({
        email: user.email || null,
        displayName: user.displayName || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        premium: { active: false, plan: null, expiresAt: null, lastOrderId: null }
      });
    });
  }

  function init() {
    if (!enabled) { console.warn('CivilAuth: FIREBASE_CONFIG belum diisi — fitur akun nonaktif.'); return; }
    if (typeof firebase === 'undefined') { console.error('CivilAuth: SDK Firebase gagal dimuat.'); enabled = false; return; }
    try {
      app = firebase.initializeApp(CFG);
      auth = firebase.auth();
      firestoreDb = firebase.firestore();
    } catch (e) { console.error('CivilAuth: init gagal', e); enabled = false; return; }

    auth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (user) {
        ensureUserDoc(user).then(function () { watchUserDoc(user.uid); });
      } else {
        if (userDocUnsub) { userDocUnsub(); userDocUnsub = null; }
        premiumState = { active: false, plan: null, expiresAt: null, lastOrderId: null };
        notify();
      }
    });

    wireAuthModal();
    wirePaywallModal();
  }

  /* ---------- API auth ---------- */
  function signUp(email, password) {
    if (!enabled) return Promise.reject(new Error('Fitur akun belum dikonfigurasi'));
    return auth.createUserWithEmailAndPassword(email, password);
  }
  function signIn(email, password) {
    if (!enabled) return Promise.reject(new Error('Fitur akun belum dikonfigurasi'));
    return auth.signInWithEmailAndPassword(email, password);
  }
  function signInWithGoogle() {
    if (!enabled) return Promise.reject(new Error('Fitur akun belum dikonfigurasi'));
    var provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider);
  }
  function signOutUser() {
    if (!enabled) return Promise.resolve();
    return auth.signOut();
  }
  function onChange(fn) {
    listeners.push(fn);
    try { fn(currentUser, premiumState); } catch (e) { console.error(e); }
    return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }
  function getUser() { return currentUser; }
  function isPremium() { return !!premiumState.active; }
  function getPremium() { return premiumState; }
  function getDb() { return firestoreDb; }

  /* ---------- Pesan error Firebase -> bahasa Indonesia ---------- */
  function friendlyAuthError(err) {
    var code = (err && err.code) || '';
    var map = {
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/user-not-found': 'Email belum terdaftar.',
      'auth/wrong-password': 'Kata sandi salah.',
      'auth/invalid-credential': 'Email atau kata sandi salah.',
      'auth/email-already-in-use': 'Email sudah terdaftar — coba Masuk.',
      'auth/weak-password': 'Kata sandi minimal 6 karakter.',
      'auth/too-many-requests': 'Terlalu banyak percobaan — coba lagi nanti.',
      'auth/popup-closed-by-user': 'Jendela Google ditutup sebelum selesai.'
    };
    return map[code] || (err && err.message) || 'Terjadi kesalahan, coba lagi.';
  }

  /* ---------- Modal Masuk/Daftar (#auth-ov, markup di index.html) ---------- */
  var openLoginImpl = function () {
    if (!enabled) { if (window.CivilUI) window.CivilUI.toast('Fitur akun belum aktif', 'bad'); }
  };
  var closeLoginImpl = function () {};

  function wireAuthModal() {
    var ov = document.getElementById('auth-ov');
    if (!ov) return;
    var UI = window.CivilUI;
    var closeBtn = document.getElementById('auth-close');
    var tabIn = document.getElementById('auth-tab-signin');
    var tabUp = document.getElementById('auth-tab-signup');
    var form = document.getElementById('auth-form');
    var emailEl = document.getElementById('auth-email');
    var passEl = document.getElementById('auth-password');
    var errEl = document.getElementById('auth-err');
    var submitBtn = document.getElementById('auth-submit');
    var googleBtn = document.getElementById('auth-google');
    var mode = 'signin';

    function hideErr() { if (errEl) errEl.hidden = true; }
    function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } }
    function setMode(m) {
      mode = m;
      if (tabIn) tabIn.classList.toggle('active', m === 'signin');
      if (tabUp) tabUp.classList.toggle('active', m === 'signup');
      if (submitBtn) submitBtn.textContent = m === 'signin' ? 'Masuk' : 'Daftar';
      hideErr();
    }
    function close() {
      ov.classList.remove('show');
      if (form) form.reset();
      hideErr();
      if (submitBtn) submitBtn.disabled = false;
    }

    if (tabIn) tabIn.addEventListener('click', function () { setMode('signin'); });
    if (tabUp) tabUp.addEventListener('click', function () { setMode('signup'); });

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideErr();
      var email = (emailEl.value || '').trim(), pass = passEl.value || '';
      if (!email || !pass) return;
      submitBtn.disabled = true;
      var action = mode === 'signin' ? signIn(email, pass) : signUp(email, pass);
      action.then(function () {
        close();
        if (UI) UI.toast(mode === 'signin' ? 'Berhasil masuk' : 'Akun berhasil dibuat', undefined);
      }).catch(function (err) {
        submitBtn.disabled = false;
        showErr(friendlyAuthError(err));
      });
    });

    if (googleBtn) googleBtn.addEventListener('click', function () {
      hideErr();
      signInWithGoogle().then(function () {
        close();
        if (UI) UI.toast('Berhasil masuk', undefined);
      }).catch(function (err) { showErr(friendlyAuthError(err)); });
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('show')) close();
    });

    openLoginImpl = function () {
      if (!enabled) { if (UI) UI.toast('Fitur akun belum aktif', 'bad'); return; }
      setMode('signin');
      ov.classList.add('show');
      if (emailEl) emailEl.focus();
    };
    closeLoginImpl = close;
  }

  /* ---------- Modal bridging premium (#paywall-ov) ---------- */
  var openPaywallImpl = function () {};
  var closePaywallImpl = function () {};

  function wirePaywallModal() {
    var ov = document.getElementById('paywall-ov');
    if (!ov) return;
    var UI = window.CivilUI;
    var closeBtn = document.getElementById('paywall-close');
    var msgEl = document.getElementById('paywall-msg');
    var ctaBtn = document.getElementById('paywall-cta');

    function close() { ov.classList.remove('show'); }
    if (closeBtn) closeBtn.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('show')) close();
    });

    // CTA "Lihat Paket Berlangganan": halaman/checkout subscription dibangun
    // di Fase C (Midtrans). Sampai saat itu, tombol ini cukup beri info.
    if (ctaBtn) ctaBtn.addEventListener('click', function () {
      close();
      if (UI) UI.toast('Halaman berlangganan segera hadir', 'info');
    });

    openPaywallImpl = function (opts) {
      opts = opts || {};
      if (msgEl) {
        msgEl.textContent = opts.intent === 'save'
          ? 'Simpan pekerjaan adalah fitur Premium — berlangganan untuk menyimpan & memulihkan kalkulasi kapan saja, lintas perangkat.'
          : 'Unduh laporan PDF adalah fitur Premium — pratinjau tetap gratis, berlangganan untuk mengunduh.';
      }
      if (!currentUser) { close(); openLoginImpl(); return; }
      ov.classList.add('show');
    };
    closePaywallImpl = close;
  }

  window.CivilAuth = {
    enabled: function () { return enabled; },
    onChange: onChange,
    getUser: getUser,
    isPremium: isPremium,
    getPremium: getPremium,
    db: getDb,
    signUp: signUp,
    signIn: signIn,
    signInWithGoogle: signInWithGoogle,
    signOut: signOutUser,
    openLogin: function () { openLoginImpl(); },
    closeLogin: function () { closeLoginImpl(); },
    openPaywall: function (opts) { openPaywallImpl(opts); },
    closePaywall: function () { closePaywallImpl(); }
  };

  init();
})();
