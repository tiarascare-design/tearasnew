/*
 Cloud Functions (Gen 2) for admin order status updates
 - Callable: adminUpdateOrderStatus
 - Verifies admin UID
 - Updates both public and user order docs with Admin SDK privileges
*/

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

setGlobalOptions({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' });
admin.initializeApp();
const db = admin.firestore();

const ADMIN_UID = '5FA4SZNeMicQz0MC1waRTSUh0lB2';

const adminUpdateOrderStatusImpl = async ({ uid }, data) => {
  const context = { uid };
  const payload = data || {};
  if (!context || !context.uid || context.uid !== ADMIN_UID) {
    throw new HttpsError('permission-denied', 'Only admin can update order status.');
  }
  const { appId, orderId, userId, status } = payload;
  if (!appId || !orderId || !userId || !status) {
    throw new HttpsError('invalid-argument', 'Missing appId, orderId, userId, or status.');
  }
  const publicOrderRef = db.doc(`artifacts/${appId}/public/data/orders/${orderId}`);
  const userOrderRef = db.doc(`artifacts/${appId}/users/${userId}/orders/${orderId}`);
  await db.runTransaction(async (tx) => {
    tx.update(publicOrderRef, { status });
    tx.set(userOrderRef, { status }, { merge: true });
  });
  return { ok: true };
};

exports.adminUpdateOrderStatus = onCall(async (request) => {
  try { return await adminUpdateOrderStatusImpl(request.auth || {}, request.data || {}); } catch (err) { console.error('adminUpdateOrderStatus failed:', err); if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err?.message || 'Unknown error'); }
});

// HTTP wrapper for adminUpdateOrderStatus
// small helper to ensure CORS headers are always present and consistent
function setCorsHeaders(req, res) {
  const origin = req.get('Origin') || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Max-Age', '3600');
}

// Normalize master collection paths for backward compatibility tests and exports
function normalizeMasterCollectionPath(colPath) {
  try {
    const segs = colPath.split('/').filter(Boolean);
    // If the path looks document-like (even number of segments) and contains
    // '/masters/', insert the 'main' document so the path becomes a collection
    // path: '/masters/main/xxx'
    if (segs.length % 2 === 0 && colPath.includes('/masters/')) {
      return colPath.replace('/masters/', '/masters/main/');
    }
  } catch (e) {
    // fall through and return original
  }
  return colPath;
}

exports.adminUpdateOrderStatusHttp = onRequest(async (req, res) => {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') { return res.status(204).send(''); }
    const authHeader = req.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    const idToken = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken).catch((e) => { throw new Error('Invalid auth token'); });
    const result = await adminUpdateOrderStatusImpl({ uid: decoded.uid }, req.body || {});
    return res.status(200).json(result);
  } catch (e) {
    console.error('adminUpdateOrderStatusHttp error', e);
    try { setCorsHeaders(req, res); } catch (_) {}
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

// Note: adminResetUserCarts functionality removed to disable destructive
// operations from the production surface. If this functionality is needed
// in development for emulators, reintroduce a controlled script under
// functions/.tools and avoid exporting callable/HTTP endpoints.

// Note: adminMasterReset functionality removed to disable destructive
// operations from the production surface. If this functionality is needed
// in development for emulators, reintroduce a controlled script under
// functions/.tools and avoid exporting callable/HTTP endpoints.

// Note: adminRequestMasterReset functionality removed. Token issuance for
// master-reset is intentionally disabled to prevent performing master resets
// via browser clients or callables. Reintroduce only as an internal, guarded
// tool when running emulators.

// Export helper for unit tests and tooling
exports.normalizeMasterCollectionPath = normalizeMasterCollectionPath;

// Helper to delete all documents in a collection path (admin)
async function deleteAllDocsInCollectionAdmin(colPath) {
  const docs = await db.listDocuments(colPath);
  // listDocuments returns DocumentReference[]; delete in batches of 450
  const batchSize = 450;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const slice = docs.slice(i, i + batchSize);
    slice.forEach(dref => batch.delete(dref));
    await batch.commit();
  }
}

// Admin master reset implementation (callable/HTTP). Very destructive: guarded by ADMIN_UID.
const adminMasterResetImpl = async ({ uid }, data) => {
  if (!uid || uid !== ADMIN_UID) throw new HttpsError('permission-denied', 'Only admin can perform master reset.');
  const payload = data || {};
  const appId = payload.appId || 'tiaras-website';
  // Map logical buckets to collection paths
  const map = {
    products: `artifacts/${appId}/public/data/products`,
    suppliers: `artifacts/${appId}/public/data/suppliers`,
    customers: `artifacts/${appId}/public/data/customers`,
    purchases: `artifacts/${appId}/public/data/purchases`,
    localSales: `artifacts/${appId}/public/data/localSales`,
    salesReturns: `artifacts/${appId}/public/data/salesReturns`,
    purchaseReturns: `artifacts/${appId}/public/data/purchaseReturns`,
    productGroups: `artifacts/${appId}/public/data/productGroups`,
    slides: `artifacts/${appId}/public/data/slides`,
    galleryImages: `artifacts/${appId}/public/data/galleryImages`,
    testimonials: `artifacts/${appId}/public/data/testimonials`,
    orders: `artifacts/${appId}/public/data/orders`,
  // Ledger collections (match client paths under /ledgers/main/...)
  cash: `artifacts/${appId}/public/data/ledgers/main/cash`,
  bank: `artifacts/${appId}/public/data/ledgers/main/bank`,
  creditors: `artifacts/${appId}/public/data/ledgers/main/creditors`,
  debtors: `artifacts/${appId}/public/data/ledgers/main/debtors`,
  // Party masters
  banks: `artifacts/${appId}/public/data/masters/main/banks`,
    counters: `artifacts/${appId}/public/data/counters`,
  };

  const flags = payload.flags || {};
  const results = [];
  for (const key of Object.keys(flags)) {
    if (!flags[key]) continue;
    const colPath = map[key];
    if (!colPath) {
      results.push({ key, status: 'unknown' });
      continue;
    }
    try {
      await deleteAllDocsInCollectionAdmin(colPath);
      results.push({ key, status: 'deleted' });
    } catch (e) {
      console.error('adminMasterReset: error deleting', colPath, e);
      results.push({ key, status: 'failed', error: e?.message || String(e) });
    }
  }

  // Reset site settings if requested
  if (flags.siteSettings) {
    try {
      const siteSettingsDoc = db.doc(`artifacts/${appId}/public/settings/siteSettings`);
      await siteSettingsDoc.set({ visibilityEpochs: {} }, { merge: true });
      results.push({ key: 'siteSettings', status: 'reset' });
    } catch (e) { results.push({ key: 'siteSettings', status: 'failed', error: e?.message || String(e) }); }
  }

  return { ok: true, results };
};

exports.adminMasterReset = onCall(async (request) => {
  try { return await adminMasterResetImpl(request.auth || {}, request.data || {}); } catch (err) { console.error('adminMasterReset failed:', err); if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err?.message || 'Unknown error'); }
});

