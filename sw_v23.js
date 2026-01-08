const CACHE_NAME = "recall-pairs-v23";

// Core assets only (words are fetched at runtime).
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

// IMPORTANT: word files must never fall back to index.html.
function isWordFile(pathname) {
  return pathname.endsWith("words_daily.txt") ||
         pathname.endsWith("words_business.txt") ||
         pathname.endsWith("words_abstract.txt");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const req = event.request;

    // Network-first, cache fallback.
    try {
      const fresh = await fetch(req, { cache: "no-store" });

      if (req.method === "GET" && fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (_) {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;

      // Never return index.html for word files.
      if (isWordFile(url.pathname)) {
        return new Response("", { status: 404, statusText: "Word file not cached" });
      }

      // Navigation fallback
      if (req.mode === "navigate") {
        const idx = await caches.match("./index.html", { ignoreSearch: true });
        if (idx) return idx;
      }

      const idx = await caches.match("./index.html", { ignoreSearch: true });
      return idx || new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
