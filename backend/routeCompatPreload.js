const express = require("express");

// The production Railway service has previously served an older task router
// even while task assignment was available. Mount a small compatibility router
// immediately before the normal task router so the report/completion endpoints
// are guaranteed to exist in the running process.
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
    originalUse.call(this, "/api/task", getCompatRouter());
    console.log("✅ Task compatibility routes mounted before task router");
  }

  return originalUse.apply(this, args);
};
