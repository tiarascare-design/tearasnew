#!/usr/bin/env node
/**
 * seed_master_password.js
 *
 * Compute SHA-256 hex of a supplied password and write it into Firestore
 * at the siteSettings document for the given appId.
 *
 * WARNING: This script will only write to Firestore if the environment
 * variable FIRESTORE_EMULATOR_HOST is set OR if --force is passed on the
 * command line. This is to avoid accidental writes to production.
 *
 * Usage:
 *   node seed_master_password.js --password "MySecret" --appId tiaras-website
 *   # to force against production (dangerous):
 *   node seed_master_password.js --password "MySecret" --appId tiaras-website --force
 */

const { readFileSync } = require('fs');
const crypto = require('crypto');
const admin = require('firebase-admin');

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.log('\nUsage: node seed_master_password.js --password "MySecret" --appId <appId> [--force]');
  process.exit(msg ? 2 : 0);
}

// simple argv parsing to avoid extra deps
function parseArgs() {
  const out = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--password' || a === '-p') { out.password = args[++i]; }
    else if (a === '--appId' || a === '--app') { out.appId = args[++i]; }
    else if (a === '--force') { out.force = true; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

const argv = parseArgs();
const password = argv.password;
const appId = argv.appId || 'tiaras-website';
const force = !!argv.force;

if (!password) usageAndExit('Error: --password is required');

const hash = crypto.createHash('sha256').update(String(password), 'utf8').digest('hex');
console.log('Computed SHA-256 hex:', hash);

const allowWrite = force || !!process.env.FIRESTORE_EMULATOR_HOST;
if (!allowWrite) {
  console.warn('\nNot writing to Firestore because FIRESTORE_EMULATOR_HOST is not set and --force was not provided.');
  console.log('If you want to write to an emulator, set FIRESTORE_EMULATOR_HOST (e.g. localhost:8080) and try again.');
  console.log('To force a production write (dangerous), re-run with --force.');
  process.exit(0);
}

// Initialize Firebase Admin (application-default or emulator)
try {
  admin.initializeApp();
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
  } catch (e) {
    console.error('Write failed:', e);
    process.exit(2);
  }
})();
const admin = require('firebase-admin');
const crypto = require('crypto');

// Usage: node seed_master_password.js [--appId <appId>] [--password <password>] [--emulatorHost host:port]

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--appId' && args[i+1]) { out.appId = args[++i]; }
    else if (a === '--password' && args[i+1]) { out.password = args[++i]; }
    else if (a === '--emulatorHost' && args[i+1]) { out.emulatorHost = args[++i]; }
  }
  return out;
}

function makePassword(length = 20) {
  // url-safe base64 string trimmed
  return crypto.randomBytes(Math.max(16, length)).toString('base64').replace(/\+/g, 'A').replace(/\//g, 'B').slice(0, length);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function main() {
  const opts = parseArgs();
  const appId = opts.appId || 'tiaras-website';
  // Allow specifying the password via environment variable to avoid shell
  // quoting/expansion issues when running in different shells.
  const password = opts.password || process.env.SEED_MASTER_PASSWORD || makePassword(20);
  const emulatorHost = opts.emulatorHost || process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.warn(`FIRESTORE_EMULATOR_HOST not set. Defaulting to ${emulatorHost} for this run (emulator-only!).`);
    process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
  }

  console.log('Using Firestore emulator host:', process.env.FIRESTORE_EMULATOR_HOST);

  // Initialize admin SDK (no credentials needed for emulator when FIRESTORE_EMULATOR_HOST is set)
  try {
    admin.initializeApp({ projectId: appId });
  } catch (e) {
    // ignore if already initialized
  }
  const db = admin.firestore();

  const hash = sha256Hex(password);
  const docPath = `artifacts/${appId}/public/data/siteSettings/main`;
  const docRef = db.doc(docPath);

  console.log(`Seeding masterResetPasswordHash into '${docPath}'`);
  try {
    await docRef.set({ masterResetPasswordHash: hash }, { merge: true });
    console.log('Success: masterResetPasswordHash written.');
    console.log('Master password (keep this secret):', password);
    console.log('Stored hash (SHA-256 hex):', hash);
    process.exit(0);
  } catch (e) {
    console.error('Failed to write to Firestore emulator:', e.message || e);
    process.exit(2);
  }
}

main();
