const CACHE_VERSION = "powerhouse-static-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.svg", "/icon-512.svg"];
const NETWORK_ONLY_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "fcmregistrations.googleapis.com",
  "firebase.google.com",
  "googleapis.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function shouldBypass(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return true;
  return false;
}

async function networkThenCache(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch {
    return cache.match(request);
  }
}

async function cacheThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return networkThenCache(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (shouldBypass(request)) return;

  const url = new URL(request.url);
  if (request.mode === "navigate" || url.pathname === "/index.html") {
    event.respondWith(
      networkThenCache(request).then((response) => response || caches.match("/index.html"))
    );
    return;
  }

  // Vite's hashed JS/CSS/assets are safe to cache aggressively. Firebase/API
  // traffic is explicitly excluded above so live application data stays fresh.
  if (url.pathname.startsWith("/assets/") || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheThenNetwork(request));
  }
});
