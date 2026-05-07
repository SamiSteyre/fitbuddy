const CACHE_NAME = 'fitbuddy-v10';
const ASSETS = [
  '/fitbuddy/',
  '/fitbuddy/index.html',
  '/fitbuddy/manifest.json',
  '/fitbuddy/icon-192.png',
  '/fitbuddy/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => k !== CACHE_NAME && caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
