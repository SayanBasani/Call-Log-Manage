const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./db');
const { normalizeCall, insertBatch, getCalls, countCalls } = require('./calls');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'zez-backend', status: 'ok' });
});

app.get('/api/calls', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const total = countCalls();
  const calls = getCalls({ limit, offset });

  res.json({
    success: true,
    data: calls,
    pagination: { limit, offset, total, hasMore: offset + calls.length < total }
  });
});

app.post('/api/calls', (req, res) => {
  try {
    const body = req.body;
    let records;

    if (Array.isArray(body)) records = body;
    else if (body && Array.isArray(body.calls)) records = body.calls;
    else if (body && typeof body === 'object') records = [body];
    else {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Send a call object, an array of calls, or { "calls": [...] }.' }
      });
    }

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_BATCH', message: 'At least one call record is required.' }
      });
    }

    if (records.length > 500) {
      return res.status(413).json({
        success: false,
        error: { code: 'BATCH_TOO_LARGE', message: 'A batch can contain at most 500 records.' }
      });
    }

    const normalized = records.map(normalizeCall);
    const result = insertBatch(normalized);

    return res.json({
      success: true,
      received: records.length,
      inserted: result.inserted,
      duplicates: result.duplicates,
      total: countCalls()
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CALL', message: error.message }
      });
    }

    console.error('POST /api/calls failed:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'The server could not save the call records.' }
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds the 1 MB limit.' }
    });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' }
    });
  }

  console.error('Unhandled request error:', error);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' }
  });
});

setInterval(() => {
    fetch('http://localhost:3000/health')
        .catch(console.error);
}, 5 * 60 * 1000);

initializeDatabase()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`Zez API listening on http://${host}:${port}`);
      console.log('GET  /health');
      console.log('GET  /api/calls');
      console.log('POST /api/calls');
    });
  })
  .catch(error => {
    console.error('Could not initialize SQLite database:', error);
    process.exit(1);
  });
