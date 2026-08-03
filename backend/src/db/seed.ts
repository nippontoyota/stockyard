/**
 * Seed script — yards, branches, and app login credentials.
 * Usage: npm run db:seed
 *
 * Logins (credentials table):
 *   admin  → password ADMIN123
 *   yard   → pick yard in UI; password = yard code (e.g. CO01A)
 *   delivery → password delivery123
 */
import 'dotenv/config';
import { db } from './client.js';
import { yards, branches, branchYards, credentials } from './schema.js';
import { YARD_DATA } from '../lib/yardData.js';
import { NIPPON_BRANCHES } from '../lib/branches.js';
import {
  ADMIN_USERNAME,
  ADMIN_DEFAULT_PASSWORD,
  DELIVERY_DEFAULT_PASSWORD,
  yardUsername,
  deliveryUsername,
  defaultPasswordForRole,
} from '../lib/credentials.js';

async function seed() {
  console.log('Seeding yards...');

  await db
    .insert(yards)
    .values(YARD_DATA.map((y) => ({ ...y })))
    .onConflictDoNothing();

  const insertedYards = await db.select().from(yards);
  console.log(`Loaded ${insertedYards.length} yards`);

  await db.delete(branchYards);
  await db.delete(branches);

  console.log('Seeding branches...');
  const insertedBranches = await db
    .insert(branches)
    .values(NIPPON_BRANCHES.map((b) => ({ name: b.name })))
    .returning({ id: branches.id, name: branches.name });

  const branchYardInserts = [];
  for (let i = 0; i < NIPPON_BRANCHES.length; i++) {
    const branchConf = NIPPON_BRANCHES[i];
    const bId = insertedBranches[i].id;
    for (const code of branchConf.yardCodes) {
      for (const y of insertedYards.filter((row) => row.code === code)) {
        branchYardInserts.push({ branch_id: bId, yard_id: y.id });
      }
    }
  }

  if (branchYardInserts.length > 0) {
    await db.insert(branchYards).values(branchYardInserts);
  }
  console.log(`Inserted ${insertedBranches.length} branches and mapped yards.`);

  console.log('Seeding login credentials...');
  await db.delete(credentials);

  const activeYards = insertedYards.filter((y) => y.active);
  await db.insert(credentials).values([
    {
      username: ADMIN_USERNAME,
      password: ADMIN_DEFAULT_PASSWORD,
      role: 'admin',
      yard_id: null,
      branch_id: null,
    },
    ...activeYards.map((y) => ({
      username: yardUsername(y.id),
      password: defaultPasswordForRole('yard', y.code),
      role: 'yard',
      yard_id: y.id,
      branch_id: null,
    })),
    ...insertedBranches.map((b) => ({
      username: deliveryUsername(b.id),
      password: DELIVERY_DEFAULT_PASSWORD,
      role: 'delivery_incharge',
      yard_id: null,
      branch_id: b.id,
    })),
  ]);

  console.log(
    `Credentials: 1 admin (ADMIN123), ${activeYards.length} yards (password=code), ${insertedBranches.length} delivery (delivery123)`,
  );
  console.log(`Car models: in code at backend/src/shared/carModels.js (not DB).`);
  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
