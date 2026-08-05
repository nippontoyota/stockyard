import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { ZodError } from 'zod';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import scanRoutes from './routes/scans.js';
import vehicleRoutes from './routes/vehicles.js';
import yardRoutes from './routes/yards.js';
import adminRoutes from './routes/admin.js';
import adminBranchesRoutes from './routes/adminBranches.js';
import branchRoutes from './routes/branches.js';
import requisitionRoutes from './routes/requisitions.js';
import notificationRoutes from './routes/notifications.js';
import exportRoutes from './routes/export.js';
import { authRouter } from './routes/auth.js';
import { authenticate } from './middleware/auth.js';
import { initSocket } from './lib/socket.js';
import { checkDwellAlerts } from './lib/dwellCheck.js';
import {
  startNipponstockLocationSync,
  syncNipponstockLocations,
} from './lib/syncNipponstockLocations.js';
import { ensureBuckets } from './lib/supabase.js';
import uploadRoutes from './routes/upload.js';
import pushRoutes from './routes/pushSubscriptions.js';
import { db, pingDatabase } from './db/client.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const app = express();
const httpServer = createServer(app);

// Render terminates TLS and sets X-Forwarded-For; required for rate-limit IP keys.
app.set('trust proxy', 1);

// §1.1 — Initialize Socket.io
initSocket(httpServer);

// §1.2 — Response compression (60-80% smaller payloads)
app.use(compression());

app.use(cors());
app.use(express.json({ limit: '5mb' })); // bulk-sync payloads can be large

// Request logging
app.use(morgan('tiny'));

// Rate limiting — office NAT shares one IP across many phones; keep headroom.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// §1.6 — Per-endpoint cache control
// Stats/aggregate endpoints get short-lived caching; mutation endpoints get no-store
app.use('/api', (req, res, next) => {
  // Dashboard and stats endpoints can be cached briefly
  const isStatsEndpoint = req.path.endsWith('/stats');

  if (isStatsEndpoint && req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Liveness — process up. Render healthCheckPath should point here (/health).
// Do NOT use /ready as the platform health check: a timed-out shared-pool
// ping can leave the query holding a connection and wedge the whole API.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness — DB reachable via a one-shot connection (smoke / ops only).
app.get('/ready', async (_req, res) => {
  try {
    const dbMs = await pingDatabase(5000);
    res.json({ status: 'ready', dbMs });
  } catch (err) {
    console.error('Readiness check failed:', err);
    res.status(503).json({ status: 'not_ready', error: 'database unavailable' });
  }
});

function locationSyncSecretOk(req: express.Request): boolean {
  const secret = process.env.LOCATION_SYNC_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const token = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return token.length === expected.length && crypto.timingSafeEqual(token, expected);
}

// Manual / cron trigger for nipponstock location push (shared secret, not user JWT).
app.post('/api/internal/sync-nipponstock-locations', async (req, res) => {
  if (!process.env.NIPPONSTOCK_API_URL || !process.env.LOCATION_SYNC_SECRET) {
    res.status(503).json({ error: 'NIPPONSTOCK_API_URL / LOCATION_SYNC_SECRET not configured' });
    return;
  }
  if (!locationSyncSecretOk(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const result = await syncNipponstockLocations();
    if (!result) {
      res.status(409).json({ error: 'Sync already running or not configured' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('[nipponstock-sync] trigger failed:', err);
    res.status(502).json({
      error: 'Sync failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// Auth check — returns decoded user info
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json(req.user);
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/scans', scanRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/yards', yardRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/admin', authRouter);
app.use('/api/admin/branches', adminBranchesRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 3000;

async function start() {
  // Ensure new columns exist before serving traffic (additive NULL only — no backfill)
  await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS entry_method text`);
  await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS entry_method text`);

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Stockyard API listening on port ${port}`);

    ensureBuckets();

    db.execute(
      sql`ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS destination_yard_id text REFERENCES yards(id)`,
    ).catch((err) => console.error('Failed to ensure destination_yard_id column:', err));

    // Run legacy variant/colour migration exactly once at startup
    db.execute(
      sql`UPDATE vehicles SET variant = NULL, colour = NULL WHERE variant IS NOT NULL OR colour IS NOT NULL`
    ).catch((err) => console.error('Failed to clear legacy variant/colour:', err));

    // F6 — Dwell check: delay after boot so login traffic isn't competing with scan work.
    setTimeout(() => {
      checkDwellAlerts().catch(console.error);
      setInterval(() => checkDwellAlerts().catch(console.error), 6 * 60 * 60 * 1000);
    }, 2 * 60 * 1000);

    startNipponstockLocationSync();
  });
}

start().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
