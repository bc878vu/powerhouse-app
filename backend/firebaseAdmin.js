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

module.exports = admin;
