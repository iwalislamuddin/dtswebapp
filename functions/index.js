/* ============================================================
   Civil Tools — Cloud Functions (Fase C monetisasi)

   Dua fungsi, satu penjadwal:
     createSnapTransaction  (callable) — dipanggil browser saat pengguna
       memilih paket. HARGA DIAMBIL DARI TABEL DI FILE INI, bukan dari
       request — browser hanya mengirim planId. Membuat dokumen
       `orders/{orderId}` berstatus 'pending' lalu meminta Snap token ke
       Midtrans memakai SERVER KEY (tidak pernah sampai ke browser).
     midtransWebhook        (HTTP)     — dipanggil Midtrans setelah
       pembayaran. Memverifikasi signature SHA-512, memastikan nominal &
       order cocok, lalu memperpanjang `users/{uid}.premium`. Idempoten:
       order yang sudah 'paid' tidak pernah diproses dua kali, sehingga
       webhook berulang (Midtrans mengirim ulang bila tak dapat 200) aman.
     expirePremium          (jadwal)   — matikan premium yang lewat masa
       berlaku agar dokumen tetap jujur (klien juga sudah cek expiresAt).

   INI SATU-SATUNYA penulis field `users/{uid}.premium` dan koleksi
   `orders` — lihat firebase/firestore.rules: client dilarang menulis
   keduanya, jadi status premium tidak bisa dipalsukan dari browser.

   Deploy & setup: lihat docs/MONETIZATION.md §6.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const midtransClient = require('midtrans-client');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const REGION = 'asia-southeast2';                       // Jakarta

// Kunci rahasia — TIDAK PERNAH ada di repo. Disimpan di Secret Manager:
//   firebase functions:secrets:set MIDTRANS_SERVER_KEY
const MIDTRANS_SERVER_KEY = defineSecret('MIDTRANS_SERVER_KEY');
const MIDTRANS_CLIENT_KEY = defineSecret('MIDTRANS_CLIENT_KEY');

// SAKELAR SANDBOX / PRODUKSI. false = kartu uji, tidak ada uang berpindah.
// Saat naik produksi: ubah ke true DI SINI, set ulang kedua secret dengan key
// produksi, deploy ulang, dan samakan `production: true` di index.html.
const MIDTRANS_IS_PRODUCTION = false;

/* ---------- Sumber kebenaran harga (samakan dengan core/billing.js) ---------- */
const PLANS = {
  p1: { months: 1, price: 14000, label: 'Premium EDFS Civil Tools — 1 Bulan' },
  p3: { months: 3, price: 39000, label: 'Premium EDFS Civil Tools — 3 Bulan' },
  p12: { months: 12, price: 129000, label: 'Premium EDFS Civil Tools — 12 Bulan' }
};

function snapClient() {
  return new midtransClient.Snap({
    isProduction: MIDTRANS_IS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY.value(),
    clientKey: MIDTRANS_CLIENT_KEY.value()
  });
}

