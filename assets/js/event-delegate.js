// Lightweight event delegation helper for data-action attributes
// Avoids inline `onclick` handlers so app can run under strict CSP without 'unsafe-inline'.
(function () {
  function parseArgs(attr) {
    if (!attr) return [];
    try {
      return JSON.parse(attr);
    } catch (e) {
      return [attr];
    }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (!action) return;
    var args = parseArgs(el.getAttribute('data-args'));
    var fn = window[action];
    if (typeof fn === 'function') {
      try { fn.apply(el, args); } catch (err) { console.error('action error', action, err); }
      ev.preventDefault();
    }
  }, true);

  // Also support Enter key for buttons/controls with data-action
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var el = ev.target.closest && ev.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var args = parseArgs(el.getAttribute('data-args'));
    var fn = window[action];
    if (typeof fn === 'function') {
      try { fn.apply(el, args); } catch (err) { console.error('action error', action, err); }
      ev.preventDefault();
    }
  }, true);
  // Global image error fallback: handle broken images when inline `onerror` handlers are removed.
  document.addEventListener('error', function (ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'IMG') return;
    var fallback = t.getAttribute('data-fallback') || 'https://placehold.co/600x600/f0f0f0/ccc?text=Image+Not+Found';
    try {
      if (t.src !== fallback) t.src = fallback;
    } catch (_) {}
  }, true);

})();
