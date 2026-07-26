import { eq, and, lt, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicleStatus, flags, yards, vehicles } from '../db/schema.js';

/**
 * F6 — Dwell time alert checker.
 * Finds vehicles IN longer than threshold and creates dwell_exceeded flags.
 * Default threshold: 30 days.
 */
export async function checkDwellAlerts(defaultThresholdDays = 30) {
  try {
    // Find vehicles that have been IN too long and don't already have an open dwell flag
    const staleVehicles = await db.execute(sql`
      SELECT vs.vehicle_id, v.vin, vs.current_yard_id,
             EXTRACT(EPOCH FROM (NOW() - vs.last_changed_at)) / 86400 AS dwell_days
      FROM vehicle_status vs
      JOIN vehicles v ON v.id = vs.vehicle_id
      WHERE vs.current_status = 'in'
        AND vs.last_changed_at < NOW() - INTERVAL '${sql.raw(String(defaultThresholdDays))} days'
        AND NOT EXISTS (
          SELECT 1 FROM flags f
          WHERE f.vehicle_id = vs.vehicle_id
            AND f.flag_type = 'dwell_exceeded'
            AND f.resolved = false
        )
    `);

    let created = 0;
    for (const row of staleVehicles as any[]) {
      await db.insert(flags).values({
        vehicle_id: row.vehicle_id,
        flag_type: 'dwell_exceeded',
        message: `Vehicle has been IN for ${Math.round(row.dwell_days)} days at yard ${row.current_yard_id}`,
      });
      created++;
    }

    console.log(`[dwell-check] Created ${created} dwell alerts`);
    return created;
  } catch (err) {
    console.error('[dwell-check] Error:', err);
    return 0;
  }
}
