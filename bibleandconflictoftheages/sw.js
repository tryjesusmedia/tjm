'use strict';
// Network-only: never cache account responses or freeze an old reading-plan version.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bible &amp; Conflict</title><body style="font:20px/1.6 system-ui;padding:2rem;background:#010c18;color:#fdfaF2"><h1>You are offline</h1><p>Connect to the internet, then reopen Bible &amp; Conflict to continue reading. Your saved place is still on this device.</p><a style="color:#e5b55b" href="/bibleandconflictoftheages/">Try again</a></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
