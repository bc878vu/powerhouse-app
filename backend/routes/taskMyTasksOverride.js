const express = require("express");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

function cleanId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function latestForUser(history, userId) { return (history || []).filter((row) => Number(row.user_id) === Number(userId)).sort((a,b)=>Number(b.assignment_cycle||0)-Number(a.assignment_cycle||0)||new Date(b.assigned_at||0)-new Date(a.assigned_at||0)||Number(b.id||0)-Number(a.id||0))[0] || null; }
function statusRank(status) { const s=String(status||"Pending").trim().toLowerCase().replace(/_/g," "); if(["pending","new","assigned"].includes(s))return 0;if(["in progress","running"].includes(s))return 1;if(s==="rejected")return 2;if(s==="completed")return 3;return 2; }
function priorityRank(priority) { const p=String(priority||"Medium").trim().toLowerCase();if(["critical","urgent"].includes(p))return 0;if(p==="high")return 1;if(["medium","normal"].includes(p))return 2;if(p==="low")return 3;return 2; }
function byTaskId(rows) { return (rows||[]).reduce((map,row)=>{const key=Number(row.task_id);if(!map.has(key))map.set(key,[]);map.get(key).push(row);return map;},new Map()); }

// Canonical task-detail read. Admin report and user screens can no longer get a
// different/stale assignment view for the same SQL task ID.
router.get("/:id", async (req,res,next)=>{
  const taskId=cleanId(req.params.id); if(!taskId) return next();
  try {
    const [[taskRows],[assignmentRows],[historyRows],[completionRows]] = await Promise.all([
      promiseDb.query("SELECT * FROM tasks WHERE id = ? LIMIT 1",[taskId]),
      promiseDb.query(`SELECT ta.*, u.name AS user_name, u.email AS user_email, u.role AS user_role, u.profile_pic AS user_profile_pic FROM task_assignments ta LEFT JOIN users u ON u.id=ta.user_id WHERE ta.task_id=? ORDER BY ta.id DESC`,[taskId]),
      promiseDb.query(`SELECT h.*, u.name AS user_name, u.email AS user_email, u.role AS user_role, u.profile_pic AS user_profile_pic FROM task_assignment_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.task_id=? ORDER BY h.assignment_cycle DESC,h.assigned_at DESC,h.id DESC`,[taskId]),
      promiseDb.query(`SELECT tc.*, u.name AS completion_user_name, u.email AS completion_user_email, u.role AS completion_user_role, u.profile_pic AS completion_user_profile_pic FROM task_completions tc LEFT JOIN users u ON u.id=tc.user_id WHERE tc.task_id=? ORDER BY tc.submitted_at DESC,tc.updated_at DESC,tc.id DESC`,[taskId])
    ]);
    const task=taskRows?.[0]; if(!task) return next();
    const assignments=assignmentRows||[], history=historyRows||[], completions=completionRows||[];
    const activeAssignments=assignments.map(a=>({ ...a, user_id:Number(a.user_id), assignment_cycle:Number(a.assignment_cycle||1), status:a.status||"Pending", user:a.user_id?{id:Number(a.user_id),name:a.user_name||null,email:a.user_email||null,role:a.user_role||null,profile_pic:a.user_profile_pic||null}:null }));
    const currentAssignment=history[0]||activeAssignments[0]||null;
    const completed=completions.length>0 || String(currentAssignment?.status||task.status||"").toLowerCase()==="completed";
    return res.json({ success:true, task:{ ...task, id:Number(task.id), task_id:Number(task.id), display_task_id:`#${Number(task.id)}`, assignments:activeAssignments, assigned_users:activeAssignments, assignment_history:history, current_assignment:currentAssignment, assigned_to:currentAssignment?.user_name||activeAssignments[0]?.user_name||task.assigned_to||null, assigned_user_id:Number(currentAssignment?.user_id||activeAssignments[0]?.user_id||task.assigned_user_id||0)||null, completion_reports:completions, latest_completion:completions[0]||null, has_completion_report:completions.length>0, complete_work_status:completed?"SUBMITTED":"NOT SUBMITTED", completion_status:completed?"COMPLETED":task.completion_status||task.status||"Pending", status:completed?"Completed":task.status } });
  } catch(error){ console.error("CANONICAL TASK DETAIL ERROR:",error); return next(error); }
});

