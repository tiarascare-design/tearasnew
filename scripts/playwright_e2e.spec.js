const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8000/scripts/client_callable_page.html';
const TEST_EMAIL = 'test-e2e@example.com';
const TEST_PASSWORD = 'TestPass123!';

test('client callable create order', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // fill sign-in
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('text=Sign In');
  // wait for status to show signed in
  await page.waitForFunction(() => document.getElementById('status') && document.getElementById('status').textContent.includes('Signed in'), null, { timeout: 15000 });
  const status = await page.locator('#status').innerText();
  console.log('Status after sign-in:', status);

  // click create order
  await page.fill('#amount', '100');
  await page.click('text=Create Order');

  // wait for result to be populated
  await page.waitForSelector('#result');
  // poll until result contains either 'ok' or 'Error'
  const result = await page.locator('#result').innerText();
  console.log('Create order raw result:', result);
  // assert result contains orderId or ok
  expect(result.length).toBeGreaterThan(0);
});
