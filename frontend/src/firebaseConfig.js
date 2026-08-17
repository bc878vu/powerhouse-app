// Backward-compatible Firebase entry point.
// Keep all Firebase initialization centralized in ./firebase.js so every
// module shares the same Firebase App/Auth/Firestore/Storage instances.
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
  onMessageListener
} from "./firebase";

export { app as default } from "./firebase";
