import { Router } from 'express';
import { eq, and, desc, ilike } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, scans, yards } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ─── GET / ───────────────────────────────────────────────────────────
// Paginated vehicle list. Stockyard users auto-filtered to their yard.

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    // Stockyard users see only their yard
    if (req.user!.role === 'stockyard' && req.user!.yard_id) {
      conditions.push(eq(vehicleStatus.current_yard_id, req.user!.yard_id));
    } else if (req.query.yard_id) {
      conditions.push(eq(vehicleStatus.current_yard_id, req.query.yard_id as string));
    }

    if (req.query.status) {
      conditions.push(eq(vehicleStatus.current_status, req.query.status as string));
    }

    if (req.query.model) {
      conditions.push(ilike(vehicles.model, `%${req.query.model}%`));
    }

    const rows = await db
      .select({
        id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        vin_valid: vehicles.vin_valid,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        last_changed_at: vehicleStatus.last_changed_at,
      })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(vehicleStatus.last_changed_at))
      .limit(limit)
      .offset(offset);

    res.json({ page, limit, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:vin ───────────────────────────────────────────────────────

router.get('/:vin', async (req, res, next) => {
  try {
    const [vehicle] = await db
      .select({
        id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        vin_valid: vehicles.vin_valid,
        created_at: vehicles.created_at,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        last_in_scan_id: vehicleStatus.last_in_scan_id,
        last_out_scan_id: vehicleStatus.last_out_scan_id,
        last_changed_at: vehicleStatus.last_changed_at,
        override_reason: vehicleStatus.override_reason,
      })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .where(eq(vehicles.vin, req.params.vin.toUpperCase()));

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    // Stockyard users can only see vehicles at their yard
    if (
      req.user!.role === 'stockyard' &&
      vehicle.current_yard_id !== req.user!.yard_id
    ) {
      res.status(403).json({ error: 'Vehicle is not at your yard' });
      return;
    }

    res.json(vehicle);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:vin/history ──────────────────────────────────────────────

router.get('/:vin/history', async (req, res, next) => {
  try {
    const [vehicle] = await db
      .select({ id: vehicles.id, current_yard_id: vehicleStatus.current_yard_id })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .where(eq(vehicles.vin, req.params.vin.toUpperCase()));

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    if (
      req.user!.role === 'stockyard' &&
      vehicle.current_yard_id !== req.user!.yard_id
    ) {
      res.status(403).json({ error: 'Vehicle is not at your yard' });
      return;
    }

    const history = await db
      .select({
        id: scans.id,
        scan_type: scans.scan_type,
        yard_id: scans.yard_id,
        scanned_at: scans.scanned_at,
        status: scans.status,
        out_remark: scans.out_remark,
        damaged: scans.damaged,
        damage_remark: scans.damage_remark,
        latitude: scans.latitude,
        longitude: scans.longitude,
      })
      .from(scans)
      .where(
        req.user!.role === 'stockyard'
          ? and(eq(scans.vehicle_id, vehicle.id), eq(scans.yard_id, req.user!.yard_id!))
          : eq(scans.vehicle_id, vehicle.id)
      )
      .orderBy(desc(scans.scanned_at));

    res.json(history);
  } catch (err) {
    next(err);
  }
});

export default router;
