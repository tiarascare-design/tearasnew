// Stub testimonials page module — delegates to the legacy renderTestimonialsPage
export async function mount({ state, mountEl, navigate, registerCleanup, renderFallback } = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.renderTestimonialsPage === 'function') {
      window.renderTestimonialsPage();
    } else if (typeof renderFallback === 'function') {
      renderFallback('testimonials');
    }
  } catch (e) { /* ignore */ }
}

export async function unmount() { }
