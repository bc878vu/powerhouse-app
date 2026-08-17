import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);

if (missingConfig.length) {
  console.warn(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Single Firestore owner. The fallback prevents duplicate initialization during HMR.
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager()
    })
  });
} catch (error) {
  dbInstance = getFirestore(app);
}
export const db = dbInstance;

let messagingInstance = null;
try {
  messagingInstance = getMessaging(app);
} catch (error) {
  console.warn("Firebase Messaging unavailable:", error?.message || error);
}
export const messaging = messagingInstance;

export const getFCMToken = async () => {
  if (!messaging) return null;
  try {
    if (typeof Notification === "undefined") return null;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_VAPID_KEY
    });
    if (!token) return null;
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user?.id) {
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
      await setDoc(doc(db, "powerhouse_fcm_tokens", String(user.id)), {
        token,
        userId: String(user.id),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    return token;
  } catch (err) {
    console.log("FCM Error:", err);
    return null;
  }
};

export const onMessageListener = () => {
  if (!messaging) return Promise.resolve(null);
  return new Promise((resolve) => onMessage(messaging, (payload) => resolve(payload)));
};
