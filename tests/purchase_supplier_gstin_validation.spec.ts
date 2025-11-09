import { test, expect } from '@playwright/test';

test('inline supplier GSTIN validation and state auto-select', async ({ page }) => {
  const base = process.env.BASE_URL || 'http://localhost:5600';
  await page.goto(`${base}/?admin`, { waitUntil: 'load' });

  // Open Purchases tab
  await page.waitForSelector('a[data-tab="purchases"]', { timeout: 5000 });
  await page.click('a[data-tab="purchases"]');

  await page.waitForSelector('#purchaseForm', { timeout: 5000 });

  // Show inline add supplier row
  await page.click('#showNewSupplierBtn');
  await page.waitForSelector('#newSupplierGstin', { timeout: 2000 });

  const gstInput = page.locator('#newSupplierGstin');
  const feedback = page.locator('#newSupplierGstinFeedback');
  const stateSel = page.locator('#newSupplierStateCode');

  // Enter invalid GSTIN (15 chars) -> feedback should show after debounce
  // Type the invalid GSTIN character-by-character so debounce triggers after the final keystroke
  await gstInput.fill('');
  await gstInput.type('12INVALIDGSTINX', { delay: 40 });
  // Wait longer than the debounce (350ms) to allow validation to run
  await page.waitForTimeout(600);
  const txt = await feedback.textContent();
  expect((txt || '').toLowerCase()).toContain('invalid');

  // Enter a valid GSTIN (example with state code 29 for Karnataka)
  const valid = '29ABCDE1234F1Z5';
  await gstInput.fill('');
  await gstInput.type(valid, { delay: 40 });
  await page.waitForTimeout(600);
  // Feedback should be hidden
  await expect(feedback).toBeHidden();
  // State select should be set to 29
  await expect(stateSel).toHaveValue('29');
});
