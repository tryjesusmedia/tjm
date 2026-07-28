const CACHE = "try-jesus-journey-v1.0.0";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./content.js",
  "./app.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/logo-192.png",
  "./assets/logo-256.png",
  "./assets/logo-512.png",
  "./assets/logo-768.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put("./index.html", copy)); return response;
    }).catch(() => caches.match("./index.html").then(response => response || caches.match("./offline.html"))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
