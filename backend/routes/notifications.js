const express = require("express");
const admin = require("../firebaseAdmin");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

async function verifyUser(req) {
  if (!admin.apps.length) throw new Error("Firebase Admin is not initialized. Set FIREBASE_SERVICE_ACCOUNT on the backend.");
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Authentication token is required.");
    error.status = 401;
    throw error;
  }
  return admin.auth().verifyIdToken(token);
}

async function verifyAdmin(req) {
  const decoded = await verifyUser(req);
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

function normalizeDeviceId(value) {
  return String(value || "browser").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "browser";
}

// Register a browser/device FCM token through the authenticated backend.
// The Firestore collection is the authoritative multi-device store.
// The SQL fcm_token column is also updated because the legacy task route
// still reads that field when a task is assigned/reassigned.
router.post("/register-token", async (req, res) => {
  try {
    const decoded = await verifyUser(req);
    const token = String(req.body?.token || "").trim();
    const deviceId = normalizeDeviceId(req.body?.deviceId);
    const platform = String(req.body?.platform || "web").trim().slice(0, 30);

    if (!token) return res.status(400).json({ success: false, message: "FCM token is required." });

    const tokenId = `${decoded.uid}_${deviceId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 150);
    await admin.firestore().collection("powerhouse_fcm_tokens").doc(tokenId).set({
      token,
      userId: decoded.uid,
      deviceId,
      platform,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Keep the legacy SQL task-notification path operational.
    // This is intentionally best-effort so SQL schema differences cannot
    // prevent successful FCM registration in Firestore.
    try {
      await promiseDb.query(
        "UPDATE users SET fcm_token = ? WHERE id = ? LIMIT 1",
        [token, decoded.uid]
      );
    } catch (sqlError) {
      console.warn("Legacy SQL FCM token sync skipped:", sqlError?.message || sqlError);
    }

    // Remove duplicate copies of the same token left by older registrations.
    try {
      const duplicates = await admin.firestore().collection("powerhouse_fcm_tokens").where("token", "==", token).get();
      const batch = admin.firestore().batch();
      let deletes = 0;
      duplicates.docs.forEach((item) => {
        if (item.id !== tokenId && item.data()?.userId === decoded.uid) {
          batch.delete(item.ref);
          deletes += 1;
        }
      });
      if (deletes) await batch.commit();
    } catch (cleanupError) {
      console.warn("Duplicate FCM token cleanup skipped:", cleanupError?.message || cleanupError);
    }

    return res.json({ success: true, registered: true, deviceId, tokenId, legacyTaskPushSynced: true });
  } catch (error) {
    const status = error.status || (error.code === "auth/id-token-expired" || error.code === "auth/argument-error" ? 401 : 500);
    console.error("FCM token registration error:", error?.message || error);
    return res.status(status).json({ success: false, message: error?.message || "Unable to register push token." });
  }
});

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
