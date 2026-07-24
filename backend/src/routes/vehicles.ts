import { Router } from 'express';
import { eq, and, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, scans, yards } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';

import { detectModel } from '../lib/vin.js';

const router = Router();
router.use(authenticate);

// ─── GET / ───────────────────────────────────────────────────────────
// Paginated vehicle list. Stockyard users auto-filtered to their yard.

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 50));
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

    const rawRows = await db
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
      .orderBy(sql`${vehicleStatus.last_changed_at} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset);

    const rows = rawRows.map((v) => ({
      ...v,
      model: v.model && v.model !== 'Unknown' && v.model !== 'Toyota Vehicle' ? v.model : detectModel(v.vin),
    }));

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

// ─── POST /transit-list ──────────────────────────────────────────────

router.post('/transit-list', async (req, res, next) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can upload transit lists.' });
      return;
    }

        const transitVehicles = req.body.vehicles;
    if (!Array.isArray(transitVehicles) || transitVehicles.length === 0) {
      res.status(400).json({ error: 'Invalid or empty transit list.' });
      return;
    }

    let processedCount = 0;
    let skippedCount = 0;

    await db.transaction(async (tx) => {
      for (const tv of transitVehicles) {
        if (!tv.vin || !tv.yard_id) continue;

        // Ensure vehicle exists (upsert)
        const [upserted] = await tx
          .insert(vehicles)
          .values({
            vin: tv.vin,
            model: tv.model || 'Toyota Vehicle',
            vin_valid: true,
          })
          .onConflictDoUpdate({
            target: vehicles.vin,
            set: { model: tv.model || 'Toyota Vehicle' },
          })
          .returning({ id: vehicles.id });
        
        let vehicleId = upserted.id;

        // Fetch current status
        const [status] = await tx
          .select({ current_status: vehicleStatus.current_status })
          .from(vehicleStatus)
          .where(eq(vehicleStatus.vehicle_id, vehicleId));

        // Rule: Do not overwrite if vehicle is already "in" stockyard
        if (status && status.current_status === 'in') {
          skippedCount++;
          continue;
        }

        // Insert or update to 'transit'
        await tx
          .insert(vehicleStatus)
          .values({
            vehicle_id: vehicleId,
            current_status: 'transit',
            current_yard_id: tv.yard_id,
          })
          .onConflictDoUpdate({
            target: vehicleStatus.vehicle_id,
            set: {
              current_status: 'transit',
              current_yard_id: tv.yard_id,
              last_changed_at: new Date(),
            },
          });
        processedCount++;
      }
    });

    res.json({ message: `Transit list processed. Added: ${processedCount}, Skipped (already IN): ${skippedCount}` });
  } catch (err) {
    next(err);
  }
});

export default router;
