/*
 Cloud Functions (Gen 2) for admin order status updates
 - Callable: adminUpdateOrderStatus
 - Verifies admin UID
 - Updates both public and user order docs with Admin SDK privileges
*/

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

setGlobalOptions({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' });
admin.initializeApp();
const db = admin.firestore();

const ADMIN_UID = '5FA4SZNeMicQz0MC1waRTSUh0lB2';

exports.adminUpdateOrderStatus = onCall(async (request) => {
  try {
    const context = request.auth;
    const data = request.data || {};

    if (!context || !context.uid || context.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Only admin can update order status.');
    }

    const { appId, orderId, userId, status } = data;
    if (!appId || !orderId || !userId || !status) {
      throw new HttpsError('invalid-argument', 'Missing appId, orderId, userId, or status.');
    }

    const publicOrderRef = db.doc(`artifacts/${appId}/public/data/orders/${orderId}`);
    const userOrderRef = db.doc(`artifacts/${appId}/users/${userId}/orders/${orderId}`);

    await db.runTransaction(async (tx) => {
      tx.update(publicOrderRef, { status });
      // Ensure user order doc exists and status mirrors public; merge preserves other fields
      tx.set(userOrderRef, { status }, { merge: true });
    });

    return { ok: true };
  } catch (err) {
    console.error('adminUpdateOrderStatus failed:', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Unknown error');
  }
});
