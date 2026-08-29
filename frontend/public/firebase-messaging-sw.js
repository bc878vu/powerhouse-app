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

const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId);

function postStopAlert(alertId) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    list.forEach((client) => client.postMessage({ type: "POWERHOUSE_STOP_ALERT", alertId }));
  });
}

function lowDieselOptions(payload) {
  const data = payload.data || {};
  const current = Number(data.currentStock ?? data.stock ?? 0);
  const threshold = Number(data.lowStockLevel ?? data.lowDieselThreshold ?? 0);
  return {
    title: data.title || "LOW DIESEL STOCK",
    body: data.body || `Current stock: ${current.toLocaleString()} L • Alert level: ${threshold.toLocaleString()} L`,
    options: {
      icon: "/icon-192.svg",
      badge: "/icon-192.svg",
      tag: "powerhouse-low-diesel",
      renotify: true,
      requireInteraction: true,
      vibrate: [220, 100, 220, 220, 360],
      data: { route: data.route || "/fuel-management", type: "low_diesel", alertId: data.alertId || "current", currentStock: current, lowStockLevel: threshold },
      actions: [{ action: "acknowledge", title: "Clear alert" }, { action: "view", title: "View dashboard" }]
    }
  };
}

if (hasFirebaseConfig) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const isLowDiesel = payload.data?.type === "low_diesel" || payload.data?.type === "LOW_DIESEL";
    if (isLowDiesel) {
      const low = lowDieselOptions(payload);
      return self.registration.showNotification(low.title, low.options);
    }
    const title = payload.notification?.title || payload.data?.title || "PowerHouse";
    const body = payload.notification?.body || payload.data?.body || "You have a new PowerHouse notification.";
    const route = payload.data?.route || (payload.data?.taskId ? `/task-view/${payload.data.taskId}` : "/notifications");
    return self.registration.showNotification(title, { body, icon: "/favicon.svg", badge: "/favicon.svg", tag: payload.data?.notificationId || "powerhouse-notification", renotify: true, data: { route } });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  event.waitUntil((async () => {
    await postStopAlert(data.alertId);
    if (action === "acknowledge") return;
    const route = data.route || "/notifications";
    const targetUrl = new URL(route, self.location.origin).href;
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { await existing.focus(); return existing.navigate(targetUrl); }
    return clients.openWindow(targetUrl);
  })());
});
