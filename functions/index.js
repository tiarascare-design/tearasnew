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

// Callable: adminResetUserCarts
// Deletes artifacts/{appId}/users/*/cart/user_cart using Admin SDK privileges
exports.adminResetUserCarts = onCall(async (request) => {
  try {
    const context = request.auth;
    const data = request.data || {};

    if (!context || !context.uid || context.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Only admin can reset user carts.');
    }

    const { appId } = data;
    if (!appId) {
      throw new HttpsError('invalid-argument', 'Missing appId.');
    }

    const usersSnap = await db.collection(`artifacts/${appId}/users`).get();
    const bulk = db.bulkWriter();
    let count = 0;
    usersSnap.forEach((u) => {
      const cartDoc = db.doc(`artifacts/${appId}/users/${u.id}/cart/user_cart`);
      bulk.delete(cartDoc).catch((e) => {
        console.warn('Bulk delete cart error', { userId: u.id, error: e?.message });
      });
      count++;
    });

    await bulk.close();
    return { ok: true, deletedForUsers: count };
  } catch (err) {
    console.error('adminResetUserCarts failed:', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Unknown error');
  }
});

// Callable: adminMasterReset
// Performs a full master reset for an appId. Deletes/clears public collections and
// user-scoped data (user carts and user order copies). Returns a summary of actions.
exports.adminMasterReset = onCall(async (request) => {
  try {
    const context = request.auth;
    const data = request.data || {};

    if (!context || !context.uid || context.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Only admin can perform master reset.');
    }

  const { appId, targets, confirmation, token } = data; // targets optional array of keys to reset; if missing, reset everything
    if (!appId) {
      throw new HttpsError('invalid-argument', 'Missing appId.');
    }

    // Safety: require explicit confirmation string typed by admin (frontend prompts for 'RESET')
    if (confirmation !== 'RESET') {
      throw new HttpsError('invalid-argument', "Missing or invalid confirmation. Type 'RESET' to confirm master reset.");
    }

    // Require a short-lived admin-issued token to proceed (created via adminRequestMasterReset)
    if (!token) {
      throw new HttpsError('invalid-argument', 'Missing master-reset token. Request a token before performing master reset.');
    }

    // verify token document
    try {
      const tokenDocRef = db.doc(`artifacts/${appId}/adminResetRequests/${token}`);
      const tokenSnap = await tokenDocRef.get();
      if (!tokenSnap.exists) {
        throw new HttpsError('permission-denied', 'Invalid or expired master-reset token.');
      }
      const tokenData = tokenSnap.data();
      const now = Date.now();
      if (!tokenData || !tokenData.expiresAt || tokenData.expiresAt.toMillis() < now) {
        // delete expired token
        await tokenDocRef.delete().catch(() => {});
        throw new HttpsError('permission-denied', 'Master-reset token expired.');
      }
      // Optional: ensure creator was an admin UID (createdBy stored at token creation)
      if (!tokenData.createdBy || tokenData.createdBy !== context.uid) {
        // allow same admin to use token; if you want cross-admin approval, change this check
        // For now, ensure token was created by the same admin who is executing
        throw new HttpsError('permission-denied', 'Master-reset token was not issued to this admin.');
      }
      // delete the token (single-use)
      await tokenDocRef.delete().catch(() => {});
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error('master reset token verify error', e);
      throw new HttpsError('internal', 'Token verify failed');
    }
    // Helper to delete all docs in a collection path using bulkWriter in paginated batches
    const deleteCollectionPaginated = async (colPath, batchSize = 400) => {
      let totalDeleted = 0;
      while (true) {
        const snap = await db.collection(colPath).limit(batchSize).get();
        if (snap.empty) break;
        const bulk = db.bulkWriter();
        snap.forEach((d) => {
          bulk.delete(d.ref).catch((e) => console.warn('bulk delete failed', colPath, d.id, e?.message));
          totalDeleted++;
        });
        await bulk.close();
        // continue loop to pick next batch until empty
      }
      return { deleted: totalDeleted };
    };

    // Helper to set/overwrite a document
    const setDocPath = async (docPath, dataObj) => {
      await db.doc(docPath).set(dataObj, { merge: false });
      return { ok: true };
    };

    const summary = { products: 0, productGroups: 0, heroSlides: 0, galleryImages: 0, testimonials: 0, purchases: 0, localSales: 0, salesReturns: 0, purchaseReturns: 0, orders: 0, userOrdersCopies: 0, userCarts: 0, countersReset: false, siteSettingsReset: false, errors: [] };

    const allTargets = {
      products: `artifacts/${appId}/public/data/products`,
      productGroups: `artifacts/${appId}/public/data/productGroups`,
      heroSlides: `artifacts/${appId}/public/data/heroSlides`,
      galleryImages: `artifacts/${appId}/public/data/galleryImages`,
      testimonials: `artifacts/${appId}/public/data/testimonials`,
      purchases: `artifacts/${appId}/public/data/purchases`,
      localSales: `artifacts/${appId}/public/data/localSales`,
      salesReturns: `artifacts/${appId}/public/data/salesReturns`,
      purchaseReturns: `artifacts/${appId}/public/data/purchaseReturns`,
      orders: `artifacts/${appId}/public/data/orders`,
    };

    const targetsToRun = Array.isArray(targets) && targets.length > 0 ? targets : Object.keys(allTargets);

    // Delete public collections (paginated)
    for (const key of targetsToRun) {
      try {
        if (!allTargets[key]) continue;
        const res = await deleteCollectionPaginated(allTargets[key], 400);
        summary[key] = res.deleted || 0;
      } catch (e) {
        console.error('master reset error deleting', key, e);
        summary.errors.push({ step: `delete_${key}`, error: e?.message || e });
      }
    }

    // Delete user-scoped data: carts and user order copies under artifacts/{appId}/users/*
    try {
      const usersSnap = await db.collection(`artifacts/${appId}/users`).get();
      if (!usersSnap.empty) {
        const bulk = db.bulkWriter();
        let ucount = 0;
        usersSnap.forEach((u) => {
          // delete user cart doc if exists
          bulk.delete(db.doc(`artifacts/${appId}/users/${u.id}/cart/user_cart`)).catch((e) => console.warn('delete user cart error', u.id, e?.message));
          // delete user's orders subcollection docs (best-effort: list and delete)
          // We will schedule deletion of each doc under users/{uid}/orders by fetching synchronously per user
          ucount++;
        });
        await bulk.close();
        summary.userCarts = ucount;

        // Now delete per-user order docs (can't bulk delete across nested collections easily without listing)
        let userOrdersDeleted = 0;
        for (const uDoc of usersSnap.docs) {
          const ordersSnap = await db.collection(`artifacts/${appId}/users/${uDoc.id}/orders`).get();
          if (ordersSnap.empty) continue;
          const b = db.bulkWriter();
          ordersSnap.forEach((od) => { b.delete(db.doc(`artifacts/${appId}/users/${uDoc.id}/orders/${od.id}`)).catch(() => {}); userOrdersDeleted++; });
          await b.close();
        }
        summary.userOrdersCopies = userOrdersDeleted;
      }
    } catch (e) {
      console.error('master reset user-scoped data error', e);
      summary.errors.push({ step: 'user_scoped', error: e?.message || e });
    }

    // Reset counters doc (overwrite to empty)
    try {
      await setDocPath(`artifacts/${appId}/public/data/counters/invoiceCounters`, {});
      summary.countersReset = true;
    } catch (e) {
      summary.errors.push({ step: 'counters', error: e?.message || e });
    }

    // Reset site settings to a minimal default (merge false to clear)
    try {
      const defaultSettings = {
        isScrollingBarVisible: true,
        scrollingBarText: "",
        isGstEnabled: true,
        merchantGstin: '',
        businessAddress: '',
      };
      await setDocPath(`artifacts/${appId}/public/data/siteSettings/main`, defaultSettings);
      summary.siteSettingsReset = true;
    } catch (e) {
      summary.errors.push({ step: 'siteSettings', error: e?.message || e });
    }

    return { ok: summary.errors.length === 0, summary };
  } catch (err) {
    console.error('adminMasterReset failed:', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Unknown error');
  }
});

// Callable: adminRequestMasterReset
// Creates a short-lived token document under artifacts/{appId}/adminResetRequests/{token}
// Token must be used by the same admin to execute the master reset within expiry.
exports.adminRequestMasterReset = onCall(async (request) => {
  try {
    const context = request.auth;
    const data = request.data || {};
    if (!context || !context.uid || context.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Only admin can request master reset tokens.');
    }
    const { appId, ttlSeconds } = data;
    if (!appId) throw new HttpsError('invalid-argument', 'Missing appId.');
    const ttl = typeof ttlSeconds === 'number' && ttlSeconds > 0 ? Math.min(ttlSeconds, 600) : 300; // default 5 minutes, max 10
    // generate a token id
    const token = Math.random().toString(36).slice(2, 12);
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + ttl * 1000);
    const docRef = db.doc(`artifacts/${appId}/adminResetRequests/${token}`);
    await docRef.set({ createdBy: context.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt });
    return { ok: true, token, expiresAt: expiresAt.toDate().toISOString() };
  } catch (err) {
    console.error('adminRequestMasterReset failed:', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Unknown error');
  }
});
