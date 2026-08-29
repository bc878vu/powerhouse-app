import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

const MACHINE_COLLECTION = "powerhouse_machines";
const LOG_COLLECTION = "powerhouse_machine_load_logs";
const CATEGORY_COLLECTION = "powerhouse_machine_categories";
const DEFAULT_LOG_LIMIT = 500;

const cleanNumber = (value, min = 0) => Math.max(min, Number(value) || 0);
const sortByCreated = (items) => items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
const safeSnapshotItems = (snapshot) => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));

const normalizeMachine = (machine = {}) => ({
  name: String(machine.name || "").trim(), code: String(machine.code || "").trim().toUpperCase(), category: String(machine.category || "General").trim(), type: String(machine.type || "").trim(), manufacturer: String(machine.manufacturer || "").trim(), model: String(machine.model || "").trim(), serialNumber: String(machine.serialNumber || "").trim(), location: String(machine.location || "").trim(), department: String(machine.department || "Power House").trim(), capacity: cleanNumber(machine.capacity), capacityUnit: String(machine.capacityUnit || "kW").trim(), status: String(machine.status || "standby").trim(), currentRunningLoad: cleanNumber(machine.currentRunningLoad), loadUnit: String(machine.loadUnit || "kW").trim(), normalLoadFactor: Math.min(100, cleanNumber(machine.normalLoadFactor)), installDate: machine.installDate || "", lastMaintenance: machine.lastMaintenance || "", nextMaintenance: machine.nextMaintenance || "", maintenanceIntervalDays: cleanNumber(machine.maintenanceIntervalDays), notes: String(machine.notes || "").trim()
});

export function subscribeToMachines(callback, onError) {
  return onSnapshot(query(collection(db, MACHINE_COLLECTION), orderBy("createdAt", "desc")), snapshot => callback(safeSnapshotItems(snapshot)), onError);
}
export function subscribeToMachine(id, callback, onError) {
  if (!id) { onError?.(new Error("Machine ID is required.")); return () => {}; }
  return onSnapshot(doc(db, MACHINE_COLLECTION, id), snapshot => snapshot.exists() ? callback({ id: snapshot.id, ...snapshot.data() }) : onError?.(new Error("Machine record was not found.")), onError);
}
export function subscribeToMachineLoadLogs(callback, onError, maxItems = DEFAULT_LOG_LIMIT) {
  const capped = Math.max(1, Math.min(Number(maxItems) || DEFAULT_LOG_LIMIT, 1000));
  return onSnapshot(query(collection(db, LOG_COLLECTION), orderBy("date", "desc"), limit(capped)), snapshot => {
    const items = safeSnapshotItems(snapshot);
    items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    callback(items);
  }, onError);
}
export function subscribeToMachineCategories(callback, onError) {
  return onSnapshot(query(collection(db, CATEGORY_COLLECTION), orderBy("name", "asc")), snapshot => callback(safeSnapshotItems(snapshot)), onError);
}
export async function addMachine(machine) { const data = normalizeMachine(machine); if (!data.name || !data.code) throw new Error("Machine name and code are required."); if (data.capacity > 0 && data.currentRunningLoad > data.capacity) throw new Error("Actual running load cannot exceed rated load."); return addDoc(collection(db, MACHINE_COLLECTION), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
export async function updateMachine(id, machine) { if (!id) throw new Error("Machine ID is required."); const data = normalizeMachine(machine); if (!data.name || !data.code) throw new Error("Machine name and code are required."); if (data.capacity > 0 && data.currentRunningLoad > data.capacity) throw new Error("Actual running load cannot exceed rated load."); await updateDoc(doc(db, MACHINE_COLLECTION, id), { ...data, updatedAt: serverTimestamp() }); }
export async function deleteMachine(id) { if (!id) throw new Error("Machine ID is required."); await deleteDoc(doc(db, MACHINE_COLLECTION, id)); }
export async function addMachineLoadLog(log) {
  const machineId = String(log.machineId || "").trim(); const date = String(log.date || "").trim(); if (!machineId || !date) throw new Error("Machine and date are required.");
  const actualLoad = cleanNumber(log.actualLoad); const operatingHours = cleanNumber(log.operatingHours); const peakLoad = Math.max(actualLoad, cleanNumber(log.peakLoad)); const meterStart = log.meterStart === "" ? null : Number(log.meterStart); const meterEnd = log.meterEnd === "" ? null : Number(log.meterEnd); const meterEnergy = Number.isFinite(meterStart) && Number.isFinite(meterEnd) && meterEnd >= meterStart ? meterEnd - meterStart : 0; const directEnergy = cleanNumber(log.energyConsumed); const energyConsumed = Number((meterEnergy || directEnergy || actualLoad * operatingHours).toFixed(2)); const status = String(log.status || "").trim();
  const batch = writeBatch(db); const logRef = doc(collection(db, LOG_COLLECTION));
  batch.set(logRef, { machineId, machineName: String(log.machineName || "").trim(), machineCode: String(log.machineCode || "").trim(), date, actualLoad, peakLoad, operatingHours, meterStart: Number.isFinite(meterStart) ? meterStart : null, meterEnd: Number.isFinite(meterEnd) ? meterEnd : null, energyConsumed, status, note: String(log.note || "").trim(), recordedBy: String(log.recordedBy || "").trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const machinePatch = { currentRunningLoad: actualLoad, updatedAt: serverTimestamp() }; if (status) machinePatch.status = status; batch.update(doc(db, MACHINE_COLLECTION, machineId), machinePatch); await batch.commit(); return logRef;
}
export async function deleteMachineLoadLog(id) { if (!id) throw new Error("Load record ID is required."); await deleteDoc(doc(db, LOG_COLLECTION, id)); }
export async function addMachineCategory(name) { const clean = String(name || "").trim(); if (!clean) throw new Error("Category name is required."); return addDoc(collection(db, CATEGORY_COLLECTION), { name: clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
