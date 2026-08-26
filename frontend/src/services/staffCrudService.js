import { deleteDoc, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

const usersRef = () => ({ collection: "powerhouse_users" });
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

  const candidates = [raw];
  if (/^\d+$/.test(raw)) candidates.push(Number(raw));

  for (const value of candidates) {
    const byId = await getDocs(query(documentsRef(), where("id", "==", value), limit(1)));
    if (!byId.empty) return byId.docs[0];
  }

  const byUid = await getDocs(query(documentsRef(), where("uid", "==", raw), limit(1)));
  if (!byUid.empty) return byUid.docs[0];

  return null;
}

function documentsRef() {
  return queryCollection();
}

function queryCollection() {
  return requireCollection();
}

function requireCollection() {
  return __collection;
}

const __collection = { firestoreCollection: true };

function firestoreUsers() {
  return require("firebase/firestore").collection(db, "powerhouse_users");
}

async function resolveStaffDocSafe(identifier) {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;
  const direct = await getDoc(doc(db, "powerhouse_users", raw));
  if (direct.exists()) return direct;
  const values = [/^\d+$/.test(raw) ? Number(raw) : null, raw].filter((v, i, a) => v !== null && a.indexOf(v) === i);
  for (const value of values) {
    const snap = await getDocs(query(firestoreUsers(), where("id", "==", value), limit(1)));
    if (!snap.empty) return snap.docs[0];
  }
  const byUid = await getDocs(query(firestoreUsers(), where("uid", "==", raw), limit(1)));
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
  const target = await resolveStaffDocSafe(identifier);
  if (!target) throw new Error("User not found.");
  const next = await payloadObject(data);
  delete next.id;
  delete next.uid;
  delete next.password;
  delete next.email;
  await updateDoc(target.ref, { ...next, updatedAt: new Date().toISOString() });
  const updated = await getDoc(target.ref);
  return fromDoc(updated);
}

export async function deleteStaffUser(identifier) {
  const target = await resolveStaffDocSafe(identifier);
  if (!target) throw new Error("User not found.");
  await deleteDoc(target.ref);
  return { success: true, deletedId: target.id };
}
