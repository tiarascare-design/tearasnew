// Lightweight lazy image initializer and responsive helpers
(function(){
  function setLazyForImages(root){
    root = root || document;
    var imgs = Array.from(root.querySelectorAll('img'));
    imgs.forEach(function(img){
      if (!img.hasAttribute('loading')) img.setAttribute('loading','lazy');
      // if data-srcset is provided (e.g., build step can add these), map to srcset
      var ds = img.getAttribute('data-srcset');
      if (ds && !img.getAttribute('srcset')) img.setAttribute('srcset', ds);
      // fallback handling: if inline onerror removed migration will set data-fallback
      var fallback = img.getAttribute('data-fallback');
      if (fallback){
        img.addEventListener('error', function(){ if(img.src !== fallback) img.src = fallback; });
      }
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setLazyForImages(document); });
  } else setLazyForImages(document);
})();
