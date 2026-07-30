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
import analyticsRoutes from './routes/analytics.js';
import auditLogRoutes from './routes/auditLogs.js';
import { authRouter } from './routes/auth.js';
import { authenticate } from './middleware/auth.js';
import { initSocket } from './lib/socket.js';
import { checkDwellAlerts } from './lib/dwellCheck.js';
import { ensureBuckets } from './lib/supabase.js';
import uploadRoutes from './routes/upload.js';
import pushRoutes from './routes/pushSubscriptions.js';

const app = express();
const httpServer = createServer(app);

// §1.1 — Initialize Socket.io
initSocket(httpServer);

// §1.2 — Response compression (60-80% smaller payloads)
app.use(compression());

app.use(cors());
app.use(express.json({ limit: '5mb' })); // bulk-sync payloads can be large

// Request logging
app.use(morgan('tiny'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// §1.6 — Per-endpoint cache control
// Stats/aggregate endpoints get short-lived caching; mutation endpoints get no-store
app.use('/api', (req, res, next) => {
  // Dashboard and stats endpoints can be cached briefly
  const isStatsEndpoint =
    req.path === '/admin/dashboard' ||
    req.path.endsWith('/stats');

  if (isStatsEndpoint && req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Health check — no auth
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin/audit-logs', auditLogRoutes);
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
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Stockyard API listening on port ${port}`);

  ensureBuckets();

  // F6 — Run dwell check every 6 hours
  checkDwellAlerts().catch(console.error);
  setInterval(() => checkDwellAlerts().catch(console.error), 6 * 60 * 60 * 1000);
});
