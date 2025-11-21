// Stub products page module — delegates to the legacy renderProductsPage
export async function mount({ state, mountEl, navigate, registerCleanup, renderFallback } = {}) {
  try {
    // Pass through category/group from state if needed
    const category = state.currentCategory || null;
    const group = state.currentGroup || null;
    if (typeof window !== 'undefined' && typeof window.renderProductsPage === 'function') {
      window.renderProductsPage(category, group);
    } else if (typeof renderFallback === 'function') {
      renderFallback('products', { category, group });
    }
  } catch (e) { /* ignore */ }
}

export async function unmount() { /* nothing to cleanup for legacy renderer */ }
