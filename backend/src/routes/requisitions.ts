import { Router } from 'express';
import { db } from '../db/client.js';
import { requisitions, notifications, vehicleStatus, vehicles, branches, branchYards, yards, credentials } from '../db/schema.js';
import { eq, or, and, desc, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { notifyRoleAtBranch } from '../lib/webPush.js';
import { resolveBranchId } from '../lib/branch.js';
import { emitRequisitionEvent } from '../lib/socket.js';

const router = Router();
router.use(authenticate);

const ACTIVE_STATUSES = ['pending', 'approved'] as const;

async function branchYardList(branchId: string) {
  const rows = await db
    .select({ id: yards.id, code: yards.code, name: yards.name })
    .from(branchYards)
    .innerJoin(yards, eq(branchYards.yard_id, yards.id))
    .where(eq(branchYards.branch_id, branchId));
  return rows;
}

// Get requisitions for current user's branch (incoming and outgoing)
router.get('/', async (req, res, next) => {
  try {
    const branchId = await resolveBranchId(req.user!);
    if (!branchId) return res.json({ incoming: [], outgoing: [] });

    const reqs = await db
      .select({
        id: requisitions.id,
        status: requisitions.status,
        requested_by: requisitions.requested_by,
        requested_at: requisitions.requested_at,
        approved_by: requisitions.approved_by,
        approved_at: requisitions.approved_at,
        rejection_reason: requisitions.rejection_reason,
        requesting_branch_id: requisitions.requesting_branch_id,
        source_branch_id: requisitions.source_branch_id,
        destination_yard_id: requisitions.destination_yard_id,
        vehicle: {
          vin: vehicles.vin,
          model: vehicles.model,
        },
        source_branch: { name: branches.name },
        destination_yard: {
          id: yards.id,
          code: yards.code,
          name: yards.name,
        },
      })
      .from(requisitions)
      .innerJoin(vehicles, eq(requisitions.vehicle_id, vehicles.id))
      .innerJoin(branches, eq(requisitions.source_branch_id, branches.id))
      .leftJoin(yards, eq(requisitions.destination_yard_id, yards.id))
      .where(
        or(
          eq(requisitions.requesting_branch_id, branchId),
          eq(requisitions.source_branch_id, branchId),
        ),
      )
      .orderBy(desc(requisitions.requested_at));

    const allBranches = await db.select().from(branches);
    const branchNameById = new Map(allBranches.map((b) => [b.id, b.name]));

    const credRows = await db.select({ id: credentials.id, username: credentials.username }).from(credentials);
    const usernameById = new Map(credRows.map((c) => [c.id, c.username]));

    const requestingBranchIds = [...new Set(
      reqs.filter((r) => r.source_branch_id === branchId).map((r) => r.requesting_branch_id),
    )];
    const yardsByBranch = new Map<string, Awaited<ReturnType<typeof branchYardList>>>();
    await Promise.all(
      requestingBranchIds.map(async (id) => {
        yardsByBranch.set(id, await branchYardList(id));
      }),
    );

    const withRequester = (r: (typeof reqs)[number]) => ({
      ...r,
      requested_by_username: usernameById.get(r.requested_by) ?? null,
      destination_yard: r.destination_yard?.id ? r.destination_yard : null,
    });

    const incoming = reqs
      .filter((r) => r.source_branch_id === branchId)
      .map((r) => ({
        ...withRequester(r),
        requesting_branch: {
          name: branchNameById.get(r.requesting_branch_id),
          yards: yardsByBranch.get(r.requesting_branch_id) ?? [],
        },
      }));
    const outgoing = reqs
      .filter((r) => r.requesting_branch_id === branchId)
      .map(withRequester);

    res.json({ incoming, outgoing });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const requestingBranchId = await resolveBranchId(req.user!);
    if (!requestingBranchId || req.user?.role !== 'delivery_incharge') {
      return res.status(403).json({ error: 'Only delivery incharge can create requisitions' });
    }

    const { source_branch_id, vehicle_id, destination_yard_id } = req.body;

    if (!destination_yard_id) {
      return res.status(400).json({ error: 'destination_yard_id is required' });
    }

    if (requestingBranchId === source_branch_id) {
      return res.status(400).json({ error: 'Cannot request from your own branch' });
    }

    const [destMapped] = await db
      .select({ yard_id: branchYards.yard_id })
      .from(branchYards)
      .where(
        and(
          eq(branchYards.branch_id, requestingBranchId),
          eq(branchYards.yard_id, destination_yard_id),
        ),
      );

    if (!destMapped) {
      return res.status(400).json({ error: 'Destination yard is not under your branch' });
    }

    const sourceBranchYards = await db
      .select({ yard_id: branchYards.yard_id })
      .from(branchYards)
      .where(eq(branchYards.branch_id, source_branch_id));

    const sourceYardIds = sourceBranchYards.map((r) => r.yard_id);

    if (sourceYardIds.length === 0) {
      return res.status(400).json({ error: 'Source branch has no yards configured' });
    }

    const [vStatus] = await db
      .select()
      .from(vehicleStatus)
      .where(
        and(
          eq(vehicleStatus.vehicle_id, vehicle_id),
          eq(vehicleStatus.current_status, 'in'),
          inArray(vehicleStatus.current_yard_id, sourceYardIds),
        ),
      );

    if (!vStatus) {
      return res.status(400).json({ error: 'Vehicle is not available at the source branch' });
    }

    const [existing] = await db
      .select()
      .from(requisitions)
      .where(
        and(
          eq(requisitions.vehicle_id, vehicle_id),
          inArray(requisitions.status, [...ACTIVE_STATUSES]),
        ),
      );

    if (existing) {
      return res.status(409).json({ error: 'An active requisition already exists for this vehicle' });
    }

    const [vehicle] = await db
      .select({ vin: vehicles.vin, model: vehicles.model })
      .from(vehicles)
      .where(eq(vehicles.id, vehicle_id));

    const [reqRecord] = await db.insert(requisitions).values({
      requesting_branch_id: requestingBranchId,
      source_branch_id,
      destination_yard_id,
      vehicle_id,
      status: 'pending',
      requested_by: req.user!.id,
    }).returning();

    const vehicleLabel = vehicle ? `${vehicle.model} (${vehicle.vin})` : vehicle_id;

    await db.insert(notifications).values([
      {
        user_role: 'stockyard',
        branch_id: source_branch_id,
        message: `New requisition: ${vehicleLabel}`,
        type: 'requisition_created',
        related_req_id: reqRecord.id,
      },
      {
        user_role: 'delivery_incharge',
        branch_id: source_branch_id,
        message: `New requisition: ${vehicleLabel}`,
        type: 'requisition_created',
        related_req_id: reqRecord.id,
      },
    ]);

    await notifyRoleAtBranch('stockyard', source_branch_id, {
      title: 'New Requisition',
      body: `${vehicleLabel} requested`,
      url: '/requisitions',
    });
    await notifyRoleAtBranch('delivery_incharge', source_branch_id, {
      title: 'New Requisition',
      body: `${vehicleLabel} requested`,
      url: '/requisitions',
    });

    emitRequisitionEvent();
    res.json(reqRecord);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const branchId = await resolveBranchId(req.user!);
    if (!branchId) return res.status(403).json({ error: 'Branch not configured' });

    const [reqRecord] = await db.select().from(requisitions).where(eq(requisitions.id, req.params.id));
    if (!reqRecord) return res.status(404).json({ error: 'Not found' });

    if (reqRecord.source_branch_id !== branchId) {
      return res.status(403).json({ error: 'Not authorized for this branch' });
    }

    if (reqRecord.requested_by === req.user?.id) {
      return res.status(400).json({ error: 'Cannot self-approve' });
    }

    const [updated] = await db
      .update(requisitions)
      .set({ status: 'approved', approved_by: req.user!.id, approved_at: new Date() })
      .where(and(eq(requisitions.id, req.params.id), eq(requisitions.status, 'pending')))
      .returning();

    if (!updated) {
      return res.status(409).json({ error: 'Already approved or rejected by another user' });
    }

    await db.insert(notifications).values({
      user_role: 'delivery_incharge',
      branch_id: updated.requesting_branch_id,
      message: 'Vehicle requisition approved',
      type: 'requisition_approved',
      related_req_id: updated.id,
    });

    await notifyRoleAtBranch('delivery_incharge', updated.requesting_branch_id, {
      title: 'Requisition Approved',
      body: 'Your vehicle requisition was approved.',
      url: '/requisitions',
    });

    emitRequisitionEvent();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const branchId = await resolveBranchId(req.user!);
    if (!branchId) return res.status(403).json({ error: 'Branch not configured' });

    const { reason } = req.body;

    const [reqRecord] = await db.select().from(requisitions).where(eq(requisitions.id, req.params.id));
    if (!reqRecord) return res.status(404).json({ error: 'Not found' });

    if (reqRecord.source_branch_id !== branchId) {
      return res.status(403).json({ error: 'Not authorized for this branch' });
    }

    const [updated] = await db
      .update(requisitions)
      .set({
        status: 'rejected',
        rejected_by: req.user!.id,
        rejected_at: new Date(),
        rejection_reason: reason,
      })
      .where(and(eq(requisitions.id, req.params.id), eq(requisitions.status, 'pending')))
      .returning();

    if (!updated) {
      return res.status(409).json({ error: 'Already approved or rejected' });
    }

    await db.insert(notifications).values({
      user_role: 'delivery_incharge',
      branch_id: updated.requesting_branch_id,
      message: 'Vehicle requisition rejected',
      type: 'requisition_rejected',
      related_req_id: updated.id,
    });

    await notifyRoleAtBranch('delivery_incharge', updated.requesting_branch_id, {
      title: 'Requisition Rejected',
      body: `Your vehicle requisition was rejected: ${reason || 'No reason given'}`,
      url: '/requisitions',
    });

    emitRequisitionEvent();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
