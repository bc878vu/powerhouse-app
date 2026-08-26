import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const env = import.meta.env || {};
const VERIFIED_PROJECT_ID = "powerhouse-app-47c4a";
const envConfig = { apiKey: String(env.VITE_FIREBASE_API_KEY || "").trim(), authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(), projectId: String(env.VITE_FIREBASE_PROJECT_ID || "").trim(), storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(), messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(), appId: String(env.VITE_FIREBASE_APP_ID || "").trim(), measurementId: String(env.VITE_FIREBASE_MEASUREMENT_ID || "").trim() };
const requiredConfig = [["VITE_FIREBASE_API_KEY", envConfig.apiKey], ["VITE_FIREBASE_AUTH_DOMAIN", envConfig.authDomain], ["VITE_FIREBASE_PROJECT_ID", envConfig.projectId], ["VITE_FIREBASE_STORAGE_BUCKET", envConfig.storageBucket], ["VITE_FIREBASE_MESSAGING_SENDER_ID", envConfig.messagingSenderId], ["VITE_FIREBASE_APP_ID", envConfig.appId]];
export const missingConfig = requiredConfig.filter(([, value]) => !value).map(([name]) => name);
export const isFirebaseConfigured = missingConfig.length === 0 && envConfig.projectId === VERIFIED_PROJECT_ID;
if (!isFirebaseConfigured) console.error("Firebase configuration is missing or points to the wrong project.", { missingConfig, projectId: envConfig.projectId || "missing", expectedProjectId: VERIFIED_PROJECT_ID });
export const firebaseConfig = envConfig;
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const appCheckSiteKey = String(env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY || "").trim();
export const appCheck = typeof window !== "undefined" && isFirebaseConfigured && appCheckSiteKey ? initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true }) : null;
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1");
void setPersistence(auth, browserLocalPersistence).catch((error) => console.warn("Firebase auth persistence setup failed:", error?.message || error));
export const storage = getStorage(app);
let firestoreDb;
try { firestoreDb = initializeFirestore(app, { localCache: persistentLocalCache() }); } catch (error) { console.warn("Persistent Firestore cache unavailable; using default cache:", error?.message || error); firestoreDb = getFirestore(app); }
export const db = firestoreDb;

let messagingInstance = null;
export let messaging = null;
const MESSAGING_WORKER_PREFIX = "/firebase-messaging-sw";
const CURRENT_MESSAGING_WORKER = "/powerhouse-sw.js";
const DEVICE_ID_KEY = "powerhouse_push_device_id_v2";

const getPushDeviceId = () => {
  if (typeof window === "undefined") return "server";
  try { let id = localStorage.getItem(DEVICE_ID_KEY); if (!id) { id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(DEVICE_ID_KEY, id); } return id; } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};
const getBackendUrl = () => String(env.VITE_SOCKET_URL || env.VITE_API_URL || "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
const cleanupOldMessagingWorkers = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.filter((r) => [r.active?.scriptURL, r.installing?.scriptURL, r.waiting?.scriptURL].filter(Boolean).some((url) => { try { return new URL(url).pathname.startsWith(MESSAGING_WORKER_PREFIX); } catch { return false; } })).map((r) => r.unregister())); } catch (error) { console.warn("Firebase messaging worker cleanup skipped:", error?.message || error); }
};
if (typeof window !== "undefined") void cleanupOldMessagingWorkers();

