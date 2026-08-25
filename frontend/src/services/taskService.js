import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "../firebase";
import { createNotification, sendPushNotification } from "./notificationService";
import { socket } from "../utils/socket";
import { getUser } from "../utils/auth";

const tasksRef = collection(db, "tasks");
const usersRef = collection(db, "powerhouse_users");
const activitiesRef = collection(db, "activities");
const READ_TTL = 5000;
let taskCache = null, taskCacheAt = 0, taskPromise = null;
let staffCache = null, staffCacheAt = 0, staffPromise = null;

const nowIso = () => new Date().toISOString();
const clean = (value) => {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, clean(v)]));
  return value;
};
const fromDoc = (snap) => ({ id: snap.id, ...(clean(snap.data() || {})) });
export const invalidateTaskCache = () => { taskCache = null; taskCacheAt = 0; };
export const invalidateStaffCache = () => { staffCache = null; staffCacheAt = 0; };

async function listStaff() {
  if (staffCache && Date.now() - staffCacheAt < READ_TTL) return staffCache;
  if (staffPromise) return staffPromise;
  staffPromise = getDocs(usersRef).then(s => s.docs.map(fromDoc).map(u => ({ ...u, id: u.id ?? u.uid, uid: u.uid ?? u.id }))).then(items => { staffCache = items; staffCacheAt = Date.now(); return items; }).finally(() => { staffPromise = null; });
  return staffPromise;
}
const staffMatches = (staff, value) => {
  const wanted = String(value ?? "").trim(); if (!wanted) return false;
  return [staff.id, staff.uid, staff.user_id, staff.firebaseUid, staff.email, staff.numericId].filter(Boolean).some(v => String(v) === wanted);
};
async function resolveStaffList(values = []) {
  const unique = [...new Set((Array.isArray(values) ? values : [values]).map(v => String(v?.id ?? v?.user_id ?? v?.uid ?? v ?? "").trim()).filter(Boolean))];
  const staff = await listStaff();
  return unique.map(v => staff.find(u => staffMatches(u, v))).filter(Boolean);
}
const requestedStaffRefs = (payload = {}) => {
  const raw = payload.assigned_user_ids ?? payload.user_ids ?? payload.assigned_staff_ids ?? payload.user_id ?? payload.assigned_to ?? [];
  return Array.isArray(raw) ? raw : [raw];
};
const normalizeRefs = (payload) => [...new Set(requestedStaffRefs(payload).map(v => String(v?.id ?? v?.user_id ?? v?.uid ?? v ?? "").trim()).filter(Boolean))];
const publicNumber = task => { const n = Number(task?.task_number ?? task?.display_id ?? task?.public_id); return Number.isInteger(n) && n > 0 && n <= 999999 ? n : null; };
const createdTime = task => { const t = new Date(task.created_at || task.createdAt || 0).getTime(); return Number.isFinite(t) ? t : 0; };

async function rawTasks() {
  if (taskCache && Date.now() - taskCacheAt < READ_TTL) return taskCache;
  if (taskPromise) return taskPromise;
  taskPromise = getDocs(tasksRef).then(s => s.docs.map(fromDoc)).then(items => { items.sort((a,b) => createdTime(a)-createdTime(b)); taskCache = items; taskCacheAt = Date.now(); return items; }).finally(() => { taskPromise = null; });
  return taskPromise;
}

async function migrateLegacyTaskNumbers(tasks) {
  const used = new Set(tasks.map(t => publicNumber(t)).filter(Boolean));
  const updates = []; let cursor = 1;
  for (const task of tasks) {
    if (publicNumber(task)) continue;
    while (used.has(cursor)) cursor++;
    updates.push({ task, next: cursor }); used.add(cursor++);
  }
  if (!updates.length) return tasks;
  await Promise.all(updates.map(({task,next}) => updateDoc(doc(db,"tasks",task.id), { task_number:String(next), display_id:String(next), public_id:next, updated_at:nowIso() })));
  const map = new Map(updates.map(x => [x.task.id, x.next]));
  return tasks.map(t => map.has(t.id) ? { ...t, task_number:String(map.get(t.id)), display_id:String(map.get(t.id)), public_id:map.get(t.id) } : t);
}

