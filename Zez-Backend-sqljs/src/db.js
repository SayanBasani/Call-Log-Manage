const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const configuredPath = process.env.DATABASE_PATH || './data/zez.sqlite';
const databasePath = path.resolve(process.cwd(), configuredPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

let db;

async function initializeDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(databasePath)) {
    const fileBytes = fs.readFileSync(databasePath);
    db = new SQL.Database(fileBytes);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      phone_number TEXT NOT NULL DEFAULT '',
      contact_name TEXT NOT NULL DEFAULT '',
      call_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      call_timestamp TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_calls_timestamp
      ON calls(call_timestamp DESC);
  `);

  persistDatabase();
  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error('Database has not been initialized.');
  }
  return db;
}

function persistDatabase() {
  if (!db) return;
  const bytes = db.export();
  fs.writeFileSync(databasePath, Buffer.from(bytes));
}

module.exports = {
  initializeDatabase,
  getDatabase,
  persistDatabase,
  databasePath
};
