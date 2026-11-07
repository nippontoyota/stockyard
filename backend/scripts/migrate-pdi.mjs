import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const migration = await readFile(new URL('../migrations/pdi.sql', import.meta.url), 'utf8');
  await client.begin(async tx => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`SELECT pg_advisory_xact_lock(7310254)`;
    await tx.unsafe(migration);
  });
  console.log('PDI table and indexes ready. Existing records were not modified.');
} finally {
  await client.end();
}
