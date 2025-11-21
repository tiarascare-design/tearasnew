const admin = require('firebase-admin');

(async function main() {
  try {
    const PROJECT = process.env.FIREBASE_PROJECT || 'tiaras-website';
    try { admin.initializeApp({ projectId: PROJECT }); } catch (e) { }
    const db = admin.firestore();
    const docPath = `artifacts/${PROJECT}/public/data/siteSettings/main`;
    const snap = await db.doc(docPath).get();
    console.log('DOC_PATH:', docPath);
    console.log('EXISTS:', !!snap.exists);
    console.log('DATA:', JSON.stringify(snap.exists ? snap.data() : {}, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
