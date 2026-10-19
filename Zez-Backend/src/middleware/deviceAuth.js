const crypto = require("node:crypto");
const { pool } = require("../db");

async function deviceAuth(req, res, next) {
  try {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      console.warn("[ZEZ Auth] Missing or malformed Bearer token.");
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
      console.warn("[ZEZ Auth] Token not matched to an active device.");
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_DEVICE_TOKEN",
          message: "Invalid or revoked device token.",
        },
      });
    }

    req.deviceId = result.rows[0].id;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { deviceAuth };
