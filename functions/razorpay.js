const axios = require('axios');
const crypto = require('crypto');

function missingConfig(msg) {
  const e = new Error(msg);
  e.code = 'MISSING_CONFIG';
  throw e;
}

// Create a Razorpay order using REST API. Amount must be integer in paise (INR smallest unit).
async function createOrder({ amountPaise, currency = 'INR', receipt = null, notes = {} } = {}) {
  if (!amountPaise || typeof amountPaise !== 'number') throw new Error('amountPaise (number) required');
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) missingConfig('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured');

  const url = 'https://api.razorpay.com/v1/orders';
  const payload = {
    amount: Math.round(amountPaise),
    currency: currency || 'INR',
    receipt: receipt || `receipt_${Date.now()}`,
    payment_capture: 1,
    notes: notes || {}
  };
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };
  const resp = await axios.post(url, payload, { headers, timeout: 15000 });
  return resp.data; // contains id (order id), amount, currency, receipt, status, etc.
}

// Verify razorpay signature: signature expected = HMAC_SHA256(order_id + '|' + payment_id, key_secret)
function verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature } = {}) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) missingConfig('RAZORPAY_KEY_SECRET not configured');
  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const hmac = crypto.createHmac('sha256', keySecret);
  hmac.update(payload);
  const expected = hmac.digest('hex');
  return expected === (razorpay_signature || '').toString();
}

module.exports = {
  createOrder,
  verifySignature
};
