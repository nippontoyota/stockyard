/**
 * Seed script — run once to populate yards and create Supabase Auth users.
 * Usage: npm run db:seed
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env
 */
import 'dotenv/config';
import { db } from './client.js';
import { yards } from './schema.js';
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
  const insertedYards = await db
    .insert(yards)
    .values(YARD_DATA.map((y) => ({ ...y })))
    .returning({ id: yards.id, code: yards.code, name: yards.name });

  console.log(`Inserted ${insertedYards.length} yards`);

  // Create Supabase Auth users for each unique yard code
  // Multiple physical locations share one code → one login per code
  const codeToYardId = new Map<string, string>();
  for (const y of insertedYards) {
    // Use the first yard ID for each code (login maps to a code, not a physical yard)
    // The frontend will let users pick the specific physical yard after login
    if (!codeToYardId.has(y.code)) {
      codeToYardId.set(y.code, y.id);
    }
  }

  console.log('Creating Supabase Auth users for yards...');
  const DEFAULT_YARD_PASSWORD = 'stockyard123'; // Change per yard in production

  for (const [code, yardId] of codeToYardId) {
    const email = `${code.toLowerCase()}@yard.nippon`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEFAULT_YARD_PASSWORD,
      email_confirm: true,
      app_metadata: { role: 'stockyard', yard_id: yardId },
    });

    if (error) {
      // May already exist from a previous seed run
      console.warn(`  ${email}: ${error.message}`);
    } else {
      console.log(`  Created: ${email} (yard_id: ${yardId})`);
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