function taskView(task, staff = []) {
  const staffIds = Array.isArray(task.assigned_staff_ids) ? task.assigned_staff_ids.map(String) : [];
  const userIds = Array.isArray(task.assigned_user_ids) ? task.assigned_user_ids.map(String) : [];
  const storedUsers = Array.isArray(task.assigned_users) ? task.assigned_users : [];
  const matched = staff.filter(u => staffIds.includes(String(u.id)) || userIds.includes(String(u.uid)) || userIds.includes(String(u.id)) || userIds.includes(String(u.numericId)));
  const assignedUsers = storedUsers.length ? storedUsers : matched.map(u => ({ id:u.id, user_id:u.id, uid:u.uid, numericId:u.numericId, name:u.name || u.full_name || u.email || "User", email:u.email || "", role:u.role || "" }));
  const number = publicNumber(task);
  return { ...task, id:number ?? task.id, firestore_id:task.id, task_number:number != null ? String(number) : undefined, display_id:number != null ? String(number) : undefined, public_id:number ?? undefined, assigned_users:assignedUsers, assigned_staff_ids:staffIds, assigned_user_ids:userIds, user_id:userIds[0] || task.user_id || "", staff_name:assignedUsers[0]?.name || task.staff_name || "Unassigned" };
}

export async function listTasks({ migrate = true } = {}) {
  const tasks = await rawTasks();
  const repaired = migrate ? await migrateLegacyTaskNumbers(tasks) : tasks;
  if (repaired !== tasks) { taskCache = repaired; taskCacheAt = Date.now(); }
  const staff = await listStaff();
  return repaired.map(t => taskView(t, staff)).sort((a,b) => (publicNumber(b)||0)-(publicNumber(a)||0));
}

async function findTask(id) {
  const raw = String(id ?? "").trim(); if (!raw) return null;
  let snap = await getDocs(query(tasksRef, where("task_number","==",raw), limit(1))); if (!snap.empty) return snap.docs[0];
  const n = Number(raw);
  if (Number.isInteger(n)) {
    snap = await getDocs(query(tasksRef, where("task_number","==",n), limit(1))); if (!snap.empty) return snap.docs[0];
    snap = await getDocs(query(tasksRef, where("display_id","==",raw), limit(1))); if (!snap.empty) return snap.docs[0];
    snap = await getDocs(query(tasksRef, where("display_id","==",n), limit(1))); if (!snap.empty) return snap.docs[0];
  }
  const direct = await getDoc(doc(db,"tasks",raw)); if (direct.exists()) return direct;
  const tasks = await rawTasks();
  const ordered = [...tasks].sort((a,b) => createdTime(a)-createdTime(b));
  const legacy = ordered[n-1];
  return legacy ? getDoc(doc(db,"tasks",legacy.id)) : null;
}

