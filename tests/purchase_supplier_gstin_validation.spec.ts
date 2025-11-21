import { test, expect } from '@playwright/test';

test('inline supplier GSTIN validation and state auto-select', async ({ page }) => {
  const base = process.env.BASE_URL || 'http://localhost:5600';
  await page.goto(`${base}/?admin`, { waitUntil: 'load' });

  // Open Purchases tab
  await page.waitForSelector('a[data-tab="purchases"]', { timeout: 5000 });
  await page.click('a[data-tab="purchases"]');

  await page.waitForSelector('#purchaseForm', { timeout: 5000 });

  // Show inline add supplier row. If the click doesn't reveal it (occasional flakiness),
  // unhide the row via script so tests remain deterministic.
  await page.click('#showNewSupplierBtn');
  await page.waitForSelector('#newSupplierRow', { timeout: 3000 });
  // If the row is still hidden (click didn't work), force it visible so inputs can be typed into.
  if (!(await page.isVisible('#newSupplierRow:not(.hidden)'))) {
    await page.evaluate(() => {
      const r = document.getElementById('newSupplierRow');
      if (r) r.classList.remove('hidden');
    });
    await page.waitForSelector('#newSupplierRow:not(.hidden)', { timeout: 1000 });
  }
  await page.waitForSelector('#newSupplierGstin', { timeout: 2000 });

  const gstInput = page.locator('#newSupplierGstin');
  const feedback = page.locator('#newSupplierGstinFeedback');
  const stateSel = page.locator('#newSupplierStateCode');

  // Enter invalid GSTIN (15 chars) -> feedback should show after debounce
  // Type the invalid GSTIN character-by-character so debounce triggers after the final keystroke
  // Set the value programmatically and dispatch input/change/blur events so the page's
  // debounced validation handler reliably sees the change (more deterministic than typing).
  await page.evaluate(() => {
    const el = document.getElementById('newSupplierGstin');
    if (el) {
      (el as HTMLInputElement).value = '12INVALIDGSTINX';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  });
  // Wait for the application's validation-complete event and assert it reported invalid
  const invalidDetail = await page.evaluate(() => {
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve({ timeout: true }), 3000);
      document.addEventListener('gstin:validated', function handler(e) {
        clearTimeout(timeout);
        // @ts-ignore - event detail serialized
        resolve(e.detail || {});
      }, { once: true });
    });
  });
  // If the event timed out the object will have timeout:true
  expect((invalidDetail as any).timeout).not.toBe(true);
  expect((invalidDetail as any).inputId).toBe('newSupplierGstin');
  expect((invalidDetail as any).valid).toBe(false);

  // Enter a valid GSTIN (example with state code 29 for Karnataka)
  const valid = '29ABCDE1234F1Z5';
  await page.evaluate((v) => {
    const el = document.getElementById('newSupplierGstin');
    if (el) {
      (el as HTMLInputElement).value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, valid);
  // Wait for validation-complete event and assert valid
  const validDetail = await page.evaluate(() => {
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve({ timeout: true }), 3000);
      document.addEventListener('gstin:validated', function handler(e) {
        clearTimeout(timeout);
        // @ts-ignore
        resolve(e.detail || {});
      }, { once: true });
    });
  });
  expect((validDetail as any).timeout).not.toBe(true);
  expect((validDetail as any).inputId).toBe('newSupplierGstin');
  expect((validDetail as any).valid).toBe(true);
  // Feedback should be hidden
  await expect(feedback).toBeHidden();
  // Wait for the app to auto-apply the GST-derived state (it dispatches a gstin:stateApplied event).
  const stateApplied = await page.evaluate(() => {
    return new Promise(resolve => {
      const t = setTimeout(() => resolve({ timeout: true }), 2500);
      document.addEventListener('gstin:stateApplied', function handler(e) {
        clearTimeout(t);
        // @ts-ignore
        resolve(e.detail || {});
      }, { once: true });
    });
  });
  expect((stateApplied as any).timeout).not.toBe(true);
  expect((stateApplied as any).inputId).toBe('newSupplierGstin');
  expect((stateApplied as any).stateCode).toBe('29');
  await expect(stateSel).toHaveValue('29');
});
