import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);
const ADMIN_EMAIL = "admin@powerhouse.com";
const isAdminEmail = (email) => String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
const apiBase = () => String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");

const resolveProfilePhoto = (profile, firebaseUser) =>
  profile?.profile_pic || profile?.profilePic || profile?.photoURL || firebaseUser?.photoURL || "";

async function resolveStaffRecord(firebaseUser) {
  const base = apiBase();
  if (!base || !firebaseUser?.email) return null;

  try {
    const response = await fetch(`${base}/api/user/all`, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    const users = Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : Array.isArray(payload?.data) ? payload.data : [];
    const email = String(firebaseUser.email).trim().toLowerCase();
    return users.find((item) => String(item?.email || "").trim().toLowerCase() === email) || null;
  } catch (error) {
    console.warn("Could not resolve numeric staff ID:", error?.message || error);
    return null;
  }
}

async function syncStaffGooglePhoto(staffRecord, photoURL) {
  if (!staffRecord?.id || !photoURL) return;
  const base = apiBase();
  if (!base) return;

  try {
    await fetch(`${base}/api/user/${staffRecord.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ profile_pic: photoURL, photoURL })
    });
  } catch (error) {
    // Firestore remains the source for the Firebase profile; DB sync is best-effort.
    console.warn("Could not sync Google photo to staff record:", error?.message || error);
  }
}

async function buildSession(firebaseUser) {
  const authenticatedEmail = String(firebaseUser.email || "").trim().toLowerCase();
  const defaultRole = isAdminEmail(authenticatedEmail) ? "admin" : "electrician";
  const staffRecord = await resolveStaffRecord(firebaseUser);
  const profileRef = doc(db, "powerhouse_users", firebaseUser.uid);
  let profile = null;
  let profilePermissionIssue = false;

  try {
    const snapshot = await getDoc(profileRef);
    if (snapshot.exists()) {
      profile = { id: snapshot.id, ...snapshot.data() };
    } else {
      const googlePhoto = firebaseUser.photoURL || "";
      const newProfile = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || staffRecord?.name || (defaultRole === "admin" ? "Admin" : authenticatedEmail.split("@")[0] || "User"),
        email: firebaseUser.email || authenticatedEmail,
        role: staffRecord?.role || defaultRole,
        status: staffRecord?.status || "active",
        profile_pic: googlePhoto,
        profilePic: googlePhoto,
        photoURL: googlePhoto,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      try {
        await setDoc(profileRef, newProfile, { merge: true });
        profile = { ...newProfile, id: firebaseUser.uid, role: newProfile.role };
      } catch (writeError) {
        if (writeError?.code === "permission-denied") profilePermissionIssue = true;
        else throw writeError;
      }
    }

    const googlePhoto = firebaseUser.photoURL || "";
    if (googlePhoto && (!profile?.profile_pic || profile.profile_pic !== googlePhoto)) {
      try {
        await setDoc(profileRef, { profile_pic: googlePhoto, profilePic: googlePhoto, photoURL: googlePhoto, updatedAt: serverTimestamp() }, { merge: true });
        profile = { ...profile, profile_pic: googlePhoto, profilePic: googlePhoto, photoURL: googlePhoto };
      } catch (writeError) {
        if (writeError?.code === "permission-denied") profilePermissionIssue = true;
        else console.warn("Could not persist Google profile photo:", writeError?.message || writeError);
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
      name: firebaseUser.displayName || staffRecord?.name || authenticatedEmail.split("@")[0] || "User",
      email: firebaseUser.email || authenticatedEmail,
      role: staffRecord?.role || defaultRole,
      status: staffRecord?.status || "active",
      profile_pic: firebaseUser.photoURL || "",
      profilePic: firebaseUser.photoURL || "",
      photoURL: firebaseUser.photoURL || "",
      profilePermissionIssue
    };
  }

  if (String(profile.status || staffRecord?.status || "active").toLowerCase() === "inactive") {
    await signOut(auth);
    throw new Error("Your account is inactive. Contact admin.");
  }

  const profilePic = resolveProfilePhoto(profile, firebaseUser);
  if (staffRecord?.id && profilePic) void syncStaffGooglePhoto(staffRecord, profilePic);

  // IMPORTANT: task tables use the numeric MySQL staff id. Firebase UID remains
  // available separately for Firebase notifications/profile documents.
  const numericStaffId = Number(staffRecord?.id);
  const sessionId = Number.isInteger(numericStaffId) && numericStaffId > 0 ? numericStaffId : (profile.id || firebaseUser.uid);

  return {
    id: sessionId,
    numericId: Number.isInteger(numericStaffId) && numericStaffId > 0 ? numericStaffId : null,
    uid: firebaseUser.uid,
    firebaseUid: firebaseUser.uid,
    name: profile.name || firebaseUser.displayName || staffRecord?.name || authenticatedEmail.split("@")[0] || "User",
    email: profile.email || staffRecord?.email || firebaseUser.email || authenticatedEmail,
    role: staffRecord?.role || profile.role || defaultRole,
    status: staffRecord?.status || profile.status || "active",
    profile_pic: profilePic,
    profilePic,
    photoURL: profile.photoURL || firebaseUser.photoURL || profilePic,
    profilePermissionIssue: Boolean(profilePermissionIssue)
  };
}

export async function loginWithFirebase(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return buildSession(credential.user);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  return buildSession(credential.user);
}

export { signOut };