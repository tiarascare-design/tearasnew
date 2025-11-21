import { test, expect } from '@playwright/test';

// Basic smoke test: verify the home page loads and shows TIARAS heading
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5500';

test('home page loads and has brand heading', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Look for main brand link (use role-based locator to avoid matching footer/other occurrences)
  const heading = page.getByRole('link', { name: 'TIARAS', exact: true });
  await expect(heading.first()).toBeVisible({ timeout: 5000 });
});
