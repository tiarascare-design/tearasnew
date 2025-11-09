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
