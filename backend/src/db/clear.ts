/**
 * Wipe all vehicle inventory data for a fresh test run.
 * Keeps yards, branches, credentials, and devices.
 * Usage: npm run db:clear
 */
import 'dotenv/config';
import { db } from './client.js';
import {
  vehicles,
  scans,
  vehicleStatus,
  flags,
  notifications,
  requisitions,
  auditLogs,
} from './schema.js';

async function clear() {
  console.log('Clearing vehicle data...');

  await db.delete(notifications);
  await db.delete(requisitions);
  await db.delete(flags);
  await db.delete(vehicleStatus);
  await db.delete(scans);
  await db.delete(vehicles);
  await db.delete(auditLogs);

  console.log('Done. Removed all vehicles, scans, flags, requisitions, and notifications.');
  console.log('Yards, branches, and login credentials are unchanged.');
  process.exit(0);
}

clear().catch((e) => {
  console.error('Failed to clear database:', e);
  process.exit(1);
});
