
const express = require("express");
const crypto = require("node:crypto");
const { pool } = require("../db");

const router = express.Router();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/register", async (req, res, next) => {
  const body = req.body ?? {};
  const ids = body.ids ?? {};

  const androidId = ids.androidId ? String(ids.androidId) : null;
  const persistentId = ids.persistentId
    ? String(ids.persistentId)
    : null;

  if (!androidId && !persistentId) {
    return res.status(400).json({
      success: false,
      error: "A stable device identifier is required.",
    });
  }

  // Never use a phone number as an authentication token.
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const details = body.deviceDetails ?? {};

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialize registration requests for the same identifiers.
    const lockKey = `zez-device:${androidId ?? ""}:${persistentId ?? ""}`;

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [lockKey],
    );

    const existing = await client.query(
      `SELECT *
       FROM public.devices
       WHERE ($1::text IS NOT NULL AND androidid = $1)
          OR ($2::text IS NOT NULL AND persistentid = $2)
       FOR UPDATE`,
      [androidId, persistentId],
    );

    // If the two identifiers point to different rows, do not merge
    // them automatically. That needs manual reconciliation.
    if (existing.rows.length > 1) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        error:
          "Device identifiers match different registrations. Reconcile the device records before registering.",
      });
    }

    let deviceId;

    if (existing.rows.length === 1) {
      const device = existing.rows[0];
      deviceId = device.id;

      // Do not overwrite an existing identifier with a different one.
      if (
        androidId &&
        device.androidid &&
        device.androidid !== androidId
      ) {
        throw new Error("Android ID conflicts with existing registration.");
      }

      await client.query(
        `UPDATE public.devices
         SET androidid = COALESCE(androidid, $2),
             persistentid = COALESCE(persistentid, $3),
             device_name = $4,
             device_model = $5,
             manufacturer = $6,
             brand = $7,
             platform = COALESCE($8, 'Android'),
             os_version = $9,
             app_version = $10,
             sim1_phone_number = $11,
             sim2_phone_number = $12,
             sim1_carrier = $13,
             sim2_carrier = $14,
             sim1_country_iso = $15,
             sim2_country_iso = $16,
             primary_phone_number = $17,
             token_hash = $18,
             device_details = COALESCE(device_details, '{}'::jsonb)
                              || $19::jsonb,
             registration_status = 'active',
             last_seen_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [
          deviceId,
          androidId,
          persistentId,
          body.deviceName ?? null,
          body.deviceModel ?? null,
          body.manufacturer ?? null,
          body.brand ?? null,
          body.platform ?? "Android",
          body.osVersion ?? null,
          body.appVersion ?? null,
          body.sim1PhoneNumber ?? null,
          body.sim2PhoneNumber ?? null,
          body.sim1Carrier ?? null,
          body.sim2Carrier ?? null,
          body.sim1CountryIso ?? null,
          body.sim2CountryIso ?? null,
          body.primaryPhoneNumber ?? null,
          tokenHash,
          JSON.stringify(details),
        ],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO public.devices (
           id, androidid, persistentid,
           device_name, device_model, manufacturer, brand,
           platform, os_version, app_version,
           sim1_phone_number, sim2_phone_number,
           sim1_carrier, sim2_carrier,
           sim1_country_iso, sim2_country_iso,
           primary_phone_number, token_hash, device_details
         )
         VALUES (
           gen_random_uuid(), $1, $2,
           $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15,
           $16, $17, $18::jsonb
         )
         RETURNING id`,
        [
          androidId,
          persistentId,
          body.deviceName ?? null,
          body.deviceModel ?? null,
          body.manufacturer ?? null,
          body.brand ?? null,
          body.platform ?? "Android",
          body.osVersion ?? null,
          body.appVersion ?? null,
          body.sim1PhoneNumber ?? null,
          body.sim2PhoneNumber ?? null,
          body.sim1Carrier ?? null,
          body.sim2Carrier ?? null,
          body.sim1CountryIso ?? null,
          body.sim2CountryIso ?? null,
          body.primaryPhoneNumber ?? null,
          tokenHash,
          JSON.stringify(details),
        ],
      );

      deviceId = inserted.rows[0].id;
    }

    await client.query("COMMIT");

    const canonical = await client.query(
      `SELECT androidid, persistentid
      FROM public.devices
      WHERE id = $1`,
      [deviceId],
    );

    return res.status(200).json({
      success: true,
      deviceId,
      token,
      androidId: canonical.rows[0].androidid,
      persistentId: canonical.rows[0].persistentid,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
