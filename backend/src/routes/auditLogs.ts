import { Router } from 'express';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin'));

/**
 * F9 — Audit log viewer. Admin-only, read-only, paginated.
 */

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.user) {
      conditions.push(eq(auditLogs.user_id, req.query.user as string));
    }
    if (req.query.action) {
      conditions.push(eq(auditLogs.action, req.query.action as string));
    }
    if (req.query.resource_type) {
      conditions.push(eq(auditLogs.resource_type, req.query.resource_type as string));
    }
    if (req.query.from) {
      conditions.push(gte(auditLogs.created_at, new Date(req.query.from as string)));
    }
    if (req.query.to) {
      conditions.push(lte(auditLogs.created_at, new Date(req.query.to as string)));
    }

    const rows = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ page, limit, data: rows });
  } catch (err) { next(err); }
});

export default router;
