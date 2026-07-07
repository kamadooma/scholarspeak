/* Scholar Speak service worker
   - App shell: cache-first
   - data/words.json: network-first (fall back to cache offline)
   Bump CACHE_VERSION to invalidate old caches. */
'use strict';

const CACHE_VERSION = 'lexilab-v1.4.0';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const DATA_CACHE = CACHE_VERSION + '-data';

const SHELL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Add individually so one 404 doesn't abort the whole install.
      Promise.all(SHELL_ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('[SW] skip', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (k !== SHELL_CACHE && k !== DATA_CACHE) return caches.delete(k);
        return null;
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // data/words.json -> network-first
  if (url.pathname.endsWith('/data/words.json') || url.pathname.endsWith('data/words.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // App shell / other same-origin -> cache-first
  event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ meta: { version: 0, decks: [] }, entries: [] }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // navigation fallback -> app shell
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}
