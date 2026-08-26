importScripts("/firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

const CACHE_VERSION = "powerhouse-static-v9";
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

try {
  const firebaseConfig = self.POWERHOUSE_FIREBASE_CONFIG;
  if (firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || "PowerHouse";
      const body = payload.notification?.body || payload.data?.body || "You have a new PowerHouse notification.";
      const route = payload.data?.route || (payload.data?.taskId ? `/task-view/${payload.data.taskId}` : "/notifications");
      const notificationId = String(payload.data?.notificationId || `${Date.now()}`);

      self.registration.showNotification(title, {
        body,
        icon: "/icon-192.svg",
        badge: "/icon-192.svg",
        tag: notificationId,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [180, 100, 180],
        timestamp: Date.now(),
        data: { route }
      });
    });
  } else {
    console.warn("PowerHouse FCM worker skipped: Firebase configuration is incomplete.");
  }
} catch (error) {
  console.warn("PowerHouse FCM worker initialization failed:", error?.message || error);
}

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
    event.respondWith(networkThenCache(request).then((response) => response || caches.match("/index.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheThenNetwork(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = event.notification.data?.route || "/notifications";
  event.waitUntil((async () => {
    const targetUrl = new URL(route, self.location.origin).href;
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      return existing.navigate(targetUrl);
    }
    return clients.openWindow(targetUrl);
  })());
});
