const crypto = require('node:crypto');
const { getDatabase, persistDatabase } = require('./db');

function asString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizeCall(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Each call must be a JSON object.');
    error.statusCode = 400;
    throw error;
  }

  const phoneNumber = asString(input.phoneNumber ?? input.phone_number ?? input.number);
  const timestamp = asString(input.timestamp ?? input.dateTime ?? input.date ?? input.call_timestamp);
  const type = asString(input.type ?? input.rawType ?? input.call_type, 'UNKNOWN');
  const durationNumber = Number(input.duration ?? 0);
  const duration = Number.isFinite(durationNumber) ? Math.max(0, Math.trunc(durationNumber)) : 0;
  const name = asString(input.name ?? input.contactName ?? input.contact_name);

  const sourceId = input.id ?? input.callId ?? input.call_id;
  const fingerprintSource = JSON.stringify([phoneNumber, timestamp, type, duration, name]);
  const externalId = sourceId !== undefined && sourceId !== null && String(sourceId).length
    ? `android:${String(sourceId)}`
    : `fallback:${crypto.createHash('sha256').update(fingerprintSource).digest('hex')}`;

  return {
    externalId,
    phoneNumber,
    name,
    type,
    timestamp,
    duration,
    rawJson: JSON.stringify(input)
  };
}

function insertBatch(records) {
  const db = getDatabase();
  let inserted = 0;
  let duplicates = 0;

  db.run('BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO calls
        (external_id, phone_number, contact_name, call_type,
         call_timestamp, duration, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const record of records) {
        stmt.run([
          record.externalId,
          record.phoneNumber,
          record.name,
          record.type,
          record.timestamp,
          record.duration,
          record.rawJson
        ]);
        const changes = db.getRowsModified();
        if (changes === 1) inserted += 1;
        else duplicates += 1;
      }
    } finally {
      stmt.free();
    }

    db.run('COMMIT');
    persistDatabase();
    return { inserted, duplicates };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function getCalls({ limit, offset }) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      id,
      external_id AS externalId,
      phone_number AS phoneNumber,
      contact_name AS name,
      call_type AS type,
      call_timestamp AS timestamp,
      duration,
      raw_json AS raw,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM calls
    ORDER BY call_timestamp DESC, id DESC
    LIMIT ? OFFSET ?
  `);

  try {
    stmt.bind([limit, offset]);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows.map(row => ({ ...row, raw: JSON.parse(row.raw) }));
  } finally {
    stmt.free();
  }
}

function countCalls() {
  const db = getDatabase();
  const result = db.exec('SELECT COUNT(*) AS count FROM calls');
  return result[0]?.values[0]?.[0] ?? 0;
}

module.exports = { normalizeCall, insertBatch, getCalls, countCalls };
