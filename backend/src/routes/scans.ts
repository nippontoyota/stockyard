import { Router } from 'express';
import { z } from 'zod';
import { eq, and, count, desc, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scans, vehicles, vehicleStatus, devices, flags, yards, requisitions, notifications, branchYards } from '../db/schema.js';
import { isValidVin } from '../lib/vin.js';
import { CAR_MODELS, isCarModel } from '../shared/carModels.js';
import { authenticate } from '../middleware/auth.js';
import { emitScanEvent, emitFlagEvent, emitRequisitionEvent } from '../lib/socket.js';
import { uploadBase64Image } from '../lib/supabase.js';
import { notifyRoleAtBranch, notifyStockyardAtYard } from '../lib/webPush.js';

const router = Router();
router.use(authenticate);

const carModelSchema = z
  .string()
  .trim()
  .refine((value) => isCarModel(value), {
    message: `model must be one of: ${CAR_MODELS.join(', ')}`,
  });

// ─── Zod schemas ─────────────────────────────────────────────────────

const scanCommon = z.object({
  vin: z.string().min(1),
  scanned_at: z.string().datetime(),
  yard_id: z.string().optional(),
  device_fingerprint: z.string().min(1),
  client_scan_id: z.string().min(1),
  key_no: z.string().optional(),
  damaged: z.boolean().optional(),
  damage_remark: z.string().optional(),
  damage_image: z.string().optional(),
  drive_type: z.enum(['neo_drive', 'hybrid', 'petrol', 'diesel']).optional(),
});

const scanInBase = scanCommon.extend({
  model: carModelSchema,
});

const scanInBody = scanInBase.refine((d) => !d.damaged || (d.damage_remark && d.damage_remark.length > 0), {
  message: 'damage_remark is required when damaged is true',
  path: ['damage_remark'],
});

const scanOutBase = scanCommon.extend({
  out_remark: z.enum(['customer_acquisition', 'stockyard_transfer']),
  transfer_destination_yard_id: z.string().optional(),
  transfer_requested_by: z.string().optional(),
  damaged: z.boolean(),
  damage_remark: z.string().optional(),
  damage_image: z.string().optional(),
});

