const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { test, before, after } = require("node:test");
const { ref, uploadBytes, getBytes } = require("firebase/storage");
const { doc, setDoc } = require("firebase/firestore");
const fs = require("node:fs");
const path = require("node:path");

let env;
before(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw Error("Both Storage and Firestore emulators are required");
  }
  env = await initializeTestEnvironment({
    projectId: "powerhouse-storage-rules-test",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8") },
    storage: { rules: fs.readFileSync(path.join(__dirname, "../storage.rules"), "utf8") }
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "powerhouse_users", "admin-uid"), {role:"admin",status:"active"});
    await setDoc(doc(db, "powerhouse_users", "staff-uid"), {role:"electrician",status:"active"});
    await setDoc(doc(db, "powerhouse_users", "blocked-admin"), {role:"admin",status:"blocked"});
  });
});
after(async () => { if (env) await env.cleanup(); });
const storage = uid => uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage();
const image = Uint8Array.from([137,80,78,71,13,10,26,10]);
test("anonymous cannot upload task attachments", async () => {
  await assertFails(uploadBytes(ref(storage(), "powerhouse/tasks/test.png"), image, {contentType:"image/png"}));
});
test("authenticated staff can upload new task attachment", async () => {
  await assertSucceeds(uploadBytes(ref(storage("staff-uid"), "powerhouse/tasks/task-a.png"), image, {contentType:"image/png"}));
});
test("normal staff cannot upload machine images", async () => {
  await assertFails(uploadBytes(ref(storage("staff-uid"), "powerhouse/machines/machine-a/img.png"), image, {contentType:"image/png"}));
});
test("administrator can upload machine images", async () => {
  await assertSucceeds(uploadBytes(ref(storage("admin-uid"), "powerhouse/machines/machine-a/img.png"), image, {contentType:"image/png"}));
});
test("staff cannot write unknown storage folder", async () => {
  await assertFails(uploadBytes(ref(storage("staff-uid"), "unknown/f.txt"), Uint8Array.from([65]), {contentType:"text/plain"}));
});
test("staff cannot upload another user's profile picture", async () => {
  await assertFails(uploadBytes(ref(storage("staff-uid"), "profilePictures/admin-uid/img.png"), image, {contentType:"image/png"}));
});

test("blocked admin cannot upload machine images", async () => {
  await assertFails(uploadBytes(ref(storage("blocked-admin"), "powerhouse/machines/machine-b/blocked.png"), image, {contentType:"image/png"}));
});
