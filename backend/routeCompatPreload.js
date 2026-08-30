const express = require("express");

// Production-safe task API bridge. This is loaded with Node -r before
// server.js, so compatibility/override routes are mounted before the normal
// task router even when Railway has an older task route ordering.
const originalUse = express.application.use;
let mounted = false;
let compatRouter = null;
let myTasksOverrideRouter = null;
let legacyAssigneeRepairRouter = null;

function getCompatRouter() {
  if (!compatRouter) {
    compatRouter = require("./routes/taskCompat");
  }
  return compatRouter;
}

function getMyTasksOverrideRouter() {
  if (!myTasksOverrideRouter) {
    myTasksOverrideRouter = require("./routes/taskMyTasksOverride");
  }
  return myTasksOverrideRouter;
}

function getLegacyAssigneeRepairRouter() {
  if (!legacyAssigneeRepairRouter) {
    legacyAssigneeRepairRouter = require("./routes/taskLegacyAssigneeRepair");
  }
  return legacyAssigneeRepairRouter;
}

express.application.use = function patchedUse(...args) {
  const first = args[0];

  if (!mounted && first === "/api/task") {
    mounted = true;

    // Repair only legacy external-ID assignments before the canonical reader.
    // All normal task APIs and UI structure remain untouched.
    originalUse.call(this, "/api/task", getLegacyAssigneeRepairRouter());

    // The override router must be first so My Tasks gets deterministic
    // current-user status/order and repeated Accept cannot regress state.
    originalUse.call(this, "/api/task", getMyTasksOverrideRouter());

    // Existing compatibility routes remain intact for all other task APIs.
    originalUse.call(this, "/api/task", getCompatRouter());

    console.log(
      "[TASK-BRIDGE] Legacy assignee repair + My Tasks override + compatibility routes mounted"
    );
  }

  return originalUse.apply(this, args);
};
