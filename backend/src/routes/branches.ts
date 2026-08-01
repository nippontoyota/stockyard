import { Router } from 'express';
import { eq, and, count, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { branchYards, vehicleStatus, vehicles, requisitions, branches, yards } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Branch overview: yards + stock counts for delivery incharge and admin
router.get('/:id/overview', async (req, res, next) => {
  try {
    const branchId = req.params.id;

    if (req.user!.role === 'delivery_incharge' && req.user!.branch_id !== branchId) {
      res.status(403).json({ error: 'Access denied to this branch' });
      return;
    }

    const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));
    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    const branchYardRecords = await db
      .select({
        id: yards.id,
        code: yards.code,
        name: yards.name,
        city: yards.city,
        capacity: yards.capacity,
      })
      .from(branchYards)
      .innerJoin(yards, eq(branchYards.yard_id, yards.id))
      .where(eq(branchYards.branch_id, branchId))
      .orderBy(yards.code, yards.name);

    const yardIds = branchYardRecords.map((y) => y.id);
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

    res.json({
      branch: { id: branch.id, name: branch.name, active: branch.active },
      yards: branchYardRecords.map((yard) => {
        const in_count = inCounts.get(yard.id) ?? 0;
        return {
          ...yard,
          in_count,
          utilization_pct: yard.capacity > 0 ? Math.round((in_count / yard.capacity) * 100) : 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// Used by delivery_incharge to browse stock at a specific branch
// Returns vehicles currently marked as 'in' at any yard belonging to the branch
router.get('/:id/stock', async (req, res, next) => {
  try {
    const branchId = req.params.id;

    if (req.user!.role === 'delivery_incharge' && req.user!.branch_id !== branchId) {
      res.status(403).json({ error: 'Access denied to this branch' });
      return;
    }

    const branchYardRecords = await db
      .select({ yard_id: branchYards.yard_id })
      .from(branchYards)
      .where(eq(branchYards.branch_id, branchId));

    const yardIds = branchYardRecords.map((r) => r.yard_id);

    if (yardIds.length === 0) {
      return res.json([]);
    }

    const stock = await db
      .select({
        vin: vehicles.vin,
        model: vehicles.model,
        vehicle_id: vehicles.id,
        current_yard_id: vehicleStatus.current_yard_id,
        last_changed_at: vehicleStatus.last_changed_at,
      })
      .from(vehicleStatus)
      .innerJoin(vehicles, eq(vehicleStatus.vehicle_id, vehicles.id))
      .where(
        and(
          eq(vehicleStatus.current_status, 'in'),
          inArray(vehicleStatus.current_yard_id, yardIds),
        ),
      );

    const activeReqs = await db
      .select({ vehicle_id: requisitions.vehicle_id, status: requisitions.status })
      .from(requisitions)
      .where(inArray(requisitions.status, ['pending', 'approved']));

    const reqByVehicle = new Map(activeReqs.map((r) => [r.vehicle_id, r.status]));

    res.json(
      stock.map((v) => ({
        ...v,
        requisition_status: reqByVehicle.get(v.vehicle_id) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
