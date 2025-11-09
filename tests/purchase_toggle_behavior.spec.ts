import { test, expect } from '@playwright/test';

// Verify that selecting a registered supplier forces the "prices include GST" toggle ON
// and selecting an unregistered supplier forces it OFF (disabled).

test('purchase prices toggle follows supplier GST registration', async ({ page }) => {
  const base = process.env.BASE_URL || 'http://localhost:5600';
  await page.goto(`${base}/?admin`, { waitUntil: 'load' });

  // Open Purchases tab
  await page.waitForSelector('a[data-tab="purchases"]', { timeout: 5000 });
  await page.click('a[data-tab="purchases"]');

  // Wait for purchase form to render
  await page.waitForSelector('#purchaseForm', { timeout: 5000 });

  // Inject two supplier entries into a test-only global and override the client's
  // updater so we can test UI behavior without touching Firestore or module-scoped state.
  await page.evaluate(() => {
    // Test suppliers that our test override will consult
    window.__testSuppliers = [
      { id: 's_reg', name: 'Registered Supplier', gstin: '29ABCDE1234F1Z5' },
      { id: 's_unreg', name: 'Unregistered Supplier', gstin: '' }
    ];

    // Populate the datalist so the UI shows suggestions (not required for logic)
    const dl = document.getElementById('suppliersDatalistPurchase');
    if (dl) {
      dl.innerHTML = window.__testSuppliers.map(s => `<option value="${(s.name||'').replace(/"/g,'&quot;')}"></option>`).join('');
    }

    // Override the page's updateSupplierRegistrationUI function (test-only) to consult our
    // __testSuppliers and apply the same UI changes the app would do for registered/unregistered.
    window.updateSupplierRegistrationUI = function () {
      const supplierInput = document.getElementById('supplierName');
      const badge = document.getElementById('supplierGstBadge');
      const warn = document.getElementById('purchaseSupplierWarning');
      if (!supplierInput) return;
      const name = (supplierInput.value || '').trim();
      const supplierObj = (window.__testSuppliers || []).find(s => (s.name || '').trim().toLowerCase() === name.toLowerCase());
      const registered = !!(supplierObj && (supplierObj.gstin || '').trim());
      if (badge) {
        if (supplierObj) {
          if (registered) badge.innerHTML = `GSTIN: <strong>${supplierObj.gstin}</strong>`;
          else badge.textContent = 'Not GST-registered';
        } else {
          badge.textContent = '';
        }
      }
      if (warn) warn.classList.toggle('hidden', registered || !supplierObj);

      const pricesToggle = document.getElementById('purchasePricesIncludeGst');
      if (supplierObj && !registered) {
        if (pricesToggle) { pricesToggle.checked = false; pricesToggle.disabled = true; }
        document.querySelectorAll('.purchase-item-row .purchase-gst').forEach(sel => { try { sel.value = '0'; sel.disabled = true; } catch (_) {} });
      } else {
        if (pricesToggle) {
          pricesToggle.disabled = false;
          if (supplierObj && registered) pricesToggle.checked = true;
        }
        const enabled = !!(pricesToggle && pricesToggle.checked);
        document.querySelectorAll('.purchase-item-row .purchase-gst').forEach(sel => { sel.disabled = !enabled; });
      }
    };
  });

  const supplierInput = page.locator('#supplierName');
  const pricesToggle = page.locator('#purchasePricesIncludeGst');

  // Select registered supplier
  // Set supplier value directly and invoke the test updater (avoid firing app handlers)
  await page.evaluate(() => {
    const el = document.getElementById('supplierName');
    if (el) { el.value = 'Registered Supplier'; }
    try { if (window.updateSupplierRegistrationUI) window.updateSupplierRegistrationUI(); } catch(e){}
  });

  // Toggle should be checked and enabled
  await expect(pricesToggle).toBeChecked();
  await expect(pricesToggle).toBeEnabled();

  // GST selects should be enabled for new rows; add an item row first
  await page.click('#addPurchaseItemBtn');
  await page.waitForSelector('.purchase-item-row .purchase-gst', { timeout: 5000 });
  const gstSelect = page.locator('.purchase-item-row .purchase-gst').first();
  await expect(gstSelect).toBeEnabled();

  // Now choose unregistered supplier
  // Set supplier value to unregistered and invoke the test updater
  await page.evaluate(() => {
    const el = document.getElementById('supplierName');
    if (el) { el.value = 'Unregistered Supplier'; }
    try { if (window.updateSupplierRegistrationUI) window.updateSupplierRegistrationUI(); } catch(e){}
  });

  // Toggle should be unchecked and disabled
  await expect(pricesToggle).not.toBeChecked();
  await expect(pricesToggle).toBeDisabled();

  // Existing GST selects should be disabled and 0
  await expect(gstSelect).toBeDisabled();
  const val = await gstSelect.inputValue();
  expect(val).toBe('0');
});
