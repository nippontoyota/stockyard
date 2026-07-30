import { Router } from 'express';
import { db } from '../db/client.js';
import { branchYards, vehicleStatus, vehicles, requisitions } from '../db/schema.js';
import { eq, inArray, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Used by delivery_incharge to browse stock at a specific branch
// Returns vehicles currently marked as 'in' at any yard belonging to the branch
router.get('/:id/stock', authenticate, async (req, res, next) => {
  try {
    const branchId = req.params.id as string;

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
