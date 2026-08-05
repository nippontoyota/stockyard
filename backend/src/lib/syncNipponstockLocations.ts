import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, vehicleStatus, yards } from '../db/schema.js';
import { formatYardLabel } from './yardLabel.js';

const CHUNK = 500;
const FETCH_MS = 30_000;

/** Map stockyard status + yard → nipponstock stockyardLocation string. */
export function locationString(
  status: string,
  yard: { code?: string | null; name?: string | null; id?: string | null } | null,
): string | null {
  if (!yard) return null;
  const label = formatYardLabel(yard);
  if (status === 'in') return label;
  if (status === 'transit') return `In transit → ${label}`;
  if (status === 'out') return `OUT · ${label}`;
  return label; // unknown status: still show yard
}

let running = false;

export async function syncNipponstockLocations(): Promise<{
  total: number;
  updated: number;
  notFound: number;
  chunks: number;
} | null> {
  const baseUrl = process.env.NIPPONSTOCK_API_URL?.replace(/\/$/, '');
  const secret = process.env.LOCATION_SYNC_SECRET;
  if (!baseUrl || !secret) return null;

  if (running) {
    console.warn('[nipponstock-sync] skipped: previous run still in progress');
    return null;
  }
  running = true;

  try {
    const rows = await db
      .select({
        vin: vehicles.vin,
        status: vehicleStatus.current_status,
        yardCode: yards.code,
        yardName: yards.name,
        yardId: yards.id,
      })
      .from(vehicleStatus)
      .innerJoin(vehicles, eq(vehicleStatus.vehicle_id, vehicles.id))
      .innerJoin(yards, eq(vehicleStatus.current_yard_id, yards.id))
      .where(isNotNull(vehicleStatus.current_yard_id));

    const updates: { chassisNumber: string; stockyardLocation: string }[] = [];
    for (const row of rows) {
      const loc = locationString(row.status, {
        code: row.yardCode,
        name: row.yardName,
        id: row.yardId,
      });
      if (!loc || !row.vin) continue;
      updates.push({
        chassisNumber: row.vin.trim().toUpperCase(),
        stockyardLocation: loc,
      });
    }

    let updated = 0;
    let notFound = 0;
    let chunks = 0;

    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      chunks += 1;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_MS);
      try {
        const res = await fetch(`${baseUrl}/stock/sync-locations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ updates: slice }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const body = (await res.json()) as { updated?: number; notFound?: number };
        updated += body.updated ?? 0;
        notFound += body.notFound ?? 0;
      } finally {
        clearTimeout(timer);
      }
    }

    console.log(
      `[nipponstock-sync] total=${updates.length} updated=${updated} notFound=${notFound} chunks=${chunks}`,
    );
    return { total: updates.length, updated, notFound, chunks };
  } finally {
    running = false;
  }
}

export function startNipponstockLocationSync(intervalMs = 5 * 60 * 1000) {
  if (!process.env.NIPPONSTOCK_API_URL || !process.env.LOCATION_SYNC_SECRET) {
    console.log('[nipponstock-sync] disabled (NIPPONSTOCK_API_URL / LOCATION_SYNC_SECRET unset)');
    return;
  }
  // Delay first run so boot traffic settles (same idea as dwell check).
  setTimeout(() => {
    syncNipponstockLocations().catch((err) =>
      console.error('[nipponstock-sync] failed:', err),
    );
    setInterval(() => {
      syncNipponstockLocations().catch((err) =>
        console.error('[nipponstock-sync] failed:', err),
      );
    }, intervalMs);
  }, 60_000);
}
