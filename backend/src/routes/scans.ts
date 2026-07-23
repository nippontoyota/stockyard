import { Router } from 'express';
import { z } from 'zod';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scans, vehicles, vehicleStatus, devices, flags, yards } from '../db/schema.js';
import { isValidVin, detectModel, resolveVehicleMetadata } from '../lib/vin.js';
import { haversineMeters } from '../lib/geo.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ─── Zod schemas ─────────────────────────────────────────────────────

const scanInBase = z.object({
  vin: z.string().min(1),
  scanned_at: z.string().datetime(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  gps_accuracy_meters: z.number().nullish(),
  device_fingerprint: z.string().min(1),
  client_scan_id: z.string().min(1),
  damaged: z.boolean().optional(),
  damage_remark: z.string().optional(),
  damage_image: z.string().optional(),
});

const scanInBody = scanInBase.refine((d) => !d.damaged || (d.damage_remark && d.damage_remark.length > 0), {
  message: 'damage_remark is required when damaged is true',
  path: ['damage_remark'],
});

const scanOutBase = scanInBase.extend({
  out_remark: z.enum(['customer_acquisition', 'stockyard_transfer']),
  damaged: z.boolean(),
  damage_remark: z.string().optional(),
  damage_image: z.string().optional(),
});

const scanOutBody = scanOutBase.refine((d) => !d.damaged || (d.damage_remark && d.damage_remark.length > 0), {
  message: 'damage_remark is required when damaged is true',
  path: ['damage_remark'],
});

const bulkSyncBody = z.object({
  scans: z.array(
    z.discriminatedUnion('scan_type', [
      z.object({ scan_type: z.literal('in') }).merge(scanInBase),
      z.object({ scan_type: z.literal('out') }).merge(scanOutBase),
    ]),
  ),
});

type ScanIn = z.infer<typeof scanInBody>;
type ScanOut = z.infer<typeof scanOutBody>;

// ─── Helpers ─────────────────────────────────────────────────────────

async function findOrCreateDevice(fingerprint: string): Promise<string> {
  const result = await db
    .insert(devices)
    .values({ device_fingerprint: fingerprint })
    .onConflictDoUpdate({
      target: devices.device_fingerprint,
      set: { last_seen_at: new Date() },
    })
    .returning({ id: devices.id });
  return result[0].id;
}

async function findOrCreateVehicle(vinRaw: string): Promise<{ id: string; vinValid: boolean }> {
  const vin = vinRaw.toUpperCase().trim();
  const vinValid = isValidVin(vin);
  const model = await resolveVehicleMetadata(vin);

  const result = await db
    .insert(vehicles)
    .values({ vin, model, vin_valid: vinValid })
    .onConflictDoUpdate({
      target: vehicles.vin,
      set: { updated_at: new Date(), ...(model ? { model } : {}), vin_valid: vinValid },
    })
    .returning({ id: vehicles.id });
  return { id: result[0].id, vinValid };
}

async function createFlag(vehicleId: string, scanId: string | null, flagType: string, message: string) {
  await db.insert(flags).values({ vehicle_id: vehicleId, scan_id: scanId, flag_type: flagType, message });
}

async function checkGps(yardId: string, lat: number | undefined, lon: number | undefined, vehicleId: string, scanId: string) {
  if (lat == null || lon == null) return;
  const [yard] = await db.select({ latitude: yards.latitude, longitude: yards.longitude, gps_radius_meters: yards.gps_radius_meters }).from(yards).where(eq(yards.id, yardId));
  if (!yard?.latitude || !yard?.longitude) return;

  const distance = haversineMeters(Number(yard.latitude), Number(yard.longitude), lat, lon);
  if (distance > yard.gps_radius_meters) {
    await createFlag(vehicleId, scanId, 'gps_outside_yard', `Scan GPS is ${Math.round(distance)}m from yard center (radius: ${yard.gps_radius_meters}m)`);
  }
}

async function checkCapacity(yardId: string, vehicleId: string, scanId: string) {
  const [yard] = await db.select({ capacity: yards.capacity }).from(yards).where(eq(yards.id, yardId));
  if (!yard) return;

  const [{ value: currentCount }] = await db.select({ value: count() }).from(vehicleStatus).where(and(eq(vehicleStatus.current_yard_id, yardId), eq(vehicleStatus.current_status, 'in')));
  if (Number(currentCount) > yard.capacity) {
    await createFlag(vehicleId, scanId, 'yard_capacity_exceeded', `Yard at ${currentCount}/${yard.capacity} vehicles`);
  }
}

// ─── Core Logic ──────────────────────────────────────────────────────

async function processScanIn(body: ScanIn, yardId: string) {
  const [existing] = await db.select({ id: scans.id }).from(scans).where(eq(scans.client_scan_id, body.client_scan_id));
  if (existing) return { scan_id: existing.id, status: 'already_processed' };

  const { id: vehicleId, vinValid } = await findOrCreateVehicle(body.vin);
  const deviceId = await findOrCreateDevice(body.device_fingerprint);
  const [currentStatus] = await db.select().from(vehicleStatus).where(eq(vehicleStatus.vehicle_id, vehicleId));

  if (currentStatus?.current_status === 'in' && currentStatus.current_yard_id === yardId) {
    const [scan] = await db.insert(scans).values({
      client_scan_id: body.client_scan_id, vehicle_id: vehicleId, vin_raw: body.vin, scan_type: 'in', yard_id: yardId, device_id: deviceId, scanned_at: new Date(body.scanned_at), latitude: body.latitude?.toString(), longitude: body.longitude?.toString(), gps_accuracy_meters: body.gps_accuracy_meters?.toString(), status: 'rejected',
    }).returning();
    return { scan_id: scan.id, status: 'rejected', error: 'Vehicle is already marked IN at this yard' };
  }

  const [scan] = await db.insert(scans).values({
    client_scan_id: body.client_scan_id, vehicle_id: vehicleId, vin_raw: body.vin, scan_type: 'in', yard_id: yardId, device_id: deviceId, scanned_at: new Date(body.scanned_at), latitude: body.latitude?.toString(), longitude: body.longitude?.toString(), gps_accuracy_meters: body.gps_accuracy_meters?.toString(), damaged: body.damaged, damage_remark: body.damage_remark, damage_image: body.damage_image, status: 'accepted',
  }).returning();

  const scanTime = new Date(body.scanned_at);
  if (!currentStatus || currentStatus.last_changed_at <= scanTime) {
    await db.insert(vehicleStatus).values({
      vehicle_id: vehicleId, current_status: 'in', current_yard_id: yardId, last_in_scan_id: scan.id, last_changed_at: scanTime,
    }).onConflictDoUpdate({
      target: vehicleStatus.vehicle_id, set: { current_status: 'in', current_yard_id: yardId, last_in_scan_id: scan.id, last_changed_at: scanTime, override_reason: null },
    });
  }

  const flagsList: string[] = [];
  if (!vinValid) { await createFlag(vehicleId, scan.id, 'invalid_vin', `VIN "${body.vin}" does not match expected format`); flagsList.push('invalid_vin'); }
  if (body.damaged) { await createFlag(vehicleId, scan.id, 'damage_reported', body.damage_remark ?? 'Damage reported'); flagsList.push('damage_reported'); }
  
  if (currentStatus?.current_status === 'in' && currentStatus.current_yard_id !== yardId) {
    let oldYardCode = String(currentStatus.current_yard_id);
    if (currentStatus.current_yard_id) {
      const [oldY] = await db.select({ code: yards.code }).from(yards).where(eq(yards.id, currentStatus.current_yard_id));
      if (oldY) oldYardCode = oldY.code;
    }
    let newYardCode = yardId;
    const [newY] = await db.select({ code: yards.code }).from(yards).where(eq(yards.id, yardId));
    if (newY) newYardCode = newY.code;

    await createFlag(vehicleId, scan.id, 'duplicate_yard_status', `Vehicle was IN at yard ${oldYardCode}, now scanned IN at ${newYardCode}`);
    flagsList.push('duplicate_yard_status');
  }
  
  await checkGps(yardId, body.latitude ?? undefined, body.longitude ?? undefined, vehicleId, scan.id);
  await checkCapacity(yardId, vehicleId, scan.id);

  return { scan_id: scan.id, status: 'accepted', flags: flagsList };
}

async function processScanOut(body: ScanOut, yardId: string) {
  const [existing] = await db.select({ id: scans.id }).from(scans).where(eq(scans.client_scan_id, body.client_scan_id));
  if (existing) return { scan_id: existing.id, status: 'already_processed' };

  const { id: vehicleId, vinValid } = await findOrCreateVehicle(body.vin);
  const deviceId = await findOrCreateDevice(body.device_fingerprint);
  const [currentStatus] = await db.select().from(vehicleStatus).where(eq(vehicleStatus.vehicle_id, vehicleId));

  const [scan] = await db.insert(scans).values({
    client_scan_id: body.client_scan_id, vehicle_id: vehicleId, vin_raw: body.vin, scan_type: 'out', yard_id: yardId, device_id: deviceId, scanned_at: new Date(body.scanned_at), latitude: body.latitude?.toString(), longitude: body.longitude?.toString(), gps_accuracy_meters: body.gps_accuracy_meters?.toString(), out_remark: body.out_remark, damaged: body.damaged, damage_remark: body.damage_remark, damage_image: body.damage_image, status: 'accepted',
  }).returning();

  const scanTime = new Date(body.scanned_at);
  if (!currentStatus || currentStatus.last_changed_at <= scanTime) {
    await db.insert(vehicleStatus).values({
      vehicle_id: vehicleId, current_status: 'out', current_yard_id: yardId, last_out_scan_id: scan.id, last_changed_at: scanTime,
    }).onConflictDoUpdate({
      target: vehicleStatus.vehicle_id, set: { current_status: 'out', current_yard_id: yardId, last_out_scan_id: scan.id, last_changed_at: scanTime, override_reason: null },
    });
  }

  const flagsList: string[] = [];
  if (!currentStatus || currentStatus.current_status !== 'in') { await createFlag(vehicleId, scan.id, 'unverified_in', 'OUT scan with no prior IN record'); flagsList.push('unverified_in'); }
  if (!vinValid) { await createFlag(vehicleId, scan.id, 'invalid_vin', `VIN "${body.vin}" does not match expected format`); flagsList.push('invalid_vin'); }
  if (body.damaged) { await createFlag(vehicleId, scan.id, 'damage_reported', body.damage_remark ?? 'Damage reported'); flagsList.push('damage_reported'); }
  await checkGps(yardId, body.latitude ?? undefined, body.longitude ?? undefined, vehicleId, scan.id);

  return { scan_id: scan.id, status: 'accepted', flags: flagsList };
}

// ─── POST /in ────────────────────────────────────────────────────────

router.post('/in', async (req, res, next) => {
  try {
    const yardId = req.user!.yard_id;
    if (!yardId) { res.status(400).json({ error: 'User is not assigned to a yard' }); return; }
    
    const result = await processScanIn(scanInBody.parse(req.body), yardId);
    if (result.status === 'rejected') res.status(409).json(result);
    else res.status(result.status === 'already_processed' ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

// ─── POST /out ───────────────────────────────────────────────────────

router.post('/out', async (req, res, next) => {
  try {
    const yardId = req.user!.yard_id;
    if (!yardId) { res.status(400).json({ error: 'User is not assigned to a yard' }); return; }

    const result = await processScanOut(scanOutBody.parse(req.body), yardId);
    res.status(result.status === 'already_processed' ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

// ─── POST /bulk-sync ─────────────────────────────────────────────────

router.post('/bulk-sync', async (req, res, next) => {
  try {
    const body = bulkSyncBody.parse(req.body);
    const yardId = req.user!.yard_id;
    if (!yardId) { res.status(400).json({ error: 'User is not assigned to a yard' }); return; }

    const results: Array<{ client_scan_id: string; status: string; error?: string; flags?: string[] }> = [];

    for (const scanData of body.scans) {
      if (scanData.scan_type === 'in') {
        results.push({ client_scan_id: scanData.client_scan_id, ...await processScanIn(scanData, yardId) });
      } else {
        results.push({ client_scan_id: scanData.client_scan_id, ...await processScanOut(scanData, yardId) });
      }
    }
    res.json({ results });
  } catch (err) { next(err); }
});

// ─── GET /:id ────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const [scan] = await db.select().from(scans).where(eq(scans.id, req.params.id));
    if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
    res.json(scan);
  } catch (err) { next(err); }
});

export default router;
