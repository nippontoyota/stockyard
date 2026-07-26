import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, scans, flags, yards } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { detectModel } from '../lib/vin.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin'));

/**
 * §4.4 — Data export endpoints. Stream CSV for stock, flags, and vehicle history.
 */

function csvRow(values: (string | number | boolean | null | undefined)[]) {
  return values.map(v => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',');
}

// ─── GET /stock ──────────────────────────────────────────────────────
router.get('/stock', async (req, res, next) => {
  try {
    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.yardId) {
      conditions.push(eq(vehicleStatus.current_yard_id, req.query.yardId as string));
    }
    if (req.query.status) {
      conditions.push(eq(vehicleStatus.current_status, req.query.status as string));
    }

    const rows = await db
      .select({
        vin: vehicles.vin,
        model: vehicles.model,
        current_status: vehicleStatus.current_status,
        current_yard_id: vehicleStatus.current_yard_id,
        last_changed_at: vehicleStatus.last_changed_at,
        key_no: vehicleStatus.key_no,
      })
      .from(vehicles)
      .leftJoin(vehicleStatus, eq(vehicles.id, vehicleStatus.vehicle_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(vehicleStatus.last_changed_at));

    const format = req.query.format || 'csv';
    if (format === 'json') {
      res.json({ data: rows });
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="stock-export-${new Date().toISOString().slice(0,10)}.csv"`);

    res.write(csvRow(['VIN', 'Model', 'Status', 'Yard ID', 'Last Changed', 'Key No']) + '\n');
    for (const r of rows) {
      res.write(csvRow([
        r.vin,
        r.model && r.model !== 'Unknown' ? r.model : detectModel(r.vin),
        r.current_status,
        r.current_yard_id,
        r.last_changed_at?.toISOString(),
        r.key_no,
      ]) + '\n');
    }
    res.end();
  } catch (err) { next(err); }
});

// ─── GET /flags ──────────────────────────────────────────────────────
router.get('/flags', async (req, res, next) => {
  try {
    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.resolved === 'true') conditions.push(eq(flags.resolved, true));
    else if (req.query.resolved === 'false') conditions.push(eq(flags.resolved, false));

    const rows = await db
      .select({
        vin: vehicles.vin,
        flag_type: flags.flag_type,
        message: flags.message,
        resolved: flags.resolved,
        resolved_by: flags.resolved_by,
        created_at: flags.created_at,
        resolved_at: flags.resolved_at,
      })
      .from(flags)
      .innerJoin(vehicles, eq(flags.vehicle_id, vehicles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(flags.created_at));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="flags-export-${new Date().toISOString().slice(0,10)}.csv"`);

    res.write(csvRow(['VIN', 'Flag Type', 'Message', 'Resolved', 'Resolved By', 'Created', 'Resolved At']) + '\n');
    for (const r of rows) {
      res.write(csvRow([r.vin, r.flag_type, r.message, r.resolved, r.resolved_by, r.created_at?.toISOString(), r.resolved_at?.toISOString()]) + '\n');
    }
    res.end();
  } catch (err) { next(err); }
});

// ─── GET /history ────────────────────────────────────────────────────
router.get('/history', async (req, res, next) => {
  try {
    if (!req.query.vin) {
      res.status(400).json({ error: 'vin query parameter required' });
      return;
    }

    const rows = await db
      .select({
        scan_type: scans.scan_type,
        vin_raw: scans.vin_raw,
        yard_id: scans.yard_id,
        scanned_at: scans.scanned_at,
        out_remark: scans.out_remark,
        key_no: scans.key_no,
        damaged: scans.damaged,
        damage_remark: scans.damage_remark,
        status: scans.status,
        gps_accuracy_meters: scans.gps_accuracy_meters,
      })
      .from(scans)
      .innerJoin(vehicles, eq(scans.vehicle_id, vehicles.id))
      .where(eq(vehicles.vin, (req.query.vin as string).toUpperCase()))
      .orderBy(desc(scans.scanned_at));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="history-${req.query.vin}-${new Date().toISOString().slice(0,10)}.csv"`);

    res.write(csvRow(['Type', 'VIN', 'Yard', 'Scanned At', 'Remark', 'Key No', 'Damaged', 'Damage Remark', 'Status', 'GPS Accuracy']) + '\n');
    for (const r of rows) {
      res.write(csvRow([r.scan_type, r.vin_raw, r.yard_id, r.scanned_at?.toISOString(), r.out_remark, r.key_no, r.damaged, r.damage_remark, r.status, r.gps_accuracy_meters]) + '\n');
    }
    res.end();
  } catch (err) { next(err); }
});

export default router;
