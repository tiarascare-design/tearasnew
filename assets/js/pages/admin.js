// Stub admin page module — delegates to the legacy renderAdminPage function
export async function mount({ state, mountEl, navigate, registerCleanup, renderFallback } = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.renderAdminPage === 'function') {
      window.renderAdminPage();
    } else if (typeof renderFallback === 'function') {
      renderFallback('admin');
    }
  } catch (e) { /* ignore */ }
}

export async function unmount() {
  // legacy renderers manage cleanup internally; nothing required here
}
