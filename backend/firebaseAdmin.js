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

      // Task routes historically send one SQL fcm_token per user. Augment that
      // token list with every current Firestore device token for the same task
      // recipients, so phones + desktops can receive the same task push.
      let extraTokens = [];
      if (taskId && admin.apps.length) {
        try {
          const db = require("./config/db");
          const promiseDb = db.promiseDb ? db.promiseDb : db.promise();
          const [rows] = await promiseDb.query(
            `SELECT DISTINCT user_id FROM task_assignments WHERE task_id = ?`,
            [Number(taskId)]
          );
          const recipientIds = (rows || [])
            .map((row) => String(row.user_id || "").trim())
            .filter(Boolean);

          if (recipientIds.length) {
            const tokenCollection = admin.firestore().collection("powerhouse_fcm_tokens");
            const snapshots = await Promise.all(
              recipientIds.map((uid) =>
                tokenCollection.where("userId", "==", uid).get()
              )
            );
            extraTokens = snapshots.flatMap((snapshot) =>
              snapshot.docs.map((doc) => String(doc.data()?.token || "").trim()).filter(Boolean)
            );
          }
        } catch (error) {
          console.warn("PowerHouse multi-device task token lookup skipped:", error?.message || error);
        }
      }

      const mergedTokens = [...new Set([
        ...(Array.isArray(message?.tokens) ? message.tokens : []),
        ...extraTokens
      ].map(String).map((token) => token.trim()).filter(Boolean))];

      if (!mergedTokens.length) {
        console.warn("PowerHouse WebPush: no registered device tokens.");
        return { responses: [], successCount: 0, failureCount: 0 };
      }

      const enhancedMessage = {
        ...message,
        tokens: mergedTokens,
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
        `📲 WebPush multicast: success=${response.successCount}, failed=${response.failureCount}, devices=${mergedTokens.length}`
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
