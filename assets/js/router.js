// Lightweight client-side router with dynamic imports and cleanup API
let _mountEl = null;
let _stateRef = null;
let _currentModule = null;
let _cleanupFns = [];

export function initRouter({ mountElId = 'pageContent', state = null } = {}) {
  _mountEl = document.getElementById(mountElId) || null;
  _stateRef = state;

  // Delegate clicks for elements with `data-page` to enable client-side navigation
  document.addEventListener('click', (e) => {
    try {
      const el = e.target.closest && e.target.closest('[data-page]');
      if (!el) return;
      const page = el.getAttribute('data-page');
      if (!page) return;
      e.preventDefault();
      const id = el.getAttribute('data-id') || null;
      const category = el.getAttribute('data-category') || null;
      const group = el.getAttribute('data-group') || null;
      // Call global navigateTo if present (legacy) so app state is updated
      if (typeof window.navigateTo === 'function') {
        // Don't await to keep event handler sync-friendly
        window.navigateTo(page, id, category, group);
      } else {
        navigate(page, { id, category, group });
      }
    } catch (err) { /* ignore */ }
  }, true);

  // Expose router on window for debugging and for modules that want to call registerCleanup
  try { window.__router = { navigate, registerCleanup }; } catch (_) {}
}

export async function navigate(page, opts = {}) {
  // Attempt to dynamically import a page module from ./pages/{page}.js
  // If the module exists and has a `mount` export, call it and return true.
  // Otherwise return false so callers can fall back to the legacy renderer.
  await runCleanup();

  const modulePath = `./pages/${page}.js`;
  try {
    const mod = await import(modulePath);
    // Unmount current module if it provided an unmount
    if (_currentModule && typeof _currentModule.unmount === 'function') {
      try { await _currentModule.unmount(); } catch (_) {}
    }
    _currentModule = mod;
    // Reset any registered cleanup functions
    _cleanupFns = [];

    if (typeof mod.mount === 'function') {
      // Provide a small API to the module: { state, mountEl, navigate, registerCleanup }
      await mod.mount({ state: _stateRef, mountEl: _mountEl, navigate: navigate, registerCleanup });
      return true;
    }
    return false;
  } catch (err) {
    // Module not found or errored — signal caller to use fallback renderer
    return false;
  }
}

export function registerCleanup(fn) {
  if (typeof fn === 'function') _cleanupFns.push(fn);
}

async function runCleanup() {
  // Run cleanup functions (in reverse order) and clear them
  const fns = _cleanupFns.slice().reverse();
  _cleanupFns = [];
  for (const fn of fns) {
    try { await fn(); } catch (e) { /* ignore */ }
  }
}

export function getCurrentModule() { return _currentModule; }
