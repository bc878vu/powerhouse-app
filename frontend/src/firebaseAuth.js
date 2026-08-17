import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, getDocs, query, where, limit, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);

export async function loginWithFirebase(email, password) {
  const credential = await signInWithEmailAndPassword(auth, String(email).trim().toLowerCase(), password);
  const firebaseUser = credential.user;
  const snapshot = await getDocs(query(collection(db, "powerhouse_users"), where("email", "==", firebaseUser.email), limit(1)));
  let profile;

  if (snapshot.empty) {
    // Least-privilege default. Admin/superadmin roles must be assigned by an
    // administrator in Firestore after the account has been created.
    profile = {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
      email: firebaseUser.email || String(email).trim().toLowerCase(),
      role: "electrician",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, "powerhouse_users", firebaseUser.uid), profile, { merge: true });
  } else {
    profile = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
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
