#!/usr/bin/env node
/**
 * bump_visibility_epochs.js
 *
 * Non-destructive helper to mark selected data buckets as 'reset' by updating
 * visibilityEpochs in the siteSettings document. This hides legacy data from
 * epoch-aware client queries without deleting documents.
 *
 * Usage:
 *   node bump_visibility_epochs.js --appId tiaras-website --keys orders,products
 *   node bump_visibility_epochs.js --appId tiaras-website --all
 *
 * Safety: Writes only if FIRESTORE_EMULATOR_HOST is set or --force is passed.
 */

const admin = require('firebase-admin');

function parseArgs() {
  const out = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--appId' || a === '--app') { out.appId = args[++i]; }
    else if (a === '--keys') { out.keys = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean); }
    else if (a === '--all') { out.all = true; }
    else if (a === '--force') { out.force = true; }
  }
  return out;
}

const argv = parseArgs();
const appId = argv.appId || 'tiaras-website';
const force = !!argv.force;
const all = !!argv.all;
const keys = argv.keys || [];

const allowedKeys = [
  'orders','products','productGroups','slides','galleryImages','testimonials','purchases','localSales','salesReturns','purchaseReturns'
];

let targetKeys = keys.slice();
if (all) targetKeys = allowedKeys.slice();
if (targetKeys.length === 0) {
  console.error('No keys supplied. Use --keys or --all');
  process.exit(2);
}

// Validate keys
for (const k of targetKeys) {
  if (!allowedKeys.includes(k)) {
    console.error('Invalid key:', k);
    process.exit(2);
  }
}

const allowWrite = force || !!process.env.FIRESTORE_EMULATOR_HOST;
if (!allowWrite) {
  console.warn('Not writing to Firestore because FIRESTORE_EMULATOR_HOST not set and --force not provided.');
  process.exit(0);
}

try { admin.initializeApp(); } catch (e) {}
const db = admin.firestore();
const docPath = `artifacts/${appId}/public/data/siteSettings/main`;

(async () => {
  try {
    const now = Date.now();
    const visibilityUpdates = {};
    for (const k of targetKeys) visibilityUpdates[k] = now;
    console.log('Writing visibilityEpochs:', visibilityUpdates, 'to', docPath);
    await db.doc(docPath).set({ visibilityEpochs: visibilityUpdates }, { merge: true });
    console.log('Done');
  } catch (e) {
    console.error('Failed:', e);
    process.exit(2);
  }
})();
