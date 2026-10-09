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
