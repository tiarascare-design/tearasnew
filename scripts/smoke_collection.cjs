const playwright = require('playwright');

(async () => {
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => console.log('PAGE_CONSOLE', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE_ERROR', err && err.stack ? err.stack : String(err)));

    const url = 'http://localhost:5500/';
    console.log('NAVIGATING_TO', url);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(e => console.log('GOTO_ERROR', String(e)));

    // wait a short while for client to render
    await page.waitForTimeout(1500);

    // find first collection link
    const hasGroup = await page.$('a[data-group]');
    if (!hasGroup) {
      console.log('NO_COLLECTION_LINKS_FOUND');
      await browser.close();
      process.exit(0);
    }

    // click first collection link
    await page.click('a[data-group]');
    await page.waitForTimeout(1200);

    // capture the products grid HTML
    const productsHtml = await page.evaluate(() => {
      const el = document.querySelector('.product-card') || document.querySelector('.grid');
      if (!el) return null;
      // return first 2000 chars of the products container
      const container = el.closest('.grid') || el.parentElement;
      return container ? container.innerHTML.slice(0, 4000) : el.innerHTML.slice(0, 4000);
    });

    console.log('PRODUCTS_HTML_START');
    if (productsHtml) console.log(productsHtml.replace(/\n/g, '\\n'));
    else console.log('NO_PRODUCTS_RENDERED');
    console.log('PRODUCTS_HTML_END');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('SCRIPT_ERROR', err && err.stack ? err.stack : String(err));
    process.exit(2);
  }
})();
