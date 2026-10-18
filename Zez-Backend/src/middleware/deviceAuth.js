const crypto = require("node:crypto");
const { pool } = require("../db");

async function deviceAuth(req, res, next) {
  try {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        error: { code: "MISSING_TOKEN", message: "Device token is required." },
      });
    }

    const token = match[1].trim();

    if (token.length < 32 || token.length > 256) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid device token." },
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await pool.query(
      `SELECT id
       FROM public.devices
       WHERE token_hash = $1
         AND registration_status = 'active'
       LIMIT 1`,
      [tokenHash]
    );

    if (result.rowCount !== 1) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Device token is not valid." },
      });
    }

    req.device = { id: result.rows[0].id };

    await pool.query(
      `UPDATE public.devices
       SET last_seen_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.device.id]
    );

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { deviceAuth };
