const CACHE_NAME = 'fitbuddy-v4';
const ASSETS = [
  '/fitbuddy/',
  '/fitbuddy/index.html',
  '/fitbuddy/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});
self.addEventListener('fetch', function(event) {
    // Ce code permet juste à l'app d'être considérée comme "installable"
});

