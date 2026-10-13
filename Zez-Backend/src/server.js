const express = require('express');
const cors = require('cors');
const { initializeDatabase, closeDatabase } = require('./db');
const { normalizeCall, insertBatch, getCalls, countCalls } = require('./calls');
require("dotenv").config();

const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Log every incoming API request in the terminal
app.use((req, res, next) => {
  const startTime = Date.now();

  console.log('\n========== INCOMING REQUEST ==========');
  console.log('Method:', req.method);
  console.log('Route:', req.originalUrl);
  console.log('Query parameters:', req.query);
  console.log('Route parameters:', req.params);

  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', req.body);
  }

  console.log('======================================');

  res.on('finish', () => {
    console.log(
      `[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startTime} ms)`
    );
  });

  next();
});

// modified
app.get('/',function(req,res){
  res.sendFile(path.join(__dirname,'/index.html'));
});

app.get('/health', async (_req, res) => {
  try {
    await require('./db').pool.query('SELECT 1');
    res.json({ success: true, service: 'zez-backend', status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({
      success: false,
      service: 'zez-backend',
      status: 'unavailable'
    });
  }
});

app.get('/api/calls', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const [total, calls] = await Promise.all([
      countCalls(),
      getCalls({ limit, offset })
    ]);

    res.json({
      success: true,
      data: calls,
      pagination: { limit, offset, total, hasMore: offset + calls.length < total }
    });
  } catch (error) {
    console.error('GET /api/calls failed:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Could not retrieve call records.' }
    });
  }
});

app.post('/api/calls', async (req, res) => {
  try {
    const body = req.body;
    let records;

    if (Array.isArray(body)) records = body;
    else if (body && Array.isArray(body.calls)) records = body.calls;
    else if (body && typeof body === 'object') records = [body];
    else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BODY',
          message: 'Send a call object, an array of calls, or { "calls": [...] }.'
        }
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
    const result = await insertBatch(normalized);
    const total = await countCalls();

    res.json({
      success: true,
      received: records.length,
      inserted: result.inserted,
      duplicates: result.duplicates,
      total
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CALL', message: error.message }
      });
    }

    console.error('POST /api/calls failed:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'The server could not save the call records.' }
    });
  }
});

// GET /api/calls/readable
// Retrieve encrypted database records and return decrypted JSON.
// app.get('/api/calls/readable', async (req, res) => {
//   try {
//     const limit = Math.min(
//       200,
//       Math.max(1, Number.parseInt(req.query.limit, 10) || 100)
//     );

//     const offset = Math.max(
//       0,
//       Number.parseInt(req.query.offset, 10) || 0
//     );

//     const [total, calls] = await Promise.all([
//       countCalls(),
//       getCalls({ limit, offset })
//     ]);

//     console.log("total----------------------")
//     console.log(total)
//     console.log(calls)
//     console.log("calls--------------------------")

//     return res.status(200).json({
//       success: true,
//       message: 'Call records retrieved and decrypted successfully.',
//       data: calls,
//       pagination: {
//         limit,
//         offset,
//         total,
//         hasMore: offset + calls.length < total
//       }
//     });
//   } catch (error) {
//     // Keep sensitive details out of the HTTP response.
//     console.error('GET /api/calls/readable failed:', error.message);

//     return res.status(500).json({
//       success: false,
//       error: {
//         code: 'DECRYPTION_OR_DATABASE_ERROR',
//         message: 'Could not retrieve and decrypt call records.'
//       }
//     });
//   }
// });


app.get("/api/calls/readable", async (req, res) => {
  try {
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 100)
    );

    const offset = Math.max(
      0,
      Number.parseInt(req.query.offset, 10) || 0
    );

    const [total, calls] = await Promise.all([
      countCalls(),
      getCalls({ limit, offset }),
    ]);

    return res.json({
      success: true,
      message: "Call records retrieved and decrypted successfully.",
      data: calls,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + calls.length < total,
      },
    });
  } catch (error) {
    console.error("GET /api/calls/readable failed:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "DECRYPTION_OR_DATABASE_ERROR",
        message: "Could not retrieve and decrypt call records.",
      },
    });
  }
});


app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
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

async function startServer() {
  await initializeDatabase();

  const server = app.listen(port, host, () => {
    console.log(`Zez API listening on port ${port}`);
    console.log('Server started at http://localhost:' + port);
    console.log('GET  /health');
    console.log('GET  /api/calls');
    console.log('POST /api/calls');
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async () => {
      try {
        await closeDatabase();
        process.exit(0);
      } catch (error) {
        console.error('Error while closing database:', error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(async (error) => {
  console.error('Could not initialize PostgreSQL:', error);
  process.exit(1);
});
