const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { doc, setDoc, updateDoc, deleteDoc, getDoc } = require("firebase/firestore");

let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("FIRESTORE_EMULATOR_HOST required");
  env = await initializeTestEnvironment({
    projectId: "powerhouse-security-rules-test",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8") }
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db,"powerhouse_users","admin-uid"),{uid:"admin-uid",role:"admin",status:"active"});
    await setDoc(doc(db,"powerhouse_users","staff-uid"),{uid:"staff-uid",role:"electrician",status:"active"});
    await setDoc(doc(db,"powerhouse_users","other-uid"),{uid:"other-uid",role:"electrician",status:"active"});
    await setDoc(doc(db,"powerhouse_users","blocked-admin"),{uid:"blocked-admin",role:"admin",status:"blocked"});
    await setDoc(doc(db,"powerhouse_users","blocked-superadmin"),{uid:"blocked-superadmin",role:"superadmin",status:"inactive"});
    await setDoc(doc(db,"system_counters","task"),{value:5});
    await setDoc(doc(db,"activities","audit-1"),{type:"task_status",task_id:"t1"});
    for (const name of ["entries","engineServiceLogs","wapdaReadings"]) {
      await setDoc(doc(db,name,"record-1"),{value:100,created_by:"staff-uid"});
    }
    await setDoc(doc(db,"tasks","t1"),{assigned_user_ids:["staff-uid"],user_ids:["staff-uid"],user_id:"staff-uid",status:"Pending",assignment_cycle:1,title:"Test task"});
  });
});
after(async()=>{if(env)await env.cleanup()});
const firestore = uid => uid ? env.authenticatedContext(uid,{email:uid==="admin-uid"?"admin@example.com":uid+"@example.com"}).firestore() : env.unauthenticatedContext().firestore();

test("anonymous may read tasks but not modify",async()=>{
  const db=firestore();
  await assertSucceeds(getDoc(doc(db,"tasks","t1")));
  await assertFails(updateDoc(doc(db,"tasks","t1"),{status:"Completed"}));
});
test("assigned staff may update status",async()=>{
  const db=firestore("staff-uid");
  await assertSucceeds(updateDoc(doc(db,"tasks","t1"),{status:"In Progress"}));
});
test("other staff cannot alter assignments or status",async()=>{
  const db=firestore("other-uid");
  await assertFails(updateDoc(doc(db,"tasks","t1"),{status:"Completed"}));
});
test("assigned staff cannot reassign or delete task",async()=>{
  const db=firestore("staff-uid");
  await assertFails(updateDoc(doc(db,"tasks","t1"),{assigned_user_ids:["other-uid"]}));
  await assertFails(deleteDoc(doc(db,"tasks","t1")));
});
test("admin can reassign task",async()=>{
  const db=firestore("admin-uid");
  await assertSucceeds(updateDoc(doc(db,"tasks","t1"),{assigned_user_ids:["other-uid"]}));
});

test("blocked admin cannot modify protected task",async()=>{
  const db=firestore("blocked-admin");
  await assertFails(updateDoc(doc(db,"tasks","t1"),{title:"Unauthorized"}));
});

test("inactive superadmin cannot modify admin-only machine record", async () => {
  const db = firestore("blocked-superadmin");
  await assertFails(setDoc(doc(db, "powerhouse_machines", "machine-1"), { name: "Forbidden machine" }));
});

test("operational records: staff may update but cannot delete; admin can delete",async()=>{
  for (const name of ["entries","engineServiceLogs","wapdaReadings"]) {
    const staff=firestore("staff-uid"),admin=firestore("admin-uid");
    await assertSucceeds(updateDoc(doc(staff,name,"record-1"),{value:150}));
    await assertFails(deleteDoc(doc(staff,name,"record-1")));
    await assertSucceeds(deleteDoc(doc(admin,name,"record-1")));
  }
});

test("staff activity events are append-only, admins can correct",async()=>{
  const staff=firestore("staff-uid"),admin=firestore("admin-uid");
  await assertSucceeds(setDoc(doc(staff,"activities","new-audit"),{type:"task_status",task_id:"t1"}));
  await assertFails(updateDoc(doc(staff,"activities","audit-1"),{type:"tampered"}));
  await assertFails(deleteDoc(doc(staff,"activities","audit-1")));
  await assertSucceeds(updateDoc(doc(admin,"activities","audit-1"),{type:"corrected"}));
});

test("system counters are readable by staff but writable only by admin",async()=>{
  const staff=firestore("staff-uid"),admin=firestore("admin-uid");
  await assertSucceeds(getDoc(doc(staff,"system_counters","task")));
  await assertFails(updateDoc(doc(staff,"system_counters","task"),{value:6}));
  await assertFails(deleteDoc(doc(staff,"system_counters","task")));
  await assertSucceeds(updateDoc(doc(admin,"system_counters","task"),{value:6}));
});

test("staff can mark only own duty status; shift assignment stays admin-only",async()=>{
  const staff=firestore("staff-uid"),other=firestore("other-uid"),admin=firestore("admin-uid");
  const key="staff-uid_2026-10-09";
  const record={user_id:"staff-uid",duty_date:"2026-10-09",record_type:"status",status:"on_duty"};
  await assertSucceeds(setDoc(doc(staff,"duties",key),record));
  await assertFails(updateDoc(doc(other,"duties",key),{status:"off_duty"}));
  await assertFails(setDoc(doc(staff,"duties","other-uid_2026-10-09"),{...record,user_id:"other-uid"}));
  await assertFails(setDoc(doc(staff,"duties","shift-1"),{user_id:"staff-uid",record_type:"shift"}));
  await assertSucceeds(setDoc(doc(admin,"duties","shift-1"),{user_id:"staff-uid",record_type:"shift"}));
  await assertSucceeds(updateDoc(doc(staff,"duties",key),{status:"off_duty"}));
});
