const playwright = require('playwright');

(async () => {
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => {
      console.log('PAGE_CONSOLE', msg.type(), msg.text());
    });
    page.on('pageerror', err => console.log('PAGE_ERROR', err && err.stack ? err.stack : String(err)));
    page.on('response', response => {
      if (response.status() >= 400) console.log('RESPONSE_ERROR', response.status(), response.url());
    });

    const url = 'http://localhost:5500/';
    console.log('NAVIGATING_TO', url);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(e => console.log('GOTO_ERROR', String(e)));

    // Ensure a minimal state exists so inline renderers won't throw when accessed
    await page.evaluate(() => {
      window.state = window.state || { siteSettings: {}, allPurchases: [] };
      window.currentPage = window.currentPage || '';
    }).catch(() => {});

    // Wait for app to initialize (render function) or timeout
    try {
      await page.waitForFunction(() => typeof renderAdminPurchasesPage === 'function', { timeout: 20000 });
    } catch (e) {
      console.log('WARN', 'renderAdminPurchasesPage not available within timeout');
    }

    // If render function exists, use it, otherwise try to set state and call a top-level render dispatcher if present
    const hasRenderFn = await page.evaluate(() => typeof renderAdminPurchasesPage === 'function');
    if (hasRenderFn) {
      await page.evaluate(() => {
        window.currentPage = 'admin';
        window.state = window.state || {};
        window.state.adminCurrentTab = 'purchases';
        try { renderAdminPurchasesPage(); } catch (e) { console.error('INPAGE_RENDER_ERROR', e && e.stack ? e.stack : e); }
      });
    } else {
      // Try clicking the admin purchases tab UI (if present) to trigger client-side navigation
      try {
        await page.click('a[data-tab="purchases"]', { timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(800);
      } catch (e) {}
      // try setting state and calling a generic re-render function if present
      await page.evaluate(() => {
        window.currentPage = 'admin';
        window.state = window.state || {};
        window.state.adminCurrentTab = 'purchases';
        try {
          if (typeof renderApp === 'function') renderApp();
          if (typeof renderAdminPage === 'function') renderAdminPage();
        } catch (e) { /* ignore */ }
      });
    }

    // wait a short while for client code to render
    await page.waitForTimeout(2500);

    // capture header container html
    const headerHtml = await page.evaluate(() => {
      const el = document.getElementById('purchaseHistoryContainer');
      return el ? el.innerHTML.slice(0, 2000) : null;
    });

    console.log('PURCHASE_HISTORY_CONTAINER_HTML_START');
    if (headerHtml) console.log(headerHtml.replace(/\n/g, '\\n'));
    else console.log('MISSING');
    console.log('PURCHASE_HISTORY_CONTAINER_HTML_END');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('SCRIPT_ERROR', err && err.stack ? err.stack : String(err));
    process.exit(2);
  }
})();
