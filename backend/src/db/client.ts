import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Supabase transaction pooler (port 6543) requires prepare: false.
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 8,
  idle_timeout: 20,
  max_lifetime: 60 * 10,
  connect_timeout: 8,
  connection: {
    application_name: 'stockyard-api',
    statement_timeout: 10000,
  },
});
export const db = drizzle(client, { schema });

/** One-shot DB ping that cannot leak a connection into the shared pool. */
export async function pingDatabase(timeoutMs = 5000): Promise<number> {
  const started = Date.now();
  const ping = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 1,
    connect_timeout: Math.max(1, Math.ceil(timeoutMs / 1000)),
    idle_timeout: 5,
    max_lifetime: 30,
    connection: {
      application_name: 'stockyard-api-ready',
      statement_timeout: timeoutMs,
    },
  });
  try {
    await Promise.race([
      ping`select 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db ping timeout')), timeoutMs),
      ),
    ]);
    return Date.now() - started;
  } finally {
    await ping.end({ timeout: 2 }).catch(() => undefined);
  }
}
