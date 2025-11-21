const { chromium } = require('playwright');

(async () => {
  const BASE = process.env.USE_FILE_URL === '1' ? 'file:///' + require('path').resolve(__dirname, 'client_callable_page.html').replace(/\\/g, '/') : 'http://localhost:8000/scripts/client_callable_page.html';
  const TEST_EMAIL = 'test-e2e@example.com';
  const TEST_PASSWORD = 'TestPass123!';
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', m => console.log('PAGE LOG:', m.text()));
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    console.log('Page loaded');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('text=Sign In');
    // wait for status
    await page.waitForFunction(() => document.getElementById('status') && document.getElementById('status').textContent.includes('Signed in'), null, { timeout: 15000 });
    const status = await page.locator('#status').innerText();
    console.log('Status after sign-in:', status);
    await page.fill('#amount', '100');
    await page.click('text=Create Order');
    // wait for result to contain order details
    await page.waitForFunction(() => document.getElementById('result') && document.getElementById('result').textContent.trim().length>0, null, { timeout: 15000 });
    const result = await page.locator('#result').innerText();
    console.log('Create order result:', result);

    // Wait for razorpay checkout frame to appear and fill test card details
    const frame = await page.waitForEvent('frameattached', { timeout: 15000 }).catch(()=>null);
    // Sometimes frameattached doesn't fire; find a frame whose url contains 'checkout.razorpay'
    let checkoutFrame = null;
    for (const f of page.frames()) {
      if ((f.url() || '').includes('checkout.razorpay') || (f.url() || '').includes('razorpay')) { checkoutFrame = f; break; }
    }
    if (!checkoutFrame) {
      // try polling for iframe element
      const iframeHandle = await page.$('iframe[src*="checkout.razorpay"], iframe[src*="razorpay"]');
      if (iframeHandle) checkoutFrame = await iframeHandle.contentFrame();
    }
    if (checkoutFrame) {
      console.log('Filling Razorpay test card in checkout frame (robust mode)');
      // Try to set input values via evaluate to bypass visibility issues
      const fillInFrame = async (f) => {
        try {
          await f.evaluate(() => { window.focus(); });
        } catch (e) {}
        const sets = [
          { sel: 'input[placeholder*="Card number"]', val: '4111 1111 1111 1111' },
          { sel: 'input[placeholder*="Card number"]', val: '4111111111111111' },
          { sel: 'input[name="card[number]"]', val: '4111111111111111' },
          { sel: 'input[placeholder*="MM / YY"]', val: '12 / 30' },
          { sel: 'input[placeholder*="MM/YY"]', val: '12/30' },
          { sel: 'input[placeholder*="MM"]', val: '12' },
          { sel: 'input[placeholder*="YY"]', val: '30' },
          { sel: 'input[name="card[expiry]"]', val: '12/30' },
          { sel: 'input[placeholder*="CVV"]', val: '123' },
          { sel: 'input[name="card[cvv]"]', val: '123' },
        ];
        for (const s of sets) {
          try {
            await f.evaluate((sel, val) => {
              const el = document.querySelector(sel);
              if (el) {
                el.focus(); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              return false;
            }, s.sel, s.val);
          } catch (e) {}
        }

        // attempt to click any visible/interactive button using evaluate
        const clicked = await f.evaluate(() => {
          const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
          for (const c of candidates) {
            const txt = (c.innerText || c.value || '').toLowerCase();
            if (txt.includes('pay') || txt.includes('pay now') || txt.includes('pay ₹') || txt.includes('continue') || txt.includes('submit')) {
              try { c.click(); return true; } catch (e) { }
            }
          }
          // fallback: click first enabled button
          for (const c of candidates) {
            try { c.click(); return true; } catch (e) { }
          }
          return false;
        });
        return clicked;
      };

      // try on the frame and its child frames
      let success = await fillInFrame(checkoutFrame);
      if (!success) {
        for (const child of checkoutFrame.childFrames()) {
          success = await fillInFrame(child);
          if (success) break;
        }
      }
      console.log('Attempted to interact with checkout, success=', success);
    } else {
      console.log('Razorpay checkout frame not found; skipping card fill');
    }
  } catch (e) {
    console.error('Playwright run failed:', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
