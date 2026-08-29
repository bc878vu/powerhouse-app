importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get("apiKey") || "AIzaSyAJA_813bMbg_Dsydx09E8F7TZfzZteLHI",
  authDomain: params.get("authDomain") || "powerhouse-app-47c4a.firebaseapp.com",
  projectId: params.get("projectId") || "powerhouse-app-47c4a",
  storageBucket: params.get("storageBucket") || "powerhouse-app-47c4a.firebasestorage.app",
  messagingSenderId: params.get("messagingSenderId") || "428354200600",
  appId: params.get("appId") || "1:428354200600:web:a73756991c3df0275b8f6d"
};

function postStopAlert(alertId) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    list.forEach((client) => client.postMessage({ type: "POWERHOUSE_STOP_ALERT", alertId }));
  });
}

function buildAlert(payload) {
  const data = payload.data || {};
  const current = Number(data.currentStock ?? data.stock ?? 0);
  const threshold = Number(data.lowStockLevel ?? data.lowDieselThreshold ?? 0);
  const type = data.type || "manual";
  return {
    title: data.title || (type === "low_diesel" ? "LOW DIESEL STOCK" : "POWERHOUSE ALERT"),
    options: {
      body: data.body || `Current stock: ${current.toLocaleString()} L${threshold ? ` • Alert level: ${threshold.toLocaleString()} L` : ""}`,
      icon: "/icon-192.svg", badge: "/icon-192.svg", tag: `powerhouse-alert-${data.alertId || type}`,
      renotify: true, requireInteraction: true, vibrate: [180, 90, 180, 120, 260],
      data: { route: data.route || "/", type, alertId: data.alertId || "current", currentStock: current, lowStockLevel: threshold },
      actions: [{ action: "acknowledge", title: "Clear alert" }, { action: "view", title: "View dashboard" }]
    }
  };
}

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const alert = buildAlert(payload);
  return self.registration.showNotification(alert.title, alert.options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  event.waitUntil((async () => {
    await postStopAlert(data.alertId);
    if (action === "acknowledge") return;
    const targetUrl = new URL(data.route || "/", self.location.origin).href;
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = list.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { await existing.focus(); return existing.navigate(targetUrl); }
    return clients.openWindow(targetUrl);
  })());
});

// If the platform exposes close events, notify open clients as well.
self.addEventListener("notificationclose", (event) => {
  const data = event.notification?.data || {};
  event.waitUntil(postStopAlert(data.alertId));
});
