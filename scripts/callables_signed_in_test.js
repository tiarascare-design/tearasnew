const admin = require('firebase-admin');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT = 'tiaras-website';
const REGION = 'us-central1';
const CREATE_URL = `https://${REGION}-${PROJECT}.cloudfunctions.net/createRazorpayOrder`;
const VERIFY_URL = `https://${REGION}-${PROJECT}.cloudfunctions.net/verifyRazorpayPayment`;
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'tiaras-website-firebase-adminsdk-fbsvc-9428e3c305.json');
// API key from assets/js/app.js
const FIREBASE_API_KEY = 'AIzaSyAYLMFFAzJhiNZbtwXxmeGRMzuar6Af7fE';

async function main() {
  console.log('Signed-client callable test starting');

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('Service account file not found at', SERVICE_ACCOUNT_PATH);
    process.exit(2);
  }
  admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
  const uid = `e2e_client_user_${Date.now()}`;

  // Create a test user (uid only, no password) - we'll mint a custom token for it
  console.log('Creating custom token for uid', uid);
  const customToken = await admin.auth().createCustomToken(uid);

  // Exchange custom token for ID token using REST API
  console.log('Exchanging custom token for ID token with REST API');
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`;
  const signResp = await axios.post(signInUrl, { token: customToken, returnSecureToken: true });
  const idToken = signResp.data.idToken;
  console.log('Obtained ID token; length=', idToken.length);

  // Now call createRazorpayOrder with Authorization: Bearer <idToken>
  const amountPaise = 100; // 1 INR
  console.log('Calling createRazorpayOrder with authenticated client');
  const createResp = await axios.post(CREATE_URL, { data: { amountPaise, currency: 'INR', receipt: `receipt_client_${Date.now()}` } }, { headers: { Authorization: `Bearer ${idToken}` }, timeout: 20000 });
  console.log('createRazorpayOrder response:', createResp.data);
  if (!createResp.data || !createResp.data.ok) throw new Error('createRazorpayOrder failed');

  const razorpayOrderId = createResp.data.orderId;
  const fakePaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) { console.warn('RAZORPAY_KEY_SECRET not set in env; set it to compute signature'); }
  const payload = `${razorpayOrderId}|${fakePaymentId}`;
  const expectedSig = crypto.createHmac('sha256', secret || 'dummy').update(payload).digest('hex');

  console.log('Calling verifyRazorpayPayment with authenticated client');
  const verifyResp = await axios.post(VERIFY_URL, { data: { publicOrderId: `client_test_order_${Date.now()}`, orderData: { appId: PROJECT, userId: uid, items: [], totalAmountPaise: amountPaise }, razorpay_order_id: razorpayOrderId, razorpay_payment_id: fakePaymentId, razorpay_signature: expectedSig } }, { headers: { Authorization: `Bearer ${idToken}` }, timeout: 20000 });
  console.log('verifyRazorpayPayment response:', verifyResp.data);

  console.log('Signed-client callable test completed');
}

main().catch(e=>{ console.error('Test failed:', e.response ? e.response.data : e.message || e); process.exit(1); });
