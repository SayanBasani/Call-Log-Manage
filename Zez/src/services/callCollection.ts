import CallLogs from "react-native-call-log";

export type CollectedCall = {
  externalId: string;
  phoneNumber: string;
  name: string;
  type: string;
  timestamp: string;
  duration: number;
  raw: Record<string, unknown>;
};

function asString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeCall(input: Record<string, unknown>): CollectedCall {
  const phoneNumber = asString(
    input.phoneNumber ?? input.phone_number ?? input.number
  );

  const timestamp = asString(
    input.timestamp ?? input.dateTime ?? input.date
  );

  const type = asString(
    input.type ?? input.rawType ?? input.call_type
  );

  const durationValue = Number(input.duration ?? 0);

  const duration = Number.isFinite(durationValue)
    ? Math.max(0, Math.trunc(durationValue))
    : 0;

  const name = asString(
    input.name ?? input.contactName ?? input.contact_name
  );

  // Prefer Android's call-log record ID.
  // The fallback is deterministic for records with the same fields.
  const sourceId = input.id ?? input.callId ?? input.call_id;

  const externalId =
    sourceId !== null &&
    sourceId !== undefined &&
    String(sourceId).length > 0
      ? `android:${String(sourceId)}`
      : `fallback:${JSON.stringify([
          phoneNumber,
          timestamp,
          type,
          duration,
          name,
        ])}`;

  return {
    externalId,
    phoneNumber,
    name,
    type,
    timestamp,
    duration,
    raw: input,
  };
}

/**
 * Reads the currently available Android call history.
 * It does not upload records or delete anything.
 */
export async function collectCallLogs(): Promise<CollectedCall[]> {
  const records = await CallLogs.loadAll();
  return records.map((record) =>
    normalizeCall(
      record as unknown as Record<string, unknown>
    )
  );
}
