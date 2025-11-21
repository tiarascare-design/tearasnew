import { test, expect } from '@playwright/test';

test.describe('Transfer modal', () => {
  test('opens transfer modal when ref-link clicked', async ({ page }) => {
    // adjust URL if you use a different port or path
    await page.goto('http://localhost:5500/?admin');
    // wait for the .ref-link to appear (ledger page should render)
    await page.waitForSelector('.ref-link', { timeout: 10000 });
    const ref = await page.locator('.ref-link').first();
    await ref.click();
    // modal should appear with Transfer Details heading
    const modal = page.locator('text=Transfer Details');
    await expect(modal).toBeVisible();
    // ledger rows section should be visible
    await expect(page.locator('#transferLedgerRows')).toBeVisible();
    // reverse button should be present
    await expect(page.locator('#transferReverseBtn')).toBeVisible();
  });
});