// order_id Midtrans: maks 50 karakter, hanya huruf/angka/-/_/./~
function newOrderId(uid) {
  return `CT-${uid.slice(0, 8)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);          // 31 Jan + 1 bulan -> 28/29 Feb
  return d;
}

/* ============================================================
   1. createSnapTransaction — callable dari browser (core/billing.js)
   ============================================================ */
exports.createSnapTransaction = onCall(
  { region: REGION, secrets: [MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY], cors: true },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Masuk dulu sebelum berlangganan.');

    const planId = req.data && req.data.planId;
    const plan = PLANS[planId];
    if (!plan) throw new HttpsError('invalid-argument', 'Paket tidak dikenal.');

    const email = (req.auth.token && req.auth.token.email) || null;
    const orderId = newOrderId(uid);

    await db.collection('orders').doc(orderId).set({
      uid,
      email,
      planId,
      months: plan.months,
      amount: plan.price,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });

    try {
      const tx = await snapClient().createTransaction({
        transaction_details: { order_id: orderId, gross_amount: plan.price },
        item_details: [{ id: planId, price: plan.price, quantity: 1, name: plan.label }],
        customer_details: email ? { email } : undefined,
        credit_card: { secure: true },
        expiry: { unit: 'hours', duration: 24 }
      });
      return { token: tx.token, orderId, redirectUrl: tx.redirect_url || null };
    } catch (err) {
      logger.error('Snap createTransaction gagal', { orderId, err: String(err) });
      await db.collection('orders').doc(orderId)
        .set({ status: 'failed', error: String(err) }, { merge: true });
      throw new HttpsError('internal', 'Gagal membuat transaksi pembayaran.');
    }
  }
);

/* ============================================================
   2. midtransWebhook — notifikasi pembayaran dari Midtrans
   URL webhook = https://<region>-<project>.cloudfunctions.net/midtransWebhook
   (atau URL Cloud Run yang tercetak saat deploy) — daftarkan di
   Midtrans Dashboard > Settings > Configuration > Payment Notification URL.
   ============================================================ */
exports.midtransWebhook = onRequest(
  { region: REGION, secrets: [MIDTRANS_SERVER_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    const b = req.body || {};
    const orderId = b.order_id;
    const statusCode = b.status_code;
    const grossAmount = b.gross_amount;

    if (!orderId || !statusCode || !grossAmount || !b.signature_key) {
      res.status(400).send('Payload tidak lengkap'); return;
    }

    // Signature Midtrans: sha512(order_id + status_code + gross_amount + serverKey)
    const expected = crypto.createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY.value()}`)
      .digest('hex');
    if (expected !== b.signature_key) {
      logger.warn('Webhook signature tidak cocok', { orderId });
      res.status(403).send('Invalid signature'); return;
    }

    const trxStatus = b.transaction_status;
    const fraud = b.fraud_status;
    const settled = (trxStatus === 'settlement') || (trxStatus === 'capture' && fraud === 'accept');

    const orderRef = db.collection('orders').doc(orderId);

    try {
      const result = await db.runTransaction(async (t) => {
        const orderSnap = await t.get(orderRef);
        if (!orderSnap.exists) return 'unknown-order';
        const order = orderSnap.data();

        // Idempotensi: webhook boleh datang berkali-kali untuk order yang sama.
        if (order.status === 'paid') return 'already-paid';

        if (!settled) {
          t.set(orderRef, {
            status: trxStatus || 'unknown',
            fraudStatus: fraud || null,
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          return 'not-settled';
        }

        // Nominal harus sama dengan yang kita buat sendiri di createSnapTransaction.
        if (Math.round(parseFloat(grossAmount)) !== Number(order.amount)) {
          logger.error('Nominal webhook tidak cocok', { orderId, grossAmount, expected: order.amount });
          t.set(orderRef, {
            status: 'amount-mismatch',
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          return 'amount-mismatch';
        }

        const userRef = db.collection('users').doc(order.uid);
        const userSnap = await t.get(userRef);
        const cur = (userSnap.exists && userSnap.data().premium) || {};
        const curExp = cur.expiresAt && cur.expiresAt.toDate ? cur.expiresAt.toDate() : null;
        const now = new Date();
        // Perpanjang dari sisa masa aktif bila masih berlaku (tidak hangus).
        const base = (curExp && curExp > now) ? curExp : now;
        const expiresAt = addMonths(base, Number(order.months) || 1);

        t.set(userRef, {
          premium: {
            active: true,
            plan: order.planId,
            expiresAt: Timestamp.fromDate(expiresAt),
            lastOrderId: orderId
          }
        }, { merge: true });

        t.set(orderRef, {
          status: 'paid',
          paidAt: FieldValue.serverTimestamp(),
          transactionStatus: trxStatus,
          paymentType: b.payment_type || null,
          premiumUntil: Timestamp.fromDate(expiresAt)
        }, { merge: true });

        return 'activated';
      });

      logger.info('Webhook diproses', { orderId, trxStatus, result });
      // 404 hanya untuk order yang benar-benar tak dikenal; sisanya 200 supaya
      // Midtrans berhenti mengirim ulang notifikasi yang sudah kita tangani.
      if (result === 'unknown-order') { res.status(404).send('Order tidak ditemukan'); return; }
      res.status(200).send('OK');
    } catch (err) {
      logger.error('Webhook gagal diproses', { orderId, err: String(err) });
      res.status(500).send('Error');       // biar Midtrans mengirim ulang
    }
  }
);

/* ============================================================
   3. expirePremium — bersihkan langganan yang habis masa berlakunya
   Query satu field (premium.expiresAt) supaya tidak butuh composite index.
   ============================================================ */
exports.expirePremium = onSchedule(
  { region: REGION, schedule: 'every day 03:00', timeZone: 'Asia/Jakarta' },
  async () => {
    const now = Timestamp.now();
    const snap = await db.collection('users')
      .where('premium.expiresAt', '<', now)
      .limit(500)
      .get();

    let n = 0;
    const batch = db.batch();
    snap.forEach((doc) => {
      const p = doc.data().premium || {};
      if (!p.active) return;
      batch.set(doc.ref, { premium: { active: false } }, { merge: true });
      n++;
    });
    if (n) await batch.commit();
    logger.info(`expirePremium: ${n} langganan dinonaktifkan`);
  }
);
