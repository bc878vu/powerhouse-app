const express = require("express");

const originalUse = express.application.use;
let taskMounted = false;
let activityMounted = false;
let crudCompatRouter;
let compatRouter;
let myTasksOverrideRouter;
let legacyAssigneeRepairRouter;
let completionReportCompatRouter;
let activityAssigneeCompatRouter;

const lazy = (name, file) => {
  if (name === "crud") return crudCompatRouter || (crudCompatRouter = require(file));
  if (name === "compat") return compatRouter || (compatRouter = require(file));
  if (name === "my") return myTasksOverrideRouter || (myTasksOverrideRouter = require(file));
  if (name === "legacy") return legacyAssigneeRepairRouter || (legacyAssigneeRepairRouter = require(file));
  if (name === "report") return completionReportCompatRouter || (completionReportCompatRouter = require(file));
  return activityAssigneeCompatRouter || (activityAssigneeCompatRouter = require(file));
};

express.application.use = function patchedUse(...args) {
  const first = args[0];
  if (!taskMounted && first === "/api/task") {
    taskMounted = true;
    originalUse.call(this, "/api/task", lazy("crud", "./routes/taskCrudCompat"));
    originalUse.call(this, "/api/task", lazy("report", "./routes/taskCompletionReportCompat"));
    originalUse.call(this, "/api/task", lazy("legacy", "./routes/taskLegacyAssigneeRepair"));
    originalUse.call(this, "/api/task", lazy("my", "./routes/taskMyTasksOverride"));
    originalUse.call(this, "/api/task", lazy("compat", "./routes/taskCompat"));
  }
  if (!activityMounted && first === "/api/activity") {
    activityMounted = true;
    originalUse.call(this, "/api/activity", lazy("activity", "./routes/activityAssigneeCompat"));
  }
  return originalUse.apply(this, args);
};
