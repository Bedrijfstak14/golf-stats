// Golf Stats service worker: app-shell en pagina's cachen, zodat bekijken en
// handmatig invoeren ook zonder verbinding werken. Opslaan gaat via de wachtrij in de pagina.
const CACHE = "golf-stats-v2";
const SHELL = ["/", "/rounds", "/stats", "/more", "/add", "/add/manual", "/icon.svg", "/favicon.ico", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/uploads/")) return;

  // Statische assets: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/api/uploads/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/favicon.ico"
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pagina's en RSC-data: network-first, terugvallen op cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            caches.match(url.pathname).then(
              (p) =>
                p ||
                new Response("<h1>Offline</h1><p>Deze pagina is nog niet eerder geopend.</p>", {
                  headers: { "content-type": "text/html; charset=utf-8" },
                }),
            ),
        ),
      ),
  );
});
