require('dotenv').config();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

// DB connection (same as your config)
const db = mysql.createConnection({
  host: "junction.proxy.rlwy.net",
  user: "root",
  password: "XPVBdlqDjGIveguxslaYJaJXBKJhbqHq",
  database: "railway",
  port: 32944
});

// ADMIN DATA
const adminUser = {
  name: "Admin",
  email: "admin@powerhouse.com",
  password: "admin123",
  role: "admin"
};

async function createAdmin() {
  try {
    const hashedPassword = await bcrypt.hash(adminUser.password, 10);

    const sql = `
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE password = VALUES(password)
    `;

    db.query(
      sql,
      [adminUser.name, adminUser.email, hashedPassword, adminUser.role],
      (err, result) => {
        if (err) {
          console.error("❌ Error:", err);
        } else {
          console.log("✅ Admin user created/updated successfully!");
          console.log("👉 Email: admin@powerhouse.com");
          console.log("👉 Password: admin123");
        }
        process.exit();
      }
    );
  } catch (err) {
    console.error("❌ Hash Error:", err);
  }
}

createAdmin();