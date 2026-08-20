import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase Web configuration is public client configuration. Keep the verified
// PowerHouse Firebase project as the source of truth so stale Vercel variables
// from another Firebase project can never initialize this app.
const VERIFIED_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAJA_813bMbg_Dsydx09E8F7TZfzZteLHI",
  authDomain: "powerhouse-app-47c4a.firebaseapp.com",
  projectId: "powerhouse-app-47c4a",
  storageBucket: "powerhouse-app-47c4a.firebasestorage.app",
  messagingSenderId: "428354200600",
  appId: "1:428354200600:web:a73756991c3df0275b8f6d",
  measurementId: "G-T9KELG6TG6"
};

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
const hasCompleteConfig = (config) => requiredConfigKeys.every((key) => typeof config[key] === "string" && config[key].trim().length > 0);
const useEnvConfig = hasCompleteConfig(envConfig) && envConfig.projectId === VERIFIED_FIREBASE_CONFIG.projectId;

export const firebaseConfig = useEnvConfig ? { ...VERIFIED_FIREBASE_CONFIG, ...envConfig } : VERIFIED_FIREBASE_CONFIG;
export const missingConfig = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
export const isFirebaseConfigured = missingConfig.length === 0;

if (!useEnvConfig && hasCompleteConfig(envConfig)) {
  console.warn("Ignoring stale Firebase environment variables; using the verified PowerHouse Firebase project configuration.");
}

if (!isFirebaseConfigured) {
  console.warn(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
}

// IMPORTANT: use the normal Firestore instance during application startup.
// Persistent IndexedDB cache was causing a client-side Firebase crash in the
// deployed build (TypeError: r.indexOf is not a function). Firestore itself
// remains fully online/realtime; this removes the failing startup path.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Keep the authenticated session across reloads and PWA launches without
// changing the application's existing login/logout behavior.
void setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence setup failed:", error?.message || error);
});
export const storage = getStorage(app);
export const db = getFirestore(app);

let messagingInstance = null;
export let messaging = null;

const MESSAGING_WORKER_PREFIX = "/firebase-messaging-sw";
const CURRENT_MESSAGING_WORKER = "/firebase-messaging-sw-v2.js";

// Clean every old PowerHouse messaging worker. Old deployments registered
// workers with incomplete query-string configuration; those workers can keep
// running after a new deployment and generate Installations/missing-apiKey
// errors independently of the current application bundle.
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

  // Only create the worker after the user explicitly enables push. This keeps
  // notification infrastructure completely out of normal page startup.
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
