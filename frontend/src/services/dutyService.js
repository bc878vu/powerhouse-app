import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebase";

const dutiesRef = collection(db, "duties");
const text = (v) => String(v ?? "").trim();
const normalizeId = (v) => text(v);
const dateOnly = (v) => {
  const s = text(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const todayString = () => dateOnly(new Date());
const dayDiff = (from, to) => {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
};

async function queryUserDuties(userId) {
  const id = normalizeId(userId);
  if (!id) return [];
  const values = [...new Set([id, /^\d+$/.test(id) ? Number(id) : null].filter((v) => v !== null))];
  const snapshots = await Promise.all(values.map((value) => getDocs(query(dutiesRef, where("user_id", "==", value), limit(500)))));
  const map = new Map();
  snapshots.flatMap((snap) => snap.docs).forEach((doc) => map.set(doc.id, { id: doc.id, ...doc.data() }));
  return [...map.values()];
}

function getShifts(records) {
  return records.filter((r) => r.record_type === "shift").sort((a, b) => dateOnly(b.effective_from || b.created_at).localeCompare(dateOnly(a.effective_from || a.created_at)));
}

function getActiveShift(records, today = todayString()) {
  const shifts = getShifts(records);
  return shifts.find((shift) => {
    const from = dateOnly(shift.effective_from) || today;
    const to = dateOnly(shift.effective_to);
    return from <= today && (!to || to >= today);
  }) || shifts[0] || null;
}

function getTodayDuty(records, today = todayString()) {
  return records.filter((r) => r.record_type === "status" && dateOnly(r.duty_date) === today)
    .sort((a, b) => text(b.updated_at || b.created_at).localeCompare(text(a.updated_at || a.created_at)))[0] || null;
}

export async function getUserDuty(userId, year = new Date().getFullYear(), month = new Date().getMonth() + 1) {
  const records = await queryUserDuties(userId);
  const today = todayString();
  const statuses = records.filter((r) => r.record_type === "status");
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthly = statuses.filter((r) => dateOnly(r.duty_date).startsWith(prefix));
  const currentShift = getActiveShift(records, today);
  const todayDuty = getTodayDuty(records, today);
  const summary = {
    recordedDays: monthly.length,
    dutyDays: monthly.filter((r) => r.status === "on_duty").length,
    leaveDays: monthly.filter((r) => r.status === "leave").length,
    offDays: monthly.filter((r) => r.status === "off_duty").length,
  };
  const effectiveTo = dateOnly(currentShift?.effective_to);
  return {
    currentShift,
    todayDuty,
    summary,
    records: monthly.sort((a, b) => dateOnly(b.duty_date).localeCompare(dateOnly(a.duty_date))),
    allRecords: records,
    shifts: getShifts(records),
    dutyDaysRemaining: effectiveTo ? dayDiff(today, effectiveTo) : null,
    shiftStart: dateOnly(currentShift?.effective_from),
    shiftEnd: effectiveTo,
  };
}

export async function getDutyStaff(userIds = []) {
  return Promise.all(userIds.map((id) => getUserDuty(id)));
}
