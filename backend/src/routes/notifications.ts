import { Router } from 'express';
import { db } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { resolveBranchId } from '../lib/branch.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const role = req.user!.role as "stockyard" | "delivery_incharge" | "admin";
    const branchId = await resolveBranchId(req.user!);
    if (!branchId || role === 'admin') return res.json([]);

    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.branch_id, branchId),
          eq(notifications.user_role, role),
          eq(notifications.read, false)
        )
      )
      .orderBy(desc(notifications.created_at))
      .limit(50);

    res.json(notifs);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const role = req.user!.role as "stockyard" | "delivery_incharge" | "admin";
    const branchId = await resolveBranchId(req.user!);
    if (!branchId || role === 'admin') return res.status(403).json({ error: 'Forbidden' });

    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, req.params.id),
          eq(notifications.branch_id, branchId),
          eq(notifications.user_role, role)
        )
      );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const role = req.user!.role as "stockyard" | "delivery_incharge" | "admin";
    const branchId = await resolveBranchId(req.user!);
    if (!branchId || role === 'admin') return res.status(403).json({ error: 'Forbidden' });

    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.branch_id, branchId),
          eq(notifications.user_role, role),
          eq(notifications.read, false)
        )
      );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
