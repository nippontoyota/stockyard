import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Supabase transaction pooler (port 6543) requires prepare: false.
// connect_timeout + statement_timeout: fail fast instead of hanging forever
// when the pooler/network wedges (which surfaces as AbortError in the UI).
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  connection: {
    application_name: 'stockyard-api',
    statement_timeout: 15000,
  },
});
export const db = drizzle(client, { schema });
