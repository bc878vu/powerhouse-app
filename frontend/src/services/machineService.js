import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "powerhouse_machines";

const normalizeMachine = (machine = {}) => ({
  name: String(machine.name || "").trim(),
  code: String(machine.code || "").trim(),
  category: String(machine.category || "General").trim(),
  type: String(machine.type || "").trim(),
  manufacturer: String(machine.manufacturer || "").trim(),
  model: String(machine.model || "").trim(),
  serialNumber: String(machine.serialNumber || "").trim(),
  location: String(machine.location || "").trim(),
  department: String(machine.department || "Power House").trim(),
  capacity: Number(machine.capacity) || 0,
  capacityUnit: String(machine.capacityUnit || "kW").trim(),
  status: String(machine.status || "standby").trim(),
  installDate: machine.installDate || "",
  lastMaintenance: machine.lastMaintenance || "",
  nextMaintenance: machine.nextMaintenance || "",
  maintenanceIntervalDays: Number(machine.maintenanceIntervalDays) || 0,
  notes: String(machine.notes || "").trim()
});

export function subscribeToMachines(callback, onError) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      items.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(items);
    },
    (error) => onError?.(error)
  );
}

export async function addMachine(machine) {
  const data = normalizeMachine(machine);
  return addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateMachine(id, machine) {
  if (!id) throw new Error("Machine ID is required.");
  const data = normalizeMachine(machine);
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteMachine(id) {
  if (!id) throw new Error("Machine ID is required.");
  await deleteDoc(doc(db, COLLECTION, id));
}
