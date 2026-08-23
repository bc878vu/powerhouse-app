import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);
const ADMIN_EMAIL = "admin@powerhouse.com";
const isAdminEmail = (email) => String(email || "").trim().toLowerCase() === ADMIN_EMAIL;

const resolveProfilePhoto = (profile, firebaseUser) =>
  profile?.profile_pic ||
  profile?.profilePic ||
  profile?.photoURL ||
  firebaseUser?.photoURL ||
  "";

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

      // Keep a Google/Gmail avatar available to every part of the portal.
      // A manually uploaded profile_pic always has priority over Google photoURL.
      if (!profile.profile_pic && firebaseUser.photoURL) {
        try {
          await setDoc(
            profileRef,
            {
              profile_pic: firebaseUser.photoURL,
              photoURL: firebaseUser.photoURL,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
          profile.profile_pic = firebaseUser.photoURL;
          profile.photoURL = firebaseUser.photoURL;
        } catch (writeError) {
          if (writeError?.code === "permission-denied") {
            profilePermissionIssue = true;
          } else {
            console.warn("Could not persist Google profile photo:", writeError?.message || writeError);
          }
        }
      }
    } else {
      const googlePhoto = firebaseUser.photoURL || "";
      const newProfile = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || (defaultRole === "admin" ? "Admin" : authenticatedEmail.split("@")[0] || "User"),
        email: firebaseUser.email || authenticatedEmail,
        role: defaultRole,
        status: "active",
        profile_pic: googlePhoto,
        photoURL: googlePhoto,
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

  if (!profile) {
    profile = {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || (defaultRole === "admin" ? "Admin" : authenticatedEmail.split("@")[0] || "User"),
      email: firebaseUser.email || authenticatedEmail,
      role: defaultRole,
      status: "active",
      profile_pic: firebaseUser.photoURL || "",
      photoURL: firebaseUser.photoURL || "",
      profilePermissionIssue
    };
  }

  if (profile.status === "inactive") {
    await signOut(auth);
    throw new Error("Your account is inactive. Contact admin.");
  }

  const profilePic = resolveProfilePhoto(profile, firebaseUser);

  return {
    id: profile.id || firebaseUser.uid,
    uid: firebaseUser.uid,
    firebaseUid: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || authenticatedEmail.split("@")[0] || "User",
    email: profile.email || firebaseUser.email || authenticatedEmail,
    role: profile.role || defaultRole,
    profile_pic: profilePic,
    profilePic,
    photoURL: profile.photoURL || firebaseUser.photoURL || profilePic,
    profilePermissionIssue: Boolean(profilePermissionIssue)
  };
}

export { signOut };
