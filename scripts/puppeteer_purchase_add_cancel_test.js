const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = process.env.URL || 'http://localhost:5500/?useProd=1';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE_CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.toString()));

  console.log('opening', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(800);

  // Navigate to admin purchases view and seed admin state for deterministic rendering
  await page.evaluate(() => {
    try {
      // Ensure admin container exists so renderAdminPurchasesPage can attach
      if (!document.getElementById('adminPurchasesContainer')) {
        const c = document.createElement('div'); c.id = 'adminPurchasesContainer'; document.body.appendChild(c);
      }
      window.state = window.state || {};
      // Impersonate admin user in the page so admin renderers are available
      try {
        window.state.currentUser = window.state.currentUser || {};
        window.state.currentUser = { uid: '5FA4SZNeMicQz0MC1waRTSUh0lB2', isAnonymous: false };
        window.ADMIN_UID = window.ADMIN_UID || '5FA4SZNeMicQz0MC1waRTSUh0lB2';
        window.state.isAdmin = true;
      } catch(_) {}

      // Seed minimal site data required by admin purchases renderer
      window.state.siteSettings = Object.assign({ isGstEnabled: true, pricesIncludeGst: false }, window.state.siteSettings || {});
      window.state.products = window.state.products && window.state.products.length ? window.state.products : [
        { id: 'p_test_1', name: '+ Add New Product', productGroup: 'Default', salePrice: 100.00, stock: 10, purchasePrice: 50.00 }
      ];
      window.state.productGroups = window.state.productGroups && window.state.productGroups.length ? window.state.productGroups : [{ name: 'Default' }];
      window.state.allSuppliers = window.state.allSuppliers && window.state.allSuppliers.length ? window.state.allSuppliers : [{ id: 's_test_1', name: 'Test Supplier' }];

      window.state.currentPage = 'admin';
      window.state.adminCurrentTab = 'purchases';

      // If renderers are defined, force a re-render of admin purchases
      if (typeof renderAdminPurchasesPage === 'function') renderAdminPurchasesPage();
      else if (typeof renderApp === 'function') renderApp();
    } catch (e) { console.error('nav error', e); }
  });

  await sleep(800);

  // Diagnostic: check render function, admin identity and state
  const diag = await page.evaluate(() => {
    return {
      renderAdminPurchasesPage_type: typeof renderAdminPurchasesPage,
      ADMIN_UID_value: typeof ADMIN_UID !== 'undefined' ? ADMIN_UID : null,
      stateCurrentUser: window.state && window.state.currentUser ? window.state.currentUser : null,
      isAdminCheck: (window.state && window.state.currentUser && typeof ADMIN_UID !== 'undefined') ? (window.state.currentUser.uid === ADMIN_UID) : null,
      adminTab: window.state && window.state.adminCurrentTab ? window.state.adminCurrentTab : null
    };
  });
  console.log('diag', diag);

  // Dump adminPurchasesContainer HTML size for debugging
  const containerInfo = await page.evaluate(() => {
    const el = document.getElementById('adminPurchasesContainer');
    return { present: !!el, len: el ? el.innerHTML.length : 0, snippet: el ? el.innerHTML.slice(0, 400) : '' };
  });
  console.log('containerInfo', containerInfo);

  // More diagnostics: check modal functions/elements
  const modalDiag = await page.evaluate(() => {
    return {
      closeNewProductModal_type: typeof closeNewProductModal,
      newProductModal_present: !!document.getElementById('newProductModal'),
      cancelNewProductBtn_present: !!document.getElementById('cancelNewProductBtn'),
      closeNewProductModalBtn_present: !!document.getElementById('closeNewProductModalBtn')
    };
  });
    // Count purchase-product-select elements present
    const purchaseSelectCount = await page.evaluate(() => {
      return document.querySelectorAll('.purchase-product-select').length;
    });
    console.log('purchaseSelectCount', purchaseSelectCount);
  // List all select elements inside adminPurchasesContainer for inspection
  const selectsInfo = await page.evaluate(() => {
    const container = document.getElementById('adminPurchasesContainer');
    if (!container) return [];
    return Array.from(container.querySelectorAll('select')).map(s => ({ id: s.id || null, className: s.className || null, outer: s.outerHTML.slice(0,200) }));
  });
  console.log('selectsInfo', selectsInfo);

  // Check if purchaseItemsContainer exists
  const itemsContainerPresent = await page.evaluate(() => !!document.getElementById('purchaseItemsContainer'));
  console.log('purchaseItemsContainer present', itemsContainerPresent);

  // Check for any purchase item rows or product selects specifically
  const purchaseRowInfo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.purchase-item-row'));
    return { count: rows.length, first: rows[0] ? rows[0].outerHTML.slice(0,300) : null };
  });
  console.log('purchaseRowInfo', purchaseRowInfo);
  console.log('modalDiag', modalDiag);

  // Ensure there's at least one purchase item row
  await page.evaluate(() => { try { if (typeof addPurchaseItemRow === 'function') addPurchaseItemRow(); } catch(_) {} });
  await sleep(300);

  // Find the first purchase-product-select and set it to 'new'
  const setResult = await page.evaluate(() => {
    const sel = document.querySelector('.purchase-product-select');
    if (!sel) return { found: false };
    sel.value = 'new';
    // Dispatch change to trigger modal opening
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true };
  });
  console.log('setResult', setResult);

  await sleep(600);

  // Click cancel on the new product modal
  const cancelClicked = await page.evaluate(() => {
    const cancel = document.getElementById('cancelNewProductBtn') || document.getElementById('closeNewProductModalBtn') || document.querySelector('#newProductModal .btn-cancel');
    if (!cancel) return { clicked: false };
    try { cancel.click(); return { clicked: true }; } catch(e) { return { clicked: false, err: e.toString() }; }
  });
  console.log('cancelClicked', cancelClicked);

  await sleep(400);

  // Read the value of the first purchase-product-select
  const selectInfo = await page.evaluate(() => {
    const sel = document.querySelector('.purchase-product-select');
    if (!sel) return { present: false };
    return { present: true, value: sel.value, selectedText: sel.options[sel.selectedIndex]?.text || '' };
  });
  console.log('selectInfo', selectInfo);

  await browser.close();
  console.log('done');
  process.exit(0);
})();