import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});
export const messaging = getMessaging(app);

export const getFCMToken = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_VAPID_KEY });
    if (!token) return null;
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user?.id) {
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
      await setDoc(doc(db, "powerhouse_fcm_tokens", String(user.id)), { token, userId: String(user.id), updatedAt: serverTimestamp() }, { merge: true });
    }
    return token;
  } catch (err) {
    console.log("FCM Error:", err);
    return null;
  }
};

export const onMessageListener = () => new Promise((resolve) => {
  onMessage(messaging, (payload) => resolve(payload));
});
