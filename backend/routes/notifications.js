const express = require("express");
const admin = require("../firebaseAdmin");

const router = express.Router();

async function verifyAdmin(req) {
  if (!admin.apps.length) throw new Error("Firebase Admin is not initialized. Set FIREBASE_SERVICE_ACCOUNT on the backend.");
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Authentication token is required.");
    error.status = 401;
    throw error;
  }
  const decoded = await admin.auth().verifyIdToken(token);
  const email = String(decoded.email || "").trim().toLowerCase();
  let profile = null;
  try {
    const snapshot = await admin.firestore().collection("powerhouse_users").doc(decoded.uid).get();
    profile = snapshot.exists ? snapshot.data() : null;
  } catch (error) {
    console.warn("Notification profile lookup failed:", error?.message || error);
  }
  const isAdmin = email === "admin@powerhouse.com" || ["admin", "superadmin"].includes(String(profile?.role || decoded.role || "").toLowerCase());
  if (!isAdmin) {
    const error = new Error("Admin permission is required to send system notifications.");
    error.status = 403;
    throw error;
  }
  return decoded;
}

function normalizeIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((x) => x.trim()).filter(Boolean))];
  if (value == null || value === "") return [];
  return [String(value).trim()].filter(Boolean);
}

async function getTokens(recipientIds = []) {
  const firestore = admin.firestore();
  const tokenCollection = firestore.collection("powerhouse_fcm_tokens");
  const tokenSet = new Set();

  const addSnapshotTokens = (snapshot) => {
    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      const token = String(data.token || "").trim();
      if (token) tokenSet.add(token);
    });
  };

  if (recipientIds.length === 0) {
    addSnapshotTokens(await tokenCollection.get());
  } else {
    await Promise.all(recipientIds.map(async (uid) => {
      const [byUser, legacy] = await Promise.all([
        tokenCollection.where("userId", "==", String(uid)).get(),
        tokenCollection.doc(String(uid)).get()
      ]);
      addSnapshotTokens(byUser);
      if (legacy.exists) addSnapshotTokens({ forEach: (fn) => fn(legacy) });
    }));
  }

  return [...tokenSet];
}

router.post("/push", async (req, res) => {
  try {
    await verifyAdmin(req);
    const body = req.body || {};
    const title = String(body.title || "PowerHouse Alert").trim().slice(0, 120);
    const messageBody = String(body.body || "You have a new PowerHouse alert.").trim().slice(0, 500);
    const route = String(body.route || "/notifications").trim();
    const recipientIds = normalizeIds(body.userIds ?? body.userId);
    const tokens = await getTokens(recipientIds);

    if (!tokens.length) {
      return res.json({ success: true, sent: 0, skipped: 0, reason: "No registered push tokens for the selected users." });
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://powerhouse-app-eight.vercel.app";
    const link = new URL(route, frontendUrl).href;
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body: messageBody },
      data: {
        title,
        body: messageBody,
        route,
        notificationId: String(body.notificationId || "")
      },
      webpush: {
        headers: { Urgency: "high" },
        fcmOptions: { link },
        notification: {
          title,
          body: messageBody,
          icon: "/icon-192.svg",
          badge: "/icon-192.svg",
          tag: String(body.notificationId || `powerhouse-alert-${Date.now()}`),
          requireInteraction: true,
          silent: false,
          vibrate: [180, 100, 180]
        }
      }
    });

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      const code = result.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) invalidTokens.push(tokens[index]);
    });

    if (invalidTokens.length) {
      const tokenCollection = admin.firestore().collection("powerhouse_fcm_tokens");
      await Promise.all(invalidTokens.map(async (token) => {
        const snapshot = await tokenCollection.where("token", "==", token).get();
        await Promise.all(snapshot.docs.map((item) => item.ref.delete()));
      }));
    }

    return res.json({ success: true, sent: response.successCount, failed: response.failureCount, cleaned: invalidTokens.length, recipients: recipientIds.length ? recipientIds.length : "all", devices: tokens.length });
  } catch (error) {
    const status = error.status || (error.code === "auth/id-token-expired" || error.code === "auth/argument-error" ? 401 : 500);
    console.error("FCM notification error:", error?.message || error);
    return res.status(status).json({ success: false, message: error?.message || "Unable to send push notification." });
  }
});

module.exports = router;