exports.adminMasterResetHttp = onRequest(async (req, res) => {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') { return res.status(204).send(''); }
    const authHeader = req.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    const idToken = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken).catch((e) => { throw new Error('Invalid auth token'); });
    const result = await adminMasterResetImpl({ uid: decoded.uid }, req.body || {});
    return res.status(200).json(result);
  } catch (e) {
    console.error('adminMasterResetHttp error', e);
    try { setCorsHeaders(req, res); } catch (_) {}
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

// --- Delhivery integration endpoints ---
const delhivery = require('./delhivery');

// Track by AWB: GET /?awb=XXXX or POST { awb: 'XXXX' }
exports.delhiveryTrackHttp = onRequest(async (req, res) => {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    const awb = (req.query && req.query.awb) || (req.body && req.body.awb);
    if (!awb) return res.status(400).json({ error: 'Missing awb (query or JSON body)' });
    const data = await delhivery.trackByAwb(awb);
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error('delhiveryTrackHttp error', e?.message || e);
    try { setCorsHeaders(req, res); } catch (_) {}
    return res.status(500).json({ error: e?.message || 'Delhivery track error' });
  }
});

// Webhook receiver: Delhivery will POST tracking updates here. Expected JSON payload
// should include at least an awb and status. Example payload: { awb: 'DL123', status: 'In Transit', timestamp: 1234567890, orderId: 'ORD-123' }
// The function will try to locate matching orders (by orderId if provided; otherwise by shipping.awb)
// and append a tracking event into the order document and optionally update status.
exports.delhiveryWebhook = onRequest(async (req, res) => {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');

    // optionally verify signature
    const rawBody = req.rawBody || req.body;
    if (!delhivery.verifyWebhookSignature(rawBody, req)) {
      console.warn('delhiveryWebhook: signature verification failed');
      return res.status(401).json({ error: 'signature verification failed' });
    }

    const payload = req.body || {};
    const awb = payload.awb || payload.waybill || (payload.data && payload.data.awb);
    const status = payload.status || payload.event || (payload.data && payload.data.status) || null;
    const ts = payload.timestamp || payload.time || Date.now();
    const orderId = payload.orderId || payload.referenceId || null;

    if (!awb && !orderId) return res.status(400).json({ error: 'missing awb and orderId' });

    // locate order(s) in public orders collection
    const appId = payload.appId || 'tiaras-website';
    const ordersCol = db.collection(`artifacts/${appId}/public/data/orders`);
    let matched = [];
    if (orderId) {
      const doc = await ordersCol.doc(orderId).get();
      if (doc.exists) matched.push({ id: doc.id, data: doc.data() });
    }
    if (matched.length === 0 && awb) {
      const q = await ordersCol.where('shipping.awb', '==', awb).limit(10).get();
      q.forEach(d => matched.push({ id: d.id, data: d.data() }));
    }

    if (matched.length === 0) {
      console.warn('delhiveryWebhook: no matching orders for awb/orderId', { awb, orderId });
      return res.status(200).json({ ok: true, message: 'no matching orders' });
    }

    // For each matched public order, update status and append tracking event. Also update user order doc if possible.
    const updates = [];
    for (const m of matched) {
      const publicRef = db.doc(`artifacts/${appId}/public/data/orders/${m.id}`);
      const userId = (m.data && m.data.userId) || null;
      const userRef = userId ? db.doc(`artifacts/${appId}/users/${userId}/orders/${m.id}`) : null;

      const trackingEvent = {
        awb: awb || null,
        status: status || 'Unknown',
        raw: payload,
        ts: typeof ts === 'number' ? new Date(ts) : (new Date()),
      };

      // merge tracking array and status
      const publicUpdate = { lastTrackingEvent: trackingEvent };
      if (status) publicUpdate.status = status;
      updates.push(publicRef.set({ tracking: admin.firestore.FieldValue.arrayUnion(trackingEvent), status }, { merge: true }));
      if (userRef) updates.push(userRef.set({ tracking: admin.firestore.FieldValue.arrayUnion(trackingEvent), status }, { merge: true }));
    }

    await Promise.all(updates);
    return res.status(200).json({ ok: true, matched: matched.length });
  } catch (e) {
    console.error('delhiveryWebhook error', e);
    try { setCorsHeaders(req, res); } catch (_) {}
    return res.status(500).json({ error: e?.message || 'internal delhivery webhook error' });
  }
});

