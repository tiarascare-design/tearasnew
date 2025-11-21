import { test, expect } from '@playwright/test';

// Configurable target URL via env TARGET_URL or CLI --param
const TARGET = process.env.TARGET_URL || 'https://tiaras-website.web.app';
console.log('TEST TARGET:', TARGET);

test.describe('Admin Party Directory', () => {
  test('party tables render and Edit modal opens', async ({ page }) => {
    await page.goto(TARGET + '/?admin', { waitUntil: 'domcontentloaded' });

    // Force the admin tab to Transactions (ledgers) and re-render (safe in dev preview)
    await page.evaluate(() => {
      try {
        (window as any).state = (window as any).state || {};
        (window as any).state.adminCurrentTab = 'transactions';
        if ((window as any).renderAdminLedgersPage) (window as any).renderAdminLedgersPage();
      } catch (e) { console.warn('Could not force renderAdminLedgersPage', e); }
    });

    // Wait for suppliers table to appear
    const supTable = page.locator('table.party-table[data-type="suppliers"]');
    await expect(supTable).toBeVisible({ timeout: 10000 });

    // Ensure there is at least one Edit button and click it
    const editBtn = page.locator('button.edit-party-btn').first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Check that the edit modal (GSTIN input) appears
    const gstInput = page.locator('#partyEditGstin');
    await expect(gstInput).toBeVisible();
  });
});
