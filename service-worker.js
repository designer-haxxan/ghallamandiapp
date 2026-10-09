// Ghalla Mandi service worker: precaches the app shell so both language versions open with no network.
// Cache names are namespaced because other apps on the same origin share Cache Storage.
// Bump VERSION whenever any cached file changes; installed apps then update on their next online visit.
const APP = 'ghallamandi';
const VERSION = `${APP}-v1.0.0`;
const SHELL = [
  './', './index.html', './urdu.html', './promo.html', './css/app.css', './fonts/jameel-noori-nastaleeq.woff',
  './manifest-en.json', './manifest-ur.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './js/main.js', './js/i18n.js', './js/db.js', './js/store.js', './js/util.js', './js/ui.js', './js/auth.js', './js/print.js',
  './js/router.js', './js/gate.js',
  './js/views/home.js', './js/views/lots.js', './js/views/sales.js', './js/views/parties.js', './js/views/cash.js',
  './js/views/rates.js', './js/views/reports.js', './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(`${APP}-`) && key !== VERSION) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cache first for the shell; anything else (lazy-loaded modules, pages) is network first with a cache fallback.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw e;
    }
  })());
});
