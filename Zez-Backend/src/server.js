const express = require('express');
const cors = require('cors');
const { initializeDatabase, closeDatabase } = require('./db');
require("dotenv").config();
const deviceRouter = require('./routes/devices');
const crypto = require("node:crypto");
const { deviceAuth } = require("./middleware/deviceAuth");
const callSyncRouter = require("./routes/callSync");
const callReadRouter = require("./routes/callRead");
const adminCallsRouter = require("./routes/adminCalls");
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Help to log the details of the requests
app.use((req, res, next) => {
  // Device/client information
  const device = req.get('x-device-id') || 'Unknown';
  const userAgent = req.get('user-agent') || 'Unknown';

  // Log only the useful request details
  console.log('\n========== API REQUEST ==========');
  console.log('Route:', req.originalUrl);
  console.log('Method:', req.method);
  console.log('Device:', device);
  console.log('Client:', userAgent);
  
  if (Object.keys(req.query).length > 0) {
    console.log('Requested data:', req.query);
  }

  if (req.params && Object.keys(req.params).length > 0) {
    console.log('Route params:', req.params);
  }

  next();
});



// modified
app.get('/',function(req,res){
  res.sendFile(path.join(__dirname,'/index.html'));
});

app.get("/admin", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "admin.html"));
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

app.use('/api/devices',deviceRouter);
app.use("/api/calls", callSyncRouter);
app.use("/api/admin", adminCallsRouter);
app.use("/api/calls/read", callReadRouter);

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



app.use((err, req, res, next) => {
  console.error("[API Error]", {
    method: req.method,
    path: req.path,
    message: err.message,
    code: err.code,
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    error: "Internal server error",
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