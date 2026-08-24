const express = require("express");

// Production-safe task API bridge. This is loaded with Node -r before
// server.js, so the compatibility router is guaranteed to be mounted before
// the normal task router even when Railway has an older task route ordering.
const originalUse = express.application.use;
let mounted = false;
let compatRouter = null;

function getCompatRouter() {
  if (!compatRouter) {
    compatRouter = require("./routes/taskCompat");
  }
  return compatRouter;
}

express.application.use = function patchedUse(...args) {
  const first = args[0];

  if (!mounted && first === "/api/task") {
    mounted = true;

    // Must be first under /api/task so these routes win over older handlers.
    originalUse.call(this, "/api/task", getCompatRouter());

    console.log(
      "[TASK-BRIDGE] compatibility routes mounted: GET /:id, GET /:id/pre, GET /single/:id, POST /complete-work/:id"
    );
  }

  return originalUse.apply(this, args);
};
