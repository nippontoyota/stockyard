import { Router } from 'express';
import { eq, and, count, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { yards, vehicles, vehicleStatus, branchYards, requisitions } from '../db/schema.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { resolveBranchId } from '../lib/branch.js';

const router = Router();

router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    if (req.user?.role === 'stockyard') {
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

/**
 * Yards a delivery incharge can request vehicles from.
 * Excludes their own branch yards. Includes live IN counts.
 */
router.get('/request-targets', authenticate, async (req, res, next) => {
  try {
    if (req.user!.role !== 'delivery_incharge') {
      res.status(403).json({ error: 'Only delivery incharge can browse request targets' });
      return;
    }

    const ownBranchId = await resolveBranchId(req.user!);
    const ownYardIds = ownBranchId
      ? (
          await db
            .select({ yard_id: branchYards.yard_id })
            .from(branchYards)
            .where(eq(branchYards.branch_id, ownBranchId))
        ).map((r) => r.yard_id)
      : [];

    const rows = await db
      .select({
        id: yards.id,
        code: yards.code,
        name: yards.name,
        city: yards.city,
        capacity: yards.capacity,
        branch_id: branchYards.branch_id,
      })
      .from(yards)
      .innerJoin(branchYards, eq(branchYards.yard_id, yards.id))
      .where(eq(yards.active, true))
      .orderBy(yards.city, yards.code, yards.name);

    const filtered = ownYardIds.length
      ? rows.filter((r) => !ownYardIds.includes(r.id))
      : rows;

    const yardIds = filtered.map((r) => r.id);
    const inCounts = new Map<string, number>();
    if (yardIds.length > 0) {
      const counts = await db
        .select({
          yard_id: vehicleStatus.current_yard_id,
          value: count(),
        })
        .from(vehicleStatus)
        .where(
          and(
            eq(vehicleStatus.current_status, 'in'),
            inArray(vehicleStatus.current_yard_id, yardIds),
          ),
        )
        .groupBy(vehicleStatus.current_yard_id);

      for (const row of counts) {
        if (row.yard_id) inCounts.set(row.yard_id, Number(row.value));
      }
    }

    res.json(
      filtered.map((yard) => ({
        ...yard,
        in_count: inCounts.get(yard.id) ?? 0,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/stock ──────────────────────────────────────────────────

router.get('/:id/stock', authenticate, async (req, res, next) => {
  try {
    const yardId = String(req.params.id);
    // Stockyard users can only see their own yard
    if (req.user!.role === 'stockyard' && req.user!.yard_id !== yardId) {
      res.status(403).json({ error: 'Access denied to this yard' });
      return;
    }

    // Delivery incharge may not request from their own branch yards
    if (req.user!.role === 'delivery_incharge') {
      const ownBranchId = await resolveBranchId(req.user!);
      if (ownBranchId) {
        const [mapped] = await db
          .select({ branch_id: branchYards.branch_id })
          .from(branchYards)
          .where(eq(branchYards.yard_id, yardId))
          .limit(1);
        if (mapped?.branch_id === ownBranchId) {
          res.status(400).json({ error: 'Cannot request from your own branch yards' });
          return;
        }
      }
    }

    const rows = await db
      .select({
        vehicle_id: vehicles.id,
        vin: vehicles.vin,
        model: vehicles.model,
        current_yard_id: vehicleStatus.current_yard_id,
        last_changed_at: vehicleStatus.last_changed_at,
      })
      .from(vehicleStatus)
      .innerJoin(vehicles, eq(vehicleStatus.vehicle_id, vehicles.id))
      .where(
        and(
          eq(vehicleStatus.current_yard_id, yardId),
          eq(vehicleStatus.current_status, 'in'),
        ),
      )
      .orderBy(vehicleStatus.last_changed_at);

    const activeReqs = await db
      .select({ vehicle_id: requisitions.vehicle_id, status: requisitions.status })
      .from(requisitions)
      .where(inArray(requisitions.status, ['pending', 'approved']));

    const reqByVehicle = new Map(activeReqs.map((r) => [r.vehicle_id, r.status]));

    res.json(
      rows.map((v) => ({
        ...v,
        requisition_status: reqByVehicle.get(v.vehicle_id) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/utilization ────────────────────────────────────────────

router.get('/:id/utilization', authenticate, async (req, res, next) => {
  try {
    const yardId = String(req.params.id);
    if (req.user!.role === 'stockyard' && req.user!.yard_id !== yardId) {
      res.status(403).json({ error: 'Access denied to this yard' });
      return;
    }

    const [yard] = await db
      .select({ capacity: yards.capacity, name: yards.name, code: yards.code })
      .from(yards)
      .where(eq(yards.id, yardId));

    if (!yard) {
      res.status(404).json({ error: 'Yard not found' });
      return;
    }

    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(vehicleStatus)
      .where(
        and(
          eq(vehicleStatus.current_yard_id, yardId),
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
