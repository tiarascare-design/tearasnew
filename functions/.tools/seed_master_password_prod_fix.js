#!/usr/bin/env node
const admin = require('firebase-admin');
const crypto = require('crypto');

const password = process.argv[2] || process.env.SEED_MASTER_PASSWORD;
if (!password) {
  console.error('Usage: node seed_master_password_prod_fix.js <password>');
  process.exit(2);
}
const appId = 'tiaras-website';
const hash = crypto.createHash('sha256').update(String(password), 'utf8').digest('hex');
console.log('Computed SHA-256 hex:', hash);

try {
  admin.initializeApp({ projectId: appId });
} catch (e) {
  // ignore if already initialized
}

const db = admin.firestore();
const docPath = `artifacts/${appId}/public/data/siteSettings/main`;

(async () => {
  try {
    console.log('Writing masterResetPasswordHash to', docPath);
    await db.doc(docPath).set({ masterResetPasswordHash: hash }, { merge: true });
    console.log('Write complete.');
    process.exit(0);
  } catch (e) {
    console.error('Write failed:', e);
    process.exit(2);
  }
})();
