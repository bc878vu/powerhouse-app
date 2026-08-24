const express = require("express");

// Railway has previously served an older task router while assignment still
// worked. Mount compatibility routes before the normal task router so old
// frontend builds and current frontend builds use the same task API.
const originalUse = express.application.use;
let mounted = false;
let compatRouter = null;
let preEditRouter = null;

function getCompatRouter() {
  if (!compatRouter) {
    compatRouter = require("./routes/taskCompat");
  }
  return compatRouter;
}

function getPreEditRouter() {
  if (!preEditRouter) {
    preEditRouter = require("./routes/taskPreCompat");
  }
  return preEditRouter;
}

express.application.use = function patchedUse(...args) {
  const first = args[0];

  if (!mounted && first === "/api/task") {
    mounted = true;

    // Complete/report routes and legacy GET /task/:id compatibility.
    originalUse.call(this, "/api/task", getCompatRouter());

    // Legacy edit-loader route: GET /api/task/:id/pre
    originalUse.call(this, "/api/task", getPreEditRouter());

    console.log(
      "✅ Task compatibility + edit-pre routes mounted before task router"
    );
  }

  return originalUse.apply(this, args);
};
