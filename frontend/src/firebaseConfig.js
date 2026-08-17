// Backward-compatible Firebase entry point.
// The project previously initialized a second Firebase app here, which caused
// duplicate Firestore initialization in production. Keep all initialization
// centralized in ./firebase.js.
export { app as default, app, db, messaging, getFCMToken, onMessageListener } from "./firebase";
