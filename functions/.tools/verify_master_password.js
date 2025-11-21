const admin = require('firebase-admin');
const crypto = require('crypto');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

(async function main() {
  try {
    const PROJECT = process.env.FIREBASE_PROJECT || 'tiaras-website';
    const password = process.env.SEED_MASTER_PASSWORD || process.argv.slice(2)[0];
    if (!password) {
      console.error('Usage: set SEED_MASTER_PASSWORD or pass password as first arg');
      process.exit(2);
    }
    try { admin.initializeApp({ projectId: PROJECT }); } catch (e) {}
    const db = admin.firestore();
    const docPath = `artifacts/${PROJECT}/public/data/siteSettings/main`;
    const snap = await db.doc(docPath).get();
    if (!snap.exists) {
      console.error('No siteSettings document found at', docPath);
      process.exit(2);
    }
    const stored = snap.data() || {};
    const storedHash = stored.masterResetPasswordHash;
    if (!storedHash) {
      console.error('masterResetPasswordHash not set in', docPath);
      process.exit(2);
    }
    const computed = sha256Hex(password);
    console.log('Provided password hash :', computed);
    console.log('Stored masterResetPasswordHash:', storedHash);
    if (computed === storedHash) {
      console.log('MATCH: The provided password matches the stored master password hash.');
      process.exit(0);
    } else {
      console.log('MISMATCH: The provided password does NOT match the stored hash.');
      process.exit(3);
    }
  } catch (e) {
    console.error('ERROR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
