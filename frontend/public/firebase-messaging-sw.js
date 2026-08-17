importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  storageBucket: params.get("storageBucket") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || ""
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId || !firebaseConfig.appId) {
  throw new Error("PowerHouse Firebase Messaging worker is missing public Firebase configuration.");
}

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
