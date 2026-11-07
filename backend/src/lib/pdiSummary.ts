import { sql, type SQL } from 'drizzle-orm';
import { vehicles } from '../db/schema.js';
import { pdiEnabled } from './pdiPolicy.js';

// Gate reads until the additive migration is applied; old deployments keep working.
export function latestPdiSummary(vehicleId: SQL = sql`${vehicles.id}`) {
  if (!pdiEnabled()) return sql`'{"disabled":true}'::jsonb`;
  return sql`(SELECT jsonb_build_object('id', p.id, 'result', p.result, 'created_at', p.created_at)
    FROM pdi_inspections p WHERE p.vehicle_id = ${vehicleId}
    ORDER BY p.sequence DESC LIMIT 1)`;
}
