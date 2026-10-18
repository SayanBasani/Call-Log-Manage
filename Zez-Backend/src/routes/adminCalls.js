const express = require("express");
const crypto = require("node:crypto");
const { pool } = require("../db");
const { decryptStoredPayload } = require("../crypto");

const router = express.Router();
const DEFAULT_LIMIT = 50;
const MAX_PAGE_SIZE = 500;
const MAX_SEARCH_LENGTH = 200;

function passwordMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const a = crypto.createHash("sha256").update(provided, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  const expected = process.env.ADMIN_API_PASSWORD;
  if (!expected) {
    console.error("ADMIN_API_PASSWORD is not configured.");
    return res.status(503).json({ success: false, error: "Admin access is not configured." });
  }
  if (!passwordMatches(req.get("x-admin-password"), expected)) {
    return res.status(401).json({ success: false, error: "Invalid or missing master password." });
  }
  next();
});

function parseDate(value) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 40) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isValidId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)) return false;
  return value.length < 19 || value <= "9223372036854775807";
}

function decryptCall(row) {
  let call = null;
  let decryptionFailed = false;
  try { call = decryptStoredPayload(row.encrypted_payload); }
  catch { decryptionFailed = true; }

  return {
    id: String(row.id),
    deviceId: row.device_id,
    deviceName: row.device_name || "",
    deviceModel: row.device_model || "",
    manufacturer: row.manufacturer || "",
    brand: row.brand || "",
    platform: row.platform || "",
    osVersion: row.os_version || "",
    appVersion: row.app_version || "",
    callTimestamp: row.call_timestamp,
    createdAt: row.created_at,
    call,
    decryptionFailed
  };
}

function redactSensitiveFields(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(token|password|secret|private.?key|encryption.?key|credential|authorization|api.?key)/i.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactSensitiveFields(item);
    }
  }
  return output;
}

function safeDevice(row) {
  return {
    id: row.id, deviceId: row.device_id, persistentId: row.persistentid, androidId: row.androidid,
    deviceName: row.device_name, deviceModel: row.device_model, manufacturer: row.manufacturer,
    brand: row.brand, platform: row.platform, osVersion: row.os_version, appVersion: row.app_version,
    sim1PhoneNumber: row.sim1_phone_number, sim2PhoneNumber: row.sim2_phone_number,
    sim1Carrier: row.sim1_carrier, sim2Carrier: row.sim2_carrier,
    sim1CountryIso: row.sim1_country_iso, sim2CountryIso: row.sim2_country_iso,
    primaryPhoneNumber: row.primary_phone_number, registrationStatus: row.registration_status,
    createdAt: row.created_at, lastSeenAt: row.last_seen_at, updatedAt: row.updated_at,
    deviceDetails: redactSensitiveFields(row.device_details || {})
  };
}

router.get("/devices", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, device_id, persistentid, androidid, device_name, device_model,
              manufacturer, brand, platform, os_version, app_version,
              sim1_phone_number, sim2_phone_number, sim1_carrier, sim2_carrier,
              sim1_country_iso, sim2_country_iso, primary_phone_number,
              registration_status, created_at, last_seen_at, updated_at, device_details
         FROM public.devices
        ORDER BY last_seen_at DESC NULLS LAST, id DESC`
    );
    return res.json({ success: true, count: result.rows.length, devices: result.rows.map(safeDevice) });
  } catch (error) {
    console.error("Admin device retrieval failed:", error.message);
    return res.status(500).json({ success: false, error: "Unable to retrieve device details." });
  }
});

/**
 * GET /api/admin/calls
 * Query: limit (1..500), beforeId (cursor), deviceId, from, to.
 * Sort order is newest database ID first. Cursor pagination has no total-record cap.
 * Search is intentionally performed on the dashboard over fetched decrypted data.
 */
router.get("/calls", async (req, res) => {
  const rawLimit = req.query.limit;
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    if (typeof rawLimit !== "string" || !/^[1-9]\d*$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit))) {
      return res.status(400).json({ success: false, error: "limit must be a positive integer." });
    }
    limit = Math.min(Number(rawLimit), MAX_PAGE_SIZE);
  }

  const { beforeId, beforeTimestamp, deviceId } = req.query;
  if ((beforeId === undefined) !== (beforeTimestamp === undefined) ||
      (beforeId !== undefined && !isValidId(beforeId))) {
    return res.status(400).json({ success: false, error: "beforeId and beforeTimestamp must be provided together as a valid cursor." });
  }
  const parsedBeforeTimestamp = beforeTimestamp === undefined ? undefined : parseDate(beforeTimestamp);
  if (parsedBeforeTimestamp === null) {
    return res.status(400).json({ success: false, error: "beforeTimestamp must be a valid date string." });
  }
  if (deviceId !== undefined &&
      (typeof deviceId !== "string" ||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId))) {
    return res.status(400).json({ success: false, error: "deviceId must be a valid UUID." });
  }

  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  if (from === null || to === null) {
    return res.status(400).json({ success: false, error: "from and to must be valid date strings." });
  }
  if (from && to && new Date(from) >= new Date(to)) {
    return res.status(400).json({ success: false, error: "from must be earlier than to." });
  }

  const conditions = [];
  const params = [];
  if (beforeId !== undefined) {
    params.push(parsedBeforeTimestamp);
    params.push(beforeId);
    conditions.push(`(COALESCE(cl.call_timestamp, cl.created_at), cl.id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
  }
  if (deviceId) {
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
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT cl.id, cl.device_id, cl.call_timestamp, cl.encrypted_payload, cl.created_at,
              COALESCE(cl.call_timestamp, cl.created_at) AS sort_timestamp,
              d.device_name, d.device_model, d.manufacturer, d.brand, d.platform,
              d.os_version, d.app_version
         FROM public.call_logs cl
         JOIN public.devices d ON d.id = cl.device_id
         ${where}
        ORDER BY COALESCE(cl.call_timestamp, cl.created_at) DESC, cl.id DESC
        LIMIT $${params.length}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const calls = rows.map(decryptCall);
    return res.json({
      success: true,
      count: calls.length,
      limit,
      hasMore,
      nextBeforeId: hasMore && rows.length ? String(rows[rows.length - 1].id) : null,
      nextBeforeTimestamp: hasMore && rows.length ? rows[rows.length - 1].sort_timestamp : null,
      calls
    });
  } catch (error) {
    console.error("Admin call retrieval failed:", error.message);
    if (error.code === "57014") {
      return res.status(503).json({ success: false, error: "The database request timed out. Try a smaller page or narrower date range." });
    }
    return res.status(500).json({ success: false, error: "Unable to retrieve call records." });
  }
});

module.exports = router;
