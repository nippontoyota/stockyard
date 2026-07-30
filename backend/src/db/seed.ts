/**
 * Seed script — run once to populate yards and create Supabase Auth users.
 * Usage: npm run db:seed
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env
 */
import 'dotenv/config';
import { db } from './client.js';
import { yards, branches, branchYards } from './schema.js';
import { createClient } from '@supabase/supabase-js';
import { YARD_DATA } from '../lib/yardData.js';
import { NIPPON_BRANCHES } from '../lib/branches.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const YARD_DATA_SEED = YARD_DATA;

async function seed() {
  console.log('Seeding yards...');

  // Insert yards — each row is a separate physical location even when codes repeat
  await db
    .insert(yards)
    .values(YARD_DATA_SEED.map((y) => ({ ...y })))
    .onConflictDoNothing();

  const insertedYards = await db.select().from(yards);
  console.log(`Loaded ${insertedYards.length} yards`);

  // Clear existing branch data
  await db.delete(branchYards);
  await db.delete(branches);

  // Create Branches based on exact NIPPON_BRANCHES list
  console.log('Seeding branches...');

  const insertedBranches = await db.insert(branches).values(NIPPON_BRANCHES.map(b => ({ name: b.name }))).returning({ id: branches.id, name: branches.name });
  
  // Link branches and yards
  const branchYardInserts = [];
  const codeToBranchId = new Map<string, string>();
  for (let i = 0; i < NIPPON_BRANCHES.length; i++) {
    const branchConf = NIPPON_BRANCHES[i];
    const bId = insertedBranches[i].id;
    for (const code of branchConf.yardCodes) {
      codeToBranchId.set(code, bId);
      const matchingYards = insertedYards.filter(y => y.code === code);
      for (const y of matchingYards) {
        branchYardInserts.push({ branch_id: bId, yard_id: y.id });
      }
    }
  }
  
  if (branchYardInserts.length > 0) {
    await db.insert(branchYards).values(branchYardInserts);
  }
  console.log(`Inserted ${insertedBranches.length} branches and mapped yards.`);

  // Create Supabase Auth users for each unique yard code
  const codeToYardId = new Map<string, string>();
  for (const y of insertedYards) {
    if (!codeToYardId.has(y.code)) {
      codeToYardId.set(y.code, y.id);
    }
  }

  console.log('Creating Supabase Auth users for yards...');
  const DEFAULT_YARD_PASSWORD = 'stockyard123'; // Change per yard in production
  const DEFAULT_DELIVERY_PASSWORD = 'delivery123';

  for (const [code, yardId] of codeToYardId) {
    const email = `${code.toLowerCase()}@yard.nippon`;
    const branchId = codeToBranchId.get(code); // Might be undefined
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEFAULT_YARD_PASSWORD,
      email_confirm: true,
      app_metadata: { role: 'stockyard', yard_id: yardId, branch_id: branchId },
    });

    if (error) {
      console.warn(`  ${email}: ${error.message}`);
    } else {
      console.log(`  Created: ${email} (yard_id: ${yardId}, branch_id: ${branchId || 'unassigned'})`);
    }
  }

  // Create delivery_incharge user for each branch
  console.log('Creating delivery_incharge users for branches...');
  for (const branch of insertedBranches) {
    const branchSlug = branch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const deliveryEmail = `${branchSlug}@delivery.nippon`;
    const { error: deliveryErr } = await supabase.auth.admin.createUser({
      email: deliveryEmail,
      password: DEFAULT_DELIVERY_PASSWORD,
      email_confirm: true,
      app_metadata: { role: 'delivery_incharge', branch_id: branch.id },
    });
    
    if (deliveryErr) {
      console.warn(`  ${deliveryEmail}: ${deliveryErr.message}`);
    } else {
      console.log(`  Created: ${deliveryEmail} (branch_id: ${branch.id})`);
    }
  }

  // Create admin user
  console.log('Creating admin user...');
  const { data: adminData, error: adminErr } = await supabase.auth.admin.createUser({
    email: 'admin@nippon.toyota',
    password: 'admin123', // Change in production
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });

  if (adminErr) {
    console.warn(`  admin: ${adminErr.message}`);
  } else {
    console.log(`  Created: admin@nippon.toyota`);
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
