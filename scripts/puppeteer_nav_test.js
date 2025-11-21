const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = process.env.URL || 'http://localhost:5500/?useProd=1';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE_CONSOLE:', msg.type(), msg.text()));
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.nav-btn', { timeout: 10000 });
  // Helper inside page to click a nav item by a selector and return diagnostic info
  const clickAndReport = async (selectorMatcher) => {
    return await page.evaluate(async (matcher) => {
      const header = document.getElementById('main-header');
      const candidates = header ? Array.from(header.querySelectorAll('.nav-btn')) : Array.from(document.querySelectorAll('.nav-btn'));
      let el = null;
      if (matcher.type === 'data-page') el = candidates.find(n => n.getAttribute && n.getAttribute('data-page') === matcher.value);
      else if (matcher.type === 'text') el = candidates.find(n => (n.textContent||'').toLowerCase().trim() === matcher.value.toLowerCase().trim());
      else if (matcher.type === 'regex') el = candidates.find(n => matcher.value.test(n.textContent||''));
      if (!el) return { clicked: false, reason: 'not_found', matcher };
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch(_) {}
      try {
        el.click();
      } catch (e) {
        try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch(_) {}
      }
      await new Promise(r => setTimeout(r, 300));
      const activeLinks = Array.from((header && header.querySelectorAll('nav .nav-link')) || []).map(n => ({ text: (n.textContent||'').trim(), classes: n.className }));
      return {
        clicked: true,
        matcher,
        stateCurrentPage: window.state && window.state.currentPage,
        stateCurrentCategory: window.state && window.state.currentCategory,
        activeLinks,
        pageContentLen: document.getElementById('pageContent') ? document.getElementById('pageContent').innerHTML.length : null
      };
    }, selectorMatcher);
  };

  const tests = [
    { name: 'Home', matcher: { type: 'data-page', value: 'home' } },
    { name: 'Shop All', matcher: { type: 'text', value: 'Shop All' } },
    { name: 'Ornaments', matcher: { type: 'text', value: 'Ornaments' } },
    { name: 'Beauty', matcher: { type: 'text', value: 'Beauty' } },
    { name: 'Testimonials', matcher: { type: 'data-page', value: 'testimonials' } }
  ];

  for (const t of tests) {
    const result = await clickAndReport(t.matcher);
    console.log('nav test ->', t.name, result);
    await sleep(400);
  }
  await browser.close();
})();