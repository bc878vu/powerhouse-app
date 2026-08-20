import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);

export async function loginWithFirebase(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  // IMPORTANT: authenticate with Firebase first, then read the profile by the
  // authenticated UID. A collection query by email is incompatible with our
  // Firestore security rule (users can only read their own profile), so the
  // old query caused a successful Firebase login to be turned into a generic
  // "Login failed" message.
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  const firebaseUser = credential.user;
  const profileRef = doc(db, "powerhouse_users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileRef);

  let profile;

  if (!profileSnapshot.exists()) {
    // Least-privilege bootstrap. Admin/superadmin must be assigned explicitly
    // in Firestore by an authorized administrator.
    profile = {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
      email: firebaseUser.email || normalizedEmail,
      role: "electrician",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(profileRef, profile, { merge: true });
  } else {
    profile = { id: profileSnapshot.id, ...profileSnapshot.data() };
  }

  if (profile.status === "inactive") {
    await signOut(auth);
    throw new Error("Your account is inactive. Contact admin.");
  }

  return {
    id: profile.id || firebaseUser.uid,
    uid: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || "User",
    email: profile.email || firebaseUser.email,
    role: profile.role || "electrician"
  };
}

export { signOut };
