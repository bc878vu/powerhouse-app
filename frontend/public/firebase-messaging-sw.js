importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

// ❗ IMPORTANT: yahan ENV use nahi hota
// isliye config minimal rakho (safe way)

firebase.initializeApp({
  messagingSenderId: "428354200600",
  appId: "1:428354200600:web:a73756991c3df0275b8f6d",
  projectId: "powerhouse-app-47c4a"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  console.log("🔔 Background Message:", payload);

  const notificationTitle = payload.notification?.title || "PowerHouse";

  self.registration.showNotification(notificationTitle, {
    body: payload.notification?.body,
    icon: "/logo192.png",
    badge: "/logo192.png",
    data: {
      taskId: payload.data?.taskId || null
    }
  });
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const taskId = event.notification.data?.taskId;

  event.waitUntil(
    clients.openWindow(taskId ? `/task-view/${taskId}` : `/`)
  );
});