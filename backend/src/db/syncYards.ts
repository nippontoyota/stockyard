/**
 * Sync yards table with backend/src/lib/yardData.ts without wiping vehicles.
 * Usage: npm run db:sync-yards
 */
import 'dotenv/config';
import { db } from './client.js';
import { yards, branches, branchYards, credentials, vehicleStatus, scans } from './schema.js';
import { YARD_DATA } from '../lib/yardData.js';
import { NIPPON_BRANCHES, LEGACY_YARD_REMAP } from '../lib/branches.js';
import { yardUsername, defaultPasswordForRole } from '../lib/credentials.js';
import { eq, notInArray, inArray, sql } from 'drizzle-orm';

async function syncYards() {
  await db.execute(
    sql`ALTER TABLE yards ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 50`,
  );

  const ids = YARD_DATA.map((y) => y.id);
  console.log(`Syncing ${ids.length} yards...`);

  for (const yard of YARD_DATA) {
    await db
      .insert(yards)
      .values({ ...yard, active: true })
      .onConflictDoUpdate({
        target: yards.id,
        set: {
          code: yard.code,
          name: yard.name,
          city: yard.city,
          capacity: yard.capacity,
          active: true,
        },
      });
  }

  // Remap vehicles/scans off legacy ids before deactivating those yards
  let remapped = 0;
  for (const [fromId, toId] of Object.entries(LEGACY_YARD_REMAP)) {
    if (!ids.includes(toId)) {
      console.warn(`  Skip remap ${fromId} → ${toId} (target missing)`);
      continue;
    }
    const vs = await db
      .update(vehicleStatus)
      .set({ current_yard_id: toId })
      .where(eq(vehicleStatus.current_yard_id, fromId))
      .returning({ vehicle_id: vehicleStatus.vehicle_id });
    const sc = await db
      .update(scans)
      .set({ yard_id: toId })
      .where(eq(scans.yard_id, fromId))
      .returning({ id: scans.id });
    remapped += vs.length + sc.length;
    if (vs.length || sc.length) {
      console.log(`  Remapped ${fromId} → ${toId}: ${vs.length} status, ${sc.length} scans`);
    }
  }
  console.log(`Legacy remaps touched ${remapped} rows.`);

  const deactivated = await db
    .update(yards)
    .set({ active: false })
    .where(notInArray(yards.id, ids))
    .returning({ id: yards.id });

  console.log(`Upserted ${ids.length} yards. Deactivated ${deactivated.length} legacy rows.`);

  if (deactivated.length > 0) {
    const deadIds = deactivated.map((y) => y.id);
    await db.delete(branchYards).where(inArray(branchYards.yard_id, deadIds));
    const deadCreds = await db
      .delete(credentials)
      .where(andYardCredentials(deadIds))
      .returning({ username: credentials.username });
    console.log(`Removed ${deadCreds.length} credentials for deactivated yards.`);
  }

  const allBranches = await db.select().from(branches);
  const branchByName = new Map(allBranches.map((b) => [b.name, b]));

  for (const conf of NIPPON_BRANCHES) {
    if (!branchByName.has(conf.name)) {
      const [created] = await db.insert(branches).values({ name: conf.name }).returning();
      branchByName.set(conf.name, created);
      console.log(`  Created branch: ${conf.name}`);
    }
  }

  const activeYards = await db.select().from(yards).where(eq(yards.active, true));
  const existingLinks = await db.select().from(branchYards);
  const linked = new Set(existingLinks.map((l) => `${l.branch_id}:${l.yard_id}`));

  let linksAdded = 0;
  for (const conf of NIPPON_BRANCHES) {
    const branch = branchByName.get(conf.name);
    if (!branch) {
      console.warn(`  Branch not found: ${conf.name}`);
      continue;
    }
    for (const code of conf.yardCodes) {
      for (const yard of activeYards.filter((y) => y.code === code)) {
        const key = `${branch.id}:${yard.id}`;
        if (linked.has(key)) continue;
        await db.insert(branchYards).values({ branch_id: branch.id, yard_id: yard.id });
        linked.add(key);
        linksAdded++;
      }
    }
  }
  console.log(`Added ${linksAdded} branch-yard links.`);

  let credsAdded = 0;
  for (const yard of YARD_DATA) {
    const username = yardUsername(yard.id);
    const [existing] = await db.select().from(credentials).where(eq(credentials.username, username));
    if (existing) continue;
    await db.insert(credentials).values({
      username,
      password: defaultPasswordForRole('yard', yard.code),
      role: 'yard',
      yard_id: yard.id,
      branch_id: null,
    });
    credsAdded++;
  }
  console.log(`Added ${credsAdded} yard credentials.`);

  const activeAfter = await db.select().from(yards).where(eq(yards.active, true));
  console.log(`Done. ${activeAfter.length} active yards in database.`);
  process.exit(0);
}

function andYardCredentials(deadIds: string[]) {
  return inArray(credentials.yard_id, deadIds);
}

syncYards().catch((err) => {
  console.error('Yard sync failed:', err);
  process.exit(1);
});
