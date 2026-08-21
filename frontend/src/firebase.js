import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase Web configuration must come from the deployment environment so
// Vercel Production values are actually used. The previous version hard-coded
// an old API key and explicitly ignored VITE_FIREBASE_* variables, so changing
// Vercel environment variables could never affect the deployed Firebase client.
const env = import.meta.env || {};
const VERIFIED_PROJECT_ID = "powerhouse-app-47c4a";

const envConfig = {
  apiKey: String(env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
  projectId: String(env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
  messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: String(env.VITE_FIREBASE_APP_ID || "").trim(),
  measurementId: String(env.VITE_FIREBASE_MEASUREMENT_ID || "").trim()
};

// Fail closed instead of silently connecting to a stale/wrong Firebase project.
const requiredConfig = [
  ["VITE_FIREBASE_API_KEY", envConfig.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", envConfig.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", envConfig.projectId],
  ["VITE_FIREBASE_STORAGE_BUCKET", envConfig.storageBucket],
  ["VITE_FIREBASE_MESSAGING_SENDER_ID", envConfig.messagingSenderId],
  ["VITE_FIREBASE_APP_ID", envConfig.appId]
];

export const missingConfig = requiredConfig.filter(([, value]) => !value).map(([name]) => name);
export const isFirebaseConfigured = missingConfig.length === 0 && envConfig.projectId === VERIFIED_PROJECT_ID;

if (!isFirebaseConfigured) {
  console.error("Firebase configuration is missing or points to the wrong project.", {
    missingConfig,
    projectId: envConfig.projectId || "missing",
    expectedProjectId: VERIFIED_PROJECT_ID
  });
}

export const firebaseConfig = envConfig;

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Keep the authenticated session across reloads and PWA launches.
void setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence setup failed:", error?.message || error);
});

export const storage = getStorage(app);
export const db = getFirestore(app);

let messagingInstance = null;
export let messaging = null;

const MESSAGING_WORKER_PREFIX = "/firebase-messaging-sw";
const CURRENT_MESSAGING_WORKER = "/powerhouse-sw.js";

const cleanupOldMessagingWorkers = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const urls = [registration.active?.scriptURL, registration.installing?.scriptURL, registration.waiting?.scriptURL].filter(Boolean);
          return urls.some((url) => {
            try {
              return new URL(url).pathname.startsWith(MESSAGING_WORKER_PREFIX);
            } catch {
              return false;
            }
          });
        })
        .map((registration) => registration.unregister())
    );
  } catch (error) {
    console.warn("Firebase messaging worker cleanup skipped:", error?.message || error);
  }
};

if (typeof window !== "undefined") {
  void cleanupOldMessagingWorkers();
}

const getMessagingInstance = async () => {
  if (messagingInstance) return messagingInstance;
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return null;
  if (!isFirebaseConfigured) throw new Error(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);

  const { getMessaging } = await import("firebase/messaging");
  messagingInstance = getMessaging(app);
  messaging = messagingInstance;
  return messagingInstance;
};

const getMessagingServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return null;
  if (!isFirebaseConfigured) throw new Error(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);

  const registration = await navigator.serviceWorker.register(CURRENT_MESSAGING_WORKER, { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
};

export const getFCMToken = async () => {
  try {
    const messagingService = await getMessagingInstance();
    if (!messagingService || typeof Notification === "undefined") return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    if (!import.meta.env.VITE_VAPID_KEY) throw new Error("VITE_VAPID_KEY is missing; configure the Firebase Web Push certificate first.");

    const serviceWorkerRegistration = await getMessagingServiceWorker();
    if (!serviceWorkerRegistration) return null;

    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messagingService, {
      vapidKey: import.meta.env.VITE_VAPID_KEY,
      serviceWorkerRegistration
    });
    if (!token) return null;

    const currentUser = auth.currentUser;
    if (currentUser?.uid) {
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
      await setDoc(doc(db, "powerhouse_fcm_tokens", currentUser.uid), {
        token,
        userId: currentUser.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    return token;
  } catch (err) {
    console.warn("FCM setup failed:", err?.message || err);
    throw err;
  }
};

export const onMessageListener = async () => {
  if (!isFirebaseConfigured) return null;
  const messagingService = await getMessagingInstance();
  if (!messagingService) return null;
  const { onMessage } = await import("firebase/messaging");
  return new Promise((resolve) => onMessage(messagingService, (payload) => resolve(payload)));
};
