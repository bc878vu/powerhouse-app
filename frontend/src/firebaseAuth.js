import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);

const ADMIN_EMAIL = "admin@powerhouse.com";

export async function loginWithFirebase(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  // Firebase Authentication is the source of truth for the password. Do not
  // query users by email before authentication and do not use the legacy MySQL
  // password system here.
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  const firebaseUser = credential.user;
  const authenticatedEmail = String(firebaseUser.email || normalizedEmail).trim().toLowerCase();
  const profileRef = doc(db, "powerhouse_users", firebaseUser.uid);

  let profile = null;

  try {
    const profileSnapshot = await getDoc(profileRef);

    if (profileSnapshot.exists()) {
      profile = { id: profileSnapshot.id, ...profileSnapshot.data() };
    } else {
      // Safe bootstrap: ordinary users can create only a low-privilege profile.
      // The configured admin email is recognized as admin by the Firestore rule
      // using the authenticated Firebase email claim.
      const role = authenticatedEmail === ADMIN_EMAIL ? "admin" : "electrician";
      const newProfile = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || (authenticatedEmail === ADMIN_EMAIL ? "Admin" : authenticatedEmail.split("@")[0] || "User"),
        email: firebaseUser.email || authenticatedEmail,
        role,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(profileRef, newProfile, { merge: true });
      profile = { id: firebaseUser.uid, ...newProfile, role };
    }
  } catch (profileError) {
    // Authentication itself has already succeeded. Surface the actual
    // Firestore error instead of replacing it with the misleading login error.
    console.error("Firebase profile error:", profileError);
    throw profileError;
  }

  if (profile.status === "inactive") {
    await signOut(auth);
    throw new Error("Your account is inactive. Contact admin.");
  }

  return {
    id: profile.id || firebaseUser.uid,
    uid: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || authenticatedEmail.split("@")[0] || "User",
    email: profile.email || firebaseUser.email || authenticatedEmail,
    role: profile.role || (authenticatedEmail === ADMIN_EMAIL ? "admin" : "electrician")
  };
}

export { signOut };
