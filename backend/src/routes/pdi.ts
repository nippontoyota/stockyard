import { Router } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { authenticate, requireRole, type AuthUser } from '../middleware/auth.js';
import { canReadPdi, inspectionBody, pdiEnabled } from '../lib/pdiPolicy.js';
import { latestPdiSummary } from '../lib/pdiSummary.js';
import { emitPdiEvent } from '../lib/socket.js';

const router = Router();
router.use(authenticate);
router.use((_req, res, next) => {
  if (!pdiEnabled()) { res.status(503).json({ error: 'PDI is not enabled yet.' }); return; }
  next();
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  q: z.string().trim().max(80).default(''),
  result: z.enum(['all', 'not_recorded', 'ok', 'repair_required']).default('all'),
});
const vinSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Enter a valid 17-character VIN.');
const pageSize = 30;

function yardScope(user: AuthUser): SQL {
  if (user.role === 'admin') return sql`true`;
  if (user.role === 'stockyard') return sql`vs.current_yard_id = ${user.yard_id}`;
  return sql`EXISTS (SELECT 1 FROM branch_yards byard JOIN branches b ON b.id = byard.branch_id
    WHERE b.active = true AND b.id = ${user.branch_id}::uuid AND byard.yard_id = vs.current_yard_id)`;
}

async function readVehicle(vin: string, user: AuthUser) {
  const rows = await db.execute(sql`SELECT v.id, v.vin, v.model, v.variant, v.colour, v.drive_type,
    vs.current_status, vs.current_yard_id, y.name AS yard_name, y.code AS yard_code,
    ${latestPdiSummary(sql`v.id`)} AS pdi
    FROM vehicles v LEFT JOIN vehicle_status vs ON vs.vehicle_id = v.id
    LEFT JOIN yards y ON y.id = vs.current_yard_id
    WHERE v.vin = ${vin} AND ${yardScope(user)}`);
  return rows[0];
}

const historySelect = sql`p.id, p.vin_snapshot, p.result, p.remarks, p.created_at,
  p.inspector_username_snapshot, p.branch_id, b.name AS branch_name, p.yard_id, y.name AS yard_name`;

router.get('/vehicles', requireRole('pdi'), async (req, res, next) => {
  try {
    const { page, q, result } = querySchema.parse(req.query);
    const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const resultFilter = result === 'all' ? sql`true`
      : result === 'not_recorded' ? sql`pdi IS NULL` : sql`pdi->>'result' = ${result}`;
    const rows = await db.execute(sql`SELECT * FROM (
      SELECT v.id, v.vin, v.model, vs.current_status, vs.current_yard_id, y.name AS yard_name,
      ${latestPdiSummary(sql`v.id`)} AS pdi
      FROM vehicles v JOIN vehicle_status vs ON vs.vehicle_id = v.id
      LEFT JOIN yards y ON y.id = vs.current_yard_id
      WHERE ${yardScope(req.user!)} AND (v.vin ILIKE ${term} OR v.model ILIKE ${term})
    ) scoped WHERE ${resultFilter} ORDER BY vin LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`);
    res.json({ data: rows.slice(0, pageSize), page, has_more: rows.length > pageSize });
  } catch (err) { next(err); }
});

router.get('/inspections', requireRole('pdi'), async (req, res, next) => {
  try {
    const { page, q, result } = querySchema.parse(req.query);
    const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await db.execute(sql`SELECT ${historySelect}, v.vin FROM pdi_inspections p
      JOIN vehicles v ON v.id = p.vehicle_id JOIN vehicle_status vs ON vs.vehicle_id = v.id
      JOIN branches b ON b.id = p.branch_id JOIN yards y ON y.id = p.yard_id
      WHERE ${yardScope(req.user!)} AND p.branch_id = ${req.user!.branch_id}::uuid
      AND (v.vin ILIKE ${term} OR p.inspector_username_snapshot ILIKE ${term})
      AND ${result === 'all' ? sql`true` : sql`p.result = ${result}`}
      ORDER BY p.sequence DESC LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`);
    res.json({ data: rows.slice(0, pageSize), page, has_more: rows.length > pageSize });
  } catch (err) { next(err); }
});

router.get('/vehicles/:vin', async (req, res, next) => {
  try {
    const vehicle = await readVehicle(vinSchema.parse(req.params.vin), req.user!);
    if (!vehicle) { res.status(404).json({ error: 'Vehicle not found in your permitted yards.' }); return; }
    res.json(vehicle);
  } catch (err) { next(err); }
});

