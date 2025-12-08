// Try to load the built app bundle (`assets/dist/app.js`) first.
// If loading fails (file not present), fall back to the development bundle (`assets/js/app.js?v=6`).
(function(){
  function loadScript(src, isModule){
    return new Promise(function(resolve, reject){
      var s = document.createElement(isModule ? 'script' : 'script');
      if (isModule) s.type = 'module';
      s.src = src;
      s.defer = true;
      s.onload = resolve;
      s.onerror = function(){ reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var built = 'assets/dist/app.js';
  var dev = 'assets/js/app.js?v=6';

  // Attempt to load the built file first
  loadScript(built, true).catch(function(){
    // fallback to dev bundle
    return loadScript(dev, true);
  }).catch(function(err){
    console.error('Failed to load app bundle', err);
  });
})();
