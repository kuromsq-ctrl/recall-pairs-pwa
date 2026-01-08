const CACHE_NAME = "recall-pairs-v22";

// Core assets only. (Do NOT include words_*.txt here to avoid install failure on 404.)
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

// Word files are required by the app, but we fetch them at runtime (network-first).
const WORD_FILES = [
  "./words_daily.txt",
  "./words_business.txt",
  "./words_abstract.txt"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);

      // Try to pre-cache word files, but do not fail install if any fetch fails.
      for (const f of WORD_FILES) {
        try {
          const res = await fetch(f, { cache: "no-store" });
          if (res.ok) await cache.put(f, res.clone());
        } catch (_) {
          // ignore
        }
      }

      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

function isWordFile(pathname) {
  return pathname.endsWith("/words_daily.txt") ||
         pathname.endsWith("/words_business.txt") ||
         pathname.endsWith("/words_abstract.txt") ||
         pathname.endsWith("words_daily.txt") ||
         pathname.endsWith("words_business.txt") ||
         pathname.endsWith("words_abstract.txt");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const req = event.request;

      try {
        const fresh = await fetch(req, { cache: "no-store" });

        // Update cache for GET requests
        if (req.method === "GET" && fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;

        // Never fall back to index.html for word files (HTML would be treated as a wordlist)
        if (isWordFile(url.pathname)) {
          return new Response("", { status: 404, statusText: "Word file not cached" });
        }

        // For navigation, fall back to index.html
        if (req.mode === "navigate") {
          const idx = await caches.match("./index.html", { ignoreSearch: true });
          if (idx) return idx;
        }

        const idx = await caches.match("./index.html", { ignoreSearch: true });
        return idx || new Response("", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
