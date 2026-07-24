import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import scanRoutes from './routes/scans.js';
import vehicleRoutes from './routes/vehicles.js';
import yardRoutes from './routes/yards.js';
import adminRoutes from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { authenticate } from './middleware/auth.js';

const app = express();

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

// Prevent caching of API routes
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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
app.use('/api/admin', authRouter);
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
app.listen(port, () => {
  console.log(`Stockyard API listening on port ${port}`);
});
