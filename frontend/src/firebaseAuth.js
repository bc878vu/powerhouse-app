import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

export const auth = getAuth(app);
const ADMIN_EMAIL = "admin@powerhouse.com";
const isAdminEmail = (email) => String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
const apiBase = () => String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
const resolveProfilePhoto = (profile, firebaseUser) => profile?.profile_pic || profile?.profilePic || profile?.photoURL || firebaseUser?.photoURL || "";

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
    const imageResponse = await fetch(photoURL, { mode: "cors" });
    if (!imageResponse.ok) throw new Error(`Google avatar download failed (${imageResponse.status})`);
    const blob = await imageResponse.blob();
    if (!blob.size) throw new Error("Google avatar is empty");
    const extension = (blob.type || "image/jpeg").split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const form = new FormData();
    form.append("name", staffRecord.name || "User");
    form.append("email", staffRecord.email || "");
    form.append("role", staffRecord.role || "electrician");
    form.append("status", staffRecord.status || "active");
    form.append("profile_pic", blob, `google-profile.${extension}`);
    const response = await fetch(`${base}/api/user/${staffRecord.id}`, { method: "PUT", headers: { Accept: "application/json" }, body: form });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || `Profile photo sync failed (${response.status})`);
    }
  } catch (error) {
    console.warn("Could not persist Google photo to staff record:", error?.message || error);
  }
}

async function allocateNumericId() {
  try {
    const snapshot = await getDocs(collection(db, "powerhouse_users"));
    const ids = snapshot.docs.map((item) => Number(item.data()?.id)).filter((value) => Number.isInteger(value) && value >= 10000);
    return Math.max(10000, ...ids) + 1;
  } catch (error) {
    console.warn("Could not inspect numeric user IDs; using timestamp fallback.", error?.message || error);
    return 10000 + (Date.now() % 1000000);
  }
}

async function ensureNumericProfileId(profile, firebaseUser, staffRecord) {
  const existingId = Number(profile?.id);
  if (Number.isInteger(existingId) && existingId > 0) return { profile, numericId: existingId };
  const staffId = Number(staffRecord?.id);
  const numericId = Number.isInteger(staffId) && staffId > 0 ? staffId : await allocateNumericId();
  const nextProfile = { ...profile, id: numericId, numericId, uid: firebaseUser.uid, firebaseUid: firebaseUser.uid, updatedAt: serverTimestamp() };
  try {
    await setDoc(doc(db, "powerhouse_users", firebaseUser.uid), nextProfile, { merge: true });
  } catch (error) {
    if (error?.code !== "permission-denied") throw error;
    console.warn("Could not persist numeric profile ID because Firestore denied the write.");
  }
  return { profile: nextProfile, numericId };
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
      const newProfile = { id: firebaseUser.uid, uid: firebaseUser.uid, firebaseUid: firebaseUser.uid, name: firebaseUser.displayName || staffRecord?.name || (defaultRole === "admin" ? "Admin" : authenticatedEmail.split("@")[0] || "User"), email: firebaseUser.email || authenticatedEmail, role: staffRecord?.role || defaultRole, status: staffRecord?.status || "active", profile_pic: googlePhoto, profilePic: googlePhoto, photoURL: googlePhoto, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
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

  if (!profile) profile = { id: firebaseUser.uid, uid: firebaseUser.uid, firebaseUid: firebaseUser.uid, name: firebaseUser.displayName || staffRecord?.name || authenticatedEmail.split("@")[0] || "User", email: firebaseUser.email || authenticatedEmail, role: staffRecord?.role || defaultRole, status: staffRecord?.status || "active", profile_pic: firebaseUser.photoURL || "", profilePic: firebaseUser.photoURL || "", photoURL: firebaseUser.photoURL || "", profilePermissionIssue };

  const numericProfile = await ensureNumericProfileId(profile, firebaseUser, staffRecord);
  profile = numericProfile.profile;

  if (String(profile.status || staffRecord?.status || "active").toLowerCase() === "inactive") {
    await signOut(auth);
    throw new Error("Your account is inactive. Contact admin.");
  }

  const profilePic = resolveProfilePhoto(profile, firebaseUser);
  if (staffRecord?.id && firebaseUser.photoURL) void syncStaffGooglePhoto(staffRecord, firebaseUser.photoURL);

  return { id: numericProfile.numericId, numericId: numericProfile.numericId, uid: firebaseUser.uid, firebaseUid: firebaseUser.uid, name: profile.name || firebaseUser.displayName || staffRecord?.name || authenticatedEmail.split("@")[0] || "User", email: profile.email || staffRecord?.email || firebaseUser.email || authenticatedEmail, role: staffRecord?.role || profile.role || defaultRole, status: staffRecord?.status || profile.status || "active", profile_pic: profilePic, profilePic, photoURL: profile.photoURL || firebaseUser.photoURL || profilePic, profilePermissionIssue: Boolean(profilePermissionIssue) };
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