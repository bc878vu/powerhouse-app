const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("MCP transport requires verified administrator", () => {
  const text = source("routes/mcp.js");
  assert.match(text, /router\.use\("\/mcp", async \(req, res, next\)/);
  assert.match(text, /await verifyFirebaseAdmin\(req\)/);
  assert.match(text, /const active = profile &&/);
});

test("Socket user and admin rooms check verified identity", () => {
  const text = source("server.js");
  assert.match(text, /verifyIdToken\(raw\)/);
  assert.match(text, /if \(identity && String\(userId\) === identity\.uid\)/);
  assert.match(text, /if \(identity\?\.admin\) socket\.join\("admins"\)/);
  assert.doesNotMatch(text, /socket\.on\("taskAssigned"/);
  assert.doesNotMatch(text, /socket\.on\("taskUpdate"/);
});

test("Uploads filter extensions as well as MIME", () => {
  const text = source("middleware/upload.js");
  assert.match(text, /allowedExtensions\.get\(ext\)\?\.includes\(file\.mimetype\)/);
  assert.match(text, /fileSize: 100 \* 1024 \* 1024/);
});

test("Private downloads default to opt-in and check Firebase identity", () => {
  const text = source("server.js");
  assert.match(text, /PRIVATE_UPLOADS_ENABLED === "true"/);
  assert.match(text, /admin\.auth\(\)\.verifyIdToken\(token\)/);
});

test("Firestore task changes require admin or existing assignee and restrict staff fields", () => {
  const rules = fs.readFileSync(path.join(root, "..", "firestore.rules"), "utf8");
  assert.match(rules, /function isAssignedTask\(task\)/);
  assert.match(rules, /function isStaffTaskUpdate\(\)/);
  assert.match(rules, /allow update: if isAdmin\(\) \|\| isStaffTaskUpdate\(\);/);
  assert.match(rules, /allow delete: if isAdmin\(\);/);
});

test("Storage rules restrict writes to known paths and protect machines", () => {
  const rules = fs.readFileSync(path.join(root, "..", "storage.rules"), "utf8");
  assert.match(rules, /match \/powerhouse\/tasks\/\{filePath=\*\*\}/);
  assert.match(rules, /match \/powerhouse\/machines\/\{filePath=\*\*\}/);
  assert.match(rules, /allow create: if isAdmin\(\) && validSize/);
  assert.match(rules, /allow write: if false;/);
});
