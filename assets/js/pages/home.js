// Sample lazy-loaded `home` page module. Exposes `mount` and `unmount`.
let _intervalId = null;

export async function mount({ state, mountEl, navigate, registerCleanup }) {
  if (!mountEl) return;
  mountEl.innerHTML = `
    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
      <h1 class="text-4xl font-playfair mb-4">Welcome to TIARAS (Lazy Home)</h1>
      <p class="text-gray-600 mb-8">This home page was loaded dynamically as a module.</p>
      <div id="home-timer" class="text-sm text-gray-500"></div>
      <p class="mt-6"><a href="#" data-page="products" class="nav-btn bg-black text-white inline-block py-3 px-6 rounded">Shop Now</a></p>
    </div>
  `;

  // Example resource to demonstrate cleanup: a simple timer that updates the UI
  const timerEl = mountEl.querySelector('#home-timer');
  let ticks = 0;
  _intervalId = setInterval(() => {
    ticks += 1;
    if (timerEl) timerEl.textContent = `Module uptime: ${ticks}s`;
  }, 1000);

  // Register cleanup so router will clear the interval when navigating away
  if (typeof registerCleanup === 'function') {
    registerCleanup(() => {
      if (_intervalId) clearInterval(_intervalId);
      _intervalId = null;
    });
  }
}

export async function unmount() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
