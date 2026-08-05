import { Router } from 'express';
import { eq, and, desc, ilike, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, scans, devices, branchYards, flags } from '../db/schema.js';
import { authenticate, type AuthUser } from '../middleware/auth.js';
import { emitScanEvent } from '../lib/socket.js';
import { resolveBranchId } from '../lib/branch.js';
import { DRIVE_TYPE_VALUES, isDriveType } from '../shared/driveTypes.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const driveTypeSchema = z
  .string()
  .trim()
  .refine((value) => isDriveType(value), {
    message: `drive_type must be one of: ${DRIVE_TYPE_VALUES.join(', ')}`,
  });



async function findOrCreateDevice(fingerprint: string): Promise<string> {
  const result = await db
    .insert(devices)
    .values({ device_fingerprint: fingerprint })
    .onConflictDoUpdate({
      target: devices.device_fingerprint,
      set: { last_seen_at: new Date() },
    })
    .returning({ id: devices.id });
  return result[0].id;
}

async function incomingYardIdsForUser(user: AuthUser | undefined): Promise<string[] | 'all' | null> {
  if (!user) return null;
  if (user.role === 'admin') return 'all';
  if (user.role === 'stockyard' && user.yard_id) return [user.yard_id];
  if (user.role === 'delivery_incharge') {
    const branchId = await resolveBranchId(user);
    if (!branchId) return [];
    const rows = await db
      .select({ yard_id: branchYards.yard_id })
      .from(branchYards)
      .where(eq(branchYards.branch_id, branchId));
    return rows.map((r) => r.yard_id);
  }
  return null;
}

// ─── GET /incoming ───────────────────────────────────────────────────
// Transit vehicles headed to this user's yard / branch yards.

