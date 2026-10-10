# Zez Backend API (sql.js edition)

Uses Node.js, Express, and SQLite through `sql.js` (WebAssembly), avoiding native Node addons.

## Install / run on Windows PowerShell

```powershell
npm install
npm run dev
```

Default base URL: `http://localhost:3000`.

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
