const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ASSIGN TOOL
router.post('/assign', (req, res) => {
  const { userId, userName, toolName, category, quantity, date } = req.body;

  const sql = `
    INSERT INTO tools 
    (user_id, user_name, tool_name, category, quantity, assigned_date) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [userId, userName, toolName, category, quantity, date], (err) => {
    if (err) return res.status(500).json(err);

    const io = req.app.get("io");
    io.emit("updateData");

    res.json({ msg: "Tool Assigned ✅" });
  });
}); // ✅ IMPORTANT CLOSE

// GET ALL
router.get('/all', (req, res) => {
  db.query("SELECT * FROM tools ORDER BY id DESC", (err, data) => {
    if (err) return res.status(500).json(err);
    res.json(data);
  });
});

// RETURN
router.put('/return/:id', (req, res) => {
  db.query(
    "UPDATE tools SET returned = 1 WHERE id=?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);

      const io = req.app.get("io");
      io.emit("updateData");

      res.json({ msg: "Returned ✅" });
    }
  );
});

// DELETE
router.delete('/:id', (req, res) => {
  db.query("DELETE FROM tools WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json(err);

    const io = req.app.get("io");
    io.emit("updateData");

    res.json({ msg: "Deleted ✅" });
  });
});

// GET BY USER
router.get('/user/:id', (req, res) => {
  const userId = req.params.id;

  const sql = `
    SELECT 
      tool_name AS toolName,
      category,
      quantity,
      assigned_date AS date
    FROM tools
    WHERE user_id = ?
    ORDER BY id DESC
  `;

  db.query(sql, [userId], (err, data) => {
    if (err) return res.status(500).json(err);
    res.json(data);
  });
});

module.exports = router;