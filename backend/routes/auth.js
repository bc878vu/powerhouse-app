const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');

router.post('/login', (req, res) => {
  const email = req.body.email?.toLowerCase();
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ msg: "Email aur password required hain" });
  }

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.log("❌ DB ERROR:", err);
      return res.status(500).json({ msg: "Database Error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ msg: "Email nahi mila!" });
    }

    const user = results[0];

    if (user.status === "inactive") {
      return res.status(403).json({
        msg: "Your account is inactive. Contact admin."
      });
    }

    try {
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({ msg: "Ghalat Password!" });
      }

      // ✅ SAFE RESPONSE (no password)
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });

    } catch (e) {
      console.log("❌ BCRYPT ERROR:", e);
      res.status(500).json({ msg: "Hashing error" });
    }
  });
});

module.exports = router;