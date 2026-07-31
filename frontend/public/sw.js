const CACHE = "yard-scan-v6";
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isAssetPath(pathname) {
  return pathname.startsWith("/assets/");
}

function shouldCacheResponse(request, response) {
  if (!response || !response.ok) return false;
  const { pathname } = new URL(request.url);
  if (isAssetPath(pathname)) {
    const type = response.headers.get("content-type") || "";
    return type.includes("text/css") || type.includes("javascript") || type.includes("wasm");
  }
  return true;
}

async function putInCache(request, response) {
  if (!shouldCacheResponse(request, response)) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

async function offlineFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const accept = request.headers.get("accept") || "";
  if (request.mode === "navigate" || accept.includes("text/html")) {
    const shell = (await caches.match("/index.html")) || (await caches.match("/"));
    if (shell) return shell;
  }

  return Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (!isSameOrigin(request.url)) return;

  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (shouldCacheResponse(request, response)) {
          await putInCache(request, response.clone());
        }
        return response;
      })
      .catch(() => offlineFallback(request))
  );
});

self.addEventListener("push", (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || "New update in Stockyard",
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        vibrate: [100, 50, 100],
        data: data.url || "/",
      };
      event.waitUntil(self.registration.showNotification(data.title || "Stockyard Notification", options));
    } catch (e) {
      console.error("Push parsing failed", e);
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.notification.data) {
    event.waitUntil(clients.openWindow(event.notification.data));
  }
});
