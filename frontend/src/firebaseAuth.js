import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);
const ADMIN_EMAIL = "admin@powerhouse.com";
const isAdminEmail = email => String(email || "").trim().toLowerCase() === ADMIN_EMAIL;

export async function loginWithFirebase(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  const firebaseUser = credential.user;
  const authenticatedEmail = String(firebaseUser.email || normalizedEmail).trim().toLowerCase();
  const defaultRole = isAdminEmail(authenticatedEmail) ? "admin" : "electrician";
  const profileRef = doc(db, "powerhouse_users", firebaseUser.uid);
  let profile = null;
  let profilePermissionIssue = false;

  try {
    const snapshot = await getDoc(profileRef);
    if (snapshot.exists()) {
      profile = { id: snapshot.id, ...snapshot.data() };
    } else {
      const newProfile = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || (defaultRole === "admin" ? "Admin" : authenticatedEmail.split("@")[0] || "User"),
        email: firebaseUser.email || authenticatedEmail,
        role: defaultRole,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      try {
        await setDoc(profileRef, newProfile, { merge: true });
        profile = { id: firebaseUser.uid, ...newProfile, role: defaultRole };
      } catch (writeError) {
        if (writeError?.code === "permission-denied") profilePermissionIssue = true;
        else throw writeError;
      }
    }
  } catch (readError) {
    if (readError?.code === "permission-denied") profilePermissionIssue = true;
    else throw readError;
  }

  // Firebase Authentication is already valid. A stale/not-yet-deployed Firestore
  // ruleset must not lock users out of the portal. Protected Firestore data is
  // still enforced server-side by rules; this fallback only creates a local
  // session with the safe default role.
  if (!profile) {
    profile = {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || (defaultRole === "admin" ? "Admin" : authenticatedEmail.split("@")[0] || "User"),
      email: firebaseUser.email || authenticatedEmail,
      role: defaultRole,
      status: "active",
      profilePermissionIssue
    };
  }

  if (profile.status === "inactive") {
    await signOut(auth);
    throw new Error("Your account is inactive. Contact admin.");
  }

  return {
    id: profile.id || firebaseUser.uid,
    uid: firebaseUser.uid,
    firebaseUid: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || authenticatedEmail.split("@")[0] || "User",
    email: profile.email || firebaseUser.email || authenticatedEmail,
    role: profile.role || defaultRole,
    profilePermissionIssue: Boolean(profilePermissionIssue)
  };
}

export { signOut };
