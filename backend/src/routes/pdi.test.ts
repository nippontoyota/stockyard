import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import express from 'express';
import { ZodError } from 'zod';
import * as schema from '../db/schema.js';
import { signSessionToken } from '../lib/session.js';
import { hashPdiPassword } from '../lib/pdiPasswords.js';

const storage = vi.hoisted(() => ({ db: null as any }));
vi.mock('../db/client.js', () => ({ db: new Proxy({}, { get: (_t, key) => storage.db[key] }) }));
vi.mock('../lib/socket.js', () => ({ emitPdiEvent: vi.fn(), emitScanEvent: vi.fn(), emitFlagEvent: vi.fn(), emitRequisitionEvent: vi.fn() }));
import pdiRoutes from './pdi.js';
import vehicleRoutes from './vehicles.js';
import scanRoutes from './scans.js';
import adminRoutes from './admin.js';
import { authRouter } from './auth.js';
import { authenticate } from '../middleware/auth.js';

// Execute the actual SQL and route handlers on isolated PostgreSQL, never DATABASE_URL.
function postgresRowsAdapter(database: any): any {
  return new Proxy(database, { get(target, key) {
    if (key === 'execute') return async (query: any) => (await target.execute(query)).rows;
    if (key === 'transaction') return (callback: any) => target.transaction((tx: any) => callback(postgresRowsAdapter(tx)));
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

let pg: PGlite;
let server: Server;
let base: string;
let migration: string;
const branchA = '10000000-0000-4000-8000-000000000001';
const branchB = '10000000-0000-4000-8000-000000000002';
const inspectorA = '20000000-0000-4000-8000-000000000001';
const inspectorB = '20000000-0000-4000-8000-000000000002';
const vehicleA = '30000000-0000-4000-8000-000000000001';
const vehicleB = '30000000-0000-4000-8000-000000000002';
const vinA = 'JTDBR32E720000001';
const vinB = 'JTDBR32E720000002';
const account = (branch = branchA) => ({ id: branch === branchA ? inspectorA : inspectorB, role: 'pdi', branch_id: branch, yard_id: null });
const admin = { id: '40000000-0000-4000-8000-000000000001', role: 'admin', branch_id: null, yard_id: null };
const body = (extra = {}) => ({ submission_id: randomUUID(), expected_latest_id: null, expected_yard_id: 'yard-a', checking_completed: true, result: 'repair_required', remarks: 'Headlamp needs repair', ...extra });

async function request(path: string, user: any = account(), payload?: any, method = payload ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { authorization: `Bearer ${signSessionToken(user)}`, 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
async function originalData() {
  const result: Record<string, unknown> = {};
  for (const name of ['vehicles', 'vehicle_status', 'credentials', 'yards', 'branches', 'branch_yards', 'devices', 'scans', 'flags', 'requisitions', 'notifications']) {
    result[name] = (await pg.query(`SELECT row_to_json(t) AS value FROM ${name} t ORDER BY row_to_json(t)::text`)).rows;
  }
  return result;
}

beforeAll(async () => {
  vi.stubEnv('PDI_ENABLED', 'true');
  vi.stubEnv('SESSION_SECRET', 'pdi-test-secret');
  pg = new PGlite();
  storage.db = postgresRowsAdapter(drizzle(pg));
  const { pdiInspections: _newTable, ...existingSchema } = schema;
  const baseline = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(existingSchema));
  await pg.exec(baseline.join(';\n'));
  migration = await readFile(new URL('../../migrations/pdi.sql', import.meta.url), 'utf8');
  await pg.exec(migration);
  const app = express();
  app.use(express.json());
  app.use('/api/pdi', pdiRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/scans', scanRoutes);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', authRouter, adminRoutes);
  // Existing API surface must be denied before a PDI caller can enter its handlers.
  app.use('/api', authenticate, (_req, res) => res.json({ reached_legacy_route: true }));
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err instanceof ZodError ? 400 : 500).json({ error: err.message });
  });
  server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30000);

beforeEach(async () => {
  vi.stubEnv('PDI_ENABLED', 'true');
  await pg.exec('TRUNCATE pdi_inspections, vehicles, credentials, yards, branches, devices CASCADE');
  await pg.query(`INSERT INTO branches (id,name) VALUES ($1,'Branch A'),($2,'Branch B')`, [branchA, branchB]);
  await pg.exec(`INSERT INTO yards (id,code,name,capacity) VALUES ('yard-a','A','Yard A',100),('yard-b','B','Yard B',100)`);
  await pg.query('INSERT INTO branch_yards VALUES ($1,$2),($3,$4)', [branchA, 'yard-a', branchB, 'yard-b']);
  await pg.query(`INSERT INTO credentials (id,username,password,role,branch_id) VALUES
    ($1,'pdi.a',$3,'pdi',$4),($2,'pdi.b',$3,'pdi',$5),($6,'admin','existing-password','admin',NULL)`,
  [inspectorA, inspectorB, hashPdiPassword('Inspector123'), branchA, branchB, admin.id]);
  await pg.query(`INSERT INTO vehicles (id,vin,model,variant,colour,vin_valid) VALUES
    ($1,$2,'Innova','Existing variant','Existing colour',true),($3,$4,'Fortuner',NULL,NULL,true)`, [vehicleA, vinA, vehicleB, vinB]);
  await pg.query(`INSERT INTO vehicle_status (vehicle_id,current_status,current_yard_id,key_no) VALUES ($1,'in','yard-a','K1'),($2,'in','yard-b','K2')`, [vehicleA, vehicleB]);
  await pg.query(`INSERT INTO flags (vehicle_id,flag_type,message) VALUES ($1,'damage_reported','Existing damage flag')`, [vehicleA]);
  await pg.exec("INSERT INTO devices (device_fingerprint) VALUES ('existing-device')");
  await pg.query(`INSERT INTO scans (client_scan_id,vehicle_id,vin_raw,scan_type,yard_id,device_id,scanned_at,status)
    SELECT 'existing-scan',$1,$2,'in','yard-a',id,now(),'accepted' FROM devices`, [vehicleA, vinA]);
  await pg.query(`UPDATE vehicle_status SET last_in_scan_id = (SELECT id FROM scans LIMIT 1) WHERE vehicle_id = $1`, [vehicleA]);
  await pg.query(`INSERT INTO requisitions (requesting_branch_id,source_branch_id,vehicle_id,requested_by)
    VALUES ($1,$2,$3,'Existing delivery team')`, [branchB, branchA, vehicleA]);
  await pg.query(`INSERT INTO notifications (user_role,branch_id,message,type,related_req_id)
    SELECT 'delivery_incharge',$1,'Existing notification','requisition_created',id FROM requisitions`, [branchB]);
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  if (pg) await pg.close();
  vi.unstubAllEnvs();
});

describe('branch PDI integration', () => {
  it('reapplies the additive migration without changing existing records', async () => {
    const before = await originalData();
    await pg.exec(migration);
    expect(await originalData()).toEqual(before);
  });

  it('scopes list, lookup, history and submission to the current branch', async () => {
    const list = await request('/pdi/vehicles');
    expect(list.status).toBe(200);
    expect(list.body.data.map((v: any) => v.vin)).toEqual([vinA]);
    for (const path of [`/pdi/vehicles/${vinB}`, `/pdi/vehicles/${vinB}/inspections`]) {
      expect((await request(path)).status).toBe(404);
    }
    expect((await request(`/pdi/vehicles/${vinB}/inspections`, account(), body())).status).toBe(404);
    expect((await request(`/pdi/vehicles/${vinA}`)).body.pdi).toBeNull();
    expect((await request('/pdi/vehicles', { ...account(), branch_id: null })).status).toBe(403);
  });

  it('saves repairs without changing stock data or flags, supports retries and append-only reinspection', async () => {
    const before = await originalData();
    const payload = body();
    const first = await request(`/pdi/vehicles/${vinA}/inspections`, account(), payload);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.inspection.inspector_id).toBe(inspectorA);
    expect(await originalData()).toEqual(before);
    const retry = await request(`/pdi/vehicles/${vinA}/inspections`, account(), payload);
    expect(retry.status).toBe(200);
    expect(retry.body.inspection.id).toBe(first.body.inspection.id);
    expect((await request(`/pdi/vehicles/${vinA}/inspections`, account(), { ...payload, result: 'ok' })).status).toBe(409);
    const stale = await request(`/pdi/vehicles/${vinA}/inspections`, account(), body({ result: 'ok' }));
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('PDI_CHANGED');
    const second = await request(`/pdi/vehicles/${vinA}/inspections`, account(), body({ expected_latest_id: first.body.inspection.id, result: 'ok', remarks: '' }));
    expect(second.status).toBe(201);
    const history = await request(`/pdi/vehicles/${vinA}/inspections`);
    expect(history.body.data.map((v: any) => v.result)).toEqual(['ok', 'repair_required']);
    expect((await request(`/pdi/vehicles/${vinA}`)).body.pdi.result).toBe('ok');
    expect(await originalData()).toEqual(before);
  });

  it('preserves inspection history on transfer and rejects a stale yard or OUT vehicle', async () => {
    const first = await request(`/pdi/vehicles/${vinA}/inspections`, account(), body());
    await pg.query("UPDATE vehicle_status SET current_yard_id = 'yard-b' WHERE vehicle_id = $1", [vehicleA]);
    expect((await request(`/pdi/vehicles/${vinA}`)).status).toBe(404);
    const history = await request(`/pdi/vehicles/${vinA}/inspections`, account(branchB));
    expect(history.body.data[0].id).toBe(first.body.inspection.id);
    expect((await request(`/pdi/vehicles/${vinA}/inspections`, account(branchB), body())).body.code).toBe('VEHICLE_MOVED');
    const second = await request(`/pdi/vehicles/${vinA}/inspections`, account(branchB), body({ expected_yard_id: 'yard-b', expected_latest_id: first.body.inspection.id, result: 'ok' }));
    expect(second.status).toBe(201);
    await pg.query("UPDATE vehicle_status SET current_status = 'out' WHERE vehicle_id = $1", [vehicleA]);
    expect((await request(`/pdi/vehicles/${vinA}/inspections`, account(branchB), body({ expected_yard_id: 'yard-b', expected_latest_id: second.body.inspection.id }))).status).toBe(409);
  });

  it('allows Admin delivery when Repair Required is the latest result', async () => {
    await request(`/pdi/vehicles/${vinA}/inspections`, account(), body());
    const delivered = await request('/vehicles/deliver', admin, { vins: [vinA] }, 'PATCH');
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    expect((await pg.query("SELECT current_status FROM vehicle_status WHERE vehicle_id = $1", [vehicleA])).rows).toEqual([{ current_status: 'out' }]);
    expect((await request(`/pdi/vehicles/${vinA}`, admin)).body.pdi.result).toBe('repair_required');
  });

  it('protects inspection history against deletion and keeps the whole delete transaction intact', async () => {
    await request(`/pdi/vehicles/${vinA}/inspections`, account(), body());
    const before = await originalData();
    const removed = await request(`/admin/vehicles/${vinA}`, admin, undefined, 'DELETE');
    expect(removed.status, JSON.stringify(removed.body)).toBe(409);
    expect(await originalData()).toEqual(before);
    await expect(pg.query('DELETE FROM credentials WHERE id = $1', [inspectorA])).rejects.toThrow();
  });

  it('denies legacy reads and writes to PDI, and PDI writes to other roles', async () => {
    for (const path of ['/scans/in', '/scans/out', '/scans/bulk-sync', '/vehicles/transit-list', `/vehicles/receive/${vinA}`, '/requisitions', '/upload/damage-photo', '/admin/import/vehicles']) {
      expect((await request(path, account(), {})).status, path).toBe(403);
    }
    for (const path of ['/vehicles', '/scans', '/admin/flags', '/export', '/branches/other/stock']) {
      expect((await request(path)).status, path).toBe(403);
    }
    expect((await request(`/pdi/vehicles/${vinA}/inspections`, admin, body())).status).toBe(403);
  });

  it('validates confirmation, result, repair remarks and unknown VINs without creating vehicles', async () => {
    for (const patch of [{ checking_completed: false }, { result: 'passed' }, { remarks: ' ' }, { inspector_id: inspectorB }]) {
      expect((await request(`/pdi/vehicles/${vinA}/inspections`, account(), body(patch))).status).toBe(400);
    }
    expect((await request('/pdi/vehicles/invalid')).status).toBe(400);
    expect((await request('/pdi/vehicles/JTDBR32E720000099')).status).toBe(404);
    expect((await pg.query('SELECT count(*)::int AS n FROM vehicles')).rows).toEqual([{ n: 2 }]);
  });

  it('accepts only one of two simultaneous inspections based on the same previous result', async () => {
    const responses = await Promise.all([
      request(`/pdi/vehicles/${vinA}/inspections`, account(), body()),
      request(`/pdi/vehicles/${vinA}/inspections`, account(), body({ result: 'ok' })),
    ]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await pg.query('SELECT count(*)::int AS n FROM pdi_inspections')).rows).toEqual([{ n: 1 }]);
  });

  it('filters and paginates branch history and reads latest tags in existing stock responses', async () => {
    await pg.query(`INSERT INTO pdi_inspections
      (vehicle_id,vin_snapshot,branch_id,yard_id,inspector_id,inspector_username_snapshot,checking_completed,result,remarks,submission_id)
      SELECT $1,$2,$3,'yard-a',$4,'pdi.a',true,'ok','Rechecked',gen_random_uuid() FROM generate_series(1,35)`,
    [vehicleA, vinA, branchA, inspectorA]);
    const first = await request('/pdi/inspections?result=ok&q=pdi.a');
    expect(first.body.data).toHaveLength(30);
    expect(first.body.has_more).toBe(true);
    const second = await request('/pdi/inspections?result=ok&page=2');
    expect(second.body.data).toHaveLength(5);
    expect(second.body.has_more).toBe(false);
    expect((await request('/pdi/vehicles?result=repair_required')).body.data).toHaveLength(0);
    expect((await request('/pdi/vehicles?result=ok')).body.data).toHaveLength(1);
    expect((await request('/pdi/vehicles?result=not_recorded')).body.data).toHaveLength(0);
    const stock = await request('/vehicles', admin);
    expect(stock.body.data.find((v: any) => v.vin === vinA).pdi.result).toBe('ok');
    expect((await request('/pdi/vehicles?page=1.5')).status).toBe(400);
  });

  it('creates individual branch accounts without updating old credentials; passwords are case-sensitive', async () => {
    const before = (await pg.query('SELECT * FROM credentials ORDER BY id')).rows;
    const created = await request('/admin/pdi-accounts', admin, { username: 'pdi.new', password: 'NewInspector123', branch_id: branchA });
    expect(created.status).toBe(201);
    expect((await pg.query('SELECT * FROM credentials WHERE id <> $1 ORDER BY id', [created.body.id])).rows).toEqual(before);
    const login = await request('/auth/login', admin, { username: 'pdi.new', password: 'NewInspector123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('pdi');
    expect((await request('/auth/login', admin, { username: 'pdi.new', password: 'newinspector123' })).status).toBe(401);
    expect((await request('/admin/pdi-accounts', admin, { username: 'pdi.new', password: 'NewInspector123', branch_id: branchB })).status).toBe(409);
    const rows = await request('/admin/credentials', admin);
    expect(rows.body.credentials.find((c: any) => c.username === 'pdi.new').password).toBeNull();
    expect((await request('/admin/credentials/update', admin, { username: 'pdi.new', password: 'short' })).status).toBe(400);
    expect((await request('/admin/credentials/update', admin, { username: 'pdi.new', password: 'ChangedPassword123' })).status).toBe(200);
    expect((await request('/auth/login', admin, { username: 'pdi.new', password: 'NewInspector123' })).status).toBe(401);
    expect((await request('/auth/login', admin, { username: 'pdi.new', password: 'ChangedPassword123' })).status).toBe(200);
  });

  it('disables PDI access for inactive branches and preserves old reads when PDI is switched off', async () => {
    await pg.query('UPDATE branches SET active = false WHERE id = $1', [branchA]);
    expect((await request('/pdi/vehicles')).status).toBe(403);
    vi.stubEnv('PDI_ENABLED', 'false');
    expect((await request('/pdi/vehicles')).status).toBe(503);
    expect((await request('/vehicles', admin)).status).toBe(200);
  });
});
