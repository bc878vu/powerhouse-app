const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    status: String,
    message: String,

    image: String,
    video: String,
    voice: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Activity", activitySchema);