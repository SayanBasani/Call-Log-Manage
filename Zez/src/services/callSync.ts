
import { PermissionsAndroid, Platform } from "react-native";

import { collectCallLogs } from "@/services/callCollection";
import { getDeviceDetails } from "@/services/deviceDetails";
import { getDeviceToken } from "@/services/deviceRegistration";
import {
  getPendingCalls,
  markCallsSynced,
  rememberCollectedCalls,
  getCallQueueCounts,
} from "@/services/callQueue";

import type { CollectedCall } from "@/services/callCollection";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");

const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

let syncPromise: Promise<SyncResult> | null = null;

export type SyncResult = {
  collected: number;
  pendingBeforeUpload: number;
  inserted: number;
  duplicates: number;
  batches: number;
  failed: number;
};

type ServerBatchResponse = {
  success: boolean;
  received: number;
  inserted: number;
  duplicates: number;
  acceptedIds: string[];
};

type AuthErrorBody = {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(
  token: string,
  calls: CollectedCall[],
  deviceDetails?: Record<string, unknown>,
): Promise<ServerBatchResponse> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error(
      "Device token is missing. Check device registration before syncing.",
    );
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      // Construct headers explicitly so the Bearer token cannot be
      // accidentally omitted by another request configuration.
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizedToken}`,
      };

      const response = await fetch(`${API_URL}/api/calls/sync`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          calls,
          ...(deviceDetails ? { deviceDetails } : {}),
        }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as AuthErrorBody | null;

        const code = body?.error?.code ?? "UNKNOWN_AUTH_ERROR";
        const message = body?.error?.message;

        // Never log the token or the Authorization header.
        console.error("[ZEZ] Authentication rejected:", {
          status: response.status,
          code,
          message,
          endpoint: "/api/calls/sync",
          authorizationHeaderConfigured: Boolean(normalizedToken),
        });

        throw new Error(
          `Device authentication failed: HTTP ${response.status} (${code})`,
        );
      }

      if (!response.ok) {
        const errorBody = await response
          .clone()
          .text()
          .catch(() => "");

        throw new Error(
          `Upload failed: HTTP ${response.status}` +
            (errorBody ? `: ${errorBody.slice(0, 200)}` : ""),
        );
      }

      const result =
        (await response.json()) as ServerBatchResponse;

      if (
        !result.success ||
        result.received !== calls.length ||
        !Number.isInteger(result.inserted) ||
        !Number.isInteger(result.duplicates) ||
        result.inserted < 0 ||
        result.duplicates < 0 ||
        result.inserted + result.duplicates !== result.received ||
        !Array.isArray(result.acceptedIds)
      ) {
        throw new Error("Invalid batch acknowledgement from server.");
      }

      // Verify every submitted call was acknowledged before marking it
      // synced in the local queue.
      const accepted = new Set(result.acceptedIds);

      if (
        calls.some((call) => !accepted.has(call.externalId)) ||
        accepted.size !== calls.length
      ) {
        throw new Error(
          "Server did not acknowledge every call in the batch.",
        );
      }

      return result;
    } catch (error) {
      lastError = error;

      // Authentication errors will not be fixed by retrying the same
      // token, so stop immediately and preserve the local queue.
      if (
        error instanceof Error &&
        error.message.startsWith("Device authentication failed:")
      ) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(1000 * 2 ** attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Upload failed after retries.");
}

async function performCallLogSync(): Promise<SyncResult> {
  if (Platform.OS !== "android") {
    throw new Error("Call-log collection is supported on Android only.");
  }

  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured.");
  }

  const permission = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
  );

  if (!permission) {
    throw new Error(
      "Call-log permission is missing. Open Zez and grant permission first.",
    );
  }

  // Obtain the device token once per sync and reuse it for all batches.
  const token = await getDeviceToken();

  if (typeof token !== "string" || !token.trim()) {
    throw new Error(
      "Device registration returned no usable token. Calls remain local.",
    );
  }

  const calls = await collectCallLogs();

  // Persist newly discovered calls before attempting network uploads.
  await rememberCollectedCalls(calls);

  const counts = await getCallQueueCounts();

  const result: SyncResult = {
    collected: calls.length,
    pendingBeforeUpload: counts.pending,
    inserted: 0,
    duplicates: 0,
    batches: 0,
    failed: 0,
  };

  const deviceDetails = await getDeviceDetails();
  let firstBatch = true;

  while (true) {
    const batch = await getPendingCalls(BATCH_SIZE);

    if (batch.length === 0) {
      break;
    }

    try {
      const response = await requestWithRetry(
        token,
        batch,
        firstBatch ? deviceDetails : undefined,
      );

      // Only mark calls synced after the server acknowledges them.
      await markCallsSynced(response.acceptedIds);

      result.inserted += response.inserted;
      result.duplicates += response.duplicates;
      result.batches += 1;

      firstBatch = false;
    } catch (error) {
      result.failed += batch.length;

      console.error(
        "[ZEZ] Batch failed; calls remain pending for retry:",
        error,
      );

      // Do not repeatedly submit the same failing batch.
      break;
    }
  }

  // An empty batch can still refresh backend device metadata when there
  // are no pending calls. Authentication errors are reported to the caller.
  if (result.batches === 0 && counts.pending === 0) {
    await requestWithRetry(token, [], deviceDetails);
  }

  const queueAfterSync = await getCallQueueCounts();

  console.log("[ZEZ] Call-log sync completed:", {
    ...result,
    queueAfterSync,
  });

  return result;
}

/** Prevent overlapping syncs within this JavaScript process. */
export function syncCallLogs(): Promise<SyncResult> {
  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = performCallLogSync().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}
