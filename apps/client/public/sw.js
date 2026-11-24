// The app shell (apps/client/perf/RESULTS.md): the page and its hashed assets come from a cache, so a
// relaunch doesn't wait on the server for index.html (~77 ms p50 from Zurich). The page is
// refreshed in the background for the next launch. API requests and other origins are never touched.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const SHELL = "todalo-shell-v1", ASSETS = "todalo-assets-v1";
const html = (response) => (response.headers.get("content-type") || "").includes("text/html");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") event.respondWith(shell(event));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(asset(request));
});

// Every route is the same single page: serve the cached one now, refresh it behind.
async function shell(event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match("/");
  const fresh = fetch(event.request).then((response) => {
    if (response.ok && html(response)) void cache.put("/", response.clone());
    return response;
  });
  if (!cached) return fresh;
  event.waitUntil(fresh.catch(() => undefined));
  return cached;
}

// Hashed file names never change content: cache first. (A missing asset can come back as the
// page itself; that is never stored under an asset's name.)
async function asset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && !html(response)) { await cache.put(request, response.clone()); void prune(cache); }
  return response;
}

// ponytail: the newest 300 assets (a few deploys' worth); an LRU if that ever matters.
async function prune(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - 300))) await cache.delete(key);
}
