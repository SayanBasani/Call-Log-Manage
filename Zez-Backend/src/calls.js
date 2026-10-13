const crypto = require('node:crypto');

const { pool } = require('./db');
const { encryptJson, decryptJson } = require('./crypto');
const { decryptStoredPayload } = require('./crypto');

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

  const phoneNumber = asString(
    input.phoneNumber ?? input.phone_number ?? input.number
  );
  const timestamp = asString(
    input.timestamp ?? input.dateTime ?? input.date ?? input.call_timestamp
  );
  const type = asString(input.type ?? input.rawType ?? input.call_type, 'UNKNOWN');
  const durationNumber = Number(input.duration ?? 0);
  const duration = Number.isFinite(durationNumber)
    ? Math.max(0, Math.trunc(durationNumber))
    : 0;
  const name = asString(input.name ?? input.contactName ?? input.contact_name);
  const sourceId = input.id ?? input.callId ?? input.call_id;

  const fingerprint = JSON.stringify([
    phoneNumber, timestamp, type, duration, name
  ]);

  const externalId =
    sourceId !== undefined && sourceId !== null && String(sourceId).length
      ? `android:${String(sourceId)}`
      : `fallback:${crypto.createHash('sha256').update(fingerprint).digest('hex')}`;

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

async function insertBatch(records) {
  const client = await pool.connect();
  let inserted = 0;
  let duplicates = 0;

  try {
    await client.query('BEGIN');

    for (const record of records) {
      const externalIdHash = crypto
        .createHash('sha256')
        .update(record.externalId)
        .digest('hex');

      const encryptedPayload = encryptJson({
        externalId: record.externalId,
        phoneNumber: record.phoneNumber,
        name: record.name,
        type: record.type,
        timestamp: record.timestamp,
        duration: record.duration,
        raw: JSON.parse(record.rawJson)
      });

      const result = await client.query(
        `INSERT INTO calls (external_id_hash, call_timestamp, encrypted_payload)
         VALUES ($1, $2, $3)
         ON CONFLICT (external_id_hash) DO NOTHING
         RETURNING id`,
        [externalIdHash, record.timestamp, encryptedPayload]
      );

      if (result.rowCount === 1) inserted++;
      else duplicates++;
    }

    await client.query('COMMIT');
    return { inserted, duplicates };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}



async function getCalls({ limit, offset }) {
  const result = await pool.query(
    `SELECT id, encrypted_payload, created_at, call_timestamp
     FROM calls
     ORDER BY call_timestamp DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  // return result.rows.map((row) => {
  return result.rows.map((row) => {
    try {
    const stored = String(row.encrypted_payload);
    const separatorIndex = stored.indexOf("--");

    if (separatorIndex <= 0) {
      // Older records that contain only the encrypted envelope or ciphertext.
      const payload = decryptStoredPayload(stored);

      return {
        id: Number(row.id),
        externalId: payload.externalId ?? "",
        phoneNumber: payload.phoneNumber ?? "",
        name: payload.name ?? "",
        type: payload.type ?? "UNKNOWN",
        timestamp: payload.timestamp ?? row.call_timestamp,
        duration: Number(payload.duration ?? 0),
        raw: payload.raw ?? payload,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      };
    }

    // Mobile format: callId--hexCiphertext
    const recordId = stored.slice(0, separatorIndex);
    const encryptedPayload = stored.slice(separatorIndex + 2);

    if (!/^(?:[0-9a-fA-F]{2})+$/.test(encryptedPayload)) {
      throw new Error(
        `Invalid hexadecimal ciphertext for record ${row.id}`
      );
    }

    const payload = decryptStoredPayload(encryptedPayload);

    return {
      id: Number(row.id),
      externalId: payload.externalId ?? `android:${recordId}`,
      phoneNumber: payload.phoneNumber ?? "",
      name: payload.name ?? "",
      type: payload.type ?? "UNKNOWN",
      timestamp: payload.timestamp ?? row.call_timestamp,
      duration: Number(payload.duration ?? 0),
      raw: payload.raw ?? payload,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    };
  // });
    } catch (error) {
    console.error("Failed to decrypt call record:", {
      id: row.id,
      error: error.message,
    });

    throw error;
  }
});
}



async function old_getCalls({ limit, offset }) {
  const result = await pool.query(
    `SELECT id, encrypted_payload, created_at, call_timestamp
     FROM calls
     ORDER BY call_timestamp DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows.map((row) => {
    // const payload = decryptJson(row.encrypted_payload);
    const encrypted_String = String(row.encrypted_payload)
    const main_encrypted_String = encrypted_String.slice(encrypted_String.indexOf("--")+2);
    // console.log(encrypted_String+" "+main_encrypted_String)

    const isHex =
      typeof main_encrypted_String === "string" &&
      /^(?:[0-9a-fA-F]{2})+$/.test(main_encrypted_String);

    console.log("Checking record:", {
      id: row.id,
      format: isHex ? "portable-hex" : "server-envelope"
    });

    console.log("1-----------")
    const payload = decryptStoredPayload(main_encrypted_String);
    console.log("2-----------")
    console.log(payload);
    
    return {
      id: Number(row.id),
      externalId: payload.externalId,
      phoneNumber: payload.phoneNumber,
      name: payload.name,
      type: payload.type,
      timestamp: payload.timestamp,
      duration: payload.duration,
      raw: payload.raw,
      createdAt: row.created_at,
      updatedAt: row.created_at
    };
  });
}

async function countCalls() {
  const result = await pool.query('SELECT COUNT(*) AS count FROM calls');
  return Number(result.rows[0].count);
}

module.exports = {
  normalizeCall,
  insertBatch,
  getCalls,
  countCalls,
};



