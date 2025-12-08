// Inline boot helpers moved out of the HTML to comply with strict Content-Security-Policy.
// Keep minimal and safe: set deterministic app id, optionally force production Firebase when
// served from localhost, and expose the public reCAPTCHA site key (client-side only).

// If the app sets window.__app_id already (server injection), keep it.
// Otherwise default to the emulator/dev app id used for local testing.
window.__app_id = typeof window.__app_id !== 'undefined' ? window.__app_id : 'tiaras-website';

try {
  const host = (window && window.location && window.location.hostname) || '';
  if (host === 'localhost' || host === '127.0.0.1') {
    window.__use_production = true;
    try { console.info('Local override: forcing production Firebase for this session (host is localhost)'); } catch (e) {}
  }
} catch (e) { /* ignore */ }

// Public reCAPTCHA site key for client RecaptchaVerifier
window.__recaptcha_site_key = '6Le2VQosAAAAAE0SwHQdNBXHjaV8vKt1GScvokd0';
