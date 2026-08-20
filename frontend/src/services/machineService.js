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

const MACHINE_COLLECTION = "powerhouse_machines";
const LOG_COLLECTION = "powerhouse_machine_load_logs";
const CATEGORY_COLLECTION = "powerhouse_machine_categories";

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
  currentRunningLoad: Math.max(0, Number(machine.currentRunningLoad) || 0),
  loadUnit: String(machine.loadUnit || "kW").trim(),
  normalLoadFactor: Math.min(100, Math.max(0, Number(machine.normalLoadFactor) || 0)),
  installDate: machine.installDate || "",
  lastMaintenance: machine.lastMaintenance || "",
  nextMaintenance: machine.nextMaintenance || "",
  maintenanceIntervalDays: Number(machine.maintenanceIntervalDays) || 0,
  notes: String(machine.notes || "").trim()
});

export function subscribeToMachines(callback, onError) {
  return onSnapshot(collection(db, MACHINE_COLLECTION), (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    callback(items);
  }, (error) => onError?.(error));
}

export function subscribeToMachineLoadLogs(callback, onError) {
  return onSnapshot(collection(db, LOG_COLLECTION), (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    callback(items);
  }, (error) => onError?.(error));
}

export function subscribeToMachineCategories(callback, onError) {
  return onSnapshot(collection(db, CATEGORY_COLLECTION), (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    callback(items);
  }, (error) => onError?.(error));
}

export async function addMachine(machine) {
  return addDoc(collection(db, MACHINE_COLLECTION), { ...normalizeMachine(machine), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateMachine(id, machine) {
  if (!id) throw new Error("Machine ID is required.");
  await updateDoc(doc(db, MACHINE_COLLECTION, id), { ...normalizeMachine(machine), updatedAt: serverTimestamp() });
}

export async function deleteMachine(id) {
  if (!id) throw new Error("Machine ID is required.");
  await deleteDoc(doc(db, MACHINE_COLLECTION, id));
}

export async function addMachineLoadLog(log) {
  const machineId = String(log.machineId || "").trim();
  const date = String(log.date || "").trim();
  if (!machineId || !date) throw new Error("Machine and date are required.");
  const hours = Math.max(0, Number(log.operatingHours) || 0);
  const loadKW = Math.max(0, Number(log.actualLoad) || 0);
  const peakLoad = Math.max(loadKW, Number(log.peakLoad) || 0);
  return addDoc(collection(db, LOG_COLLECTION), {
    machineId,
    machineName: String(log.machineName || "").trim(),
    machineCode: String(log.machineCode || "").trim(),
    date,
    actualLoad: loadKW,
    peakLoad,
    operatingHours: hours,
    energyConsumed: Number((loadKW * hours).toFixed(2)),
    note: String(log.note || "").trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function addMachineCategory(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Category name is required.");
  return addDoc(collection(db, CATEGORY_COLLECTION), { name: clean, createdAt: serverTimestamp() });
}
