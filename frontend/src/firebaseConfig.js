// Backward-compatible Firebase entry point.
// Keep all Firebase initialization centralized in ./firebase.js.
export {
  app,
  db,
  auth,
  storage,
  messaging,
  firebaseConfig,
  missingConfig,
  isFirebaseConfigured,
  getFCMToken,
  onForegroundMessage,
  onMessageListener
} from "./firebase";

export { app as default } from "./firebase";
