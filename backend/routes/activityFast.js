// Compatibility wrapper for the dashboard fast route.
// Keep a single canonical stats implementation so the production dashboard
// cannot drift between two independently-maintained /stats handlers.
const express = require("express");
const router = express.Router();
const canonicalActivityRouter = require("./activity");

// Preserve all existing activity endpoints, including /stats, from the
// canonical router. This prevents stale/duplicate count logic from returning
// zeroed statistics when one parallel query fails.
router.use("/", canonicalActivityRouter);

// Existing callers use this endpoint after task/status mutations. The
// canonical stats route is live-query based, so invalidation is intentionally
// retained as a successful no-op for backward compatibility.
router.post("/invalidate", (req, res) => {
  return res.status(200).json({ success: true, invalidated: true });
});

module.exports = router;
