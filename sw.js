
const CACHE_NAME = "recall-pairs-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.v10.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./words_low.txt",
  "./words_mid.txt",
  "./words_high.txt",
  "./words_abs.txt"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async()=>{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE_NAME) ? null : caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // Network-first for HTML/JS to reduce "stuck" issues
  if (req.destination === "document" || url.pathname.endsWith(".js")) {
    event.respondWith((async()=>{
      try{
        const fresh = await fetch(req, {cache:"no-store"});
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // Cache-first for others
  event.respondWith((async()=>{
    const cached = await caches.match(req);
    if(cached) return cached;
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});
