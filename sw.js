// NumeraFlow service worker — app-shell caching so the app can open (offline or on a flaky connection)
// even without a network round-trip. The HTML shell itself is network-first (always prefer the freshest
// deploy when online); only truly static sub-assets (icons, manifest) are cache-first. This avoids the
// classic PWA trap of a service worker permanently serving a stale app after a new version ships.
const CACHE = 'numeraflow-shell-v1';
const STATIC = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let cross-origin requests (Google Fonts) pass through untouched

  const isShell = e.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/';

  if (isShell) {
    e.respondWith(
      fetch(e.request)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
