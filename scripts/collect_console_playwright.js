const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://localhost:5500/tearasnew-from-bundle/?useProd=1';
  console.log('Starting headless chromium, navigating to', url);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    try {
      const args = msg.args().map(a => a.toString());
      console.log(`[console:${msg.type()}] ${msg.text()}`);
      if (args.length) console.log('  args:', args);
    } catch (e) { console.log('[console] msg parse error', e); }
  });

  page.on('pageerror', err => console.log('[pageerror]', err.toString()));
  page.on('response', resp => console.log(`[response] ${resp.status()} ${resp.url()}`));
  page.on('requestfailed', req => console.log(`[requestfailed] ${req.failure()?.errorText || 'failed'} ${req.url()}`));

  try {
    // allow more time for the page to settle (long-polling to Firestore may keep network busy)
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (resp) console.log('[goto] status', resp.status());
  } catch (e) {
    console.log('[goto] navigation error', e.toString());
  }

  // wait longer to capture console messages (15s)
  await page.waitForTimeout(15000);

  await browser.close();
  console.log('Done.');
})();
