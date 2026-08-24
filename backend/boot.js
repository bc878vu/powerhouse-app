// Deterministic backend bootstrap.
// This guarantees the task compatibility router is mounted before
// backend/routes/task.js regardless of how the process is launched.
const express = require("express");

const originalUse = express.application.use;
let taskCompatMounted = false;
let taskCompatRouter = null;

function getTaskCompatRouter() {
  if (!taskCompatRouter) {
    taskCompatRouter = require("./routes/taskCompat");
  }
  return taskCompatRouter;
}

express.application.use = function patchedUse(...args) {
  const mountPath = args[0];

  if (
    !taskCompatMounted &&
    typeof mountPath === "string" &&
    mountPath.replace(/\/+$/, "") === "/api/task"
  ) {
    taskCompatMounted = true;

    originalUse.call(
      this,
      "/api/task",
      getTaskCompatRouter()
    );

    console.log(
      "✅ Deterministic task compatibility routes mounted before task router"
    );
  }

  return originalUse.apply(this, args);
};

require("./server.js");