router.get('/vehicles/:vin/inspections', async (req, res, next) => {
  try {
    const { page } = querySchema.parse(req.query);
    const vehicle = await readVehicle(vinSchema.parse(req.params.vin), req.user!);
    if (!vehicle) { res.status(404).json({ error: 'Vehicle not found in your permitted yards.' }); return; }
    const rows = await db.execute(sql`SELECT ${historySelect} FROM pdi_inspections p
      JOIN branches b ON b.id = p.branch_id JOIN yards y ON y.id = p.yard_id
      LEFT JOIN vehicle_status vs ON vs.vehicle_id = p.vehicle_id
      WHERE p.vehicle_id = ${vehicle.id}::uuid AND ${yardScope(req.user!)}
      ORDER BY p.sequence DESC LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`);
    res.json({ data: rows.slice(0, pageSize), page, has_more: rows.length > pageSize });
  } catch (err) { next(err); }
});

router.post('/vehicles/:vin/inspections', requireRole('pdi'), async (req, res, next) => {
  try {
    const vin = vinSchema.parse(req.params.vin);
    const body = inspectionBody.parse(req.body);
    const user = req.user!;
    const outcome = await db.transaction(async tx => {
      // Serialize inspections, VIN edits, and deletion on this vehicle; lock status
      // separately so movement cannot change eligibility between validation and insert.
      const [vehicle] = await tx.execute(sql`SELECT id, vin FROM vehicles WHERE vin = ${vin} FOR UPDATE`);
      if (!vehicle) return { status: 404, body: { error: 'Vehicle not found in your permitted yards.' } };
      const [status] = await tx.execute(sql`SELECT current_yard_id, current_status FROM vehicle_status
        WHERE vehicle_id = ${vehicle.id}::uuid FOR UPDATE`);
      const memberships = await tx.execute(sql`SELECT byard.yard_id FROM branch_yards byard
        JOIN branches b ON b.id = byard.branch_id AND b.active = true
        WHERE b.id = ${user.branch_id}::uuid FOR SHARE OF byard, b`);
      if (!canReadPdi(user, status?.current_yard_id as string | null, memberships.map(r => String(r.yard_id)))) {
        return { status: 404, body: { error: 'Vehicle not found in your permitted yards.' } };
      }
      const [existing] = await tx.execute(sql`SELECT * FROM pdi_inspections WHERE submission_id = ${body.submission_id}::uuid`);
      if (existing) {
        if (existing.vehicle_id !== vehicle.id || existing.inspector_id !== user.id
          || existing.result !== body.result || existing.remarks !== body.remarks
          || existing.yard_id !== body.expected_yard_id) {
          return { status: 409, body: { error: 'This submission ID was already used. Reload the vehicle before submitting again.' } };
        }
        return { status: 200, body: { inspection: existing, duplicate: true } };
      }
      if (status.current_status !== 'in' || status.current_yard_id !== body.expected_yard_id) {
        return { status: 409, body: { error: 'The vehicle location or stock status changed. Reload its details before inspecting.', code: 'VEHICLE_MOVED' } };
      }
      const [latest] = await tx.execute(sql`SELECT id FROM pdi_inspections WHERE vehicle_id = ${vehicle.id}::uuid ORDER BY sequence DESC LIMIT 1`);
      if ((latest?.id ?? null) !== body.expected_latest_id) {
        return { status: 409, body: { error: 'Another inspection was saved. Review the latest result before submitting yours.', code: 'PDI_CHANGED' } };
      }
      const [account] = await tx.execute(sql`SELECT username FROM credentials
        WHERE id = ${user.id}::uuid AND role = 'pdi' AND branch_id = ${user.branch_id}::uuid FOR SHARE`);
      if (!account) return { status: 403, body: { error: 'Your branch account changed. Sign in again.' } };
      const [inspection] = await tx.execute(sql`INSERT INTO pdi_inspections
        (vehicle_id, vin_snapshot, branch_id, yard_id, inspector_id, inspector_username_snapshot,
         checking_completed, result, remarks, submission_id)
        VALUES (${vehicle.id}::uuid, ${vehicle.vin}, ${user.branch_id}::uuid, ${status.current_yard_id},
          ${user.id}::uuid, ${account.username}, true, ${body.result}, ${body.remarks}, ${body.submission_id}::uuid)
        RETURNING *`);
      return { status: 201, body: { inspection } };
    });
    if (outcome.status === 201) emitPdiEvent();
    res.status(outcome.status).json(outcome.body);
  } catch (err: any) {
    if (err.code === '23505' || err.cause?.code === '23505') {
      res.status(409).json({ error: 'Submission already exists. Reload the vehicle before submitting again.' }); return;
    }
    next(err);
  }
});

export default router;
