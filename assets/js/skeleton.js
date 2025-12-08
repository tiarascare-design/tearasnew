// Show skeleton on #pageContent until the app fires window.TIARAS_APP_READY = true
(function(){
  var root = document.getElementById('pageContent');
  if (!root) return;
  // add skeleton placeholder
  var placeholder = document.createElement('div');
  placeholder.className = 'skeleton p-6';
  placeholder.innerHTML = '<div class="skeleton-rect mb-6"></div><div class="skeleton-text mb-3" style="width:70%"></div><div class="skeleton-text" style="width:40%"></div>';
  // insert only if empty
  if (!root.firstChild) root.appendChild(placeholder);

  function clearSkeleton(){
    try{ if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);}catch(_){}
  }

  // Listen for a global signal from the app that it's ready
  if (window.TIARAS_APP_READY){ clearSkeleton(); }
  else {
    window.addEventListener('tiaras:app-ready', clearSkeleton);
    // fallback: timeout 8s
    setTimeout(clearSkeleton, 8000);
  }
})();