router.get('/incoming', async (req, res, next) => {
  try {
    const yardScope = await incomingYardIdsForUser(req.user);
    if (yardScope === null) {
      res.status(403).json({ error: 'Not allowed to view incoming vehicles' });
      return;
    }
    if (Array.isArray(yardScope) && yardScope.length === 0) {
      res.json({ data: [] });
      return;
    }

    const conditions = [eq(vehicleStatus.current_status, 'transit')];
    if (yardScope !== 'all') {
      conditions.push(inArray(vehicleStatus.current_yard_id, yardScope));
    }

    const rows = await db
      .select({
        id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        drive_type: vehicles.drive_type,
        vin_valid: vehicles.vin_valid,
        entry_method: vehicles.entry_method,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        last_changed_at: vehicleStatus.last_changed_at,
        key_no: vehicleStatus.key_no,
        out_remark: scans.out_remark,
        transfer_requested_by: scans.transfer_requested_by,
        source_yard_id: scans.yard_id,
      })
      .from(vehicles)
      .innerJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .leftJoin(scans, eq(vehicleStatus.last_out_scan_id, scans.id))
      .where(and(...conditions))
      .orderBy(desc(vehicleStatus.last_changed_at));

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

const receiveBody = z.object({
  device_fingerprint: z.string().min(1).optional(),
  key_no: z.string().optional(),
  drive_type: driveTypeSchema.optional(),
});

// ─── POST /receive/:vin ──────────────────────────────────────────────
// Mark a transit vehicle as IN at its destination yard (list receive).

router.post('/receive/:vin', async (req, res, next) => {
  try {
    const body = receiveBody.parse(req.body || {});
    const vin = req.params.vin.toUpperCase().trim();
    const yardScope = await incomingYardIdsForUser(req.user);
    if (yardScope === null || (Array.isArray(yardScope) && yardScope.length === 0)) {
      res.status(403).json({ error: 'Not allowed to receive vehicles' });
      return;
    }

    const [row] = await db
      .select({
        id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
      })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .where(eq(vehicles.vin, vin));

    if (!row) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    if (row.current_status === 'in' && row.current_yard_id) {
      const allowed =
        yardScope === 'all' || (row.current_yard_id && yardScope.includes(row.current_yard_id));
      if (allowed) {
        res.json({ status: 'already_processed', vin: row.vin, yard_id: row.current_yard_id });
        return;
      }
    }

    if (row.current_status !== 'transit' || !row.current_yard_id) {
      res.status(400).json({ error: 'Vehicle is not in transit' });
      return;
    }

    if (yardScope !== 'all' && !yardScope.includes(row.current_yard_id)) {
      res.status(403).json({ error: 'Vehicle is not incoming to your yard' });
      return;
    }

    const destYardId = row.current_yard_id;
    const fingerprint =
      body.device_fingerprint ||
      `receive-${req.user!.id || req.user!.role}-${destYardId}`;
    const deviceId = await findOrCreateDevice(fingerprint);
    const scannedAt = new Date();
    const clientScanId = `receive-${vin}-${scannedAt.getTime()}`;

    const result = await db.transaction(async (tx) => {
      if (body.drive_type) {
        await tx
          .update(vehicles)
          .set({ drive_type: body.drive_type, updated_at: new Date(), variant: null, colour: null })
          .where(eq(vehicles.id, row.id));
      }

      const [scan] = await tx
        .insert(scans)
        .values({
          client_scan_id: clientScanId,
          vehicle_id: row.id,
          vin_raw: vin,
          scan_type: 'in',
          yard_id: destYardId,
          device_id: deviceId,
          scanned_at: scannedAt,
          key_no: body.key_no,
          status: 'accepted',
        })
        .returning();

      await tx
        .insert(vehicleStatus)
        .values({
          vehicle_id: row.id,
          current_status: 'in',
          current_yard_id: destYardId,
          last_in_scan_id: scan.id,
          last_changed_at: scannedAt,
          key_no: body.key_no,
        })
        .onConflictDoUpdate({
          target: vehicleStatus.vehicle_id,
          set: {
            current_status: 'in',
            current_yard_id: destYardId,
            last_in_scan_id: scan.id,
            last_changed_at: scannedAt,
            ...(body.key_no ? { key_no: body.key_no } : {}),
            override_reason: null,
          },
        });

      return scan;
    });

    emitScanEvent({
      type: 'in',
      vin,
      model: row.model,
      yardId: destYardId,
      timestamp: scannedAt.toISOString(),
      status: 'accepted',
    });

    res.status(201).json({
      status: 'accepted',
      scan_id: result.id,
      vin,
      yard_id: destYardId,
    });
  } catch (err) {
    next(err);
  }
});

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

    const rows = await db
      .select({
        id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        drive_type: vehicles.drive_type,
        vin_valid: vehicles.vin_valid,
        entry_method: vehicles.entry_method,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        last_changed_at: vehicleStatus.last_changed_at,
        key_no: vehicleStatus.key_no,
        out_remark: scans.out_remark,
      })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .leftJoin(scans, eq(vehicleStatus.last_out_scan_id, scans.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${vehicleStatus.last_changed_at} DESC NULLS LAST`)
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
        drive_type: vehicles.drive_type,
        vin_valid: vehicles.vin_valid,
        entry_method: vehicles.entry_method,
        created_at: vehicles.created_at,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        last_in_scan_id: vehicleStatus.last_in_scan_id,
        last_out_scan_id: vehicleStatus.last_out_scan_id,
        last_changed_at: vehicleStatus.last_changed_at,
        key_no: vehicleStatus.key_no,
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
        key_no: scans.key_no,
        damaged: scans.damaged,
        damage_remark: scans.damage_remark,
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
            model: tv.model || null,
            vin_valid: true,
            variant: null,
            colour: null,
          })
          .onConflictDoUpdate({
            target: vehicles.vin,
            set: {
              ...(tv.model ? { model: tv.model } : {}),
              variant: null,
              colour: null,
            },
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

// ─── PATCH /deliver ──────────────────────────────────────────────────
// Item 3: Backend sync for delivered vehicles (was client-side only)

router.patch('/deliver', async (req, res, next) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can mark vehicles as delivered' });
      return;
    }

    const { vins } = req.body;
    if (!Array.isArray(vins) || vins.length === 0) {
      res.status(400).json({ error: 'Provide a non-empty array of VINs' });
      return;
    }

    let updated = 0;
    let notFound = 0;

    for (const vinRaw of vins) {
      const vin = String(vinRaw).toUpperCase().trim();
      const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.vin, vin));
      if (!vehicle) { notFound++; continue; }

      await db
        .insert(vehicleStatus)
        .values({ vehicle_id: vehicle.id, current_status: 'out', last_changed_at: new Date() })
        .onConflictDoUpdate({
          target: vehicleStatus.vehicle_id,
          set: { current_status: 'out', last_changed_at: new Date(), override_reason: 'delivered' },
        });

      await db
        .update(flags)
        .set({ resolved: true, resolved_by: req.user!.id, resolved_at: new Date() })
        .where(and(eq(flags.vehicle_id, vehicle.id), eq(flags.resolved, false)));
      updated++;
    }

    res.json({ updated, notFound, total: vins.length });
  } catch (err) { next(err); }
});

export default router;