// Razorpay integration (callable)
const razorpay = require('./razorpay');

const createRazorpayOrderImpl = async ({ uid }, data) => {
  // require minimal auth to avoid abuse; allow anonymous if necessary by changing this
  if (!data || typeof data.amountPaise !== 'number') throw new HttpsError('invalid-argument', 'Missing amountPaise');
  // Ensure Razorpay credentials are configured in the Functions runtime
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('createRazorpayOrderImpl: Razorpay env vars missing');
    throw new HttpsError('failed-precondition', 'Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured in the Functions runtime');
  }
  const amountPaise = Math.round(data.amountPaise);
  const receipt = data.receipt || `receipt_${Date.now()}`;
  const notes = data.notes || {};
  try {
    const order = await razorpay.createOrder({ amountPaise, currency: data.currency || 'INR', receipt, notes });
    // return the public pieces required by client to open Checkout
    return { ok: true, orderId: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt, keyId: process.env.RAZORPAY_KEY_ID || null };
  } catch (e) {
    console.error('createRazorpayOrderImpl error', e?.message || e);
    throw new HttpsError('internal', 'Razorpay order creation failed');
  }
};

exports.createRazorpayOrder = onCall(async (request) => {
  try { return await createRazorpayOrderImpl(request.auth || {}, request.data || {}); } catch (err) { console.error('createRazorpayOrder failed:', err); if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err?.message || 'Unknown error'); }
});

// Callable to report whether payments are enabled in the Functions runtime.
// Returns { ok: true, enabled: boolean, keyId?: string }
exports.getPaymentConfig = onCall(async (request) => {
  try {
    const enabled = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    return { ok: true, enabled: enabled, keyId: enabled ? process.env.RAZORPAY_KEY_ID : null };
  } catch (e) {
    console.error('getPaymentConfig error', e);
    throw new HttpsError('internal', 'Unable to read payment configuration');
  }
});

