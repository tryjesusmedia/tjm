/* ChronBible service worker v3 — the two public-domain Bibles are stored on this site.
   The reader functions without third-party Scripture APIs, and visited books are
   cached locally. Readers can explicitly download all 132 book files for offline use. */
const BOOK_CACHE = 'chronbible-bibles-v1';
const SHELL_CACHE = 'chronbible-shell-v3';
const CORE = [
  '/chronbible/',
  '/chronbible/read/',
  '/chronbible/data/readings.json',
  '/chronbible/config.js?v=20261005-doc-plan',
  '/chronbible/read/reader.js?v=6',
  '/chronbible/read/reader.css?v=5'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(CORE.map(path => cache.add(path)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key =>
      key.startsWith('chronbible-shell-') && key !== SHELL_CACHE
    ).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(BOOK_CACHE);
  const saved = await cache.match(request, { ignoreSearch: true });
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    try { await cache.put(request, response.clone()); } catch {}
  }
  return response;
}

async function networkFirst(request, fallback) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try { await cache.put(request, response.clone()); } catch {}
    }
    return response;
  } catch {
    const exact = await cache.match(request, { ignoreSearch: true });
    if (exact) return exact;
    const shell = fallback ? await cache.match(fallback) : undefined;
    if (shell) return shell;
    return new Response(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>ChronBible offline</title>' +
      '<body style="font-family:Arial,sans-serif;padding:30px"><h1>ChronBible is offline</h1>' +
      '<p>Connect once to save Scripture and tap “Save WEB &amp; KJV for offline reading” in your reader settings.</p>' +
      '<a href="/chronbible/">Return to ChronBible</a></body></html>', {
        status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      }
    );
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (/^\/chronbible\/read\/text\/(web|kjv)\/[A-Za-z0-9]+\.json$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate' && url.pathname.startsWith('/chronbible/')) {
    const fallback = url.pathname.startsWith('/chronbible/read/')
      ? '/chronbible/read/' : '/chronbible/';
    event.respondWith(networkFirst(request, fallback));
    return;
  }

  if (url.pathname === '/chronbible/data/readings.json' ||
      url.pathname === '/chronbible/read/reader.js' ||
      url.pathname === '/chronbible/read/reader.css' ||
      url.pathname === '/chronbible/config.js') {
    event.respondWith(networkFirst(request));
  }
});
