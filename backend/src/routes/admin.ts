import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, count, desc, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, scans, flags, requisitions, notifications } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { isValidVin } from '../lib/vin.js';
import { prepareVinRename } from '../lib/vinRename.js';
import { DRIVE_TYPE_VALUES, isDriveType } from '../shared/driveTypes.js';

const router = Router();
router.use(authenticate);
router.use((req, res, next) => {
  if (req.path === '/flags' && req.method === 'GET') return next();
  return requireRole('admin')(req, res, next);
});

const driveTypeSchema = z
  .string()
  .trim()
  .refine((value) => isDriveType(value), {
    message: `drive_type must be one of: ${DRIVE_TYPE_VALUES.join(', ')}`,
  });

// ─── GET /flags ──────────────────────────────────────────────────────

router.get('/flags', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 200));
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
  drive_type: z.union([driveTypeSchema, z.literal('')]).optional().nullable(),
  key_no: z.string().trim().max(40).optional().nullable(),
  status: z.enum(['in', 'out', 'transit']).optional(),
  yard_id: z.string().optional().nullable(),
  vin_valid: z.boolean().optional(),
  /** Optional typo correction — same vehicle row, new unique VIN */
  vin: z.string().trim().min(1).optional(),
});



router.patch('/vehicles/:vin', async (req, res, next) => {
  try {
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

    let takenByOther = false;
    if (body.vin !== undefined) {
      const candidate = body.vin.trim().toUpperCase();
      if (candidate !== vin) {
        const [conflict] = await db
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(eq(vehicles.vin, candidate));
        takenByOther = Boolean(conflict);
      }
    }

    const rename = prepareVinRename(vin, body.vin, takenByOther);
    if (!rename.ok) {
      res.status(rename.status).json({ error: rename.error });
      return;
    }

    const vehiclePatch: Record<string, unknown> = { updated_at: new Date(), variant: null, colour: null };
    if (body.model !== undefined) vehiclePatch.model = body.model;
    if (body.drive_type !== undefined) vehiclePatch.drive_type = body.drive_type || null;
    if (body.vin_valid !== undefined) vehiclePatch.vin_valid = body.vin_valid;
    if (rename.changed) {
      vehiclePatch.vin = rename.vin;
      vehiclePatch.vin_valid = true;
    }

    if (Object.keys(vehiclePatch).length > 1) {
      try {
        await db.update(vehicles).set(vehiclePatch).where(eq(vehicles.id, vehicle.id));
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === '23505') {
          res.status(409).json({ error: 'VIN already exists' });
          return;
        }
        throw err;
      }
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

// ─── DELETE /vehicles/:vin ───────────────────────────────────────────

router.delete('/vehicles/:vin', async (req, res, next) => {
  try {
    const vin = req.params.vin.toUpperCase();

    const [vehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.vin, vin));

    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }

    await db.transaction(async (tx) => {
      const vehicleId = vehicle.id;

      const reqs = await tx
        .select({ id: requisitions.id })
        .from(requisitions)
        .where(eq(requisitions.vehicle_id, vehicleId));
      const reqIds = reqs.map((r) => r.id);

      if (reqIds.length) {
        await tx.delete(notifications).where(inArray(notifications.related_req_id, reqIds));
        await tx.delete(requisitions).where(eq(requisitions.vehicle_id, vehicleId));
      }

      await tx.delete(flags).where(eq(flags.vehicle_id, vehicleId));

      await tx
        .update(vehicleStatus)
        .set({ last_in_scan_id: null, last_out_scan_id: null })
        .where(eq(vehicleStatus.vehicle_id, vehicleId));

      await tx.delete(scans).where(eq(scans.vehicle_id, vehicleId));
      await tx.delete(vehicleStatus).where(eq(vehicleStatus.vehicle_id, vehicleId));
      await tx.delete(vehicles).where(eq(vehicles.id, vehicleId));
    });

    res.json({ vin, deleted: true });
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
      const modelValue = v.model?.trim() || null;

      const [vehicle] = await db
        .insert(vehicles)
        .values({ vin, model: modelValue, vin_valid: vinValidCheck, variant: null, colour: null })
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
