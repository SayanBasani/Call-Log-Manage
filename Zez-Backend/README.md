# Tabls Query

```sql

BEGIN;

-- 1. Drop existing call-log tables first.
DROP TABLE IF EXISTS public.call_logs CASCADE;
DROP TABLE IF EXISTS public.device_call_logs CASCADE;

-- Drop these only if you want a complete reset.
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.callss CASCADE;
DROP TABLE IF EXISTS public.devicess CASCADE;

-- 2. Recreate the device registration table.
DROP TABLE IF EXISTS public.devices CASCADE;

CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    device_name TEXT,
    device_model TEXT,
    manufacturer TEXT,
    brand TEXT,
    platform TEXT NOT NULL DEFAULT 'Android',
    os_version TEXT,
    app_version TEXT,

    sim1_phone_number TEXT,
    sim2_phone_number TEXT,
    sim1_carrier TEXT,
    sim2_carrier TEXT,
    sim1_country_iso TEXT,
    sim2_country_iso TEXT,
    primary_phone_number TEXT,

    token_hash TEXT UNIQUE NOT NULL,

    device_details JSONB NOT NULL DEFAULT '{}'::JSONB,

    registration_status TEXT NOT NULL DEFAULT 'active'
        CHECK (registration_status IN ('active', 'revoked')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX devices_primary_phone_number_idx
    ON public.devices (primary_phone_number);

CREATE INDEX devices_created_at_idx
    ON public.devices (created_at);

-- 3. Recreate the call-log table.
CREATE TABLE public.call_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    device_id UUID NOT NULL
        REFERENCES public.devices(id)
        ON DELETE CASCADE,

    external_id_hash TEXT NOT NULL,
    call_timestamp TIMESTAMPTZ,
    encrypted_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT call_logs_device_external_id_unique
        UNIQUE (device_id, external_id_hash)
);

CREATE INDEX call_logs_device_timestamp_idx
    ON public.call_logs (device_id, call_timestamp DESC);

CREATE INDEX call_logs_created_at_idx
    ON public.call_logs (created_at DESC);

COMMIT;

```

# Zez Backend API (sql.js edition)

Uses Node.js, Express, and SQLite through `sql.js` (WebAssembly), avoiding native Node addons.

## Install / run on Windows PowerShell

```powershell
npm install
npm run dev
```
## Routes

- `GET /health`
- `GET /api/calls?limit=100&offset=0`
- `POST /api/calls`

POST accepts a single object, an array, or `{ "calls": [...] }`. It returns `received`, `inserted`, `duplicates`, and `total`.

## Test

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod "http://localhost:3000/api/calls?limit=10"
```

```powershell
$body = @{
  calls = @(
    @{
      id = "test-call-001"
      phoneNumber = "5550100"
      name = "Test Contact"
      type = "OUTGOING"
      timestamp = "2026-10-10T10:00:00.000Z"
      duration = 35
    }
  )
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri "http://localhost:3000/api/calls" -Method Post -ContentType "application/json" -Body $body
```

Repeat the POST: the second result should show `inserted: 0`, `duplicates: 1`.

The database is stored at `data/zez.sqlite` by default. `sql.js` loads it into memory and writes the exported database file after each batch. For production/high concurrency, prefer a server SQLite driver with durable transactions or a database server.

This is an unauthenticated prototype. Do not expose real call records publicly until HTTPS and access controls are in place.


# Generate 64 digit key
```js
const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('hex');
console.log(key);
```

# Generate ENCRYPTION_KEY
```js
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```