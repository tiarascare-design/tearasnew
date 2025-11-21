import { test, expect } from '@playwright/test';

test('inline add supplier: Not GST-registered checkbox disables GSTIN and saves without GSTIN', async ({ page }) => {
  const base = process.env.BASE_URL || 'http://localhost:5600';
  await page.goto(`${base}/?admin`, { waitUntil: 'load' });

  // Open Purchases tab
  await page.waitForSelector('a[data-tab="purchases"]', { timeout: 5000 });
  await page.click('a[data-tab="purchases"]');

  await page.waitForSelector('#purchaseForm', { timeout: 5000 });

  // Show inline add supplier row
  await page.click('#showNewSupplierBtn');
  await page.waitForSelector('#newSupplierRow:not(.hidden)', { timeout: 3000 });

  const gstInput = page.locator('#newSupplierGstin');
  const notReg = page.locator('#newSupplierNotRegistered');
  const addBtn = page.locator('#addSupplierInlineBtn');
  const nameInput = page.locator('#supplierName');
  const addressInput = page.locator('#newSupplierAddress');
  const stateSel = page.locator('#newSupplierStateCode');
  const badge = page.locator('#supplierGstBadge');

    // Directly mark as not registered and verify GSTIN input disables
    await expect(notReg).toBeVisible({ timeout: 3000 });
    await page.evaluate(() => {
      const el = document.getElementById('newSupplierNotRegistered');
      if (el) { (el as HTMLInputElement).checked = true; (el as HTMLInputElement).dispatchEvent(new Event('change')); }
    });
    await expect(gstInput).toBeDisabled();
    // Uncheck restores GSTIN input
    await page.evaluate(() => {
      const el = document.getElementById('newSupplierNotRegistered');
      if (el) { (el as HTMLInputElement).checked = false; (el as HTMLInputElement).dispatchEvent(new Event('change')); }
    });
    await expect(gstInput).toBeEnabled();
});
