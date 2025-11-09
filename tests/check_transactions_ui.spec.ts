import { test, expect } from '@playwright/test';

// Quick check: open admin page and assert the Transactions tab is visible
test('transactions tab is visible on admin page', async ({ page }) => {
  const base = process.env.BASE_URL || 'http://localhost:5600';
  await page.goto(`${base}/?admin`, { waitUntil: 'load' });
  // Wait for the admin tabs to be rendered by the client app (transactions anchor)
  await page.waitForSelector('a[data-tab="transactions"]', { timeout: 5000 });
  const tabText = await page.locator('a[data-tab="transactions"]').innerText();
  expect(tabText).toContain('Transactions');
  // Ensure the ledger container is present inside the Transactions tab
  await page.waitForSelector('#adminLedgersContainer', { timeout: 5000 });
  const count = await page.locator('#adminLedgersContainer').count();
  expect(count).toBeGreaterThan(0);
});
