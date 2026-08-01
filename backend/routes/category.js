const express = require("express");
const router = express.Router();
const db = require("../config/db");

// CREATE
router.post("/", (req, res) => {
  db.query(
    "INSERT INTO categories (name) VALUES (?)",
    [req.body.name],
    (err, result) => {
      if (err) return res.json(err);
      res.json(result);
    }
  );
});

// GET
router.get("/", (req, res) => {
  db.query("SELECT * FROM categories", (err, result) => {
    if (err) return res.json(err);
    res.json(result);
  });
});

module.exports = router;