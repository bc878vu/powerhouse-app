import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";

const panelsRef = collection(db, "powerhouse_panels");
const routesRef = collection(db, "powerhouse_panel_routes");
const historyRef = collection(db, "powerhouse_panel_history");

const clean = (value) => {
  if (value === undefined) return null;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  }
  return value;
};

const fromDoc = (snapshot) => ({ id: snapshot.id, ...clean(snapshot.data() || {}) });
const numericId = () => String(Date.now()) + String(Math.floor(Math.random() * 1000));

export async function listPanels({ includeDeleted = false } = {}) {
  const constraints = [];
  if (!includeDeleted) constraints.push(where("is_deleted", "!=", true));
  let snapshot;
  try {
    snapshot = await getDocs(query(panelsRef, ...constraints, orderBy("created_at", "desc")));
  } catch {
    snapshot = await getDocs(panelsRef);
  }
  return snapshot.docs
    .map(fromDoc)
    .filter((panel) => includeDeleted ? panel.is_deleted === true : panel.is_deleted !== true)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export async function getPanel(id) {
  const snapshot = await getDoc(doc(db, "powerhouse_panels", String(id)));
  if (!snapshot.exists()) return null;
  return fromDoc(snapshot);
}

export async function createPanel(payload) {
  const id = numericId();
  const now = serverTimestamp();
  const panel = {
    ...payload,
    id,
    is_deleted: false,
    deleted: 0,
    is_archived: false,
    archived: 0,
    created_at: now,
    updated_at: now,
    effective_status: payload.status || "unknown"
  };
  delete panel.deleted_at;
  delete panel.deleted_by;
  delete panel.deletion_reason;

  await addDoc(panelsRef, panel);
  const tempSnapshot = await getDocs(query(panelsRef, where("id", "==", id)));
  const created = tempSnapshot.docs[0];
  if (!created) throw new Error("Panel was saved but could not be reloaded.");

  if (Array.isArray(payload.cable_route_points) && payload.cable_route_points.length > 0) {
    await addDoc(routesRef, {
      panel_id: id,
      route_name: payload.route_name || `${payload.panel_name || "Panel"} Cable Route`,
      cable_tray_name: payload.cable_tray_name || "",
      route_points: payload.cable_route_points,
      points: payload.cable_route_points,
      created_at: now,
      updated_at: now
    });
  }
  return { ...fromDoc(created), id };
}

export async function updatePanel(id, payload) {
  const snapshot = await getDocs(query(panelsRef, where("id", "==", String(id))));
  const target = snapshot.docs[0] || null;
  if (!target) throw new Error("Panel not found");
  await updateDoc(target.ref, { ...payload, updated_at: serverTimestamp() });
  return getPanel(target.id);
}

export async function updatePanelStatus(id, status, reason = "") {
  const snapshot = await getDocs(query(panelsRef, where("id", "==", String(id))));
  const target = snapshot.docs[0] || null;
  if (!target) throw new Error("Panel not found");
  const previous = fromDoc(target);
  const nextReason = reason || `Panel changed to ${status}`;
  await updateDoc(target.ref, { status, effective_status: status, status_reason: nextReason, updated_at: serverTimestamp() });
  await addDoc(historyRef, {
    panel_id: String(id), action: "status_updated",
    previous_status: previous.status || "unknown", new_status: status,
    reason: nextReason, created_at: serverTimestamp()
  });
  return getPanel(target.id);
}

export async function archivePanel(id) {
  const snapshot = await getDocs(query(panelsRef, where("id", "==", String(id))));
  const target = snapshot.docs[0] || null;
  if (!target) throw new Error("Panel not found");
  const panel = fromDoc(target);
  const now = new Date().toISOString();
  await updateDoc(target.ref, {
    is_deleted: true, deleted: 1, is_archived: true, archived: 1,
    deleted_at: now, archived_at: now, updated_at: serverTimestamp()
  });
  await addDoc(historyRef, { panel_id: String(id), action: "archived", panel_snapshot: panel, created_at: serverTimestamp() });
  return { ...panel, is_deleted: true, deleted_at: now };
}

export async function restorePanel(id) {
  const snapshot = await getDocs(query(panelsRef, where("id", "==", String(id))));
  const target = snapshot.docs[0] || null;
  if (!target) throw new Error("Panel not found");
  await updateDoc(target.ref, {
    is_deleted: false, deleted: 0, is_archived: false, archived: 0,
    deleted_at: null, archived_at: null, updated_at: serverTimestamp()
  });
  await addDoc(historyRef, { panel_id: String(id), action: "restored", created_at: serverTimestamp() });
  return getPanel(target.id);
}

export async function permanentlyDeletePanel(id) {
  const snapshot = await getDocs(query(panelsRef, where("id", "==", String(id))));
  const target = snapshot.docs[0] || null;
  if (!target) throw new Error("Panel not found");
  const routeSnapshot = await getDocs(query(routesRef, where("panel_id", "==", String(id))));
  await Promise.all(routeSnapshot.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(target.ref);
  return { success: true };
}

export async function listRoutes() {
  const snapshot = await getDocs(routesRef);
  return snapshot.docs.map(fromDoc).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export async function getPanelStats(id) {
  const panel = await getPanel(id);
  if (!panel) throw new Error("Panel not found");
  const historySnapshot = await getDocs(query(historyRef, where("panel_id", "==", String(id))));
  const history = historySnapshot.docs.map(fromDoc);
  return {
    panel_id: String(id), status: panel.status || "unknown",
    effective_status: panel.effective_status || panel.status || "unknown",
    history_count: history.length,
    status_updates: history.filter((item) => item.action === "status_updated").length,
    last_activity: history.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0]?.created_at || panel.updated_at || panel.created_at || null
  };
}

export function subscribeToPanels(callback) {
  return onSnapshot(panelsRef, (snapshot) => {
    callback(snapshot.docs.map(fromDoc).filter((panel) => panel.is_deleted !== true));
  }, (error) => console.error("Firestore panel subscription error:", error));
}

export async function panelRequest(method, url, data) {
  const normalized = String(url || "").replace(/^\/api/, "").replace(/^\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] !== "panels") return null;
  if (method === "GET" && parts.length === 1) return { panels: await listPanels() };
  if (method === "GET" && parts[1] === "network" && parts[2] === "status") {
    const panels = await listPanels();
    return { panels: panels.map((panel) => ({ ...panel, effective_status: panel.effective_status || panel.status || "unknown" })) };
  }
  if (method === "GET" && parts[1] === "routes" && parts[2] === "all") return { routes: await listRoutes() };
  if (method === "POST" && parts.length === 1) return { success: true, panel: await createPanel(data || {}) };
  if (method === "GET" && parts[1] === "history" && parts[2] === "deleted" && parts.length === 3) return { panels: await listPanels({ includeDeleted: true }) };
  if (method === "GET" && parts[1] === "history" && parts[2] === "deleted" && parts[3]) return { panel: await getPanel(parts[3]), success: true };
  if (method === "PUT" && parts[1] === "history" && parts[2] === "deleted" && parts[3] && parts[4] === "restore") return { success: true, panel: await restorePanel(parts[3]), message: "Panel restored successfully." };
  if (method === "DELETE" && parts[1] === "history" && parts[2] === "deleted" && parts[3] && parts[4] === "permanent") return permanentlyDeletePanel(parts[3]);
  if (method === "GET" && parts[1] && parts[2] === "stats") return getPanelStats(parts[1]);
  if (method === "GET" && parts[1]) return { panel: await getPanel(parts[1]) };
  if (method === "PUT" && parts[1] && parts[2] === "status") return { success: true, panel: await updatePanelStatus(parts[1], data?.status, data?.reason) };
  if (method === "PUT" && parts[1]) return { success: true, panel: await updatePanel(parts[1], data || {}) };
  if (method === "DELETE" && parts[1]) return { success: true, panel: await archivePanel(parts[1]) };
  throw new Error(`Unsupported Firebase panel endpoint: ${method} ${url}`);
}
