// PowerHouse PWA service worker.
// Alert acknowledgement is persisted here so a browser notification's Clear action survives reloads.
const ALERT_ACK_CACHE = "powerhouse-alert-ack-cache-v1";
const ALERT_ACK_PREFIX = "/__powerhouse_alert_ack__/";

async function persistAlertAck(alertId, until) {
  if (!alertId || !Number.isFinite(Number(until))) return;
  const cache = await caches.open(ALERT_ACK_CACHE);
  await cache.put(
    new Request(`${ALERT_ACK_PREFIX}${encodeURIComponent(String(alertId))}`),
    new Response(JSON.stringify({ id: String(alertId), until: Number(until) }), {
      headers: { "content-type": "application/json" },
    })
  );
}

async function broadcastAlertAck(alertId, until) {
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: "POWERHOUSE_ACK_ALERT", alertId, until }));
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  notification.close();
  try {
    if (typeof navigator?.clearAppBadge === "function") void navigator.clearAppBadge();
  } catch {}

  const data = notification?.data || {};
  event.waitUntil((async () => {
    // Clear alert must acknowledge persistently before any navigation/reload.
    if (action === "acknowledge" || action === "clear") {
      const alertId = String(data.alertId || data.notificationId || notification.tag || "");
      const repeatMinutes = Math.max(1, Number(data.repeatMinutes) || 30);
      const until = Date.now() + repeatMinutes * 60 * 1000;
      await persistAlertAck(alertId, until);
      await broadcastAlertAck(alertId, until);
      return;
    }

    const route = data.route || "/notifications";
    const targetUrl = new URL(route, self.location.origin).href;
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      try { return await existing.navigate(targetUrl); } catch { return existing; }
    }
    return clients.openWindow(targetUrl);
  })());
});

importScripts("/firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

const CACHE_VERSION = "powerhouse-static-v17";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.svg", "/icon-512.svg"];
const NETWORK_ONLY_HOSTS = [
  "firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com", "fcmregistrations.googleapis.com", "firebase.google.com", "googleapis.com",
];

function setPushBadge(count = 1) {
  try { if (typeof navigator?.setAppBadge === "function") return navigator.setAppBadge(Math.max(1, Number(count) || 1)); } catch (error) { console.warn("PowerHouse app badge update skipped:", error?.message || error); }
  return Promise.resolve();
}

function showPowerHouseNotification(payload) {
  const title = String(payload?.notification?.title || payload?.data?.title || "PowerHouse Alert");
  const body = String(payload?.notification?.body || payload?.data?.body || "You have a new PowerHouse notification.");
  const taskId = String(payload?.data?.taskId || payload?.data?.task_id || "");
  const route = String(payload?.data?.route || (taskId ? `/task-view/${taskId}` : "/notifications"));
  const notificationId = String(payload?.data?.notificationId || payload?.messageId || (taskId ? `powerhouse-task-${taskId}-${Date.now()}` : `powerhouse-${Date.now()}`));
  const alertId = String(payload?.data?.alertId || notificationId);
  const repeatMinutes = Math.max(1, Number(payload?.data?.repeatMinutes) || 30);
  void setPushBadge(1);
  return self.registration.showNotification(title, {
    body, icon: "/icon-192.svg", badge: "/icon-192.svg", tag: notificationId,
    renotify: true, requireInteraction: true, silent: false,
    vibrate: [350, 120, 350, 120, 500, 120, 700], timestamp: Date.now(),
    data: { route, notificationId, taskId, alertId, repeatMinutes },
    actions: payload?.data?.alertId ? [{ action: "acknowledge", title: "Clear alert" }, { action: "view", title: "View dashboard" }] : [],
  });
}

try {
  const firebaseConfig = self.POWERHOUSE_FIREBASE_CONFIG;
  if (firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      console.log("[PowerHouse FCM SW] background push received", JSON.stringify({ hasNotification: Boolean(payload?.notification), hasData: Boolean(payload?.data), taskId: payload?.data?.taskId || "" }));
      void showPowerHouseNotification(payload).catch((error) => console.error("PowerHouse notification display failed:", error?.message || error));
    });
  } else console.warn("PowerHouse FCM worker skipped: Firebase configuration is incomplete.");
} catch (error) { console.warn("PowerHouse FCM worker initialization failed:", error?.message || error); }

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION && key !== ALERT_ACK_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));

function shouldBypass(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return true;
  return NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
async function networkThenCache(request) { const cache = await caches.open(CACHE_VERSION); try { const response = await fetch(request); if (response.ok && response.type === "basic") await cache.put(request, response.clone()); return response; } catch { return cache.match(request); } }
async function cacheThenNetwork(request) { return (await caches.match(request)) || networkThenCache(request); }
self.addEventListener("fetch", (event) => { const request = event.request; if (shouldBypass(request)) return; const url = new URL(request.url); if (request.mode === "navigate" || url.pathname === "/index.html") { event.respondWith(networkThenCache(request).then((response) => response || caches.match("/index.html"))); return; } if (url.pathname.startsWith("/assets/") || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) event.respondWith(cacheThenNetwork(request)); });
