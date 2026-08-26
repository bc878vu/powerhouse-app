const express = require("express");

// Production-safe task API bridge. This is loaded with Node -r before
// server.js, so compatibility/override routes are mounted before the normal
// task router even when Railway has an older task route ordering.
const originalUse = express.application.use;
let mounted = false;
let compatRouter = null;
let myTasksOverrideRouter = null;

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

express.application.use = function patchedUse(...args) {
  const first = args[0];

  if (!mounted && first === "/api/task") {
    mounted = true;

    // The override router must be first so My Tasks gets deterministic
    // current-user status/order and repeated Accept cannot regress state.
    originalUse.call(this, "/api/task", getMyTasksOverrideRouter());

    // Existing compatibility routes remain intact for all other task APIs.
    originalUse.call(this, "/api/task", getCompatRouter());

    console.log(
      "[TASK-BRIDGE] My Tasks override + compatibility routes mounted"
    );
  }

  return originalUse.apply(this, args);
};
