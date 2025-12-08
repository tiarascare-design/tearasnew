// Safe shim to convert simple inline event attributes to event listeners.
// Does NOT use eval or Function()
(function (){
  'use strict';

  function parseSimpleCall(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.trim().replace(/;\s*$/, '');
    var m = /^([a-zA-Z_$][\w$]*)\s*\((.*)\)$/.exec(str);
    if (!m) return null;
    var name = m[1];
    var argsStr = m[2].trim();
    if (argsStr === '') return { name: name, args: [] };

    var args = [];
    var i = 0;
    var len = argsStr.length;
    while (i < len) {
      while (i < len && /\s/.test(argsStr[i])) i++;
      if (i >= len) break;
      var ch = argsStr[i];
      if (ch === '"' || ch === "'") {
        var quote = ch; i++; var buf = '';
        while (i < len) {
          var c = argsStr[i++];
          if (c === '\\') { if (i < len) { buf += argsStr[i++]; } }
          else if (c === quote) { break; }
          else { buf += c; }
        }
        args.push(buf);
      } else {
        var start = i; while (i < len && /[^,\s]/.test(argsStr[i])) i++;
        var token = argsStr.slice(start, i).trim();
        if (/^-?\d+(?:\.\d+)?$/.test(token)) args.push(Number(token));
        else if (token === 'true') args.push(true);
        else if (token === 'false') args.push(false);
        else if (token === 'null') args.push(null);
        else if (token === 'undefined') args.push(undefined);
        else if (/^['\"]/.test(token)) args.push(token.replace(/^['\"]|['\"]$/g, ''));
        else args.push(token);
      }
      while (i < len && /\s/.test(argsStr[i])) i++;
      if (argsStr[i] === ',') i++;
    }
    return { name: name, args: args };
  }

  function processElement(el) {
    if (!el || el.nodeType !== 1) return;
    try {
      if (el.hasAttribute && el.hasAttribute('onclick')) {
        var raw = el.getAttribute('onclick');
        var parsed = parseSimpleCall(raw);
        if (parsed && typeof window[parsed.name] === 'function') {
          el.addEventListener('click', function (ev) {
            try { window[parsed.name].apply(this, parsed.args); } catch (e) { console.error(e); }
          });
          el.removeAttribute('onclick');
        }
      }
      if (el.tagName === 'IMG' && el.hasAttribute && el.hasAttribute('onerror')) {
        var errRaw = el.getAttribute('onerror');
        var errParsed = parseSimpleCall(errRaw);
        if (errParsed && typeof window[errParsed.name] === 'function') {
          el.addEventListener('error', function (ev) {
            try { window[errParsed.name].apply(this, errParsed.args); } catch (e) { console.error(e); }
          });
          el.removeAttribute('onerror');
        }
      }
    } catch (e) { console.warn('inline-event-shim processElement failed', e); }
  }

  function scanRoot(root) {
    if (!root) return;
    if (root.nodeType === 1) processElement(root);
    var els = root.querySelectorAll('[onclick], img[onerror]');
    for (var i = 0; i < els.length; i++) processElement(els[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ scanRoot(document); });
  else scanRoot(document);

  try {
    var mo = new MutationObserver(function(mutations){
      for (var m=0;m<mutations.length;m++){
        var rec = mutations[m];
        if (rec.addedNodes && rec.addedNodes.length) {
          for (var j=0;j<rec.addedNodes.length;j++) scanRoot(rec.addedNodes[j]);
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList:true, subtree:true });
  } catch (e) { /* ignore */ }

})();
