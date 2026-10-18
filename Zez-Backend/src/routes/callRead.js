
const express = require("express");
const { pool } = require("../db");
const { deviceAuth } = require("../middleware/deviceAuth");
const { decryptStoredPayload } = require("../crypto");

const router = express.Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Every route in this file requires a valid registered-device token.
router.use(deviceAuth);

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function parseLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;

  const limit = parsePositiveInteger(value);

  if (limit === null) return null;

  return Math.min(limit, MAX_LIMIT);
}

function parseDate(value) {
  if (value === undefined) return undefined;

  if (typeof value !== "string" || value.length > 40) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function decodeRecord(row) {
  let call = null;
  let decryptionFailed = false;

  try {
    call = decryptStoredPayload(row.encrypted_payload);
  } catch {
    // Do not expose ciphertext, keys, or internal crypto errors.
    decryptionFailed = true;
  }

  return {
    id: String(row.id),
    callTimestamp: row.call_timestamp,
    createdAt: row.created_at,
    call,
    decryptionFailed,
  };
}

function sendDatabaseError(res, error, operation) {
  // Log the operation and error message only; never log tokens or payloads.
  console.error(`Call retrieval failed (${operation}):`, error.message);

  if (error.code === "57014") {
    return res.status(503).json({
      success: false,
      error: "The database operation timed out. Please try again.",
    });
  }

  if (error.code === "53300" || error.code === "57P03") {
    return res.status(503).json({
      success: false,
      error: "The database is temporarily unavailable.",
    });
  }

  return res.status(500).json({
    success: false,
    error: "Unable to retrieve call records.",
  });
}

/**
 * GET /api/calls/read/stats
 *
 * Summary of records belonging to the authenticated device.
 */
router.get("/stats", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::text AS total_calls,
         COUNT(*) FILTER (
           WHERE call_timestamp >= date_trunc('day', NOW())
             AND call_timestamp < date_trunc('day', NOW()) + INTERVAL '1 day'
         )::text AS calls_today,
         MAX(call_timestamp) AS latest_call,
         MIN(call_timestamp) AS earliest_call
       FROM public.call_logs
       WHERE device_id = $1`,
      [req.device.id]
    );

    const stats = result.rows[0];

    return res.json({
      success: true,
      stats: {
        totalCalls: stats.total_calls,
        callsToday: stats.calls_today,
        latestCall: stats.latest_call,
        earliestCall: stats.earliest_call,
      },
    });
  } catch (error) {
    return sendDatabaseError(res, error, "stats");
  }
});

/**
 * GET /api/calls/read
 *
 * Query parameters:
 *   limit=50       Maximum records per response (1–100)
 *   beforeId=123   Return records with id lower than this ID
 *   from=ISO_DATE  Inclusive lower timestamp boundary
 *   to=ISO_DATE    Exclusive upper timestamp boundary
 *
 * Results are ordered by database ID descending.
 */
router.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit);

  if (limit === null) {
    return res.status(400).json({
      success: false,
      error: `limit must be a positive integer (maximum ${MAX_LIMIT}).`,
    });
  }

  let beforeId;

  if (req.query.beforeId !== undefined) {
    // Keep IDs as strings: PostgreSQL BIGINT may exceed JS safe integers.
    if (
      typeof req.query.beforeId !== "string" ||
      !/^[1-9]\d{0,18}$/.test(req.query.beforeId)
    ) {
      return res.status(400).json({
        success: false,
        error: "beforeId must be a valid positive database ID.",
      });
    }

    beforeId = req.query.beforeId;
  }

  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);

  if (from === null || to === null) {
    return res.status(400).json({
      success: false,
      error: "from and to must be valid date strings.",
    });
  }

  if (from && to && new Date(from) >= new Date(to)) {
    return res.status(400).json({
      success: false,
      error: "from must be earlier than to.",
    });
  }

  const conditions = ["device_id = $1"];
  const params = [req.device.id];

  if (beforeId !== undefined) {
    params.push(beforeId);
    conditions.push(`id < $${params.length}::bigint`);
  }

  if (from) {
    params.push(from);
    conditions.push(`call_timestamp >= $${params.length}::timestamptz`);
  }

  if (to) {
    params.push(to);
    conditions.push(`call_timestamp < $${params.length}::timestamptz`);
  }

  // Fetch one extra record to determine whether another page exists.
  params.push(limit + 1);

  try {
    const result = await pool.query(
      `SELECT id, call_timestamp, encrypted_payload, created_at
         FROM public.call_logs
        WHERE ${conditions.join(" AND ")}
        ORDER BY id DESC
        LIMIT $${params.length}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const calls = rows.map(decodeRecord);

    return res.json({
      success: true,
      count: calls.length,
      limit,
      hasMore,
      nextBeforeId: hasMore && rows.length
        ? String(rows[rows.length - 1].id)
        : null,
      calls,
    });
  } catch (error) {
    return sendDatabaseError(res, error, "list");
  }
});

/**
 * GET /api/calls/read/:id
 *
 * Retrieve one record, but only if it belongs to this device.
 */
router.get("/:id", async (req, res) => {
  const id = req.params.id;

  // PostgreSQL BIGINT maximum is 9223372036854775807.
  if (
    typeof id !== "string" ||
    !/^[1-9]\d{0,18}$/.test(id) ||
    (id.length === 19 && id > "9223372036854775807")
  ) {
    return res.status(400).json({
      success: false,
      error: "id must be a valid positive call-record ID.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, call_timestamp, encrypted_payload, created_at
         FROM public.call_logs
        WHERE id = $1::bigint
          AND device_id = $2
        LIMIT 1`,
      [id, req.device.id]
    );

    if (result.rows.length === 0) {
      // Do not reveal whether another device owns this record.
      return res.status(404).json({
        success: false,
        error: "Call record not found.",
      });
    }

    return res.json({
      success: true,
      call: decodeRecord(result.rows[0]),
    });
  } catch (error) {
    return sendDatabaseError(res, error, "single record");
  }
});

module.exports = router;