const verifyRazorpayPaymentImpl = async ({ uid }, data) => {
  // data must include: publicOrderId, orderData, razorpay_order_id, razorpay_payment_id, razorpay_signature
  if (!data || !data.publicOrderId || !data.orderData || !data.razorpay_order_id || !data.razorpay_payment_id || !data.razorpay_signature) {
    throw new HttpsError('invalid-argument', 'Missing required payment verification fields');
  }
  // Verify signature
  const valid = razorpay.verifySignature({ razorpay_order_id: data.razorpay_order_id, razorpay_payment_id: data.razorpay_payment_id, razorpay_signature: data.razorpay_signature });
  if (!valid) {
    throw new HttpsError('permission-denied', 'Invalid payment signature');
  }

  // Proceed to commit order and related writes atomically using Admin SDK
  const orderId = data.publicOrderId;
  const appId = data.orderData.appId || 'tiaras-website';
  const publicRef = db.doc(`artifacts/${appId}/public/data/orders/${orderId}`);
  const userId = data.orderData.userId;
  const userRef = userId ? db.doc(`artifacts/${appId}/users/${userId}/orders/${orderId}`) : null;

  // Build the order document to persist
  const finalOrderDoc = Object.assign({}, data.orderData, {
    status: 'Paid',
    payment: {
      provider: 'razorpay',
      order_id: data.razorpay_order_id,
      payment_id: data.razorpay_payment_id,
      signature: data.razorpay_signature,
      capturedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    orderDate: admin.firestore.FieldValue.serverTimestamp()
  });

  // Perform stock decrement and writes
  const batch = db.batch();
  // decrement stock for each item
  (data.orderData.items || []).forEach(item => {
    const productRef = db.doc(`artifacts/${appId}/public/data/products/${item.id}`);
    batch.update(productRef, { stock: admin.firestore.FieldValue.increment(- (item.quantity || 0)) });
  });
  batch.set(publicRef, finalOrderDoc, { merge: true });
  if (userRef) batch.set(userRef, finalOrderDoc, { merge: true });
  // clear cart (best-effort)
  if (userId) {
    const cartRef = db.doc(`artifacts/${appId}/users/${userId}/cart/user_cart`);
    batch.set(cartRef, { items: {} }, { merge: true });
  }

  await batch.commit();
  return { ok: true, orderId };
};

exports.verifyRazorpayPayment = onCall(async (request) => {
  try { return await verifyRazorpayPaymentImpl(request.auth || {}, request.data || {}); } catch (err) { console.error('verifyRazorpayPayment failed:', err); if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err?.message || 'Unknown error'); }
});

// Reserve a deleted invoice for reuse in a transaction-safe manner.
// Marks the original deleted purchase as reused and records an audit entry.
const reserveDeletedInvoiceImpl = async ({ uid }, data) => {
  const payload = data || {};
  const appId = payload.appId || 'tiaras-website';
  const invoiceNumber = (payload.invoiceNumber || '').toString();
  const newPurchaseId = (payload.newPurchaseId || '').toString();

  if (!invoiceNumber) throw new HttpsError('invalid-argument', 'Missing invoiceNumber');
  if (!newPurchaseId) throw new HttpsError('invalid-argument', 'Missing newPurchaseId');
  if (!uid) throw new HttpsError('permission-denied', 'Authentication required');

  const purchasesCol = db.collection(`artifacts/${appId}/public/data/purchases`);
  const qSnap = await purchasesCol.where('invoiceNumber', '==', invoiceNumber).limit(1).get();
  if (qSnap.empty) throw new HttpsError('not-found', 'Original purchase not found');
  const origDoc = qSnap.docs[0];
  const origRef = origDoc.ref;

  await db.runTransaction(async (tx) => {
    const origSnap = await tx.get(origRef);
    if (!origSnap.exists) throw new HttpsError('not-found', 'Original purchase missing');
    const od = origSnap.data() || {};
    if (!od.isDeleted) throw new HttpsError('failed-precondition', 'Invoice is not marked deleted');
    if (od.reused) throw new HttpsError('failed-precondition', 'Invoice already reused');

    tx.update(origRef, {
      reused: true,
      reusedBy: uid || 'system',
      reusedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reusedByNewPurchaseId: newPurchaseId
    });

    const auditRef = db.collection(`artifacts/${appId}/public/data/audit/invoiceReuses`).doc();
    tx.set(auditRef, {
      invoiceNumber,
      originalPurchaseId: origRef.id,
      newPurchaseId,
      reusedBy: uid || 'system',
      reusedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { ok: true, originalPurchaseId: origRef.id };
};

exports.reserveDeletedInvoice = onCall(async (request) => {
  try { return await reserveDeletedInvoiceImpl(request.auth || {}, request.data || {}); } catch (err) { console.error('reserveDeletedInvoice failed:', err); if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err?.message || 'Unknown error'); }
});
