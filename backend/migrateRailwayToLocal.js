require("dotenv").config();
const mysql = require("mysql2/promise");

// ==========================================
// RAILWAY DATABASE
// Uses MYSQL_PUBLIC_URL from backend/.env
// ==========================================
const railwayDb = mysql.createPool({
  uri: process.env.MYSQL_PUBLIC_URL,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

// ==========================================
// LOCAL XAMPP DATABASE
// ==========================================
const localDb = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "railway",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

// ==========================================
// CONVERT RAILWAY MYSQL 8 SQL
// TO XAMPP / MARIADB COMPATIBLE SQL
// ==========================================
function makeCreateSqlCompatible(createSql) {
  return createSql
    // MySQL 8.0 collations → XAMPP compatible collations
    .replace(/utf8mb4_0900_ai_ci/gi, "utf8mb4_unicode_ci")
    .replace(/utf8mb4_0900_as_ci/gi, "utf8mb4_unicode_ci")
    .replace(/utf8mb4_0900_as_cs/gi, "utf8mb4_bin")
    .replace(/utf8mb4_0900_bin/gi, "utf8mb4_bin")

    // General fallback for any other utf8mb4_0900 collation
    .replace(
      /utf8mb4_0900_[a-z0-9_]+/gi,
      "utf8mb4_unicode_ci"
    );
}

// ==========================================
// MIGRATION FUNCTION
// ==========================================
async function migrateDatabase() {
  let railwayConnection;
  let localConnection;
  let foreignKeyChecksDisabled = false;

  try {
    // --------------------------------------
    // Check Railway URL
    // --------------------------------------
    if (!process.env.MYSQL_PUBLIC_URL) {
      throw new Error(
        "MYSQL_PUBLIC_URL not found in backend/.env file"
      );
    }

    // --------------------------------------
    // Connect to Railway
    // --------------------------------------
    console.log("🔄 Connecting to Railway database...");

    railwayConnection = await railwayDb.getConnection();

    console.log(
      "✅ Railway database connected successfully."
    );

    // --------------------------------------
    // Connect to Local XAMPP
    // --------------------------------------
    console.log(
      "🔄 Connecting to local XAMPP database..."
    );

    localConnection = await localDb.getConnection();

    console.log(
      "✅ Local XAMPP database connected successfully."
    );

    console.log(
      "\n✅ Both databases connected successfully."
    );

    // --------------------------------------
    // Show source and destination databases
    // --------------------------------------
    const [[railwayDatabase]] =
      await railwayConnection.query(
        "SELECT DATABASE() AS db"
      );

    const [[localDatabase]] =
      await localConnection.query(
        "SELECT DATABASE() AS db"
      );

    console.log("\n📍 Database information:");
    console.log(
      `   Railway source : ${railwayDatabase.db}`
    );
    console.log(
      `   XAMPP target   : ${localDatabase.db}`
    );

    // --------------------------------------
    // Get all Railway tables
    // --------------------------------------
    console.log(
      "\n🔍 Reading tables from Railway..."
    );

    const [tables] = await railwayConnection.query(
      "SHOW TABLES"
    );

    const tableNames = tables.map(
      (row) => Object.values(row)[0]
    );

    if (tableNames.length === 0) {
      console.log(
        "⚠️ No tables found in Railway database."
      );
      return;
    }

    console.log("\n📦 Tables found:");

    tableNames.forEach((tableName, index) => {
      console.log(`${index + 1}. ${tableName}`);
    });

    // --------------------------------------
    // Disable foreign key checks locally
    // --------------------------------------
    await localConnection.query(
      "SET FOREIGN_KEY_CHECKS = 0"
    );

    foreignKeyChecksDisabled = true;

    console.log(
      "\n🔓 Foreign key checks temporarily disabled."
    );

    // --------------------------------------
    // Migrate each table
    // --------------------------------------
    for (const tableName of tableNames) {
      console.log(
        "\n======================================"
      );

      console.log(
        `🔄 Migrating table: ${tableName}`
      );

      console.log(
        "======================================"
      );

      // ------------------------------------
      // Get CREATE TABLE statement
      // ------------------------------------
      console.log(
        "🔍 Reading table structure from Railway..."
      );

      const [createResult] =
        await railwayConnection.query(
          `SHOW CREATE TABLE \`${tableName}\``
        );

      let createSql =
        createResult[0]["Create Table"];

      // ------------------------------------
      // Fix MySQL 8 collations for XAMPP
      // ------------------------------------
      const originalCreateSql = createSql;

      createSql =
        makeCreateSqlCompatible(createSql);

      if (originalCreateSql !== createSql) {
        console.log(
          "🔧 MySQL 8 collation converted for XAMPP compatibility."
        );
      }

      // ------------------------------------
      // Drop old local table
      // ------------------------------------
      console.log(
        "🗑️ Removing old local table if it exists..."
      );

      await localConnection.query(
        `DROP TABLE IF EXISTS \`${tableName}\``
      );

      // ------------------------------------
      // Create table locally
      // ------------------------------------
      console.log(
        `🏗️ Creating local table: ${tableName}`
      );

      await localConnection.query(createSql);

      console.log(
        "✅ Table structure created successfully."
      );

      // ------------------------------------
      // Get all Railway data
      // ------------------------------------
      console.log(
        "📥 Reading data from Railway..."
      );

      const [rows] =
        await railwayConnection.query(
          `SELECT * FROM \`${tableName}\``
        );

      // ------------------------------------
      // Empty table
      // ------------------------------------
      if (rows.length === 0) {
        console.log(
          `⚪ ${tableName}: Table is empty — structure copied only.`
        );

        continue;
      }

      console.log(
        `📊 ${rows.length} rows found. Starting import...`
      );

      // ------------------------------------
      // Get column names
      // ------------------------------------
      const columns = Object.keys(rows[0]);

      const columnNames = columns
        .map((column) => `\`${column}\``)
        .join(", ");

      const placeholders = columns
        .map(() => "?")
        .join(", ");

      const insertSql = `
        INSERT INTO \`${tableName}\`
        (${columnNames})
        VALUES (${placeholders})
      `;

      // ------------------------------------
      // Insert all rows
      // ------------------------------------
      let importedRows = 0;

      for (const row of rows) {
        const values = columns.map(
          (column) => row[column]
        );

        await localConnection.query(
          insertSql,
          values
        );

        importedRows++;

        console.log(
          `   ➜ ${importedRows}/${rows.length} rows imported`
        );
      }

      console.log(
        `✅ ${tableName}: ${importedRows} rows successfully imported`
      );
    }

    // --------------------------------------
    // Re-enable foreign key checks
    // --------------------------------------
    await localConnection.query(
      "SET FOREIGN_KEY_CHECKS = 1"
    );

    foreignKeyChecksDisabled = false;

    console.log(
      "\n🔒 Foreign key checks enabled again."
    );

    // --------------------------------------
    // Verify migration
    // --------------------------------------
    console.log(
      "\n🔍 Verifying imported tables..."
    );

    console.log(
      "\n======================================"
    );
    console.log("📊 MIGRATION SUMMARY");
    console.log(
      "======================================"
    );

    for (const tableName of tableNames) {
      const [[railwayCount]] =
        await railwayConnection.query(
          `SELECT COUNT(*) AS total FROM \`${tableName}\``
        );

      const [[localCount]] =
        await localConnection.query(
          `SELECT COUNT(*) AS total FROM \`${tableName}\``
        );

      const status =
        railwayCount.total === localCount.total
          ? "✅"
          : "⚠️";

      console.log(
        `${status} ${tableName}: Railway=${railwayCount.total} | XAMPP=${localCount.total}`
      );
    }

    // --------------------------------------
    // Final success
    // --------------------------------------
    console.log("\n");
    console.log(
      "======================================"
    );
    console.log(
      "🎉 DATABASE MIGRATION COMPLETED"
    );
    console.log(
      "======================================"
    );
    console.log(
      "Source      : Railway MySQL"
    );
    console.log(
      "Destination : XAMPP Local MySQL"
    );
    console.log(
      "Database    : railway"
    );
    console.log(
      "======================================"
    );

    console.log(
      "\n✅ Railway database has been successfully copied to XAMPP."
    );

  } catch (error) {
    console.error("\n❌ MIGRATION FAILED:");
    console.error(
      "--------------------------------------"
    );

    console.error(
      "Message:",
      error.message
    );

    if (error.code) {
      console.error(
        "Error Code:",
        error.code
      );
    }

    if (error.errno) {
      console.error(
        "Error Number:",
        error.errno
      );
    }

    if (error.sqlState) {
      console.error(
        "SQL State:",
        error.sqlState
      );
    }

    if (error.sqlMessage) {
      console.error(
        "SQL Message:",
        error.sqlMessage
      );
    }

    console.error(
      "--------------------------------------"
    );

    // --------------------------------------
    // Restore foreign key checks
    // --------------------------------------
    try {
      if (
        localConnection &&
        foreignKeyChecksDisabled
      ) {
        await localConnection.query(
          "SET FOREIGN_KEY_CHECKS = 1"
        );

        foreignKeyChecksDisabled = false;

        console.log(
          "🔒 Foreign key checks restored."
        );
      }
    } catch (restoreError) {
      console.error(
        "⚠️ Could not restore foreign key checks:",
        restoreError.message
      );
    }

  } finally {
    // --------------------------------------
    // Release active connections
    // --------------------------------------
    if (railwayConnection) {
      railwayConnection.release();
    }

    if (localConnection) {
      localConnection.release();
    }

    // --------------------------------------
    // Close pools
    // --------------------------------------
    await railwayDb.end();
    await localDb.end();

    console.log(
      "\n🔌 Database connections closed."
    );
  }
}

// ==========================================
// START MIGRATION
// ==========================================
migrateDatabase();