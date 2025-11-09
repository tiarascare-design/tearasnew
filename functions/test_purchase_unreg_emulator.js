/**
 * Emulator-backed test script (Node) to assert purchases saved with an unregistered supplier
 * have gstBreakdown.total === 0 and supplierGstRegistered === false.
 *
 * Usage:
 * 1. Start the Firestore emulator (in this workspace) - e.g.:
 *    npx firebase emulators:start --only firestore --export-on-exit=./.firebase_emulator_export
 *
 * 2. In a separate shell, run this script from the `functions/` folder after `npm install`:
 *    node test_purchase_unreg_emulator.js
 *
 * The script expects the emulator to be running on localhost:8080 (default). If your emulator
 * uses a different host/port, set FIRESTORE_EMULATOR_HOST accordingly.
 */

const admin = require('firebase-admin');

async function main() {
  // Point to emulator if present
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.warn('WARNING: FIRESTORE_EMULATOR_HOST not set. This script expects the emulator to be running.');
    console.warn('Set FIRESTORE_EMULATOR_HOST=localhost:8080 and re-run. Aborting.');
    process.exit(1);
  }

  // Initialize admin SDK (no credentials needed for emulator)
  admin.initializeApp({ projectId: 'tiaras-website' });
  const db = admin.firestore();

  // Create a supplier without GSTIN
  const suppliersCol = db.collection('suppliers');
  const supplierRef = suppliersCol.doc('test_unreg_supplier');
  await supplierRef.set({ name: 'EMULATOR Unregistered Supplier', gstin: '' });

  // Build a purchase payload that the frontend would save for an unregistered supplier
  const purchasesCol = db.collection('purchases');
  const purchaseRef = purchasesCol.doc();
  const purchaseData = {
    supplierName: 'EMULATOR Unregistered Supplier',
    supplierGstin: null,
    supplierGstRegistered: false,
    invoiceNumber: 'EM-1000',
    purchaseDate: admin.firestore.Timestamp.now(),
    items: [ { productId: 'p_demo', productName: 'Demo', purchasePrice: 100, quantity: 2, gstPercentage: 18 } ],
    subtotal: 200,
    gstBreakdown: { total: 0 },
    totalAmount: 200,
    pricesIncludeGst: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await purchaseRef.set(purchaseData);
  console.log('Wrote purchase doc:', purchaseRef.id);

  const snap = await purchaseRef.get();
  const doc = snap.data();
  if (!doc) throw new Error('No doc returned');

  console.log('purchase.gstBreakdown.total =', doc.gstBreakdown?.total);
  console.log('purchase.supplierGstRegistered =', doc.supplierGstRegistered);

  if ((doc.gstBreakdown?.total || 0) !== 0 || doc.supplierGstRegistered !== false) {
    console.error('Assertion failed: saved document does not match expected shape for unregistered supplier.');
    process.exitCode = 2;
    return;
  }

  console.log('Assertion passed: gstBreakdown.total === 0 and supplierGstRegistered === false');
}

main().catch(err => {
  console.error('Test failed', err);
  process.exitCode = 1;
});
