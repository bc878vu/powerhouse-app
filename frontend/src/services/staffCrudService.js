import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

const usersRef = collection(db, "powerhouse_users");
const clean = (value) => {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
};
const fromDoc = (snapshot) => ({ id: snapshot.id, firestoreId: snapshot.id, ...(clean(snapshot.data() || {})) });

async function resolveStaffDoc(identifier) {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;

  const direct = await getDoc(doc(db, "powerhouse_users", raw));
  if (direct.exists()) return direct;

  const values = [/^\d+$/.test(raw) ? Number(raw) : null, raw].filter((v, i, a) => v !== null && a.indexOf(v) === i);
  for (const value of values) {
    const snap = await getDocs(query(usersRef, where("id", "==", value), limit(1)));
    if (!snap.empty) return snap.docs[0];
  }

  const byUid = await getDocs(query(usersRef, where("uid", "==", raw), limit(1)));
  if (!byUid.empty) return byUid.docs[0];
  return null;
}

async function payloadObject(data) {
  if (!(typeof FormData !== "undefined" && data instanceof FormData)) return { ...(data || {}) };
  const result = {};
  for (const [key, value] of data.entries()) {
    if (typeof File !== "undefined" && value instanceof File) {
      if (!value.size) continue;
      const safeName = String(value.name || `profile-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `powerhouse/uploads/staff-${Date.now()}-${safeName}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, value);
      result[key] = { url: await getDownloadURL(storageRef), path, name: value.name || safeName, type: value.type || "" };
    } else result[key] = value;
  }
  return result;
}

export async function updateStaffUser(identifier, data) {
  const target = await resolveStaffDoc(identifier);
  if (!target) throw new Error("User not found.");
  const next = await payloadObject(data);
  delete next.id;
  delete next.uid;
  delete next.password;
  delete next.email;
  await updateDoc(target.ref, { ...next, updatedAt: new Date().toISOString() });
  return fromDoc(await getDoc(target.ref));
}

export async function deleteStaffUser(identifier) {
  const target = await resolveStaffDoc(identifier);
  if (!target) throw new Error("User not found.");
  await deleteDoc(target.ref);
  return { success: true, deletedId: target.id };
}
