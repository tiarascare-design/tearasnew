import { test, expect } from '@playwright/test';

// Configurable target URL via env TARGET_URL or CLI --param
const TARGET = process.env.TARGET_URL || 'https://tiaras-website.web.app';
console.log('TEST TARGET:', TARGET);

test.describe('Smoke: basic site integrity', () => {
  test('homepage loads and key assets present', async ({ page }) => {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });

    // Basic title or main container present
    await expect(page.locator('body')).toBeVisible();

    // Check that CSS loaded by looking for a known class on the header
    const header = page.locator('#main-header');
    await expect(header).toBeVisible();

    // Ensure main JS loaded by checking for a global we know the app sets (appId)
    // appId is injected as __app_id sometimes; fallback to existence of pageContent
    const pageContent = page.locator('#pageContent');
    await expect(pageContent).toBeVisible();

    // Check static asset (CSS) returns 200
    const cssUrl = await page.evaluate(() => {
      const el = document.querySelector('link[rel="stylesheet"][href*="styles.css"]') || document.querySelector('link[rel="stylesheet"]');
      return el ? (el as HTMLLinkElement).href : '';
    });
    if (cssUrl) {
      const resp = await page.request.get(cssUrl);
      expect(resp.ok()).toBeTruthy();
    }

    // Find Settings / Save All Settings button if present in DOM
    const saveBtn = page.locator('button:has-text("Save All Settings")');
    if (await saveBtn.count() > 0) {
      await expect(saveBtn.first()).toBeVisible();
    }
  });

  test('settings page: UI layout for Save vs App Reset (tolerant)', async ({ page }) => {
    // Open settings/admin preview (dev preview via ?admin should enable admin UI locally)
    await page.goto(TARGET + '/?admin', { waitUntil: 'domcontentloaded' });

    // Locators (may not be present on production if admin preview is disabled)
    const saveBtn = page.locator('button:has-text("Save All Settings")');
    const appReset = page.locator('text=App Reset (Admin)');

    const saveCount = await saveBtn.count();
    const resetCount = await appReset.count();

    // If either element is missing, log a warning and skip strict ordering check.
    if (saveCount === 0 || resetCount === 0) {
      console.warn('Admin preview not available in this environment — skipping strict layout assertions.');
      // Make best-effort: assert that if Save exists it is visible; similarly for App Reset
      if (saveCount > 0) await expect(saveBtn.first()).toBeVisible();
      if (resetCount > 0) await expect(appReset.first()).toBeVisible();
      return;
    }

    // Both present — assert visibility and DOM ordering
    await expect(saveBtn.first()).toBeVisible();
    await expect(appReset.first()).toBeVisible();

    const saveIndex = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const s = all.find(el => el.textContent && el.textContent.includes('Save All Settings')) || null;
      const r = all.find(el => el.textContent && el.textContent.includes('App Reset (Admin)')) || null;
      return { save: s ? all.indexOf(s) : -1, reset: r ? all.indexOf(r) : -1 };
    });

    expect(saveIndex.save).toBeGreaterThanOrEqual(0);
    expect(saveIndex.reset).toBeGreaterThanOrEqual(0);
    expect(saveIndex.save).toBeLessThan(saveIndex.reset);
  });
});
