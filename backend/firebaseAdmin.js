const admin = require("firebase-admin");

let serviceAccount = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT not found");
  }
} catch (err) {
  console.error("❌ Firebase JSON Parse Error:", err.message);
}

// ✅ Initialize ONLY if valid config exists
if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.warn("⚠️ Firebase not initialized (no config)");
}

module.exports = admin;