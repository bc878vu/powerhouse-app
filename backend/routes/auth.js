const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) return res.status(400).json({ msg: 'Email aur password required hain' });

  db.query(
    'SELECT * FROM users WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1',
    [email],
    async (err, results) => {
      if (err) {
        console.error('DB LOGIN ERROR:', err);
        return res.status(500).json({ msg: 'Database Error' });
      }
      if (!results.length) return res.status(401).json({ msg: 'Email nahi mila!' });

      const user = results[0];
      const status = String(user.status || 'active').toLowerCase();

      if (status === 'inactive') return res.status(403).json({ msg: 'Your account is disabled. Contact admin.' });
      if (status === 'blocked') return res.status(403).json({ msg: 'Your account is blocked. Contact admin.' });

      try {
        const match = await bcrypt.compare(password, String(user.password || ''));
        if (!match) return res.status(401).json({ msg: 'Ghalat Password!' });

        return res.json({
          user: {
            id: Number(user.id),
            name: user.name,
            email: String(user.email || '').trim().toLowerCase(),
            role: user.role,
            status,
            employeeID: user.employeeID || ''
          }
        });
      } catch (error) {
        console.error('BCRYPT LOGIN ERROR:', error);
        return res.status(500).json({ msg: 'Hashing error' });
      }
    }
  );
});

module.exports = router;
