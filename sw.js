const CACHE = 'photoframe-v12';
const ASSETS = [
  './', './index.html', './css/style.css', './favicon.svg', './manifest.webmanifest',
  './vendor/exifr-lite.umd.js', './vendor/jszip.min.js', './vendor/FileSaver.min.js',
  './vendor/heic2any.min.js', './vendor/UTIF.js',
  './js/presets.js', './js/exif-reader.js', './js/image-decoder.js',
  './js/canvas-renderer.js', './js/crop-editor.js', './js/collage-layouts.js', './js/sticker-library.js',
  './js/storage.js', './js/session-store.js', './js/batch-processor.js', './js/app.js'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  })));
});
