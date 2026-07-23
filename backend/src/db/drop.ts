import 'dotenv/config';
import { db } from './client.js';
import { sql } from 'drizzle-orm';

async function drop() {
  await db.execute(sql`DROP TABLE IF EXISTS flags, vehicle_status, scans, vehicles, devices, yards CASCADE`);
  console.log('Tables dropped');
  process.exit(0);
}
drop();
