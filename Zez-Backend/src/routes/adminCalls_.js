
const express = require("express");
const crypto = require("node:crypto");
const { pool } = require("../db");
const { decryptStoredPayload } = require("../crypto");

const router = express.Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function passwordMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }

  const providedHash = crypto
    .createHash("sha256")
    .update(provided, "utf8")
    .digest();

  const expectedHash = crypto
    .createHash("sha256")
    .update(expected, "utf8")
    .digest();

  return crypto.timingSafeEqual(providedHash, expectedHash);
}

// Protect every route in this router.
router.use((req, res, next) => {
  const expectedPassword = process.env.ADMIN_API_PASSWORD;

  if (!expectedPassword) {
    console.error("ADMIN_API_PASSWORD is not configured.");

    return res.status(503).json({
      success: false,
      error: "Admin access is not configured.",
    });
  }

  // Send the normal string password in this header:
  // x-admin-password: your_password
  const providedPassword = req.get("x-admin-password");

  if (!passwordMatches(providedPassword, expectedPassword)) {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing master password.",
    });
  }

  next();
});

function parseLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;

  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    return null;
  }

  return Math.min(Number(value), MAX_LIMIT);
}

function validBigintId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,18}$/.test(value)
  ) {
    return false;
  }

  return value.length < 19 ||
    value <= "9223372036854775807";
}

function parseDate(value) {
  if (value === undefined) return undefined;

  if (typeof value !== "string" || value.length > 40) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function decryptRow(row) {
  let call = null;
  let decryptionFailed = false;

  try {
    call = decryptStoredPayload(row.encrypted_payload);
  } catch {
    decryptionFailed = true;
  }

  return {
    id: String(row.id),
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceModel: row.device_model,
    callTimestamp: row.call_timestamp,
    createdAt: row.created_at,
    call,
    decryptionFailed,
  };
}

/**
 * GET /api/admin/calls
 *
 * Headers:
 *   x-admin-password: your master password
 *
 * Query:
 *   limit=50
 *   beforeId=123
 *   deviceId=<device UUID>
 *   from=<ISO timestamp>
 *   to=<ISO timestamp>
 *
 * Without deviceId, reads calls from all devices.
 */
router.get("/calls", async (req, res) => {
  const limit = parseLimit(req.query.limit);

  if (limit === null) {
    return res.status(400).json({
      success: false,
      error: `limit must be a positive integer (maximum ${MAX_LIMIT}).`,
    });
  }

  const { beforeId, deviceId } = req.query;

  if (beforeId !== undefined && !validBigintId(beforeId)) {
    return res.status(400).json({
      success: false,
      error: "beforeId must be a valid positive database ID.",
    });
  }

  if (
    deviceId !== undefined &&
    (
      typeof deviceId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)
    )
  ) {
    return res.status(400).json({
      success: false,
      error: "deviceId must be a valid UUID.",
    });
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

  const conditions = [];
  const params = [];

  if (beforeId !== undefined) {
    params.push(beforeId);
    conditions.push(`cl.id < $${params.length}::bigint`);
  }

  if (deviceId !== undefined) {
    params.push(deviceId);
    conditions.push(`cl.device_id = $${params.length}::uuid`);
  }

  if (from) {
    params.push(from);
    conditions.push(`cl.call_timestamp >= $${params.length}::timestamptz`);
  }

  if (to) {
    params.push(to);
    conditions.push(`cl.call_timestamp < $${params.length}::timestamptz`);
  }

  params.push(limit + 1);

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  try {
    const result = await pool.query(
      `SELECT
         cl.id,
         cl.device_id,
         d.device_name,
         d.device_model,
         cl.call_timestamp,
         cl.encrypted_payload,
         cl.created_at
       FROM public.call_logs AS cl
       JOIN public.devices AS d
         ON d.id = cl.device_id
       ${whereClause}
       ORDER BY cl.id DESC
       LIMIT $${params.length}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const calls = rows.map(decryptRow);

    return res.json({
      success: true,
      count: calls.length,
      limit,
      hasMore,
      nextBeforeId:
        hasMore && rows.length > 0
          ? String(rows[rows.length - 1].id)
          : null,
      calls,
    });
  } catch (error) {
    // Never log passwords, encrypted payloads, or returned call details.
    console.error("Admin call retrieval failed:", error.message);

    if (error.code === "57014") {
      return res.status(503).json({
        success: false,
        error: "The database request timed out. Please retry.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Unable to retrieve call records.",
    });
  }
});

module.exports = router;