router.get("/my-tasks/:userId", async (req, res, next) => {
  const userId = cleanId(req.params.userId); if (!userId) return res.status(400).json({ success:false,msg:"Invalid user ID" });
  try {
    const [rows]=await promiseDb.query(`SELECT t.*,p.id AS panel_join_id,p.panel_code,p.panel_name,p.panel_type,p.area AS panel_area,p.location AS panel_location FROM tasks t INNER JOIN task_assignments ta ON ta.task_id=t.id AND ta.user_id=? LEFT JOIN panels p ON t.panel_id=p.id AND p.is_deleted=0 ORDER BY t.id DESC`,[userId]);
    if(!rows?.length)return res.json([]); const ids=rows.map(r=>Number(r.id)).filter(Number.isInteger), ph=ids.map(()=>"?").join(",");
    const [[historyRows],[completionRows]]=await Promise.all([promiseDb.query(`SELECT h.*,u.name AS user_name,u.email AS user_email,u.role AS user_role,u.profile_pic AS user_profile_pic FROM task_assignment_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.task_id IN (${ph}) ORDER BY h.task_id,h.assignment_cycle DESC,h.assigned_at DESC,h.id DESC`,ids),promiseDb.query(`SELECT tc.id,tc.task_id,tc.user_id,tc.assignment_cycle,tc.completion_note,tc.submitted_at,tc.updated_at FROM task_completions tc WHERE tc.task_id IN (${ph}) ORDER BY tc.task_id,tc.submitted_at DESC,tc.id DESC`,ids)]);
    const hb=byTaskId(historyRows),cb=byTaskId(completionRows); const tasks=rows.map(row=>{const history=hb.get(Number(row.id))||[],completions=cb.get(Number(row.id))||[],current=latestForUser(history,userId),status=current?.status||row.status||"Pending",assignedAt=current?.assigned_at||row.created_at||null,userCycles=new Set(history.filter(h=>Number(h.user_id)===userId).map(h=>Number(h.assignment_cycle||1))),title=row.title||row.task_title||row.name||"Untitled Task",label=`#${Number(row.id)}`;return {...row,id:Number(row.id),title:String(title).startsWith(label)?title:`${label} · ${title}`,task_id:Number(row.id),display_task_id:label,status,assigned_at:assignedAt,accepted_at:current?.accepted_at||null,completed_at:current?.completed_at||row.completed_at||null,rejected_at:current?.rejected_at||row.rejected_at||null,rejection_reason:current?.rejection_reason||null,due_at:current?.due_at||row.due_at||null,assignment_cycle:Number(current?.assignment_cycle||1),assignment_count:userCycles.size||1,repeat_count:Math.max(userCycles.size-1,0),assignment_history:history,current_assignment:current,completion_reports:completions,latest_completion:completions[0]||null,has_completion_report:completions.length>0,_sortStatusRank:statusRank(status),_sortPriorityRank:priorityRank(row.priority||current?.priority),_sortDate:new Date(assignedAt||row.updated_at||row.created_at||0).getTime()};});
    tasks.sort((a,b)=>a._sortStatusRank-b._sortStatusRank||a._sortPriorityRank-b._sortPriorityRank||b._sortDate-a._sortDate||Number(b.id)-Number(a.id));tasks.forEach(t=>{delete t._sortStatusRank;delete t._sortPriorityRank;delete t._sortDate;});return res.json(tasks);
  }catch(error){console.error("TASK MY-TASKS OVERRIDE ERROR:",error);return next(error);}
});

router.put("/update-status/:id", async(req,res,next)=>{if(String(req.body?.status||"").trim().toLowerCase()!=="in progress")return next();const taskId=cleanId(req.params.id),userId=cleanId(req.body?.user_id);if(!taskId||!userId)return next();try{const[rows]=await promiseDb.query(`SELECT status,assignment_cycle,accepted_at,completed_at,rejected_at FROM task_assignment_history WHERE task_id=? AND user_id=? ORDER BY assignment_cycle DESC,assigned_at DESC,id DESC LIMIT 1`,[taskId,userId]);const current=rows?.[0];if(!current||current.status==="Pending")return next();if(["In Progress","Completed"].includes(current.status))return res.json({success:true,msg:current.status==="Completed"?"Task is already completed":"Task is already accepted",status:current.status,overall_status:current.status,task:{id:taskId,task_id:taskId,display_task_id:`#${taskId}`,status:current.status,assignment_cycle:Number(current.assignment_cycle||1),accepted_at:current.accepted_at||null,completed_at:current.completed_at||null,rejected_at:current.rejected_at||null}});return next();}catch(error){return next(error);}});
module.exports=router;
