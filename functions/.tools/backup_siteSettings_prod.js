#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');

const appId = process.argv[2] || 'tiaras-website';
const docPath = `artifacts/${appId}/public/data/siteSettings/main`;

async function main() {
  try {
    admin.initializeApp({ projectId: appId });
  } catch (e) {
    // ignore if already initialized
  }
  const db = admin.firestore();
  try {
    const snap = await db.doc(docPath).get();
    const out = snap.exists ? snap.data() : { missing: true };
    const fname = `backup_siteSettings_main_${Date.now()}.json`;
    fs.writeFileSync(fname, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote backup to', fname);
    console.log('Document contents:', out);
    process.exit(0);
  } catch (err) {
    console.error('Failed to read/write document:', err.message || err);
    process.exit(2);
  }
}

main();
