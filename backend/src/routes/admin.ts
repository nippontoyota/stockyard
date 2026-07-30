import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, count, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, scans, yards, flags } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { isValidVin, detectModel } from '../lib/vin.js';

const router = Router();
router.use(authenticate);
router.use((req, res, next) => {
  if (req.path === '/flags' && req.method === 'GET') return next();
  return requireRole('admin')(req, res, next);
});

// ─── GET /dashboard ──────────────────────────────────────────────────

router.get('/dashboard', async (req, res, next) => {
  try {
    // Total IN count
    const [{ value: totalIn }] = await db
      .select({ value: count() })
      .from(vehicleStatus)
      .where(eq(vehicleStatus.current_status, 'in'));

    // Per-yard breakdown
    const yardBreakdown = await db
      .select({
        yard_id: yards.id,
        code: yards.code,
        name: yards.name,
        capacity: yards.capacity,
        current_count: count(vehicleStatus.vehicle_id),
      })
      .from(yards)
      .leftJoin(
        vehicleStatus,
        and(
          eq(vehicleStatus.current_yard_id, yards.id),
          eq(vehicleStatus.current_status, 'in'),
        ),
      )
      .where(eq(yards.active, true))
      .groupBy(yards.id, yards.code, yards.name, yards.capacity)
      .orderBy(yards.code);

    const yardsData = yardBreakdown.map((y) => ({
      ...y,
      current_count: Number(y.current_count),
      utilization_pct: y.capacity > 0 ? Math.round((Number(y.current_count) / y.capacity) * 100) : 0,
    }));

    // Model split
    const modelSplit = await db
      .select({
        model: vehicles.model,
        count: count(),
      })
      .from(vehicleStatus)
      .innerJoin(vehicles, eq(vehicleStatus.vehicle_id, vehicles.id))
      .where(eq(vehicleStatus.current_status, 'in'))
      .groupBy(vehicles.model)
      .orderBy(desc(count()));

    // Average dwell time (vehicles currently IN)
    // ponytail: raw SQL for interval arithmetic — Drizzle's builder is clunkier here
    const dwellByYard = await db.execute(sql`
      SELECT
        y.id AS yard_id,
        y.code,
        y.name,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - vs.last_changed_at)) / 3600)::numeric, 1) AS avg_dwell_hours
      FROM vehicle_status vs
      JOIN yards y ON y.id = vs.current_yard_id
      WHERE vs.current_status = 'in'
      GROUP BY y.id, y.code, y.name
      ORDER BY y.code
    `);

    const dwellByModel = await db.execute(sql`
      SELECT
        v.model,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - vs.last_changed_at)) / 3600)::numeric, 1) AS avg_dwell_hours
      FROM vehicle_status vs
      JOIN vehicles v ON v.id = vs.vehicle_id
      WHERE vs.current_status = 'in'
      GROUP BY v.model
      ORDER BY v.model
    `);

    // Open flags by type
    const openFlags = await db
      .select({
        flag_type: flags.flag_type,
        count: count(),
      })
      .from(flags)
      .where(eq(flags.resolved, false))
      .groupBy(flags.flag_type);

    res.json({
      total_in: Number(totalIn),
      yards: yardsData,
      model_split: modelSplit.map((m) => ({ model: m.model ?? 'Unknown', count: Number(m.count) })),
      dwell_time: {
        by_yard: dwellByYard,
        by_model: dwellByModel,
      },
      open_flags: openFlags.map((f) => ({ type: f.flag_type, count: Number(f.count) })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /flags ──────────────────────────────────────────────────────

router.get('/flags', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 1000));
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (req.query.type) {
      conditions.push(eq(flags.flag_type, req.query.type as string));
    }

    if (req.query.resolved === 'true') {
      conditions.push(eq(flags.resolved, true));
    } else if (req.query.resolved === 'false') {
      conditions.push(eq(flags.resolved, false));
    }

    const rows = await db
      .select({
        id: flags.id,
        vehicle_id: flags.vehicle_id,
        scan_id: flags.scan_id,
        flag_type: flags.flag_type,
        message: flags.message,
        resolved: flags.resolved,
        resolved_by: flags.resolved_by,
        resolved_at: flags.resolved_at,
        created_at: flags.created_at,
        vin: vehicles.vin,
        model: vehicles.model,
        damage_remark: scans.damage_remark,
        damage_image: scans.damage_image,
        scan_type: scans.scan_type,
        yard_id: scans.yard_id,
      })
      .from(flags)
      .innerJoin(vehicles, eq(flags.vehicle_id, vehicles.id))
      .leftJoin(scans, eq(flags.scan_id, scans.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(flags.id))
      .limit(limit)
      .offset(offset);

    res.json({ page, limit, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /flags/:id/resolve ────────────────────────────────────────

router.patch('/flags/:id/resolve', async (req, res, next) => {
  try {
    const [updated] = await db
      .update(flags)
      .set({
        resolved: true,
        resolved_by: req.user!.id,
        resolved_at: new Date(),
      })
      .where(eq(flags.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /flags/bulk-resolve (§4.1) ────────────────────────────────

const bulkResolveBody = z.object({
  flag_ids: z.array(z.string().uuid()).min(1).max(500),
});

router.patch('/flags/bulk-resolve', async (req, res, next) => {
  try {
    const body = bulkResolveBody.parse(req.body);
    const now = new Date();
    let resolved = 0;

    for (const id of body.flag_ids) {
      const [updated] = await db
        .update(flags)
        .set({ resolved: true, resolved_by: req.user!.id, resolved_at: now })
        .where(and(eq(flags.id, id), eq(flags.resolved, false)))
        .returning();
      if (updated) resolved++;
    }

    res.json({ resolved, total: body.flag_ids.length });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /vehicles/:vin/status ─────────────────────────────────────

const overrideBody = z.object({
  status: z.enum(['in', 'out']),
  yard_id: z.string().optional(),
  yardId: z.string().optional(),
  reason: z.string().min(1),
}).transform((d) => ({
  status: d.status,
  yard_id: d.yard_id || d.yardId || undefined,
  reason: d.reason,
}));

router.patch('/vehicles/:vin/status', async (req, res, next) => {
  try {
    const body = overrideBody.parse(req.body);

    const [vehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.vin, req.params.vin.toUpperCase()));

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    // Read existing status to preserve yard on force-OUT
    const [existingStatus] = await db
      .select({ current_yard_id: vehicleStatus.current_yard_id })
      .from(vehicleStatus)
      .where(eq(vehicleStatus.vehicle_id, vehicle.id));

    const resolvedYardId = body.status === 'in'
      ? body.yard_id ?? existingStatus?.current_yard_id ?? null
      : existingStatus?.current_yard_id ?? null;

    // Upsert status
    await db
      .insert(vehicleStatus)
      .values({
        vehicle_id: vehicle.id,
        current_status: body.status,
        current_yard_id: resolvedYardId,
        last_changed_at: new Date(),
        override_reason: body.reason,
      })
      .onConflictDoUpdate({
        target: vehicleStatus.vehicle_id,
        set: {
          current_status: body.status,
          current_yard_id: resolvedYardId,
          last_changed_at: new Date(),
          override_reason: body.reason,
        },
      });

    // Audit flag
    await db.insert(flags).values({
      vehicle_id: vehicle.id,
      flag_type: 'manual_admin_override',
      message: `Admin set status to ${body.status}. Reason: ${body.reason}`,
      resolved: true,
      resolved_by: req.user!.id,
      resolved_at: new Date(),
    });

    // Auto-resolve any active operational flags since the admin has manually corrected the state
    await db.update(flags)
      .set({
        resolved: true,
        resolved_by: req.user!.id,
        resolved_at: new Date(),
      })
      .where(and(eq(flags.vehicle_id, vehicle.id), eq(flags.resolved, false)));

    res.json({ vin: req.params.vin.toUpperCase(), status: body.status, reason: body.reason });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /vehicles/:vin ────────────────────────────────────────────
// Full vehicle field edit (admin)

const editVehicleBody = z.object({
  model: z.string().trim().min(1).max(120).optional(),
  variant: z.string().trim().max(120).optional().nullable(),
  colour: z.string().trim().max(80).optional().nullable(),
  drive_type: z.enum(['neo_drive', 'hybrid', 'petrol', 'diesel', '']).optional().nullable(),
  key_no: z.string().trim().max(40).optional().nullable(),
  status: z.enum(['in', 'out', 'transit']).optional(),
  yard_id: z.string().optional().nullable(),
  vin_valid: z.boolean().optional(),
});

let vehicleExtraColumnsReady = false;
async function ensureVehicleExtraColumns() {
  if (vehicleExtraColumnsReady) return;
  await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS variant text`);
  await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS colour text`);
  vehicleExtraColumnsReady = true;
}

router.patch('/vehicles/:vin', async (req, res, next) => {
  try {
    await ensureVehicleExtraColumns();
    const body = editVehicleBody.parse(req.body);
    const vin = req.params.vin.toUpperCase();

    const [vehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.vin, vin));

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    const vehiclePatch: Record<string, unknown> = { updated_at: new Date() };
    if (body.model !== undefined) vehiclePatch.model = body.model;
    if (body.variant !== undefined) vehiclePatch.variant = body.variant || null;
    if (body.colour !== undefined) vehiclePatch.colour = body.colour || null;
    if (body.drive_type !== undefined) vehiclePatch.drive_type = body.drive_type || null;
    if (body.vin_valid !== undefined) vehiclePatch.vin_valid = body.vin_valid;

    if (Object.keys(vehiclePatch).length > 1) {
      await db.update(vehicles).set(vehiclePatch).where(eq(vehicles.id, vehicle.id));
    }

    const [existingStatus] = await db
      .select()
      .from(vehicleStatus)
      .where(eq(vehicleStatus.vehicle_id, vehicle.id));

    const nextStatus = body.status ?? existingStatus?.current_status ?? 'out';
    let nextYardId =
      body.yard_id !== undefined ? body.yard_id || null : existingStatus?.current_yard_id ?? null;
    if (nextStatus === 'out' && body.yard_id === undefined) {
      nextYardId = existingStatus?.current_yard_id ?? null;
    }
    if (nextStatus === 'in' && !nextYardId) {
      res.status(400).json({ error: 'Select a yard when status is IN.' });
      return;
    }

    const statusPatch: Record<string, unknown> = {
      current_status: nextStatus,
      current_yard_id: nextYardId,
      last_changed_at: new Date(),
      override_reason: 'Admin vehicle edit',
    };
    if (body.key_no !== undefined) statusPatch.key_no = body.key_no || null;

    await db
      .insert(vehicleStatus)
      .values({
        vehicle_id: vehicle.id,
        current_status: nextStatus,
        current_yard_id: nextYardId,
        last_changed_at: new Date(),
        key_no: body.key_no ?? existingStatus?.key_no ?? null,
        override_reason: 'Admin vehicle edit',
      })
      .onConflictDoUpdate({
        target: vehicleStatus.vehicle_id,
        set: statusPatch,
      });

    await db.insert(flags).values({
      vehicle_id: vehicle.id,
      flag_type: 'manual_admin_override',
      message: 'Admin updated vehicle details',
      resolved: true,
      resolved_by: req.user!.id,
      resolved_at: new Date(),
    });

    const [updated] = await db
      .select({
        vin: vehicles.vin,
        model: vehicles.model,
        variant: vehicles.variant,
        colour: vehicles.colour,
        drive_type: vehicles.drive_type,
        vin_valid: vehicles.vin_valid,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        key_no: vehicleStatus.key_no,
        last_changed_at: vehicleStatus.last_changed_at,
      })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .where(eq(vehicles.id, vehicle.id));

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /import/vehicles ──────────────────────────────────────────

const importBody = z.object({
  vehicles: z.array(
    z.object({
      vin: z.string().min(1),
      yard_id: z.string().uuid(),
      model: z.string().optional(),
    }),
  ),
});

router.post('/import/vehicles', async (req, res, next) => {
  try {
    const body = importBody.parse(req.body);
    let imported = 0;
    let skipped = 0;

    for (const v of body.vehicles) {
      const vin = v.vin.toUpperCase().trim();

      // Check if vehicle already exists
      const [existing] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.vin, vin));

      if (existing) {
        skipped++;
        continue;
      }

      const vinValidCheck = isValidVin(vin);
      const modelValue = v.model ?? detectModel(vin);

      const [vehicle] = await db
        .insert(vehicles)
        .values({ vin, model: modelValue, vin_valid: vinValidCheck })
        .returning({ id: vehicles.id });

      await db
        .insert(vehicleStatus)
        .values({
          vehicle_id: vehicle.id,
          current_status: 'in',
          current_yard_id: v.yard_id,
          last_changed_at: new Date(),
          override_reason: 'Bulk import at launch',
        });

      imported++;
    }

    res.json({ imported, skipped, total: body.vehicles.length });
  } catch (err) {
    next(err);
  }
});

export default router;
