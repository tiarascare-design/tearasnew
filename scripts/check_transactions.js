const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  try {
    await page.goto('http://localhost:5600/?admin', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(3000);
    const nav = await page.$('nav');
    if (!nav) { console.log('NO NAV ELEMENT FOUND'); }
    else {
      const txt = await nav.innerText();
      console.log('NAV TEXT (first 400 chars):', txt.slice(0,400));
    }
  } catch (err) {
    console.error('SCRIPT ERROR:', err.message);
  } finally {
    await browser.close();
  }
})();