const scanOutBody = scanOutBase
  .refine((d) => !d.damaged || (d.damage_remark && d.damage_remark.length > 0), {
    message: 'damage_remark is required when damaged is true',
    path: ['damage_remark'],
  })
  .refine((d) => d.out_remark !== 'stockyard_transfer' || (d.transfer_destination_yard_id && d.transfer_requested_by), {
    message: 'transfer_destination_yard_id and transfer_requested_by are required for stockyard_transfer',
    path: ['transfer_destination_yard_id'],
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

async function findOrCreateDevice(fingerprint: string, txOrDb: any = db): Promise<string> {
  const result = await txOrDb
    .insert(devices)
    .values({ device_fingerprint: fingerprint })
    .onConflictDoUpdate({
      target: devices.device_fingerprint,
      set: { last_seen_at: new Date() },
    })
    .returning({ id: devices.id });
  return result[0].id;
}

async function findOrCreateVehicle(
  vinRaw: string,
  opts: { driveType?: string; model?: string } = {},
  txOrDb: any = db,
): Promise<{ id: string; vinValid: boolean }> {
  const vin = vinRaw.toUpperCase().trim();
  const vinValid = isValidVin(vin);
  const model = opts.model?.trim() || undefined;

  const result = await txOrDb
    .insert(vehicles)
    .values({
      vin,
      model: model ?? null,
      drive_type: opts.driveType,
      vin_valid: vinValid,
      variant: null,
      colour: null,
    })
    .onConflictDoUpdate({
      target: vehicles.vin,
      set: {
        updated_at: new Date(),
        ...(model ? { model } : {}),
        ...(opts.driveType ? { drive_type: opts.driveType } : {}),
        vin_valid: vinValid,
        variant: null,
        colour: null,
      },
    })
    .returning({ id: vehicles.id });
  return { id: result[0].id, vinValid };
}

async function createFlag(vehicleId: string, scanId: string | null, flagType: string, message: string, vin?: string, txOrDb: any = db) {
  const [flag] = await txOrDb.insert(flags).values({ vehicle_id: vehicleId, scan_id: scanId, flag_type: flagType, message }).returning();
  emitFlagEvent({ id: flag.id, vehicleId, vin: vin ?? '', flagType, message });
}

// ─── Core Logic ──────────────────────────────────────────────────────

async function processScanIn(body: ScanIn, yardId: string) {
  // Idempotency check outside transaction
  const [existing] = await db.select({ id: scans.id }).from(scans).where(eq(scans.client_scan_id, body.client_scan_id));
  if (existing) return { scan_id: existing.id, status: 'already_processed' as const };

  // Upload image outside transaction (external I/O)
  let damageImageUrl: string | undefined = body.damage_image;
  if (body.damage_image) {
    const uploaded = await uploadBase64Image(body.damage_image);
    damageImageUrl = uploaded ?? undefined;
  }

  return db.transaction(async (tx) => {
    const { id: vehicleId, vinValid } = await findOrCreateVehicle(
      body.vin,
      { driveType: body.drive_type, model: body.model },
      tx,
    );
    const deviceId = await findOrCreateDevice(body.device_fingerprint, tx);
    const [currentStatus] = await tx.select().from(vehicleStatus).where(eq(vehicleStatus.vehicle_id, vehicleId));

    if (currentStatus?.current_status === 'in' && currentStatus.current_yard_id === yardId) {
      const [scan] = await tx.insert(scans).values({
        client_scan_id: body.client_scan_id, vehicle_id: vehicleId, vin_raw: body.vin, scan_type: 'in', yard_id: yardId, device_id: deviceId, scanned_at: new Date(body.scanned_at), key_no: body.key_no, status: 'rejected',
      }).returning();
      return { scan_id: scan.id, status: 'rejected' as const, error: 'Vehicle is already marked IN at this yard' };
    }

    const [scan] = await tx.insert(scans).values({
      client_scan_id: body.client_scan_id, vehicle_id: vehicleId, vin_raw: body.vin, scan_type: 'in', yard_id: yardId, device_id: deviceId, scanned_at: new Date(body.scanned_at), key_no: body.key_no, damaged: body.damaged, damage_remark: body.damage_remark, damage_image: damageImageUrl, status: 'accepted',
    }).returning();

    const scanTime = new Date(body.scanned_at);
    if (!currentStatus || currentStatus.last_changed_at <= scanTime) {
      await tx.insert(vehicleStatus).values({
        vehicle_id: vehicleId, current_status: 'in', current_yard_id: yardId, last_in_scan_id: scan.id, last_changed_at: scanTime, key_no: body.key_no,
      }).onConflictDoUpdate({
        target: vehicleStatus.vehicle_id, set: { current_status: 'in', current_yard_id: yardId, last_in_scan_id: scan.id, last_changed_at: scanTime, ...(body.key_no ? { key_no: body.key_no } : {}), override_reason: null },
      });
    }

    const flagsList: string[] = [];
    if (!vinValid) { await createFlag(vehicleId, scan.id, 'invalid_vin', `VIN "${body.vin}" does not match expected format`, body.vin, tx); flagsList.push('invalid_vin'); }
    if (body.damaged) { await createFlag(vehicleId, scan.id, 'damage_reported', body.damage_remark ?? 'Damage reported', body.vin, tx); flagsList.push('damage_reported'); }
    if (body.damage_image && !damageImageUrl) { await createFlag(vehicleId, scan.id, 'photo_upload_failed', 'Damage photo upload failed — image not saved', body.vin, tx); flagsList.push('photo_upload_failed'); }
    
    if (currentStatus?.current_status === 'in' && currentStatus.current_yard_id !== yardId) {
      let oldYardCode = String(currentStatus.current_yard_id);
      if (currentStatus.current_yard_id) {
        const [oldY] = await tx.select({ code: yards.code }).from(yards).where(eq(yards.id, currentStatus.current_yard_id));
        if (oldY) oldYardCode = oldY.code;
      }
      let newYardCode = yardId;
      const [newY] = await tx.select({ code: yards.code }).from(yards).where(eq(yards.id, yardId));
      if (newY) newYardCode = newY.code;

      await createFlag(vehicleId, scan.id, 'duplicate_yard_status', `Vehicle was IN at yard ${oldYardCode}, now scanned IN at ${newYardCode}`, body.vin, tx);
      flagsList.push('duplicate_yard_status');
    }
    
    return { scan_id: scan.id, status: 'accepted' as const, flags: flagsList };
  });
}

async function processScanOut(body: ScanOut, yardId: string) {
  const [existing] = await db.select({ id: scans.id }).from(scans).where(eq(scans.client_scan_id, body.client_scan_id));
  if (existing) return { scan_id: existing.id, status: 'already_processed' as const };

  // Upload image outside transaction (external I/O)
  let damageImageUrl: string | undefined = body.damage_image;
  if (body.damage_image) {
    const uploaded = await uploadBase64Image(body.damage_image);
    damageImageUrl = uploaded ?? undefined;
  }

  return db.transaction(async (tx) => {
    const { id: vehicleId, vinValid } = await findOrCreateVehicle(
      body.vin,
      { driveType: body.drive_type },
      tx,
    );
    const deviceId = await findOrCreateDevice(body.device_fingerprint, tx);
    const [currentStatus] = await tx.select().from(vehicleStatus).where(eq(vehicleStatus.vehicle_id, vehicleId));

    const [scan] = await tx.insert(scans).values({
      client_scan_id: body.client_scan_id, vehicle_id: vehicleId, vin_raw: body.vin, scan_type: 'out', yard_id: yardId, device_id: deviceId, scanned_at: new Date(body.scanned_at), key_no: body.key_no, out_remark: body.out_remark, transfer_destination_yard_id: body.transfer_destination_yard_id, transfer_requested_by: body.transfer_requested_by, damaged: body.damaged, damage_remark: body.damage_remark, damage_image: damageImageUrl, status: 'accepted',
    }).returning();

    const scanTime = new Date(body.scanned_at);
    const isTransfer = body.out_remark === 'stockyard_transfer';
    const nextStatus = isTransfer ? 'transit' : 'out';
    const nextYardId = isTransfer ? body.transfer_destination_yard_id! : yardId;

    if (!currentStatus || currentStatus.last_changed_at <= scanTime) {
      await tx.insert(vehicleStatus).values({
        vehicle_id: vehicleId,
        current_status: nextStatus,
        current_yard_id: nextYardId,
        last_out_scan_id: scan.id,
        last_changed_at: scanTime,
        key_no: body.key_no,
      }).onConflictDoUpdate({
        target: vehicleStatus.vehicle_id,
        set: {
          current_status: nextStatus,
          current_yard_id: nextYardId,
          last_out_scan_id: scan.id,
          last_changed_at: scanTime,
          ...(body.key_no ? { key_no: body.key_no } : {}),
          override_reason: null,
        },
      });
    }

    const flagsList: string[] = [];
    if (!currentStatus || currentStatus.current_status !== 'in') { await createFlag(vehicleId, scan.id, 'unverified_in', 'OUT scan with no prior IN record', body.vin, tx); flagsList.push('unverified_in'); }
    if (!vinValid) { await createFlag(vehicleId, scan.id, 'invalid_vin', `VIN "${body.vin}" does not match expected format`, body.vin, tx); flagsList.push('invalid_vin'); }
    if (body.damaged) { await createFlag(vehicleId, scan.id, 'damage_reported', body.damage_remark ?? 'Damage reported', body.vin, tx); flagsList.push('damage_reported'); }
    if (body.damage_image && !damageImageUrl) { await createFlag(vehicleId, scan.id, 'photo_upload_failed', 'Damage photo upload failed — image not saved', body.vin, tx); flagsList.push('photo_upload_failed'); }

    if (isTransfer) {
      const destYardId = body.transfer_destination_yard_id!;
      const [destBranch] = await tx
        .select({ branch_id: branchYards.branch_id })
        .from(branchYards)
        .where(eq(branchYards.yard_id, destYardId))
        .limit(1);

      const [reqRecord] = await tx
        .update(requisitions)
        .set({ status: 'fulfilled', fulfilled_at: scanTime })
        .where(
          and(
            eq(requisitions.vehicle_id, vehicleId),
            eq(requisitions.status, 'approved')
          )
        )
        .returning();

      if (reqRecord) {
        await tx.insert(notifications).values({
          user_role: 'delivery_incharge',
          branch_id: reqRecord.requesting_branch_id,
          message: 'Vehicle is in transit to your branch. Open Incoming to receive it.',
          type: 'requisition_fulfilled',
          related_req_id: reqRecord.id,
        });
        notifyRoleAtBranch('delivery_incharge', reqRecord.requesting_branch_id, {
          title: 'Vehicle In Transit',
          body: 'Transfer started — open Incoming to receive the vehicle.',
          url: '/incoming',
        }).catch(() => {});
      } else if (destBranch) {
        await tx.insert(notifications).values({
          user_role: 'delivery_incharge',
          branch_id: destBranch.branch_id,
          message: `Vehicle ${body.vin.toUpperCase()} is in transit to your yard.`,
          type: 'vehicle_inbound',
        });
        notifyRoleAtBranch('delivery_incharge', destBranch.branch_id, {
          title: 'Vehicle In Transit',
          body: 'A vehicle is on the way — open Incoming to receive it.',
          url: '/incoming',
        }).catch(() => {});
      }

      if (destBranch) {
        await tx.insert(notifications).values({
          user_role: 'stockyard',
          branch_id: destBranch.branch_id,
          message: `Vehicle ${body.vin.toUpperCase()} is in transit to yard ${destYardId}. Open Incoming to receive it.`,
          type: 'vehicle_inbound',
        });
      }
      notifyStockyardAtYard(destYardId, {
        title: 'Incoming Vehicle',
        body: 'A transfer is on the way — open Incoming to receive it.',
        url: '/incoming',
      }).catch(() => {});
    } else {
      await tx
        .update(requisitions)
        .set({
          status: 'rejected',
          rejected_at: scanTime,
          rejection_reason: 'Vehicle scanned out for another reason',
        })
        .where(
          and(
            eq(requisitions.vehicle_id, vehicleId),
            inArray(requisitions.status, ['pending', 'approved'])
          )
        );
    }

    return { scan_id: scan.id, status: 'accepted' as const, flags: flagsList };
  });
}

// ─── POST /in ────────────────────────────────────────────────────────

router.post('/in', async (req, res, next) => {
  try {
    const parsed = scanInBody.parse(req.body);
    const yardId = parsed.yard_id || req.user!.yard_id;
    if (!yardId) { res.status(400).json({ error: 'Yard ID is required for scan' }); return; }
    
    const result = await processScanIn(parsed, yardId);
    if (result.status === 'accepted') {
      emitScanEvent({ type: 'in', vin: parsed.vin, model: null, yardId, timestamp: parsed.scanned_at, status: 'accepted', flagType: result.flags?.[0] });
    }
    if (result.status === 'rejected') res.status(409).json(result);
    else res.status(result.status === 'already_processed' ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

// ─── POST /out ───────────────────────────────────────────────────────

router.post('/out', async (req, res, next) => {
  try {
    const parsed = scanOutBody.parse(req.body);
    const yardId = parsed.yard_id || req.user!.yard_id;
    if (!yardId) { res.status(400).json({ error: 'Yard ID is required for scan' }); return; }

    const result = await processScanOut(parsed, yardId);
    if (result.status === 'accepted') {
      emitScanEvent({ type: 'out', vin: parsed.vin, model: null, yardId, timestamp: parsed.scanned_at, status: 'accepted', flagType: result.flags?.[0] });
      emitRequisitionEvent();
    }
    res.status(result.status === 'already_processed' ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

// ─── POST /bulk-sync ─────────────────────────────────────────────────

router.post('/bulk-sync', async (req, res, next) => {
  try {
    const body = bulkSyncBody.parse(req.body);
    const results: Array<{ client_scan_id: string; status: string; error?: string; flags?: string[] }> = [];

    for (const scanData of body.scans) {
      const targetYardId = scanData.yard_id || req.user!.yard_id;
      if (!targetYardId) {
        results.push({ client_scan_id: scanData.client_scan_id, status: 'rejected', error: 'Yard ID is required for scan' });
        continue;
      }
      if (scanData.scan_type === 'in') {
        results.push({ client_scan_id: scanData.client_scan_id, ...await processScanIn(scanData, targetYardId) });
      } else {
        results.push({ client_scan_id: scanData.client_scan_id, ...await processScanOut(scanData, targetYardId) });
      }
    }
    res.json({ results });
  } catch (err) { next(err); }
});

// ─── GET / ───────────────────────────────────────────────────────────
// List recent scans for cross-device synchronization

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 1000));
    const rows = await db
      .select({
        id: scans.id,
        clientScanId: scans.client_scan_id,
        vin: vehicles.vin,
        vinRaw: scans.vin_raw,
        type: scans.scan_type,
        yardId: scans.yard_id,
        scannedAt: scans.scanned_at,
        damaged: scans.damaged,
        damageRemark: scans.damage_remark,
        damageImage: scans.damage_image,
        outRemark: scans.out_remark,
        transferDestinationYardId: scans.transfer_destination_yard_id,
        transferRequestedBy: scans.transfer_requested_by,
        keyNo: scans.key_no,
        status: scans.status,
      })
      .from(scans)
      .innerJoin(vehicles, eq(scans.vehicle_id, vehicles.id))
      .orderBy(desc(scans.scanned_at))
      .limit(limit);

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
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
