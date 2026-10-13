const { Pool } = require('pg');
require("dotenv").config();

const connectionString = process.env.DATABASE_URL;
// const connectionString="postgresql://neondb_owner:npg_Qxz43HdmWSvE@ep-still-night-b4paxi42-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"


if (!connectionString) {
  throw new Error('DATABASE_URL is not configured.');
}

// Use the connection string supplied by your PostgreSQL provider (for Neon,
// use its pooled connection string and keep SSL enabled in that URL).
const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

async function initializeDatabase() {
  // Fail early if PostgreSQL is unreachable or credentials are incorrect.
  await pool.query('SELECT 1');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls (
      id BIGSERIAL PRIMARY KEY,
      external_id_hash CHAR(64) NOT NULL UNIQUE,
      call_timestamp TEXT NOT NULL DEFAULT '',
      encrypted_payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_calls_timestamp
    ON calls (call_timestamp DESC, id DESC);
  `);

  console.log('PostgreSQL database initialized.');
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  initializeDatabase,
  closeDatabase
};
