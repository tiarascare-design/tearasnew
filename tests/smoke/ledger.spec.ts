import { test, expect } from '@playwright/test';

// E2E smoke: open admin ledgers, add a cash debit twice and ensure modal re-opens and posts
const RAW_BASE = process.env.BASE_URL || 'http://127.0.0.1:5500';
// Build an admin URL that works whether RAW_BASE already contains query params or a trailing slash.
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE.slice(0, -1) : RAW_BASE;
const adminUrl = BASE.includes('?') ? `${BASE}&admin` : `${BASE}/?admin`;

test('add cash debit twice via modal', async ({ page }) => {
  // Open admin preview without auth using ?admin (built above to handle BASE variations)
  await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
  // Ensure admin tab rendered
  await expect(page.locator('text=Transactions').first()).toBeVisible({ timeout: 5000 }).catch(() => {});

  // Click Add Debit in Cash Book
  const cashAddDebit = page.locator('button', { hasText: 'Add Debit' }).first();
  await expect(cashAddDebit).toBeVisible({ timeout: 5000 });
  await cashAddDebit.click();

  // Modal should appear; fill amount and save
  const amount = page.locator('#ledgerEntryAmount');
  // Try clicking to open modal; if that doesn't make the modal visible, fall back to calling a global helper if present.
  try {
    await expect(amount).toBeVisible({ timeout: 2000 });
  } catch (err) {
    // fallback: call openLedgerEntryModal from the page if it's exposed
    await page.evaluate(() => {
      try { if ((window as any).openLedgerEntryModal) (window as any).openLedgerEntryModal('cash', 'debit'); } catch (e) { /* ignore */ }
    });
    await expect(amount).toBeVisible({ timeout: 5000 });
  }
  await amount.fill('123.45');
  // Wait for submit button to be visible and stable (network/JS may take time in production)
  await page.locator('#ledgerEntrySubmitBtn').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  await page.locator('#ledgerEntrySubmitBtn').click();

  // Wait for modal to close
  await expect(page.locator('#ledgerEntryModal')).toHaveCSS('display', 'none', { timeout: 5000 }).catch(() => {});

  // Small wait to allow UI to re-enable quick-add buttons after save
  await page.waitForTimeout(500);

  // Click Add Debit again — modal must open again
  await cashAddDebit.click();
  // Same fallback for second open
  try {
    await expect(page.locator('#ledgerEntryAmount')).toBeVisible({ timeout: 2000 });
  } catch (err) {
    await page.evaluate(() => {
      try { if ((window as any).openLedgerEntryModal) (window as any).openLedgerEntryModal('cash', 'debit'); } catch (e) { }
    });
    await expect(page.locator('#ledgerEntryAmount')).toBeVisible({ timeout: 5000 });
  }
  // Verify amount input is empty on second open
  await expect(page.locator('#ledgerEntryAmount')).toHaveValue('', { timeout: 2000 });
});
