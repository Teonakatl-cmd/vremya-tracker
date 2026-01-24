/* PWA service worker: ВРЕМЯ (safe auto-update)
   - НЕ трогает localStorage (данные пользователя сохраняются)
   - HTML (navigate) -> network-first (no-store), fallback cache
   - Assets -> stale-while-revalidate
*/

const CACHE = "vremya-cache";

// Resolve URLs relative to SW scope (works on / and /vremya-tracker/)
const SCOPE = self.registration.scope; // e.g. https://..../vremya-tracker/
const U = (p) => new URL(p, SCOPE).toString();

const CORE = [
  U("./"),
  U("./index.html"),
  U("./manifest.webmanifest"),
  U("./service-worker.js"),
  U("./icons/icon-192.png"),
  U("./icons/icon-512.png"),
  U("./icons/icon-192-maskable.png"),
  U("./icons/icon-512-maskable.png"),
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache:reload forces a fresh fetch during install when possible
    await Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Keep only our current cache name
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("vremya-cache")).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  // HTML: network-first (no-store) so new versions show up ASAP
  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_e) {
        const cached = await caches.match(req);
        return cached || caches.match(U("./index.html")) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Assets: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);

    const fetchPromise = fetch(req).then((fresh) => {
      cache.put(req, fresh.clone());
      return fresh;
    }).catch(() => cached);

    return cached || fetchPromise;
  })());
});
