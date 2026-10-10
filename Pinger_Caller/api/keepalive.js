export default async function handler(req, res) {
  // Protect this endpoint with a secret.
  const auth = req.headers.authorization;

  if (auth !== `Bearer ${process.env.PING_SECRET}`) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

  const target = process.env.RENDER_URL;

  if (!target) {
    return res.status(500).json({
      success: false,
      error: "RENDER_URL is not configured"
    });
  }

  try {
    const response = await fetch(
      `${target.replace(/\/+$/, "")}/health`,
      { signal: AbortSignal.timeout(10000) }
    );

    const body = await response.text();

    return res.status(response.ok ? 200 : 502).json({
      success: response.ok,
      renderStatus: response.status,
      response: body
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "Could not reach Render",
      message: error.message
    });
  }
}