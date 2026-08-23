const express = require("express");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

function isAllowedGooglePhoto(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "googleusercontent.com" || host.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

router.post("/google-photo", async (req, res) => {
  try {
    const userId = Number(req.body?.user_id);
    const photoURL = String(req.body?.photoURL || req.body?.profile_pic || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Valid numeric user ID is required." });
    }

    if (!isAllowedGooglePhoto(photoURL)) {
      return res.status(400).json({ success: false, message: "Only a valid Google-hosted profile photo is allowed." });
    }

    const [result] = await promiseDb.query(
      `UPDATE users SET profile_pic = ? WHERE id = ?`,
      [photoURL, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const [rows] = await promiseDb.query(
      `SELECT id, name, email, role, phone, employeeID, maritalStatus, address, backgroundInfo, profile_pic, COALESCE(status, 'active') AS status FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    return res.json({ success: true, message: "Google profile photo synced.", user: rows[0] || null });
  } catch (error) {
    console.error("GOOGLE PROFILE PHOTO SYNC ERROR:", error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Profile photo sync failed." });
  }
});

module.exports = router;
