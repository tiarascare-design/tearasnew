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
  // Migration helper: convert inline `onclick` and image `onerror` attributes to data- attributes
  function migrateInlineHandlers(root) {
    root = root || document;
    // Migrate onclick attributes
    var nodes = Array.from(root.querySelectorAll('[onclick]'));
    nodes.forEach(function (n) {
      try {
        var code = n.getAttribute('onclick').trim();
        // simple pattern: fnName('arg1', 'arg2') or fnName()
        var m = code.match(/^([a-zA-Z_$][\w$]*)\s*\((.*)\)\s*;?\s*$/);
        if (m) {
          var fnName = m[1];
          var argsText = m[2].trim();
          var args = [];
          if (argsText) {
            // naive split on commas, handle quoted strings
            try {
              args = new Function('return [' + argsText + '];')();
            } catch (_) {
              args = [argsText];
            }
          }
          n.setAttribute('data-action', fnName);
          if (args && args.length) n.setAttribute('data-args', JSON.stringify(args));
          n.removeAttribute('onclick');
        }
      } catch (e) {
        // leave original handler if parsing fails
        console.debug('migration onclick failed', e);
      }
    });

    // Migrate image onerror patterns like: this.onerror=null;this.src='URL';
    var imgs = Array.from(root.querySelectorAll('img[onerror]'));
    imgs.forEach(function (img) {
      try {
        var code = img.getAttribute('onerror');
        var m = code.match(/this\.src\s*=\s*['"]([^'"]+)['"]/);
        if (m) {
          var url = m[1];
          img.setAttribute('data-fallback', url);
          img.removeAttribute('onerror');
        }
      } catch (e) {
        console.debug('migration onerror failed', e);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { migrateInlineHandlers(document); });
  } else {
    migrateInlineHandlers(document);
  }

})();
