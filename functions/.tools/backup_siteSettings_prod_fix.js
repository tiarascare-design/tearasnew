#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');

// Usage:
// node backup_siteSettings_prod_fix.js --appId tiaras-website --key C:\path\to\service-account.json
// or set environment variable GOOGLE_APPLICATION_CREDENTIALS

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--appId' || a === '--app') && args[i+1]) out.appId = args[++i];
    else if ((a === '--key' || a === '--credential') && args[i+1]) out.key = args[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    console.log('Usage: node backup_siteSettings_prod_fix.js --appId <appId> [--key <path-to-service-account.json>]');
    process.exit(0);
  }
  const appId = opts.appId || 'tiaras-website';
  const docPath = `artifacts/${appId}/public/data/siteSettings/main`;

  // Initialize admin SDK robustly
  try {
    if (opts.key) {
      console.log('Initializing admin with service account key:', opts.key);
      const key = JSON.parse(fs.readFileSync(opts.key, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(key), projectId: appId });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('Initializing admin using GOOGLE_APPLICATION_CREDENTIALS');
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: appId });
    } else {
      console.log('No service account provided. Attempting application default credentials (gcloud ADC).');
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: appId });
    }
  } catch (e) {
    // if already initialized, ignore
    if (e && e.code === 'app/duplicate-app') {
      // already initialized
    } else {
      console.error('Failed to initialize Firebase Admin SDK:', e && e.message ? e.message : e);
      process.exit(2);
    }
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
    console.error('Failed to read/write document:', err && err.message ? err.message : err);
    process.exit(2);
  }
}

main();
