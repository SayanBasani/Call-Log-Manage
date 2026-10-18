
require("dotenv").config();

const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured. Check your .env file.");
}

const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

/**
 * Verify the existing Neon schema.
 *
 * This function deliberately does NOT create or drop tables.
 * Your Neon database schema is managed separately.
 */
async function initializeDatabase() {
  const requiredColumns = {
    devices: [
      "id",
      "device_id",
      "persistentid",
      "androidid",
      "token_hash",
      "device_details",
      "registration_status",
      "last_seen_at",
      "updated_at",
    ],
    call_logs: [
      "id",
      "device_id",
      "external_id_hash",
      "call_timestamp",
      "encrypted_payload",
      "created_at",
    ],
  };

  // Confirm that the database connection works.
  await pool.query("SELECT 1");

  // Check that both required tables exist in the public schema.
  const tablesResult = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('devices', 'call_logs')`
  );

  const existingTables = new Set(
    tablesResult.rows.map((row) => row.table_name)
  );

  const missingTables = ["devices", "call_logs"].filter(
    (table) => !existingTables.has(table)
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Required Neon tables are missing: ${missingTables.join(", ")}. ` +
      "Check your existing public schema; this backend will not recreate it."
    );
  }

  // Check the columns used by the current backend.
  const columnsResult = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('devices', 'call_logs')`
  );

  const columnsByTable = new Map();

  for (const row of columnsResult.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, new Set());
    }
    columnsByTable.get(row.table_name).add(row.column_name);
  }

  const missingColumns = [];

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const existingColumns = columnsByTable.get(table) || new Set();

    for (const column of columns) {
      if (!existingColumns.has(column)) {
        missingColumns.push(`public.${table}.${column}`);
      }
    }
  }

  if (missingColumns.length > 0) {
    throw new Error(
      "The Neon schema is missing columns required by the backend: " +
      missingColumns.join(", ")
    );
  }

  console.log(
    "Neon database connected. Existing public.devices and public.call_logs tables verified."
  );
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  initializeDatabase,
  closeDatabase,
};
