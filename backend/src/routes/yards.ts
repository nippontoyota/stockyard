import { Router } from 'express';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { yards, vehicles, vehicleStatus } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ─── GET / ───────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    if (req.user!.role === 'stockyard') {
      if (!req.user!.yard_id) {
        res.status(400).json({ error: 'User is not assigned to a yard' });
        return;
      }

      const rows = await db
        .select()
        .from(yards)
        .where(and(eq(yards.active, true), eq(yards.id, req.user!.yard_id)))
        .orderBy(yards.code, yards.name);

      res.json(rows);
      return;
    }

    const rows = await db
      .select()
      .from(yards)
      .where(eq(yards.active, true))
      .orderBy(yards.code, yards.name);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/stock ──────────────────────────────────────────────────

router.get('/:id/stock', async (req, res, next) => {
  try {
    // Stockyard users can only see their own yard
    if (req.user!.role === 'stockyard' && req.user!.yard_id !== req.params.id) {
      res.status(403).json({ error: 'Access denied to this yard' });
      return;
    }

    const rows = await db
      .select({
        id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        last_changed_at: vehicleStatus.last_changed_at,
      })
      .from(vehicleStatus)
      .innerJoin(vehicles, eq(vehicleStatus.vehicle_id, vehicles.id))
      .where(
        and(
          eq(vehicleStatus.current_yard_id, req.params.id),
          eq(vehicleStatus.current_status, 'in'),
        ),
      )
      .orderBy(vehicleStatus.last_changed_at);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/utilization ────────────────────────────────────────────

router.get('/:id/utilization', async (req, res, next) => {
  try {
    if (req.user!.role === 'stockyard' && req.user!.yard_id !== req.params.id) {
      res.status(403).json({ error: 'Access denied to this yard' });
      return;
    }

    const [yard] = await db
      .select({ capacity: yards.capacity, name: yards.name, code: yards.code })
      .from(yards)
      .where(eq(yards.id, req.params.id));

    if (!yard) {
      res.status(404).json({ error: 'Yard not found' });
      return;
    }

    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(vehicleStatus)
      .where(
        and(
          eq(vehicleStatus.current_yard_id, req.params.id),
          eq(vehicleStatus.current_status, 'in'),
        ),
      );

    const current = Number(currentCount);
    res.json({
      code: yard.code,
      name: yard.name,
      capacity: yard.capacity,
      current_count: current,
      utilization_pct: yard.capacity > 0 ? Math.round((current / yard.capacity) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
