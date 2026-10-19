import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.EXPO_PUBLIC_DATABASE_URL);

export const sql = neon(DATABASE_URL);

export async function testDatabase() {
  const result = await sql`SELECT NOW() AS current_time`;
  return result;
}


export async function insertTestRecord() {
  const result = await sql`
    INSERT INTO calls (
      external_id_hash,
      call_timestamp,
      encrypted_payload
    )
    VALUES (
      ${"test-" + Date.now()},
      ${new Date().toISOString()},
      ${JSON.stringify({ test: true, message: "Zez connection test" })}
    )
    RETURNING id, call_timestamp
  `;

  return result;
}

export async function fetchTestRecords() {
  const result = await sql`
    SELECT id, call_timestamp, created_at
    FROM calls
    ORDER BY id DESC
    LIMIT 10
  `;

  return result;
}