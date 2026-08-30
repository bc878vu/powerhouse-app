import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

const clean = (value) => {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
};

const fromDoc = (snap) => ({ id: snap.id, ...(clean(snap.data() || {})) });

export function subscribeTaskRealtime(taskId, onTask, onCompletions = () => {}) {
  const key = String(taskId ?? "").trim();
  if (!key) return () => {};

  const taskRef = doc(db, "tasks", key);
  const unsubTask = onSnapshot(taskRef, (snap) => {
    if (snap.exists()) onTask(fromDoc(snap));
  }, (error) => console.warn("Task realtime listener failed:", error?.message || error));

  const completionRef = collection(db, "task_completion_reports");
  const fieldCandidates = [
    query(completionRef, where("task_id", "==", key)),
    query(completionRef, where("taskId", "==", key)),
    query(completionRef, where("task_number", "==", key)),
  ];

  const unsubs = fieldCandidates.map((q, index) => onSnapshot(q, (snap) => {
    const reports = snap.docs.map(fromDoc);
    if (reports.length) onCompletions(reports, index);
  }, () => {}));

  return () => {
    unsubTask();
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
