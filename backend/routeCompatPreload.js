const express = require("express");

// Production-safe task API bridge. This is loaded with Node -r before
// server.js, so compatibility/override routes are mounted before the normal
// task router even when Railway has an older task route ordering.
const originalUse = express.application.use;
let mounted = false;
let crudCompatRouter = null;
let compatRouter = null;
let myTasksOverrideRouter = null;
let legacyAssigneeRepairRouter = null;
let completionReportCompatRouter = null;

function getCrudCompatRouter() {
  if (!crudCompatRouter) crudCompatRouter = require("./routes/taskCrudCompat");
  return crudCompatRouter;
}
function getCompatRouter() {
  if (!compatRouter) compatRouter = require("./routes/taskCompat");
  return compatRouter;
}
function getMyTasksOverrideRouter() {
  if (!myTasksOverrideRouter) myTasksOverrideRouter = require("./routes/taskMyTasksOverride");
  return myTasksOverrideRouter;
}
function getLegacyAssigneeRepairRouter() {
  if (!legacyAssigneeRepairRouter) legacyAssigneeRepairRouter = require("./routes/taskLegacyAssigneeRepair");
  return legacyAssigneeRepairRouter;
}
function getCompletionReportCompatRouter() {
  if (!completionReportCompatRouter) completionReportCompatRouter = require("./routes/taskCompletionReportCompat");
  return completionReportCompatRouter;
}

express.application.use = function patchedUse(...args) {
  const first = args[0];
  if (!mounted && first === "/api/task") {
    mounted = true;
    // Mutations are mounted first: this prevents a stale duplicate router from
    // swallowing PUT/DELETE requests and returning the dashboard's generic
    // "Task delete/update failed" error.
    originalUse.call(this, "/api/task", getCrudCompatRouter());
    originalUse.call(this, "/api/task", getCompletionReportCompatRouter());
    originalUse.call(this, "/api/task", getLegacyAssigneeRepairRouter());
    originalUse.call(this, "/api/task", getMyTasksOverrideRouter());
    originalUse.call(this, "/api/task", getCompatRouter());
    console.log("[TASK-BRIDGE] CRUD + completion report + assignee repair + task compatibility routes mounted");
  }
  return originalUse.apply(this, args);
};
