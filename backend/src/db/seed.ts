/**
 * Seed script — run once to populate yards and create Supabase Auth users.
 * Usage: npm run db:seed
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env
 */
import 'dotenv/config';
import { db } from './client.js';
import { yards, branches, branchYards } from './schema.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const YARD_DATA = [
  { id: 'CO01A-1', code: 'CO01A', name: 'Nettur Showroom, Cochin', city: 'Cochin', capacity: 125 },
  { id: 'CO01B-1', code: 'CO01B', name: 'Kalamasery, Cochin', city: 'Cochin', capacity: 200 },
  { id: 'CO01B-2', code: 'CO01B', name: 'Nippon Tower - 7th floor, Cochin', city: 'Cochin', capacity: 80 },
  { id: 'KY01A-1', code: 'KY01A', name: 'Showroom, Kayamkulam', city: 'Kayamkulam', capacity: 60 },
  { id: 'KY01A-2', code: 'KY01A', name: 'Ramapuram East, Kayamkulam', city: 'Kayamkulam', capacity: 210 },
  { id: 'KY01A-3', code: 'KY01A', name: 'Ramapuram West, Kayamkulam', city: 'Kayamkulam', capacity: 80 },
  { id: 'KY01A-4', code: 'KY01A', name: 'Evoor Yard, Kayamkulam', city: 'Kayamkulam', capacity: 110 },
  { id: 'IR01A-1', code: 'IR01A', name: 'Showroom, Irinjalakuda', city: 'Irinjalakuda', capacity: 30 },
  { id: 'KL01A-1', code: 'KL01A', name: 'Showroom, Kollam', city: 'Kollam', capacity: 55 },
  { id: 'KL01B-1', code: 'KL01B', name: 'Thazhuthala, Kollam', city: 'Kollam', capacity: 225 },
  { id: 'TI01A-1', code: 'TI01A', name: 'Peramangalam, Trissur', city: 'Trissur', capacity: 175 },
  { id: 'MV01A-1', code: 'MV01A', name: 'Muvattupuzha', city: 'Muvattupuzha', capacity: 105 },
  { id: 'PH01A-1', code: 'PH01A', name: 'Pathanamthitta', city: 'Pathanamthitta', capacity: 70 },
  { id: 'TL01A-1', code: 'TL01A', name: 'Thiruvalla', city: 'Thiruvalla', capacity: 45 },
  { id: 'TR01C-1', code: 'TR01C', name: 'Vallakkadavu, Trivandrum', city: 'Trivandrum', capacity: 45 },
  { id: 'TR01C-2', code: 'TR01C', name: 'Enchakkal, Trivandrum', city: 'Trivandrum', capacity: 20 },
  { id: 'TR01A-1', code: 'TR01A', name: 'Showroom, Kazhakuttam, Trivandrum', city: 'Trivandrum', capacity: 40 },
  { id: 'TR01A-2', code: 'TR01A', name: 'Yard-1, Kazhakuttam, Trivandrum', city: 'Trivandrum', capacity: 130 },
  { id: 'TR01A-3', code: 'TR01A', name: 'Yard-2, Kazhakuttam, Trivandrum', city: 'Trivandrum', capacity: 65 },
  { id: 'TR01A-4', code: 'TR01A', name: 'Yard-3, Kazhakuttam, Trivandrum', city: 'Trivandrum', capacity: 130 },
  { id: 'KT01A-1', code: 'KT01A', name: 'Kottayam, behind the showroom', city: 'Kottayam', capacity: 300 },
] as const;

async function seed() {
  console.log('Seeding yards...');

  // Insert yards — each row is a separate physical location even when codes repeat
  await db
    .insert(yards)
    .values(YARD_DATA.map((y) => ({ ...y })))
    .onConflictDoNothing();

  const insertedYards = await db.select().from(yards);
  console.log(`Loaded ${insertedYards.length} yards`);

  // Clear existing branch data
  await db.delete(branchYards);
  await db.delete(branches);

  // Create Branches based on exact NIPPON_BRANCHES list
  console.log('Seeding branches...');
  const NIPPON_BRANCHES = [
    { name: 'Enchakkal', yardCodes: ['TR01C'] },
    { name: 'Kazhakootam', yardCodes: ['TR01A'] },
    { name: 'Kochuveli', yardCodes: [] },
    { name: 'Kalamassery (Nippon Towers)', yardCodes: ['CO01B'] },
    { name: 'Nettoor', yardCodes: ['CO01A'] },
    { name: 'Muvattupuzha', yardCodes: ['MV01A'] },
    { name: 'Puzhakkal (Ayyanthole)', yardCodes: ['TI01A'] },
    { name: 'Nadathara', yardCodes: [] },
    { name: 'Vellangallur (Irinjalakuda)', yardCodes: ['IR01A'] },
    { name: 'Nattakom', yardCodes: ['KT01A'] },
    { name: 'Thellakom', yardCodes: [] },
    { name: 'Pala', yardCodes: [] },
    { name: 'Kottiyam (Kollam)', yardCodes: ['KL01A', 'KL01B'] },
    { name: 'Pathanamthitta', yardCodes: ['PH01A'] },
    { name: 'Thiruvalla', yardCodes: ['TL01A'] },
    { name: 'Kayamkulam', yardCodes: ['KY01A'] }
  ];

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
