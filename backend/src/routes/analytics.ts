import { Router } from 'express';
import { eq, and, gte, lte, count, sql, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scans, vehicles, vehicleStatus, flags } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin'));

/**
 * F7 — Analytics v2. Trend data, throughput, damage rates.
 */

// ─── GET /trends ────────────────────────────────────────────────────
// Daily IN/OUT counts for a date range
router.get('/trends', async (req, res, next) => {
  try {
    const from = req.query.from as string || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to as string || new Date().toISOString().slice(0, 10);

    const trends = await db.execute(sql`
      SELECT
        DATE(scanned_at) AS date,
        scan_type,
        COUNT(*) AS count
      FROM scans
      WHERE scanned_at >= ${from}::date
        AND scanned_at < (${to}::date + INTERVAL '1 day')
        AND status = 'accepted'
      GROUP BY DATE(scanned_at), scan_type
      ORDER BY date
    `);

    res.json({ from, to, data: trends });
  } catch (err) { next(err); }
});

// ─── GET /throughput ────────────────────────────────────────────────
// Vehicles processed per yard per day (last 30 days)
router.get('/throughput', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));

    const data = await db.execute(sql`
      SELECT
        yard_id,
        DATE(scanned_at) AS date,
        COUNT(*) AS total_scans,
        COUNT(*) FILTER (WHERE scan_type = 'in') AS in_count,
        COUNT(*) FILTER (WHERE scan_type = 'out') AS out_count
      FROM scans
      WHERE scanned_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
        AND status = 'accepted'
      GROUP BY yard_id, DATE(scanned_at)
      ORDER BY date DESC, yard_id
    `);

    res.json({ days, data });
  } catch (err) { next(err); }
});

// ─── GET /damage-rate ───────────────────────────────────────────────
router.get('/damage-rate', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));

    const data = await db.execute(sql`
      SELECT
        yard_id,
        COUNT(*) AS total_out,
        COUNT(*) FILTER (WHERE damaged = true) AS damaged_count,
        ROUND(
          (COUNT(*) FILTER (WHERE damaged = true)::numeric / NULLIF(COUNT(*), 0)) * 100, 1
        ) AS damage_pct
      FROM scans
      WHERE scan_type = 'out'
        AND scanned_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
        AND status = 'accepted'
      GROUP BY yard_id
      ORDER BY damage_pct DESC
    `);

    res.json({ days, data });
  } catch (err) { next(err); }
});

// ─── GET /model-dwell ───────────────────────────────────────────────
// Which models move fastest / sit longest
router.get('/model-dwell', async (req, res, next) => {
  try {
    const data = await db.execute(sql`
      SELECT
        v.model,
        COUNT(*) AS vehicle_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - vs.last_changed_at)) / 3600)::numeric, 1) AS avg_dwell_hours,
        ROUND(MIN(EXTRACT(EPOCH FROM (NOW() - vs.last_changed_at)) / 3600)::numeric, 1) AS min_dwell_hours,
        ROUND(MAX(EXTRACT(EPOCH FROM (NOW() - vs.last_changed_at)) / 3600)::numeric, 1) AS max_dwell_hours
      FROM vehicle_status vs
      JOIN vehicles v ON v.id = vs.vehicle_id
      WHERE vs.current_status = 'in'
      GROUP BY v.model
      ORDER BY avg_dwell_hours DESC
    `);

    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
