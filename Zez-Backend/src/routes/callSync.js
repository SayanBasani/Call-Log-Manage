const express = require("express");
const crypto = require("node:crypto");

const { pool } = require("../db");
const { encryptJson } = require("../crypto");

const router = express.Router();

const MAX_BATCH_SIZE = 100;
const MAX_DEVICE_DETAILS_BYTES = 100_000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // Android call-log dates are commonly milliseconds since epoch.
  const numeric = Number(value);

  const date =
    Number.isFinite(numeric) && numeric > 0
      ? new Date(numeric)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw httpError(400, "A call has an invalid timestamp.");
  }

  return date.toISOString();
}

function normalizeCall(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw httpError(400, "Each call must be an object.");
  }

  const externalId =
    input.externalId ??
    input.id ??
    input.callId ??
    input.call_id;

  if (
    externalId === null ||
    externalId === undefined ||
    String(externalId).length === 0
  ) {
    throw httpError(
      400,
      "A stable call identifier is required.",
    );
  }

  const durationNumber = Number(input.duration ?? 0);

  if (
    !Number.isFinite(durationNumber) ||
    durationNumber < 0
  ) {
    throw httpError(400, "A call has an invalid duration.");
  }

  return {
    externalId: String(externalId),
    phoneNumber: String(input.phoneNumber ?? ""),
    name: String(input.name ?? ""),
    type: String(input.type ?? "UNKNOWN"),
    timestamp: getTimestamp(input.timestamp),
    duration: Math.trunc(durationNumber),
    raw: input.raw ?? input,
  };
}

// Authenticate the device and resolve its ID from the token.
async function authenticateDevice(req, res, next) {
  try {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      // throw httpError(401, "Device token is required.");
      return res.status(401).json({
        success: false,
        error: {
          code: "DEVICE_TOKEN_REQUIRED",
          message: "Device token is required.",
        },
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(match[1])
      .digest("hex");

    const result = await pool.query(
      `SELECT id
       FROM public.devices
       WHERE token_hash = $1
         AND registration_status = 'active'
       LIMIT 1`,
      [tokenHash],
    );

    if (result.rowCount !== 1) {
      // throw httpError(401, "Invalid or revoked device token.");
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_DEVICE_TOKEN",
          message: "Invalid or revoked device token.",
        },
      });
    }

    req.deviceId = result.rows[0].id;
    console.log({
      authorization, match, tokenHash, result
    })
    next();
  } catch (error) {
    console.log(error);
    next(error);
  }
}

router.post("/sync", authenticateDevice, async (req, res, next) => {

  console.log("----------------------")
  const body = req.body ?? {};
  const calls = body.calls;

  try {
    if (!Array.isArray(calls)) {
      throw httpError(400, "'calls' must be an array.");
    }

    if (calls.length > MAX_BATCH_SIZE) {
      throw httpError(
        413,
        `A maximum of ${MAX_BATCH_SIZE} calls is allowed per batch.`,
      );
    }

    const details = body.deviceDetails;

    if (
      details !== undefined &&
      (details === null ||
        typeof details !== "object" ||
        Array.isArray(details))
    ) {
      throw httpError(400, "'deviceDetails' must be an object.");
    }

    if (
      details !== undefined &&
      Buffer.byteLength(JSON.stringify(details), "utf8") >
        MAX_DEVICE_DETAILS_BYTES
    ) {
      throw httpError(413, "Device details are too large.");
    }

    const records = calls.map(normalizeCall);

    // Reject duplicate IDs inside a single batch.
    const seen = new Set();

    for (const record of records) {
      if (seen.has(record.externalId)) {
        throw httpError(400, "Duplicate call ID inside this batch.");
      }

      seen.add(record.externalId);
    }

    const client = await pool.connect();

    let inserted = 0;
    let duplicates = 0;

    try {
      await client.query("BEGIN");

      // Merge the latest device details without replacing other JSON keys.
      if (details !== undefined) {
        await client.query(
          `UPDATE public.devices
           SET device_details = COALESCE(device_details, '{}'::jsonb)
                                 || $2::jsonb,
               last_seen_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [req.deviceId, JSON.stringify(details)],
        );
      } else {
        await client.query(
          `UPDATE public.devices
           SET last_seen_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [req.deviceId],
        );
      }

      for (const record of records) {
        const externalIdHash = crypto
          .createHash("sha256")
          .update(record.externalId)
          .digest("hex");

        const existing = await client.query(
          `SELECT 1
           FROM public.call_logs
           WHERE device_id = $1
             AND external_id_hash = $2
           LIMIT 1`,
          [req.deviceId, externalIdHash],
        );
        if (existing.rowCount > 0) {
          duplicates += 1;
          continue;
        }

        const encryptedPayload = encryptJson({
          externalId: record.externalId,
          phoneNumber: record.phoneNumber,
          name: record.name,
          type: record.type,
          timestamp: record.timestamp,
          duration: record.duration,
          raw: record.raw,
        });

        const result = await client.query(
          `INSERT INTO public.call_logs (
             device_id,
             external_id_hash,
             call_timestamp,
             encrypted_payload
           )
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (device_id, external_id_hash) DO NOTHING
           RETURNING id`,
          [
            req.deviceId,
            externalIdHash,
            record.timestamp,
            encryptedPayload,
          ],
        );

        if (result.rowCount === 1) {
          inserted += 1;
        } else {
          duplicates += 1;
        }
      }

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        received: records.length,
        inserted,
        duplicates,
        acceptedIds: records.map((record) => record.externalId),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
