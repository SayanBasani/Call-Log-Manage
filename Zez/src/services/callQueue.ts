
import * as SQLite from "expo-sqlite";
import type { CollectedCall } from "@/services/callCollection";

const DATABASE_NAME = "zez-call-queue.db";

type QueuedCall = CollectedCall & {
  status: "pending" | "synced";
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS call_queue (
          external_id TEXT PRIMARY KEY NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'synced')),
          discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS call_queue_status_idx
          ON call_queue(status);
      `);

      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

/**
 * Save discovered calls locally.
 *
 * Existing synced records stay synced.
 * Existing pending records stay pending.
 * New records enter the queue as pending.
 */
export async function rememberCollectedCalls(
  calls: CollectedCall[],
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const call of calls) {
      await db.runAsync(
        `INSERT INTO call_queue (external_id, payload_json, status)
         VALUES (?, ?, 'pending')
         ON CONFLICT(external_id) DO UPDATE SET
           payload_json = excluded.payload_json`,
        call.externalId,
        JSON.stringify(call),
      );
    }
  });
}

/** Return pending records in upload-sized batches. */
export async function getPendingCalls(
  limit = 100,
): Promise<CollectedCall[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    payload_json: string;
  }>(
    `SELECT payload_json
     FROM call_queue
     WHERE status = 'pending'
     ORDER BY discovered_at ASC
     LIMIT ?`,
    limit,
  );

  return rows.map((row) => JSON.parse(row.payload_json) as CollectedCall);
}

/**
 * Mark only calls explicitly acknowledged by the server.
 */
export async function markCallsSynced(
  externalIds: string[],
): Promise<void> {
  if (externalIds.length === 0) return;

  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const externalId of externalIds) {
      await db.runAsync(
        `UPDATE call_queue
         SET status = 'synced', synced_at = CURRENT_TIMESTAMP
         WHERE external_id = ?`,
        externalId,
      );
    }
  });
}

/** Optional diagnostic counts for testing. */
export async function getCallQueueCounts(): Promise<{
  pending: number;
  synced: number;
}> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    status: string;
    count: number;
  }>(
    `SELECT status, COUNT(*) AS count
     FROM call_queue
     GROUP BY status`,
  );

  return {
    pending: Number(rows.find((r) => r.status === "pending")?.count ?? 0),
    synced: Number(rows.find((r) => r.status === "synced")?.count ?? 0),
  };
}
