import { test, expect } from '@playwright/test';

const TARGET = process.env.TARGET_URL || 'https://tiaras-website.web.app';
console.log('ADMIN TEST TARGET:', TARGET);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// This test signs in with provided credentials if available. Skips otherwise.
test.describe('Admin login (optional)', () => {
  test('sign in as admin if creds provided', async ({ page }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(true, 'No admin credentials provided via ADMIN_EMAIL/ADMIN_PASSWORD');
    }

    await page.goto(TARGET + '/?admin', { waitUntil: 'domcontentloaded' });

    // Navigate to auth page if necessary
    try {
      // Click account/auth link if present
      const authBtn = page.locator('a[data-page="auth"], a[href*="auth"], a:has-text("Login"), a:has-text("Sign in")');
      if (await authBtn.count() > 0) await authBtn.first().click();
    } catch (_) {}

    // Fill login form if visible. The app uses custom forms; try common selectors.
    const emailSel = page.locator('input[type="email"], input[name="email"], input#email');
    const passSel = page.locator('input[type="password"], input[name="password"], input#password');
    const submitBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Login")');

    if ((await emailSel.count()) === 0 || (await passSel.count()) === 0) {
      console.warn('Login form not found; cannot sign in automatically.');
      test.skip(true, 'Login form not found on page');
    }

    await emailSel.fill(ADMIN_EMAIL);
    await passSel.fill(ADMIN_PASSWORD);
    if ((await submitBtn.count()) > 0) {
      await submitBtn.first().click();
    } else {
      // Submit via Enter if no button found
      await passSel.press('Enter');
    }

    // Wait for admin indicator
    const adminIndicator = page.locator('text=Admin Panel, text=Master Reset, text=Save All Settings');
    await expect(adminIndicator.first()).toBeVisible({ timeout: 8000 });
  });
});
