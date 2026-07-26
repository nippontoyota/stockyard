import { Router } from 'express';
import { z } from 'zod';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { zones, vehicleStatus, yards } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

/**
 * F2 — Zone/Slot tracking. CRUD for zones within yards.
 */

// ─── GET / ───────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.yard_id) {
      conditions.push(eq(zones.yard_id, req.query.yard_id as string));
    }

    const rows = await db
      .select()
      .from(zones)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(zones.code);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ─── GET /:yardId/occupancy ─────────────────────────────────────────
router.get('/:yardId/occupancy', async (req, res, next) => {
  try {
    // Note: This requires zone_id on vehicle_status (future migration)
    // For now return zone definitions with capacity info
    const yardZones = await db
      .select()
      .from(zones)
      .where(eq(zones.yard_id, req.params.yardId))
      .orderBy(zones.code);

    res.json({ data: yardZones });
  } catch (err) { next(err); }
});

// ─── POST / ─────────────────────────────────────────────────────────
const createZoneBody = z.object({
  yard_id: z.string().min(1),
  code: z.string().min(1).max(10),
  label: z.string().optional(),
  max_capacity: z.number().int().positive().default(50),
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const body = createZoneBody.parse(req.body);
    const [zone] = await db.insert(zones).values(body).returning();
    res.status(201).json(zone);
  } catch (err) { next(err); }
});

// ─── PATCH /:id ─────────────────────────────────────────────────────
const updateZoneBody = z.object({
  code: z.string().min(1).max(10).optional(),
  label: z.string().optional(),
  max_capacity: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const body = updateZoneBody.parse(req.body);
    const [updated] = await db.update(zones).set(body).where(eq(zones.id, req.params.id)).returning();
    if (!updated) { res.status(404).json({ error: 'Zone not found' }); return; }
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── DELETE /:id ────────────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const [deleted] = await db.update(zones).set({ active: false }).where(eq(zones.id, req.params.id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Zone not found' }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
