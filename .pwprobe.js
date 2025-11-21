const { chromium } = require('playwright');
(async()=>{
  try{
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5500/?useProd=1', {waitUntil:'load', timeout:15000});
    const result = await page.evaluate(() => {
      const arr = Array.from(document.querySelectorAll('[required]')).map(e => ({ id: e.id || null, name: e.name || null, tag: e.tagName, hidden: (e.offsetWidth === 0 && e.offsetHeight === 0) || getComputedStyle(e).display === 'none' }));
      const dup = (document.documentElement.innerHTML.match(/id=\"newSupplierAddress\"/g) || []).length;
      return { requiredHidden: arr.slice(0,200), requiredHiddenCount: arr.filter(x => x.hidden).length, newSupplierAddressCount: dup };
    });
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
