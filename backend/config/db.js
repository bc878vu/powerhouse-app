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

  // IMPORTANT:
  // On Railway Free plan, the MySQL service can sleep. The private hostname
  // may then return ECONNREFUSED while the database is waking up. Prefer the
  // Railway public TCP URL when it is available so the connection can wake
  // the MySQL service through Railway's proxy. Fall back to private variables
  // for environments where a public URL is not configured.
  const mysqlPublicUrl = process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

  if (mysqlPublicUrl) {
    console.log("🌐 DATABASE CONNECTION: RAILWAY PUBLIC MYSQL URL");
    db = mysql.createPool(mysqlPublicUrl);
  } else {
    // Railway can expose MYSQLDATABASE or MYSQL_DATABASE depending on setup.
    const mysqlHost = process.env.MYSQLHOST || process.env.MYSQL_HOST;
    const mysqlUser = process.env.MYSQLUSER || process.env.MYSQL_USER;
    const mysqlPassword = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || "";
    const mysqlDatabase = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE;
    const mysqlPort = Number(process.env.MYSQLPORT || process.env.MYSQL_PORT) || 3306;

    if (!mysqlHost || !mysqlUser || !mysqlDatabase) {
      throw new Error(
        "❌ Railway MySQL environment variables not found. Expected MYSQL_PUBLIC_URL/MYSQL_URL or MYSQLHOST/MYSQLDATABASE."
      );
    }

    console.log("🔒 DATABASE CONNECTION: RAILWAY PRIVATE MYSQL");
    db = mysql.createPool({
      host: mysqlHost,
      user: mysqlUser,
      password: mysqlPassword,
      database: mysqlDatabase,
      port: mysqlPort,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
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
// TEST DATABASE CONNECTION WITH RETRY
// ==========================================
const testDatabaseConnection = (attempt = 1) => {
  db.getConnection((err, conn) => {
    if (err) {
      console.error(`❌ DB CONNECTION FAILED (attempt ${attempt}):`);
      console.error("Message:", err.message);
      console.error("Code:", err.code);

      // Railway MySQL can take a few seconds to wake after sleeping.
      // Retry without crashing the backend so the API/socket server remains
      // available while the database comes online.
      if (attempt < 8) {
        const delay = Math.min(3000 * attempt, 15000);
        console.log(`⏳ Retrying MySQL connection in ${delay}ms...`);
        setTimeout(() => testDatabaseConnection(attempt + 1), delay);
      }
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
};

testDatabaseConnection();

module.exports = db;
