import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Supabase transaction pooler (port 6543) requires prepare: false
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 10,
  idle_timeout: 5,
  max_lifetime: 60 * 30,
  connection: {
    application_name: 'stockyard-api',
  },
});
export const db = drizzle(client, { schema });
