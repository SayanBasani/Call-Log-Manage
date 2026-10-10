import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let database: SQLite.SQLiteDatabase | null = null;

export type SavedCall = {
  id: number;
  fingerprint: string;
  phoneNumber: string;
  name: string;
  type: string;
  timestamp: string;
  duration: number;
  rawJson: string;
  note: string;
  syncStatus: string;
};

type CallRecord = {
  id?: string | number;
  phoneNumber?: string;
  name?: string;
  type?: string;
  rawType?: string;
  timestamp?: string | number;
  dateTime?: string;
  duration?: string | number;
  [key: string]: unknown;
};

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabase({name: 'Zez.db', location: 'default'});
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      phone_number TEXT,
      contact_name TEXT,
      call_type TEXT,
      call_timestamp TEXT,
      duration INTEGER DEFAULT 0,
      raw_json TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  // Safe migration for databases created by earlier Zez builds.
  const [columns] = await db.executeSql('PRAGMA table_info(calls)');
  const names: string[] = [];
  for (let i = 0; i < columns.rows.length; i++) names.push(columns.rows.item(i).name);
  if (!names.includes('note')) {
    await db.executeSql("ALTER TABLE calls ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  if (!names.includes('sync_status')) {
    await db.executeSql("ALTER TABLE calls ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'");
  }

  database = db;
  return db;
}

export async function saveCalls<T extends object>(records: T[]): Promise<number> {
  const db = await getDatabase();
  let savedCount = 0;

  for (const call of records) {
    const record = call as CallRecord;
    const phoneNumber = String(record.phoneNumber ?? record.number ?? '');
    const timestamp = String(record.timestamp ?? record.dateTime ?? '');
    const type = String(record.type ?? record.rawType ?? 'UNKNOWN');
    const durationValue = Number(record.duration ?? 0);
    const duration = Number.isFinite(durationValue) ? durationValue : 0;
    const name = String(record.name ?? '');
    const rawJson = JSON.stringify(call);
    const fingerprint = record.id != null
      ? `android:${String(record.id)}`
      : `fallback:${JSON.stringify([phoneNumber, timestamp, type, duration])}`;

    const result = await db.executeSql(
      `INSERT OR IGNORE INTO calls
       (fingerprint, phone_number, contact_name, call_type, call_timestamp,
        duration, raw_json, note, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', 'pending')`,
      [fingerprint, phoneNumber, name, type, timestamp, duration, rawJson],
    );
    savedCount += result[0].rowsAffected;
  }
  return savedCount;
}

export async function getSavedCalls(): Promise<SavedCall[]> {
  const db = await getDatabase();
  const [result] = await db.executeSql(`
    SELECT id, fingerprint, phone_number AS phoneNumber,
      contact_name AS name, call_type AS type, call_timestamp AS timestamp,
      duration, raw_json AS rawJson, note, sync_status AS syncStatus
    FROM calls ORDER BY CAST(call_timestamp AS INTEGER) DESC, id DESC;
  `);
  const rows: SavedCall[] = [];
  for (let i = 0; i < result.rows.length; i++) rows.push(result.rows.item(i) as SavedCall);
  return rows;
}

export async function getPendingCalls(): Promise<SavedCall[]> {
  const db = await getDatabase();
  const [result] = await db.executeSql(`
    SELECT id, fingerprint, phone_number AS phoneNumber,
      contact_name AS name, call_type AS type, call_timestamp AS timestamp,
      duration, raw_json AS rawJson, note, sync_status AS syncStatus
    FROM calls WHERE sync_status != 'synced'
    ORDER BY id ASC;
  `);
  const rows: SavedCall[] = [];
  for (let i = 0; i < result.rows.length; i++) rows.push(result.rows.item(i) as SavedCall);
  return rows;
}

export async function markCallsSynced(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDatabase();
  for (const id of ids) {
    await db.executeSql("UPDATE calls SET sync_status = 'synced' WHERE id = ?", [id]);
  }
}

export async function updateCallNote(id: number, note: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('UPDATE calls SET note = ? WHERE id = ?', [note, id]);
}

export async function getCallStats(): Promise<{total: number; incoming: number; outgoing: number; missed: number; pending: number}> {
  const db = await getDatabase();
  const [result] = await db.executeSql(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN UPPER(call_type) LIKE '%INCOMING%' OR UPPER(call_type) = '1' THEN 1 ELSE 0 END) AS incoming,
      SUM(CASE WHEN UPPER(call_type) LIKE '%OUTGOING%' OR UPPER(call_type) = '2' THEN 1 ELSE 0 END) AS outgoing,
      SUM(CASE WHEN UPPER(call_type) LIKE '%MISSED%' OR UPPER(call_type) = '3' THEN 1 ELSE 0 END) AS missed,
      SUM(CASE WHEN sync_status != 'synced' THEN 1 ELSE 0 END) AS pending
    FROM calls;
  `);
  const row = result.rows.item(0);
  return {
    total: Number(row.total || 0),
    incoming: Number(row.incoming || 0),
    outgoing: Number(row.outgoing || 0),
    missed: Number(row.missed || 0),
    pending: Number(row.pending || 0),
  };
}
