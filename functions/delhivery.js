const axios = require('axios');
const crypto = require('crypto');

// Delhivery integration helpers
// Configuration via environment variables (set in your Functions runtime):
// - DELHIVERY_TRACK_URL: full URL template to fetch tracking info. Use `{awb}` as placeholder.
//   Example: https://track.delhivery.com/api/items/json/?awb={awb}&token=YOURTOKEN
// - DELHIVERY_API_TOKEN: optional bearer token for Authorization header
// - DELHIVERY_WEBHOOK_SECRET: optional secret to verify webhook payloads (HMAC-SHA256)

function missingConfig(msg) {
  const e = new Error(msg);
  e.code = 'MISSING_CONFIG';
  throw e;
}

// Default test token (provided by the user for testing).
// WARNING: do NOT commit production secrets. Prefer runtime env vars or
// Firebase functions config for real deployments.
const DEFAULT_TEST_TOKEN = process.env.__DELHIVERY_TEST_TOKEN || 'da3b09913805cf2be9695d394231aefd8314c629';

async function trackByAwb(awb) {
  if (!awb) throw new Error('awb required');
  // If a full URL template is provided via DELHIVERY_TRACK_URL, use it.
  // Otherwise build a reasonable default using the token.
  const trackUrlTemplate = process.env.DELHIVERY_TRACK_URL || 'https://track.delhivery.com/api/packages/json/?token={token}&waybill={awb}';
  const token = process.env.DELHIVERY_API_TOKEN || DEFAULT_TEST_TOKEN;
  const url = trackUrlTemplate.replace('{awb}', encodeURIComponent(awb)).replace('{token}', encodeURIComponent(token));
  const headers = {};
  if (process.env.DELHIVERY_API_TOKEN) {
    // Some APIs expect Authorization header instead of token param — include as best-effort
    headers['Authorization'] = `Bearer ${process.env.DELHIVERY_API_TOKEN}`;
  }
  // allow a configurable timeout
  const timeout = parseInt(process.env.DELHIVERY_HTTP_TIMEOUT_MS || '10000', 10);
  const resp = await axios.get(url, { headers, timeout });
  return resp.data;
}

// Verify webhook signature (HMAC-SHA256) if DELHIVERY_WEBHOOK_SECRET is set.
// Expected header name: X-Delhivery-Signature (configurable via DELHIVERY_SIGNATURE_HEADER)
function verifyWebhookSignature(rawBody, req) {
  const secret = process.env.DELHIVERY_WEBHOOK_SECRET;
  if (!secret) return true; // nothing to verify
  const headerName = (process.env.DELHIVERY_SIGNATURE_HEADER || 'x-delhivery-signature').toLowerCase();
  const sig = (req.get && req.get(headerName)) || req.headers[headerName] || '';
  if (!sig) return false;
  // compute HMAC-SHA256 of the raw body
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
  const expected = hmac.digest('hex');
  // signature might come prefixed; compare in lowercase
  return expected === sig.toLowerCase();
}

module.exports = {
  trackByAwb,
  verifyWebhookSignature,
};
