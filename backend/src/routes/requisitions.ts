import { Router } from 'express';
import { db } from '../db/client.js';
import { requisitions, notifications, vehicleStatus, vehicles, branches, branchYards } from '../db/schema.js';
import { eq, or, and, desc, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { notifyRoleAtBranch } from '../lib/webPush.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// Get requisitions for current user's branch (incoming and outgoing)
router.get('/', async (req, res, next) => {
  try {
    const branchId = req.user?.branch_id;
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
        vehicle: {
          vin: vehicles.vin,
          model: vehicles.model
        },
        source_branch: { name: branches.name }
      })
      .from(requisitions)
      .innerJoin(vehicles, eq(requisitions.vehicle_id, vehicles.id))
      .innerJoin(branches, eq(requisitions.source_branch_id, branches.id)) // To get source branch name
      .where(
        or(
          eq(requisitions.requesting_branch_id, branchId),
          eq(requisitions.source_branch_id, branchId)
        )
      )
      .orderBy(desc(requisitions.requested_at));

    // Also get requesting branch names manually for incoming reqs to save complex joins
    const allBranches = await db.select().from(branches);
    
    const incoming = reqs.filter(r => r.source_branch_id === branchId).map(r => ({
      ...r,
      requesting_branch: { name: allBranches.find(b => b.id === r.requesting_branch_id)?.name }
    }));
    const outgoing = reqs.filter(r => r.requesting_branch_id === branchId);

    res.json({ incoming, outgoing });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const requestingBranchId = req.user?.branch_id;
    if (!requestingBranchId || req.user?.role !== 'delivery_incharge') {
      return res.status(403).json({ error: 'Only delivery incharge can create requisitions' });
    }

    const { source_branch_id, vehicle_id } = req.body;
    
    if (requestingBranchId === source_branch_id) {
      return res.status(400).json({ error: 'Cannot request from your own branch' });
    }

    // Check vehicle status - must be 'in' at a yard belonging to the source branch
    const sourceBranchYards = await db
      .select({ yard_id: branchYards.yard_id })
      .from(branchYards)
      .where(eq(branchYards.branch_id, source_branch_id));

    const sourceYardIds = sourceBranchYards.map(r => r.yard_id);

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
          inArray(vehicleStatus.current_yard_id, sourceYardIds)
        )
      );
      
    if (!vStatus) {
      return res.status(400).json({ error: 'Vehicle is not available at the source branch' });
    }

    // Check existing pending requisitions
    const [existing] = await db
      .select()
      .from(requisitions)
      .where(
        and(
          eq(requisitions.vehicle_id, vehicle_id),
          eq(requisitions.status, 'pending')
        )
      );

    if (existing) {
      return res.status(409).json({ error: 'A pending requisition already exists for this vehicle' });
    }

    const [reqRecord] = await db.insert(requisitions).values({
      requesting_branch_id: requestingBranchId,
      source_branch_id,
      vehicle_id,
      status: 'pending',
      requested_by: req.user.id
    }).returning();

    // Create notifications for source branch
    const notifValues = [
      {
        user_role: 'stockyard',
        branch_id: source_branch_id,
        message: 'New vehicle requisition received',
        type: 'requisition_created',
        related_req_id: reqRecord.id,
      },
      {
        user_role: 'delivery_incharge',
        branch_id: source_branch_id,
        message: 'New vehicle requisition received',
        type: 'requisition_created',
        related_req_id: reqRecord.id,
      }
    ];
    await db.insert(notifications).values(notifValues);
    
    await notifyRoleAtBranch('stockyard', source_branch_id, {
      title: 'New Requisition',
      body: `Vehicle ${vehicle_id} requested`,
      url: '/admin'
    });
    await notifyRoleAtBranch('delivery_incharge', source_branch_id, {
      title: 'New Requisition',
      body: `Vehicle ${vehicle_id} requested`,
      url: '/admin'
    });

    res.json(reqRecord);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const branchId = req.user?.branch_id;
    
    const [reqRecord] = await db.select().from(requisitions).where(eq(requisitions.id, req.params.id));
    if (!reqRecord) return res.status(404).json({ error: 'Not found' });
    
    if (reqRecord.source_branch_id !== branchId) {
       return res.status(403).json({ error: 'Not authorized for this branch' });
    }
    
    if (reqRecord.requested_by === req.user?.id) {
       return res.status(400).json({ error: 'Cannot self-approve' });
    }

    // Atomic update
    const [updated] = await db
      .update(requisitions)
      .set({ status: 'approved', approved_by: req.user!.id, approved_at: new Date() })
      .where(and(eq(requisitions.id, req.params.id), eq(requisitions.status, 'pending')))
      .returning();

    if (!updated) {
      return res.status(409).json({ error: 'Already approved or rejected by another user' });
    }

    // Notify requester
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
      url: '/admin'
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const branchId = req.user?.branch_id;
    const { reason } = req.body;
    
    const [reqRecord] = await db.select().from(requisitions).where(eq(requisitions.id, req.params.id));
    if (!reqRecord) return res.status(404).json({ error: 'Not found' });
    
    if (reqRecord.source_branch_id !== branchId) {
       return res.status(403).json({ error: 'Not authorized for this branch' });
    }

    const [updated] = await db
      .update(requisitions)
      .set({ status: 'rejected', rejected_by: req.user!.id, rejected_at: new Date(), rejection_reason: reason })
      .where(and(eq(requisitions.id, req.params.id), eq(requisitions.status, 'pending')))
      .returning();

    if (!updated) {
      return res.status(409).json({ error: 'Already approved or rejected' });
    }

    // Notify requester
    await db.insert(notifications).values({
      user_role: 'delivery_incharge',
      branch_id: updated.requesting_branch_id,
      message: 'Vehicle requisition rejected',
      type: 'requisition_rejected',
      related_req_id: updated.id,
    });

    await notifyRoleAtBranch('delivery_incharge', updated.requesting_branch_id, {
      title: 'Requisition Rejected',
      body: `Your vehicle requisition was rejected: ${reason}`,
      url: '/admin'
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
