import { describe, it, expect } from 'vitest';
import { GSTIN_REGEX, getStateCodeFromGstin, computeGstForItems, attachGstinValidation } from '../../src/gst';

describe('GST helpers', () => {
  it('GSTIN regex should accept a valid GSTIN and reject invalid ones', () => {
    const valid = '29ABCDE1234F1Z5';
    expect(GSTIN_REGEX.test(valid)).toBe(true);
    const short = '29ABCDE1234F1Z';
    expect(GSTIN_REGEX.test(short)).toBe(false);
    const lower = '29abcde1234f1z5';
    expect(GSTIN_REGEX.test(lower.toUpperCase())).toBe(true);
  });

  it('getStateCodeFromGstin extracts first two digits or returns null', () => {
    expect(getStateCodeFromGstin('29ABCDE1234F1Z5')).toBe('29');
    expect(getStateCodeFromGstin('')).toBe(null);
    expect(getStateCodeFromGstin(null)).toBe(null);
  });

  it('computeGstForItems splits tax intra-state and inter-state correctly', () => {
    const items = [{ price: 100, quantity: 2, gstPercentage: 18 }];
    const resIntra = computeGstForItems(items, false, '29', '29');
    expect(resIntra.intraState).toBe(true);
    // For exclusive pricing: tax = 200 * 0.18 = 36; cgst & sgst half each
    expect(Math.round(resIntra.total)).toBe(36);
    expect(Math.round(resIntra.cgstTotal + resIntra.sgstTotal)).toBe(36);

    const resInter = computeGstForItems(items, false, '29', '32');
    expect(resInter.intraState).toBe(false);
    expect(Math.round(resInter.igstTotal)).toBe(36);
  });

  it('attachGstinValidation emits gstin:validated event with correct validity', async () => {
    // JSDOM environment provided by Vitest -- create elements
    const input = document.createElement('input');
    input.id = 'testGstin';
    const feedback = document.createElement('div');
    document.body.appendChild(input);
    document.body.appendChild(feedback);
    attachGstinValidation(input, feedback);

    // set invalid value
    input.value = '12INVALIDGSTINX';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const invalid = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ timeout: true }), 500);
      document.addEventListener('gstin:validated', function cb(e) { clearTimeout(t); resolve(e.detail); }, { once: true });
    });
    expect(invalid.timeout).not.toBe(true);
    expect(invalid.inputId).toBe('testGstin');
    expect(invalid.valid).toBe(false);

    // set valid value
    input.value = '29ABCDE1234F1Z5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const valid = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ timeout: true }), 500);
      document.addEventListener('gstin:validated', function cb(e) { clearTimeout(t); resolve(e.detail); }, { once: true });
    });
    expect(valid.timeout).not.toBe(true);
    expect(valid.inputId).toBe('testGstin');
    expect(valid.valid).toBe(true);
  });
});
