const admin = require("firebase-admin");

let serviceAccount = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ Firebase JSON Parse Error:", err.message);
}

if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

if (!admin.apps.length) console.warn("⚠️ Firebase Admin not initialized (set FIREBASE_SERVICE_ACCOUNT)");

// ============================================================
// PowerHouse Web-Push hardening
// ============================================================
// Existing task routes use sendEachForMulticast(). Enhance that call globally
// so background/closed PWAs receive a persistent WebPush notification with a
// secure click target, high delivery urgency, vibration and app badge data.
// ============================================================

if (!admin.__POWERHOUSE_MESSAGING_PATCHED__) {
  const originalMessaging = admin.messaging.bind(admin);

  admin.messaging = function powerhouseMessaging(...args) {
    const messaging = originalMessaging(...args);

    if (!messaging || messaging.__POWERHOUSE_WEBPUSH_PATCHED__) return messaging;

    const originalSendEachForMulticast = messaging.sendEachForMulticast.bind(messaging);

    messaging.sendEachForMulticast = async (message) => {
      const data = message?.data || {};
      const taskId = data.taskId || data.task_id || "";
      const route = String(
        data.route || (taskId ? `/task-view/${taskId}` : "/notifications")
      ).trim();
      const frontendUrl = String(
        process.env.FRONTEND_URL || "https://powerhouse-app-eight.vercel.app"
      ).replace(/\/+$/, "");

      let link = `${frontendUrl}/notifications`;
      try {
        link = new URL(route || "/notifications", `${frontendUrl}/`).href;
      } catch {}

      const title = String(
        message?.notification?.title || data.title || "PowerHouse Alert"
      ).slice(0, 120);
      const body = String(
        message?.notification?.body || data.body || "You have a new PowerHouse notification."
      ).slice(0, 500);
      const tag = String(
        data.notificationId ||
        (taskId ? `powerhouse-task-${taskId}` : `powerhouse-${Date.now()}`)
      ).slice(0, 200);

      const enhancedMessage = {
        ...message,
        notification: {
          ...(message?.notification || {}),
          title,
          body,
        },
        data: {
          ...data,
          title,
          body,
          route: route || "/notifications",
          taskId: taskId ? String(taskId) : "",
        },
        webpush: {
          ...(message?.webpush || {}),
          headers: {
            ...(message?.webpush?.headers || {}),
            Urgency: "high",
            TTL: "86400",
          },
          fcmOptions: {
            ...(message?.webpush?.fcmOptions || {}),
            link,
          },
          notification: {
            ...(message?.webpush?.notification || {}),
            title,
            body,
            icon: "/icon-192.svg",
            badge: "/icon-192.svg",
            tag,
            renotify: true,
            requireInteraction: true,
            silent: false,
            vibrate: [220, 100, 220, 100, 320, 100, 420],
          },
        },
      };

      const response = await originalSendEachForMulticast(enhancedMessage);
      console.log(
        `📲 WebPush multicast: success=${response.successCount}, failed=${response.failureCount}, devices=${message?.tokens?.length || 0}`
      );
      return response;
    };

    Object.defineProperty(messaging, "__POWERHOUSE_WEBPUSH_PATCHED__", {
      value: true,
      enumerable: false,
      configurable: false,
    });

    return messaging;
  };

  admin.__POWERHOUSE_MESSAGING_PATCHED__ = true;
}

module.exports = admin;
