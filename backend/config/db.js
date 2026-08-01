const mysql = require("mysql2");

let db;

// ==========================================
// DATABASE CONNECTION MODE
// ==========================================
// Local machine par XAMPP use hoga.
// Railway deployment par Railway MySQL use hoga.

const isRailwayProduction =
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.NODE_ENV === "production";

if (isRailwayProduction) {
  console.log("🚂 DATABASE MODE: RAILWAY MYSQL");

  // Railway server par pehle internal variables use karo
  if (
    process.env.MYSQLHOST &&
    process.env.MYSQLUSER &&
    process.env.MYSQLDATABASE
  ) {
    db = mysql.createPool({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: Number(process.env.MYSQLPORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  // Fallback: Railway Public URL
  else if (process.env.MYSQL_PUBLIC_URL) {
    db = mysql.createPool({
      uri: process.env.MYSQL_PUBLIC_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  else {
    throw new Error(
      "❌ Railway MySQL environment variables not found."
    );
  }

} else {
  console.log("💻 DATABASE MODE: LOCAL XAMPP MYSQL");

  db = mysql.createPool({
    host: "127.0.0.1",
    user: "root",
    password: "",
    database: "railway",
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

// ==========================================
// TEST DATABASE CONNECTION
// ==========================================
db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ DB CONNECTION FAILED:");
    console.error("Message:", err.message);
    console.error("Code:", err.code);
    return;
  }

  console.log("✅ DB CONNECTED SUCCESSFULLY");

  // Show exact database being used
  conn.query(
    "SELECT DATABASE() AS database_name",
    (queryErr, rows) => {
      if (queryErr) {
        console.error(
          "⚠️ Could not detect database:",
          queryErr.message
        );
      } else {
        console.log(
          "📦 ACTIVE DATABASE:",
          rows[0]?.database_name
        );
      }

      conn.release();
    }
  );
});

module.exports = db;