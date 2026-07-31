/**
 * One-time migration: drop GPS columns and legacy GPS flags.
 * Usage: npm run db:drop-gps
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './client.js';
import { sql } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, '../../drizzle/0003_drop_gps_columns.sql');

async function dropGpsColumns() {
  const migration = readFileSync(migrationPath, 'utf8');
  const statements = migration
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);

  console.log(`Applying ${statements.length} GPS cleanup statements...`);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
    console.log(`  ok: ${statement.slice(0, 60)}...`);
  }
  console.log('GPS columns and legacy flags removed.');
  process.exit(0);
}

dropGpsColumns().catch((err) => {
  console.error('GPS migration failed:', err);
  process.exit(1);
});
