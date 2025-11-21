const puppeteer = require('puppeteer');
(async () => {
  const url = process.env.URL || 'http://localhost:5500/?useProd=1';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => {
    console.log('PAGE_CONSOLE:', msg.type(), msg.text());
  });
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.toString()));

  console.log('opening', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.error('goto failed', e));
  await page.waitForTimeout(1000);

  // Try to open new product modal via exposed function
  const opened = await page.evaluate(() => {
    try {
      if (typeof openNewProductModal === 'function') { openNewProductModal(); return 'openNewProductModal() called'; }
      // fallback: click a nav/add button that likely opens it
      const btn = document.querySelector('button#openNewProductModalBtn') || document.querySelector('button[aria-label="Add New Product"]') || document.querySelector('.nav-btn[data-page="product_new"]');
      if (btn) { btn.click(); return 'fallback button clicked'; }
      return 'no-op';
    } catch (e) { return 'eval error: ' + e.message; }
  });
  console.log('open attempt ->', opened);

  // Wait for modal row and buttons
  await page.waitForSelector('#modalNewProductGroupRow', { timeout: 5000 }).catch(() => console.log('modalNewProductGroupRow not found')); 
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const out = { found: {} };
    const add = document.getElementById('modalAddProductGroupInlineBtn');
    const cancel = document.getElementById('modalCancelNewProductGroupBtn');
    const row = document.getElementById('modalNewProductGroupRow');
    out.found.add = !!add; out.found.cancel = !!cancel; out.found.row = !!row;
    try { if (add) out.addRect = add.getBoundingClientRect(); } catch(_){}
    try { if (cancel) out.cancelRect = cancel.getBoundingClientRect(); } catch(_){}
    try { if (row) out.rowRect = row.getBoundingClientRect(); } catch(_){}
    // elementFromPoint for centers
    try {
      if (add) {
        const cx = (add.getBoundingClientRect().left + add.getBoundingClientRect().right)/2;
        const cy = (add.getBoundingClientRect().top + add.getBoundingClientRect().bottom)/2;
        const top = document.elementFromPoint(cx, cy);
        out.addAtPoint = { tag: top.tagName, id: top.id, class: top.className };
      }
      if (cancel) {
        const cx = (cancel.getBoundingClientRect().left + cancel.getBoundingClientRect().right)/2;
        const cy = (cancel.getBoundingClientRect().top + cancel.getBoundingClientRect().bottom)/2;
        const top = document.elementFromPoint(cx, cy);
        out.cancelAtPoint = { tag: top.tagName, id: top.id, class: top.className };
      }
    } catch(e) { out.e = e.toString(); }
    return out;
  });

  console.log('DOM info:', JSON.stringify(info, null, 2));

  // Try clicking the Add button and wait for any console message or DOM change
  try {
    await page.click('#modalAddProductGroupInlineBtn', { timeout: 2000 }).then(()=>console.log('page.click() succeeded')).catch(e=>console.log('page.click() failed', e.message));
  } catch(e) { console.log('click error', e.toString()); }

  // Wait a moment to capture console output
  await page.waitForTimeout(1500);

  // Read select options count
  const selectInfo = await page.evaluate(() => {
    const sel = document.getElementById('modalProductGroup');
    if (!sel) return { present: false };
    return { present: true, options: Array.from(sel.options).map(o=>o.value) };
  });
  console.log('selectInfo:', JSON.stringify(selectInfo, null, 2));

  await browser.close();
  console.log('done');
  process.exit(0);
})();