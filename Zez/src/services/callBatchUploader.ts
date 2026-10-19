
import { getDeviceToken } from "@/services/deviceRegistration";
import type { CollectedCall } from "@/services/callCollection";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;

type BatchResponse = {
  success: boolean;
  received: number;
  inserted: number;
  duplicates: number;
  acceptedIds: string[];
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBatch(
  calls: CollectedCall[]
): Promise<BatchResponse> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  const token = await getDeviceToken();
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    // const response = await fetch(`${API_URL}/api/calls/batch`, {
      const response = await fetch(`${API_URL}/api/calls/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ calls }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Batch upload failed: HTTP ${response.status}`);
    }

    const result = (await response.json()) as BatchResponse;

    if (
      !result.success ||
      !Array.isArray(result.acceptedIds) ||
      result.received !== calls.length
    ) {
      throw new Error("Invalid batch acknowledgement from server.");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Uploads a list in small batches.
 * The caller must retain any unacknowledged records in SQLite.
 */
export async function uploadCallBatches(
  calls: CollectedCall[],
  onBatchAccepted?: (ids: string[]) => Promise<void>
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;

  for (let start = 0; start < calls.length; start += BATCH_SIZE) {
    const batch = calls.slice(start, start + BATCH_SIZE);
    let completed = false;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const result = await sendBatch(batch);

        // Mark only server-acknowledged records as synced.
        if (onBatchAccepted) {
          await onBatchAccepted(result.acceptedIds);
        }

        uploaded += result.acceptedIds.length;
        completed = true;
        break;
      } catch (error) {
        console.warn(
          `[Zez] Batch retry ${attempt + 1} failed:`,
          error
        );

        if (attempt < 3) {
          await wait(2 ** attempt * 1000);
        }
      }
    }

    if (!completed) {
      failed += batch.length;

      // Stop here: leave this batch and later records pending
      // for the next background run or manual sync.
      break;
    }
  }

  return { uploaded, failed };
}
