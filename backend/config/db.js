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

  // Railway can expose MYSQLDATABASE or MYSQL_DATABASE depending on setup.
  // Accept both names so an existing Railway MySQL connection is never broken.
  const mysqlHost = process.env.MYSQLHOST || process.env.MYSQL_HOST;
  const mysqlUser = process.env.MYSQLUSER || process.env.MYSQL_USER;
  const mysqlPassword = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || "";
  const mysqlDatabase = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE;
  const mysqlPort = Number(process.env.MYSQLPORT || process.env.MYSQL_PORT) || 3306;

  if (mysqlHost && mysqlUser && mysqlDatabase) {
    db = mysql.createPool({
      host: mysqlHost,
      user: mysqlUser,
      password: mysqlPassword,
      database: mysqlDatabase,
      port: mysqlPort,
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
      "❌ Railway MySQL environment variables not found. Expected MYSQLHOST/MYSQLDATABASE or MYSQL_HOST/MYSQL_DATABASE."
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

  conn.query(
    "SELECT DATABASE() AS database_name",
    (queryErr, rows) => {
      if (queryErr) {
        console.error("⚠️ Could not detect database:", queryErr.message);
      } else {
        console.log("📦 ACTIVE DATABASE:", rows[0]?.database_name);
      }
      conn.release();
    }
  );
});

module.exports = db;
