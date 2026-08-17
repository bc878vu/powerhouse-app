import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
];

export const missingConfig = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
export const isFirebaseConfigured = missingConfig.length === 0;

if (!isFirebaseConfigured) {
  console.warn(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);

  // A previous build could have registered the messaging worker before the
  // Firebase web config was available. Remove that broken worker so it cannot
  // keep producing "Installations: Missing App configuration value: apiKey"
  // errors on every page load.
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.active?.scriptURL.includes("/firebase-messaging-sw.js"))
          .map((registration) => registration.unregister())
      ))
      .catch(() => {});
  }
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  dbInstance = getFirestore(app);
}
export const db = dbInstance;

let messagingInstance = null;

const getMessagingInstance = async () => {
  if (messagingInstance) return messagingInstance;
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return null;
  }
  if (!isFirebaseConfigured) {
    throw new Error(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
  }

  const { getMessaging } = await import("firebase/messaging");
  messagingInstance = getMessaging(app);
  return messagingInstance;
};

const getMessagingServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return null;
  if (!isFirebaseConfigured) {
    throw new Error(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
  }

  // The service worker cannot read Vite environment variables directly.
  // Pass the public Firebase web config through its registration URL instead.
  const swUrl = new URL("/firebase-messaging-sw.js", window.location.origin);
  const publicConfig = {
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId
  };
  Object.entries(publicConfig).forEach(([key, value]) => swUrl.searchParams.set(key, value));

  // Replace an older notification worker with the current configured worker.
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.scope === `${window.location.origin}/` && registration.active?.scriptURL.includes("/firebase-messaging-sw.js"))
      .map((registration) => registration.unregister())
  );

  const registration = await navigator.serviceWorker.register(swUrl.toString(), { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
};

export const getFCMToken = async () => {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;
    if (typeof Notification === "undefined") return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    if (!import.meta.env.VITE_VAPID_KEY) {
      throw new Error("VITE_VAPID_KEY is missing; configure the Firebase Web Push certificate first.");
    }

    const serviceWorkerRegistration = await getMessagingServiceWorker();
    if (!serviceWorkerRegistration) return null;

    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
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
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  const { onMessage } = await import("firebase/messaging");
  return new Promise((resolve) => onMessage(messaging, (payload) => resolve(payload)));
};
