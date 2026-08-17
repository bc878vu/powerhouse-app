/*
 * One-time migration helper.
 *
 * Required env:
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
 *   MYSQLHOST / MYSQLUSER / MYSQLPASSWORD / MYSQLDATABASE / MYSQLPORT
 *
 * It copies legacy MySQL rows into Firestore and imports existing bcrypt
 * password hashes directly into Firebase Authentication, so users do not
 * need to choose new passwords. Firebase supports BCRYPT user imports.
 */
require("dotenv").config();
const db = require("./config/db");
const admin = require("./firebaseAdmin");

if (!admin.apps.length) throw new Error("Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT.");

const firestore = admin.firestore();
const auth = admin.auth();
const mysql = db.promise();

const COLLECTIONS = {
  users: "powerhouse_users",
  tasks: "tasks",
  activities: "activities",
  duties: "duties",
  categories: "categories",
  tools: "tools"
};

const clean = (value) => {
  if (value === undefined) return null;
  if (value instanceof Date) return admin.firestore.Timestamp.fromDate(value);
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, clean(v)]));
  return value;
};

async function rows(table) {
  try {
    const [result] = await mysql.query(`SELECT * FROM \\`${table}\``);
    return result;
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      console.warn(`⚠️ Skipping missing table: ${table}`);
      return [];
    }
    throw error;
  }
}

async function writeCollection(table, collectionName) {
  const data = await rows(table);
  let batch = firestore.batch(); let count = 0;
  for (const row of data) {
    const id = String(row.id ?? row._id ?? `${table}_${count}`);
    batch.set(firestore.collection(collectionName).doc(id), clean({ ...row, id }), { merge: true });
    count += 1;
    if (count % 450 === 0) { await batch.commit(); batch = firestore.batch(); }
  }
  if (count % 450) await batch.commit();
  console.log(`✅ ${table}: ${count} rows -> ${collectionName}`);
  return data;
}

async function importUsers(userRows) {
  const records = userRows.filter(u => u.email && u.password).map(u => ({
    uid: String(u.id),
    email: String(u.email).toLowerCase(),
    displayName: u.name || undefined,
    disabled: u.status === "inactive",
    passwordHash: Buffer.from(String(u.password), "utf8")
  }));

  for (let i = 0; i < records.length; i += 1000) {
    const chunk = records.slice(i, i + 1000);
    const result = await auth.importUsers(chunk, { hash: { algorithm: "BCRYPT" } });
    if (result.errors.length) {
      result.errors.forEach(({ index, error }) => console.error(`❌ Auth import failed for index ${index}:`, error.message));
    }
    console.log(`✅ Firebase Auth imported ${chunk.length} users`);
  }

  // Roles and the complete legacy profile remain in Firestore.
  const batchSize = 450;
  for (let i = 0; i < userRows.length; i += batchSize) {
    const batch = firestore.batch();
    for (const u of userRows.slice(i, i + batchSize)) {
      const uid = String(u.id);
      batch.set(firestore.collection("powerhouse_users").doc(uid), clean({
        ...u, id: uid, uid, role: u.role || "electrician", status: u.status || "active", migratedAt: admin.firestore.FieldValue.serverTimestamp()
      }), { merge: true });
    }
    await batch.commit();
  }
}

async function main() {
  console.log("🚀 Starting MySQL -> Firebase migration");
  const userRows = await writeCollection("users", COLLECTIONS.users);
  await importUsers(userRows);
  for (const [table, collectionName] of Object.entries(COLLECTIONS)) {
    if (table === "users") continue;
    await writeCollection(table, collectionName);
  }
  console.log("🎉 Migration complete. Verify Firestore counts and Firebase Auth before removing the legacy backend.");
  process.exit(0);
}

main().catch((error) => { console.error("❌ Migration failed:", error); process.exit(1); });
