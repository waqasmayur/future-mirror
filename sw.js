const CACHE_NAME='future-mirror-v1';
const ASSETS=['/','/index.html','/style.css','/app.js','/manifest.json'];
self.addEventListener('install',evt=>{evt.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',evt=>{evt.waitUntil(self.clients.claim());});
self.addEventListener('fetch',evt=>{evt.respondWith(caches.match(evt.request).then(res=>res||fetch(evt.request)));});