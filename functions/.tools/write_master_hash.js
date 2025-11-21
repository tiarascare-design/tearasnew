// Write a precomputed masterResetPasswordHash into the Firestore emulator.
// Usage (from repo root):
// npx firebase emulators:exec --only firestore --project=tiaras-website "node functions/.tools/write_master_hash.js"

const admin = require('firebase-admin');

(async function main(){
  try {
    const PROJECT = process.env.FIREBASE_PROJECT || 'tiaras-website';
  // Precomputed SHA-256 of password 'Apps$123'
  // NOTE: corrected to the actual SHA-256 of 'Apps$123'
  const HASH = 'cf0ae9bd8d5f5433497cf7618684e970ce629f7d23bda900d035e876a02ba875';
    try { admin.initializeApp({ projectId: PROJECT }); } catch (e) {}
    const db = admin.firestore();
    const docPath = `artifacts/${PROJECT}/public/data/siteSettings/main`;
    console.log('Seeding hash into', docPath);
    await db.doc(docPath).set({ masterResetPasswordHash: HASH }, { merge: true });
    console.log('Success: written hash', HASH);
    process.exit(0);
  } catch (e) {
    console.error('Write failed:', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
