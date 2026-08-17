importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

// Keep the exact verified Firebase Web App configuration in the worker.
// These values are public client configuration, not Admin credentials.
const firebaseConfig = {
  apiKey: "AIzaSyAJA_813bMbg_Dsydx09E8F7TZfzZteLHI",
  authDomain: "powerhouse-app-47c4a.firebaseapp.com",
  projectId: "powerhouse-app-47c4a",
  storageBucket: "powerhouse-app-47c4a.firebasestorage.app",
  messagingSenderId: "428354200600",
  appId: "1:428354200600:web:a73756991c3df0275b8f6d"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || "PowerHouse";
    const body = payload.notification?.body || payload.data?.body || "You have a new PowerHouse notification.";
    const route = payload.data?.route || (payload.data?.taskId ? `/task-view/${payload.data.taskId}` : "/notifications");

    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: payload.data?.notificationId || "powerhouse-notification",
      renotify: true,
      data: { route }
    });
  });
} catch (error) {
  // Never let a worker configuration error break the main application.
  console.warn("PowerHouse messaging worker initialization failed:", error?.message || error);
}

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
