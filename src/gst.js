// Lightweight GST helper utilities extracted for unit testing
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

// Importing GST_STATE_CODES from a JSON file so the codes list can be reused
// across client and server code as a single source of truth. Uses import
// assertions for JSON; ensure your build/runtime supports JSON module imports.
// Import the state codes from a small JS wrapper for best-compatibility across
// environments (Node, bundlers, browser). This keeps the module synchronous
// and predictable for both tests and the browser app.
import { GST_STATE_CODES } from './gst_state_codes.js';

function getStateCodeFromGstin(gstin) {
  if (!gstin || typeof gstin !== 'string') return null;
  const v = gstin.trim();
  if (v.length < 2) return null;
  const code = v.substring(0,2);
  // GST_STATE_CODES is an array of objects { code, name }
  const found = GST_STATE_CODES.find(s => String(s.code) === String(code));
  return found ? code : null;
}

function computeGstForItems(items, pricesIncludeGst, merchantStateCode, supplierStateCode) {
  const rateBuckets = {};
  let subtotalEx = 0;
  let subtotalInc = 0;
  const intraState = !!(merchantStateCode && supplierStateCode && merchantStateCode === supplierStateCode);
  items.forEach(it => {
    const price = parseFloat(it.price || 0) || 0;
    const qty = parseFloat(it.quantity || 0) || 0;
    const r = parseFloat(it.gstPercentage || 0) || 0;
    if (r <= 0) {
      const lineEx = price * qty;
      subtotalEx += lineEx; subtotalInc += lineEx;
      return;
    }
    if (pricesIncludeGst) {
      const lineInc = price * qty;
      const tax = lineInc * (r / (100 + r));
      const lineEx = lineInc - tax;
      subtotalInc += lineInc; subtotalEx += lineEx;
      let cgst = 0, sgst = 0, igst = 0;
      if (intraState) { cgst = tax/2; sgst = tax/2; } else { igst = tax; }
      const bucket = rateBuckets[r] || { totalTax: 0, cgst: 0, sgst: 0, igst: 0 };
      bucket.totalTax += tax; bucket.cgst += cgst; bucket.sgst += sgst; bucket.igst += igst;
      rateBuckets[r] = bucket;
    } else {
      const lineEx = price * qty;
      const tax = lineEx * (r / 100);
      const lineInc = lineEx + tax;
      subtotalEx += lineEx; subtotalInc += lineInc;
      let cgst = 0, sgst = 0, igst = 0;
      if (intraState) { cgst = tax/2; sgst = tax/2; } else { igst = tax; }
      const bucket = rateBuckets[r] || { totalTax: 0, cgst: 0, sgst: 0, igst: 0 };
      bucket.totalTax += tax; bucket.cgst += cgst; bucket.sgst += sgst; bucket.igst += igst;
      rateBuckets[r] = bucket;
    }
  });
  let totalTax = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
  Object.values(rateBuckets).forEach(b => { totalTax += (b.totalTax||0); cgstTotal += (b.cgst||0); sgstTotal += (b.sgst||0); igstTotal += (b.igst||0); });
  return { rates: rateBuckets, total: totalTax, subtotalEx, subtotalInc, cgstTotal, sgstTotal, igstTotal, intraState };
}

// Attach GSTIN validation behavior similar to the app but minimal for tests.
function attachGstinValidation(el, feedbackEl) {
  if (!el) return;
  let deb = null;
  const run = () => {
    const v = (el.value||'').toString().trim().toUpperCase();
    if (!v) {
      if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; feedbackEl.removeAttribute && feedbackEl.removeAttribute('data-validation-state'); } catch(_) {} }
        try { el.classList.remove('tiaras-valid'); el.classList.remove('tiaras-invalid'); el.removeAttribute && el.removeAttribute('aria-invalid'); } catch(_) {}
      document.dispatchEvent(new CustomEvent('gstin:validated', { detail: { inputId: el.id, valid: false } }));
      return;
    }
    // If input has fewer than 15 chars, show as 'invalid' while typing (red border)
    if (v.length > 0 && v.length < 15) {
      try { el.classList.remove('tiaras-valid'); el.classList.add('tiaras-invalid'); el.setAttribute && el.setAttribute('aria-invalid', 'true'); } catch(_) {}
      if (feedbackEl) {
        try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; feedbackEl.removeAttribute && feedbackEl.removeAttribute('data-validation-state'); } catch(_) {}
      }
      document.dispatchEvent(new CustomEvent('gstin:validated', { detail: { inputId: el.id, valid: false } }));
      return;
    }

    // Validate against first 15 characters — input may be longer if pasted
    const v15 = v.substring(0,15);
    const ok = GSTIN_REGEX.test(v15) && v.length >= 15;
    if (feedbackEl) {
      if (ok) {
        try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; feedbackEl.setAttribute && feedbackEl.setAttribute('data-validation-state', 'valid'); } catch(_) {}
      } else {
        try { feedbackEl.classList.remove('hidden'); feedbackEl.textContent = 'Invalid GSTIN format. Enter 15 characters: digits and uppercase letters.'; feedbackEl.setAttribute && feedbackEl.setAttribute('data-validation-state', 'invalid'); } catch(_) {}
      }
    }
    try {
      if (ok) {
          try { el.classList.remove('tiaras-invalid'); el.classList.add('tiaras-valid'); } catch(_) {}
          el.setAttribute && el.setAttribute('aria-invalid', 'false');
      } else {
          try { el.classList.remove('tiaras-valid'); el.classList.add('tiaras-invalid'); } catch(_) {}
          el.setAttribute && el.setAttribute('aria-invalid', 'true');
      }
    } catch(_) {}
    document.dispatchEvent(new CustomEvent('gstin:validated', { detail: { inputId: el.id, valid: ok } }));
  };
  const handler = () => {
    // Uppercase the input and validate on every keystroke for continuous feedback
    el.value = (el.value||'').toString().toUpperCase();
    if (feedbackEl) {
      try { feedbackEl.setAttribute && feedbackEl.setAttribute('aria-live', 'polite'); } catch(_) {}
    }
    // Run validation immediately so border updates as user types
    try { run(); } catch(_) {}
  };
  el.addEventListener('input', handler);
  el.addEventListener('change', handler);
  el.addEventListener('blur', handler);
  // initialize
  handler();
}

export { GSTIN_REGEX, getStateCodeFromGstin, computeGstForItems, attachGstinValidation, GST_STATE_CODES };
