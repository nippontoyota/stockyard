import 'dotenv/config';
import { db } from './client.js';
import { vehicles, scans, vehicleStatus, flags } from './schema.js';

async function clear() {
  console.log('Clearing database tables...');
  await db.delete(flags);
  await db.delete(vehicleStatus);
  await db.delete(scans);
  await db.delete(vehicles);
  console.log('Database cleared! All vehicles, scans, and flags have been removed.');
  process.exit(0);
}

clear().catch(e => {
  console.error('Failed to clear database:', e);
  process.exit(1);
});
