import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

let _app = null;
let _auth = null;
let _db = null;
let _functions = null;

export function initFirebase(config, region = 'us-central1') {
  if (_app) return { app: _app, auth: _auth, db: _db, functionsSvc: _functions };
  _app = initializeApp(config);
  try { _auth = getAuth(_app); } catch (e) { _auth = undefined; }
  try { _db = getFirestore(_app); } catch (e) { _db = undefined; }
  try { _functions = getFunctions(_app, region); } catch (e) { _functions = undefined; }
  return { app: _app, auth: _auth, db: _db, functionsSvc: _functions };
}

export function getFirebase() {
  return { app: _app, auth: _auth, db: _db, functionsSvc: _functions };
}

// Small helper for debugging in dev: log when initialized
export function debugInfo() {
  return {
    initialized: !!_app,
    projectId: _app?.options?.projectId,
    appId: _app?.options?.appId
  };
}
