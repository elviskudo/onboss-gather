const CACHE = "hallstatt-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).pathname.startsWith("/api")
  )
    return;
  if (e.request.mode === "navigate")
    e.respondWith(
      fetch(e.request).catch(
        () =>
          new Response(
            "<h1>You’re offline</h1><p>Reconnect to return to Hallstatt.</p>",
            { headers: { "Content-Type": "text/html" } },
          ),
      ),
    );
});
