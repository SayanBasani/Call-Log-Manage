
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const REQUEST_TIMEOUT_MS = 20_000;

export async function sendBackgroundPost(): Promise<void> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${API_URL.replace(/\/+$/, "")}/api/Hello`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "zez-android",
          event: "scheduled_sync",
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        `Background POST failed: HTTP ${response.status}`
      );
    }

    console.log("[ZEZ] /api/Hello responded:", response.status);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Background POST timed out after 20 seconds");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
