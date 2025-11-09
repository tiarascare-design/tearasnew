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

  // Inject two supplier entries into the client state so we don't write to Firestore
  await page.evaluate(() => {
    window.state = window.state || {};
    window.state.allSuppliers = window.state.allSuppliers || [];
    // Registered supplier
    window.state.allSuppliers.push({ id: 's_reg', name: 'Registered Supplier', gstin: '29ABCDE1234F1Z5' });
    // Unregistered supplier
    window.state.allSuppliers.push({ id: 's_unreg', name: 'Unregistered Supplier', gstin: '' });

    // Re-render datalist options if client code uses them on render
    const dl = document.getElementById('suppliersDatalistPurchase');
    if (dl) {
      dl.innerHTML = window.state.allSuppliers.map(s => `<option value="${(s.name||'').replace(/"/g,'&quot;')}"></option>`).join('');
    }
  });

  const supplierInput = page.locator('#supplierName');
  const pricesToggle = page.locator('#purchasePricesIncludeGst');

  // Select registered supplier
  await supplierInput.fill('Registered Supplier');
  // Trigger input/blur handlers
  await supplierInput.dispatchEvent('input');
  await supplierInput.dispatchEvent('blur');

  // Toggle should be checked and enabled
  await expect(pricesToggle).toBeChecked();
  await expect(pricesToggle).toBeEnabled();

  // GST selects should be enabled for new rows; add an item row first
  await page.click('#addPurchaseItemBtn');
  const gstSelect = page.locator('.purchase-item-row .purchase-gst').first();
  await expect(gstSelect).toBeEnabled();

  // Now choose unregistered supplier
  await supplierInput.fill('Unregistered Supplier');
  await supplierInput.dispatchEvent('input');
  await supplierInput.dispatchEvent('blur');

  // Toggle should be unchecked and disabled
  await expect(pricesToggle).not.toBeChecked();
  await expect(pricesToggle).toBeDisabled();

  // Existing GST selects should be disabled and 0
  await expect(gstSelect).toBeDisabled();
  const val = await gstSelect.inputValue();
  expect(val).toBe('0');
});