async function parsePayload(data) {
  if (!(typeof FormData !== "undefined" && data instanceof FormData)) return { ...(data || {}) };
  const result = {};
  for (const [key,value] of data.entries()) {
    if (typeof File !== "undefined" && value instanceof File && value.size > 0) {
      const safe = String(value.name || `file-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g,"_");
      const storagePath = `powerhouse/tasks/${Date.now()}-${safe}`; const storageRef = ref(storage,storagePath);
      await uploadBytes(storageRef,value); const uploaded = { url:await getDownloadURL(storageRef), path:storagePath, name:value.name, type:value.type, size:value.size };
      const k = key.endsWith("[]") ? key.slice(0,-2) : key; result[k] = [...(result[k]||[]),uploaded];
    } else { const k = key.endsWith("[]") ? key.slice(0,-2) : key; result[k] = result[k] === undefined ? value : Array.isArray(result[k]) ? [...result[k],value] : [result[k],value]; }
  }
  for (const key of ["assigned_user_ids","user_ids","assigned_staff_ids","attachments","files","media"]) if (typeof result[key] === "string") { try { result[key] = JSON.parse(result[key]); } catch {} }
  return result;
}
const cycleHistory = (ids,cycle,stamp,previous=[]) => [...(Array.isArray(previous)?previous:[]), ...ids.map(uid => ({ user_id:String(uid), assignment_cycle:cycle, status:"Pending", assigned_at:stamp, accepted_at:null, completed_at:null, rejected_at:null, rejection_reason:"" }))];

async function notifyAssigned(task, users, reassigned=false) {
  const number = publicNumber(task); const title = reassigned ? "Task Reassigned" : "New Task Assigned"; const body = `${title}: Task #${number}`;
  await Promise.allSettled(users.map(async user => {
    const uid = user.uid || user.id;
    const notificationId = await createNotification(uid,{ title, body:`${body} has been assigned to you.`, type:reassigned?"task_reassigned":"task_assigned", route:`/task-view/${number}`, taskId:number, sourceId:task.id });
    await sendPushNotification({ title, body:`${body} has been assigned to you.`, route:`/task-view/${number}`, userIds:[uid], notificationId });
  }));
  try { socket.emit(reassigned?"taskReassigned":"taskAssigned", { taskId:number, task_id:number, userIds:users.map(u=>u.uid||u.id), user_ids:users.map(u=>u.uid||u.id), assignment_cycle:task.assignment_cycle, status:task.status }); } catch {}
}

export async function assignTask(data) {
  const payload = await parsePayload(data); const refs = normalizeRefs(payload); if (!refs.length) throw new Error("Please select at least one staff member.");
  const users = await resolveStaffList(refs); if (users.length !== refs.length) throw new Error("One or more selected staff members could not be resolved from Staff Records.");
  const existing = await listTasks({migrate:true}); const used = new Set(existing.map(publicNumber).filter(Boolean)); let number=1; while(used.has(number)) number++;
  const stamp=nowIso(); const uidList=users.map(u=>String(u.uid||u.id)); const staffIdList=users.map(u=>String(u.id));
  const task={ ...payload, task_number:String(number), display_id:String(number), public_id:number, assigned_user_ids:uidList, user_ids:uidList, assigned_staff_ids:staffIdList, user_id:uidList[0]||"", assigned_users:users.map(u=>({id:u.id,uid:u.uid,numericId:u.numericId,name:u.name||u.email||"User",email:u.email||"",role:u.role||""})), staff_name:users[0]?.name||users[0]?.email||"Unassigned", status:payload.status||"Pending", assignment_cycle:1, assignment_count:1, assignment_history:cycleHistory(uidList,1,stamp), created_at:stamp, updated_at:stamp, createdAt:serverTimestamp() };
  delete task.id; const refDoc=await addDoc(tasksRef,task);
  await addDoc(activitiesRef,{type:"task_created",task_id:refDoc.id,task_number:String(number),public_id:number,status:task.status,assigned_user_ids:uidList,assigned_staff_ids:staffIdList,created_at:serverTimestamp()});
  invalidateTaskCache(); await notifyAssigned({...task,id:refDoc.id},users); return taskView({...task,id:refDoc.id},users);
}

export async function getTask(id) { const target=await findTask(id); if(!target) throw new Error("Task not found."); return taskView(fromDoc(target),[]); }

function currentUserIdentityValues() {
  const values=[]; const u=getUser();
  [u?.id,u?.numericId,u?.uid,u?.firebaseUid,auth.currentUser?.uid].forEach(v => { if(v!==undefined && v!==null && String(v).trim()) values.push(String(v)); });
  return [...new Set(values)];
}
function taskMatchesIdentity(task, identities) {
  const fields=[...(Array.isArray(task.assigned_user_ids)?task.assigned_user_ids:[]),...(Array.isArray(task.user_ids)?task.user_ids:[]),...(Array.isArray(task.assigned_staff_ids)?task.assigned_staff_ids:[]),task.user_id].filter(v=>v!==undefined&&v!==null).map(String);
  return identities.some(id=>fields.includes(id));
}

export async function listMyTasks(userId) {
  const supplied=String(userId??"").trim(); const identities=[...currentUserIdentityValues(), ...(supplied?[supplied]:[])];
  const unique=[...new Set(identities.filter(Boolean))]; const found=new Map();
  for (const id of unique) {
    for (const field of ["assigned_user_ids","user_ids","assigned_staff_ids"]) {
      try { const snap=await getDocs(query(tasksRef,where(field,"array-contains",id))); snap.docs.forEach(d=>found.set(d.id,fromDoc(d))); } catch (error) { if(error?.code!=="permission-denied") console.warn("Task identity query skipped",field,error?.message||error); }
    }
  }
  // Last-resort compatibility: signed-in task reads are allowed by the deployed task rule.
  if (!found.size) {
    try { const all=await rawTasks(); all.filter(t=>taskMatchesIdentity(t,unique)).forEach(t=>found.set(t.id,t)); } catch(error) { if(error?.code!=="permission-denied") console.warn("Task fallback read failed",error?.message||error); }
  }
  return [...found.values()].map(t=>taskView(t,[])).sort((a,b)=>createdTime(b)-createdTime(a));
}
export async function listUserTasks(userId) { return listMyTasks(userId); }

function assignmentUserId(task, explicit) {
  const wanted=String(explicit||"").trim(); const assigned=Array.isArray(task.assigned_user_ids)?task.assigned_user_ids.map(String):[];
  if(wanted && assigned.includes(wanted)) return wanted;
  const identities=currentUserIdentityValues(); return identities.find(id=>assigned.includes(id)) || wanted || assigned[0] || "";
}

export async function updateTask(id,data) {
  const payload=await parsePayload(data); const target=await findTask(id); if(!target) throw new Error("Task not found."); const existing=fromDoc(target);
  const refs=normalizeRefs(payload); const currentIds=Array.isArray(existing.assigned_user_ids)?existing.assigned_user_ids.map(String):[]; const users=refs.length?await resolveStaffList(refs):[];
  if(refs.length&&users.length!==refs.length) throw new Error("One or more selected staff members could not be resolved from Staff Records.");
  const nextIds=refs.length?users.map(u=>String(u.uid||u.id)):currentIds; const changed=refs.length>0&&(nextIds.length!==currentIds.length||nextIds.some(x=>!currentIds.includes(x))); const explicit=[true,"true","1",1,"yes"].includes(payload.reassign_task); const reopen=["completed","rejected"].includes(String(existing.status||"").toLowerCase())&&String(payload.status||"").toLowerCase()==="pending"; const newCycle=changed||explicit||reopen;
  const next={...payload}; ["id","firestore_id","task_number","display_id","public_id","createdAt","reassign_task","assigned_users"].forEach(k=>delete next[k]); const stamp=nowIso();
  if(newCycle){ const cycle=Number(existing.assignment_cycle||1)+1; next.assigned_user_ids=nextIds; next.user_ids=nextIds; next.assigned_staff_ids=users.length?users.map(u=>String(u.id)):(existing.assigned_staff_ids||[]); next.user_id=nextIds[0]||existing.user_id||""; next.assigned_users=users.length?users.map(u=>({id:u.id,uid:u.uid,numericId:u.numericId,name:u.name||u.email||"User",email:u.email||"",role:u.role||""})):(existing.assigned_users||[]); next.staff_name=users[0]?.name||existing.staff_name||"Unassigned"; next.status="Pending"; next.assignment_cycle=cycle; next.assignment_count=cycle; next.assignment_history=cycleHistory(nextIds,cycle,stamp,existing.assignment_history); next.assigned_at=stamp; next.accepted_at=null; next.completed_at=null; next.rejected_at=null; next.rejection_reason=""; }
  next.updated_at=stamp; await updateDoc(target.ref,next); invalidateTaskCache(); const result=await getTask(target.id); if(newCycle&&users.length) await notifyAssigned({...existing,...next,id:target.id},users,true); return result;
}

export async function updateTaskStatus(id,payload={}) {
  const target=await findTask(id); if(!target) throw new Error("Task not found."); const task=fromDoc(target); const status=payload.status||task.status||"Pending"; const userId=assignmentUserId(task,payload.user_id); const cycle=Number(payload.assignment_cycle||task.assignment_cycle||1); const history=Array.isArray(task.assignment_history)?[...task.assignment_history]:[]; const index=history.findIndex(x=>Number(x.assignment_cycle||1)===cycle&&String(x.user_id||"")===String(userId)); const current=index>=0?history[index]:null;
  if(status==="Completed"&&(current?.status==="Completed"||(task.status==="Completed"&&Number(task.assignment_cycle)===cycle))) throw new Error("This assignment cycle is already completed. Wait for a new assignment cycle.");
  const stamp=nowIso(); const event={user_id:userId,assignment_cycle:cycle,status,updated_at:stamp}; if(status==="In Progress") event.accepted_at=current?.accepted_at||stamp; if(status==="Completed") event.completed_at=stamp; if(status==="Rejected"){event.rejected_at=stamp;event.rejection_reason=payload.rejection_reason||"";}
  if(index>=0) history[index]={...history[index],...event}; else history.push({...event,assigned_at:task.assigned_at||task.created_at||stamp});
  await updateDoc(target.ref,{status,assignment_history:history,assignment_cycle:cycle,updated_at:stamp,accepted_at:status==="In Progress"?(current?.accepted_at||stamp):null,completed_at:status==="Completed"?stamp:null,rejected_at:status==="Rejected"?stamp:null,rejection_reason:status==="Rejected"?(payload.rejection_reason||""):""});
  await addDoc(activitiesRef,{type:"task_status",task_id:target.id,task_number:task.task_number||task.display_id||null,status,user_id:userId,assignment_cycle:cycle,created_at:serverTimestamp()}); invalidateTaskCache();
  try{socket.emit("taskUpdate",{taskId:publicNumber(task),task_id:publicNumber(task),status,userId,user_id:userId,assignment_cycle:cycle});}catch{} return getTask(target.id);
}

export async function completeTask(id,data={}) {
  const payload=await parsePayload(data); const task=await getTask(id); const userId=assignmentUserId(task,payload.user_id); const cycle=Number(payload.assignment_cycle||task.assignment_cycle||1); const history=Array.isArray(task.assignment_history)?task.assignment_history:[]; const current=history.find(x=>Number(x.assignment_cycle||1)===cycle&&String(x.user_id||"")===String(userId));
  if(task.status==="Completed"||current?.status==="Completed") throw new Error("This assignment cycle is already completed. Wait for a new assignment cycle."); if(current&&current.status!=="In Progress") throw new Error("Task must be accepted and In Progress before it can be completed.");
  const report={id:`completion-${Date.now()}`,assignment_cycle:cycle,completion_note:payload.completion_note||payload.note||"",submitted_by:{id:userId,name:auth.currentUser?.displayName||"User",email:auth.currentUser?.email||""},submitted_at:nowIso(),media_files:Array.isArray(payload.files)?payload.files:[],voice_notes:Array.isArray(payload.voiceNotes)?payload.voiceNotes:[]};
  const raw=await findTask(id); const existing=fromDoc(raw); const reports=Array.isArray(existing.completion_reports)?[...existing.completion_reports,report]:[report]; await updateTaskStatus(id,{status:"Completed",user_id:userId,assignment_cycle:cycle}); await updateDoc(raw.ref,{completion_reports:reports,latest_completion:report,status:"Completed",updated_at:nowIso()}); invalidateTaskCache(); return getTask(id);
}

export async function deleteTask(id){ const target=await findTask(id); if(!target) throw new Error(`Task not found: ${id}`); const task=fromDoc(target); await deleteDoc(target.ref); invalidateTaskCache(); return {success:true,deleted_id:target.id,task_number:publicNumber(task)}; }
export async function activityStats(){ const [tasks,staff]=await Promise.all([listTasks(),listStaff()]); const counts={Pending:0,"In Progress":0,Completed:0,Rejected:0}; tasks.forEach(t=>{if(counts[t.status]!==undefined)counts[t.status]++;}); return {staffCount:staff.length,taskCount:tasks.length,pendingCount:counts.Pending,inProgressCount:counts["In Progress"],completedCount:counts.Completed,rejectedCount:counts.Rejected,activities:tasks.slice(0,100),serverDate:nowIso()}; }
export const isTaskPath = path => path === "task/assign" || path.startsWith("task/");
