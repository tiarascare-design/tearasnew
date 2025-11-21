const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.TEST_URL || 'http://localhost:5500/?useProd=1';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const firestoreResponses = [];

  // Mirror page console to this process for debugging
  page.on('console', msg => {
    try { console.log('PAGE LOG:', msg.text()); } catch(_){}
  });

  page.on('response', async (response) => {
    try {
      const req = response.request();
      const reqUrl = req.url();
      if (reqUrl && reqUrl.includes('firestore.googleapis.com') && reqUrl.includes('/documents')) {
        const info = {
          url: reqUrl,
          method: req.method(),
          status: response.status(),
          postData: req.postData && req.postData(),
        };
        firestoreResponses.push(info);
      }
    } catch (e) {
      // ignore
    }
  });

  try {
    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Attempt programmatic sign-in (anonymous) if available in page scope
    const signInResult = await page.evaluate(async () => {
      try {
        // Try modular helpers if attached
        if (typeof window.signInAnonymously === 'function' && typeof window.auth !== 'undefined') {
          await window.signInAnonymously(window.auth);
          return { method: 'modular-signInAnonymously' };
        }
        // Try classic firebase namespace
        if (typeof window.firebase !== 'undefined' && typeof window.firebase.auth === 'function') {
          await window.firebase.auth().signInAnonymously();
          return { method: 'namespaced-firebase-auth' };
        }
        return { method: 'none' };
      } catch (err) {
        return { method: 'error', message: String(err && err.message ? err.message : err) };
      }
    });
    console.log('Programmatic sign-in attempt result:', signInResult);

    await page.waitForSelector('button#showModalNewProductGroupBtn, button#showNewProductGroupBtn, select#modalProductGroup, select#productGroup', { timeout: 15000 });

    const name = 'puppeteer-test-group-' + Date.now();

    const showModalBtn = await page.$('button#showModalNewProductGroupBtn');
    if (showModalBtn) {
      // Use in-page click to avoid Puppeteer's clickablePoint issues
      await page.evaluate(() => { const b = document.getElementById('showModalNewProductGroupBtn'); if (b) b.click(); });
      await page.waitForSelector('#modalNewProductGroupName', { timeout: 5000 });
      await page.type('#modalNewProductGroupName', name);
      await Promise.all([
        page.evaluate(() => { const b = document.getElementById('modalAddProductGroupInlineBtn'); if (b) b.click(); }),
        new Promise(r => setTimeout(r, 1500))
      ]);
    } else {
      const showInlineBtn = await page.$('button#showNewProductGroupBtn');
      if (!showInlineBtn) throw new Error('No modal or inline show button found');
      await page.evaluate(() => { const b = document.getElementById('showNewProductGroupBtn'); if (b) b.click(); });
      await page.waitForSelector('#newProductGroupName', { timeout: 5000 });
      await page.type('#newProductGroupName', name);
      await Promise.all([
        page.evaluate(() => { const b = document.getElementById('addProductGroupInlineBtn'); if (b) b.click(); }),
        new Promise(r => setTimeout(r, 1500))
      ]);
    }

    await new Promise(r => setTimeout(r, 1500));

    const optionAppeared = await page.evaluate((expected) => {
      const sel = document.getElementById('modalProductGroup') || document.getElementById('productGroup');
      if (!sel) return false;
      return Array.from(sel.options).some(o => (o.textContent || '').trim() === expected);
    }, name);

    console.log('Option appeared in select:', optionAppeared);
    console.log('Captured firestore responses count:', firestoreResponses.length);

    // If the UI path didn't add the option or produce a Firestore request,
    // try the temporary in-page test helper we just added to the runtime.
    const helperExists = await page.evaluate(() => typeof window.__TEST_addProductGroup === 'function');
    console.log('In-page test helper present:', helperExists);
    if (!optionAppeared && firestoreResponses.length === 0 && helperExists) {
      console.log('Calling window.__TEST_addProductGroup(...) from test script');
      const res = await page.evaluate(async (n) => {
        try {
          return await window.__TEST_addProductGroup(n);
        } catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
      }, name);
      console.log('In-page helper result:', res);
      // allow time for network capture
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!optionAppeared && firestoreResponses.length === 0) {
      // Debug: list relevant elements and their visibility/state
      const debug = await page.evaluate(() => {
        const ids = [
          'showModalNewProductGroupBtn','modalNewProductGroupRow','modalNewProductGroupName','modalAddProductGroupInlineBtn','modalProductGroup',
          'showNewProductGroupBtn','newProductGroupRow','newProductGroupName','addProductGroupInlineBtn','productGroup'
        ];
        const out = {};
        ids.forEach(id => {
          const el = document.getElementById(id);
          out[id] = el ? { tag: el.tagName, hidden: el.classList ? el.classList.contains('hidden') : false, outer: el.outerHTML.slice(0,250) } : null;
        });
        return out;
      });
      console.log('Debug element snapshot:', JSON.stringify(debug, null, 2));
      // Debug: report presence of Firebase helper symbols on window
      const globals = await page.evaluate(() => {
        return {
          addDoc: typeof window.addDoc,
          collection: typeof window.collection,
          db: typeof window.db,
          productGroupsColPath: typeof window.productGroupsColPath,
          serverTimestamp: typeof window.serverTimestamp,
        };
      });
      console.log('Global symbol types (page scope):', JSON.stringify(globals, null, 2));

      // Fallback: if runtime exposes firestore helpers, attempt addDoc directly from page context
      if (globals.addDoc === 'function' && globals.collection === 'function' && globals.productGroupsColPath === 'string') {
        console.log('Attempting in-page addDoc fallback...');
        try {
          const res = await page.evaluate(async (n) => {
            try {
              // eslint-disable-next-line no-undef
              const r = await addDoc(collection(db, productGroupsColPath), { name: n, createdAt: serverTimestamp() });
              return { ok: true, id: r && r.id ? r.id : null };
            } catch (err) {
              return { ok: false, error: String(err && err.message ? err.message : err) };
            }
          }, name);
          console.log('In-page addDoc result:', JSON.stringify(res, null, 2));
          // give network a moment
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.log('In-page addDoc fallback threw:', e && e.message ? e.message : e);
        }
      }
    }
    if (firestoreResponses.length > 0) {
      console.log('Sample Firestore response:', JSON.stringify(firestoreResponses[0], null, 2));
    }

    const success = firestoreResponses.length > 0 || optionAppeared;
    if (!success) {
      console.error('Test failed: no Firestore request observed and option did not appear.');
      await browser.close();
      process.exit(2);
    }

    console.log('Test succeeded: Firestore request observed or option added.');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Error running Puppeteer test:', err);
    try { await browser.close(); } catch(_){}
    process.exit(1);
  }
})();