const getMessagingInstance = async () => {
  if (messagingInstance) return messagingInstance;
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return null;
  if (!isFirebaseConfigured) throw new Error(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
  const { getMessaging } = await import("firebase/messaging"); messagingInstance = getMessaging(app); messaging = messagingInstance; return messagingInstance;
};

const getMessagingServiceWorker = async (forceFresh = false) => {
  if (!("serviceWorker" in navigator)) return null;
  if (!isFirebaseConfigured) throw new Error(`Firebase configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
  if (forceFresh) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => [r.active?.scriptURL, r.installing?.scriptURL, r.waiting?.scriptURL].some((url) => url && url.includes(CURRENT_MESSAGING_WORKER))).map(async (r) => { try { const s = await r.pushManager?.getSubscription?.(); if (s) await s.unsubscribe(); } catch {} try { await r.unregister(); } catch {} }));
  }
  const registration = await navigator.serviceWorker.register(`${CURRENT_MESSAGING_WORKER}?v=11`, { scope: "/", updateViaCache: "none" });
  await registration.update().catch(() => {});
  await navigator.serviceWorker.ready;
  if (!registration.active) throw new Error("PowerHouse notification service worker did not become active.");
  if (!registration.active.scriptURL.includes(CURRENT_MESSAGING_WORKER)) throw new Error("PowerHouse notification service worker is not the expected /powerhouse-sw.js worker.");
  return registration;
};

const isPushSubscriptionError = (error) => { const text = String(error?.message || error || "").toLowerCase(); const code = String(error?.code || "").toLowerCase(); return text.includes("push service error") || text.includes("failed to subscribe") || code.includes("token-subscribe-failed"); };
const clearBrowserPushSubscription = async (registration) => { try { const s = await registration?.pushManager?.getSubscription?.(); if (s) await s.unsubscribe(); } catch (error) { console.warn("Browser push subscription cleanup skipped:", error?.message || error); } };
const getTokenWithRecovery = async (messagingService, registration, vapidKey) => {
  const { getToken } = await import("firebase/messaging");
  try { return await getToken(messagingService, { vapidKey, serviceWorkerRegistration: registration }); }
  catch (error) {
    if (!isPushSubscriptionError(error)) throw error;
    console.warn("FCM subscription failed; rebuilding the PowerHouse messaging worker once.", error?.message || error);
    await clearBrowserPushSubscription(registration);
    const freshRegistration = await getMessagingServiceWorker(true);
    return getToken(messagingService, { vapidKey, serviceWorkerRegistration: freshRegistration });
  }
};

const registerTokenWithBackend = async (token, currentUser) => {
  const backendUrl = getBackendUrl(); if (!backendUrl || !currentUser?.uid) return false;
  const idToken = await currentUser.getIdToken(); const deviceId = getPushDeviceId();
  const platform = /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "desktop";
  const response = await fetch(`${backendUrl}/api/notifications/register-token`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ token, deviceId, platform }) });
  const data = await response.json().catch(() => ({})); if (!response.ok || data?.success === false) throw new Error(data?.message || `Push token registration failed (${response.status})`); return true;
};

export const getFCMToken = async ({ requestPermission = true, forceFresh = false } = {}) => {
  try {
    const messagingService = await getMessagingInstance(); if (!messagingService || typeof Notification === "undefined") return null;
    if (!window.isSecureContext) throw new Error("Web Push requires HTTPS. Open PowerHouse using the HTTPS address.");
    let permission = Notification.permission; if (permission === "default" && requestPermission) permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error(`Notification permission is ${permission}. Please allow notifications for this site.`);
    const vapidKey = String(import.meta.env.VITE_VAPID_KEY || "").trim();
    if (!vapidKey) throw new Error("VITE_VAPID_KEY is missing. Add the Firebase Web Push certificate public key for powerhouse-app-47c4a.");
    if (!/^[A-Za-z0-9_-]{80,200}$/.test(vapidKey)) throw new Error("VITE_VAPID_KEY is malformed. Use the Web Push certificate public key from Firebase Console → Project Settings → Cloud Messaging.");
    const registration = await getMessagingServiceWorker(forceFresh);
    const token = await getTokenWithRecovery(messagingService, registration, vapidKey); if (!token) throw new Error("Firebase did not return a push registration token.");
    const currentUser = auth.currentUser;
    if (currentUser?.uid) {
      try {
        const registered = await registerTokenWithBackend(token, currentUser);
        if (!registered) {
          const { doc, setDoc, serverTimestamp } = await import("firebase/firestore"); const deviceId = getPushDeviceId(); const tokenId = `${currentUser.uid}_${deviceId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 150);
          await setDoc(doc(db, "powerhouse_fcm_tokens", tokenId), { token, userId: currentUser.uid, deviceId, platform: /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "desktop", updatedAt: serverTimestamp() }, { merge: true });
        }
      } catch (registrationError) {
        console.warn("Backend FCM token registration failed; trying Firestore fallback:", registrationError?.message || registrationError);
        const { doc, setDoc, serverTimestamp } = await import("firebase/firestore"); const deviceId = getPushDeviceId(); const tokenId = `${currentUser.uid}_${deviceId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 150);
        await setDoc(doc(db, "powerhouse_fcm_tokens", tokenId), { token, userId: currentUser.uid, deviceId, platform: /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "desktop", updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    return token;
  } catch (err) {
    const text = String(err?.message || err || "");
    if (/push service error|failed to subscribe|token-subscribe-failed/i.test(text)) err = new Error(`${text} — Browser FCM subscription could not be created. The code has rebuilt the service worker; if it still fails, the deployed VAPID public key must be from Firebase project powerhouse-app-47c4a.`);
    console.error("FCM setup failed:", err); throw err;
  }
};

export const onForegroundMessage = async (callback) => { if (!isFirebaseConfigured || typeof callback !== "function") return () => {}; const m = await getMessagingInstance(); if (!m) return () => {}; const { onMessage } = await import("firebase/messaging"); return onMessage(m, callback); };
export const onMessageListener = async () => { if (!isFirebaseConfigured) return null; const m = await getMessagingInstance(); if (!m) return null; const { onMessage } = await import("firebase/messaging"); return new Promise((resolve) => onMessage(m, (payload) => resolve(payload))); };
