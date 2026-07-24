import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── yards ───────────────────────────────────────────────────────────
export const yards = pgTable('yards', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  city: text('city'),
  capacity: integer('capacity').notNull(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  gps_radius_meters: integer('gps_radius_meters').default(500).notNull(),
  active: boolean('active').default(true).notNull(),
});

// ─── credentials ─────────────────────────────────────────────────────
export const credentials = pgTable('credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull(), // 'admin' | 'yard'
  yard_id: text('yard_id'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── devices ─────────────────────────────────────────────────────────
export const devices = pgTable('devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  device_fingerprint: text('device_fingerprint').notNull().unique(),
  label: text('label'),
  first_seen_at: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── vehicles ────────────────────────────────────────────────────────
export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  vin: text('vin').notNull().unique(),
  model: text('model'),
  vin_valid: boolean('vin_valid').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── scans ───────────────────────────────────────────────────────────
export const scans = pgTable(
  'scans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    client_scan_id: text('client_scan_id').notNull().unique(),
    vehicle_id: uuid('vehicle_id').notNull().references(() => vehicles.id),
    vin_raw: text('vin_raw').notNull(),
    scan_type: text('scan_type').notNull(), // 'in' | 'out'
    yard_id: text('yard_id').notNull().references(() => yards.id),
    device_id: uuid('device_id').notNull().references(() => devices.id),
    scanned_at: timestamp('scanned_at', { withTimezone: true }).notNull(),
    received_at: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    gps_accuracy_meters: numeric('gps_accuracy_meters', { precision: 8, scale: 2 }),
    out_remark: text('out_remark'), // 'customer_acquisition' | 'stockyard_transfer'
    transfer_destination_yard_id: text('transfer_destination_yard_id').references(() => yards.id),
    transfer_requested_by: text('transfer_requested_by'),
    damaged: boolean('damaged'),
    damage_remark: text('damage_remark'),
    damage_image: text('damage_image'),
    status: text('status').notNull(), // 'accepted' | 'rejected' | 'flagged'
  },
  (t) => [
    index('scans_vehicle_id_idx').on(t.vehicle_id),
    index('scans_yard_scan_type_idx').on(t.yard_id, t.scan_type),
  ],
);

// ─── vehicle_status ──────────────────────────────────────────────────
export const vehicleStatus = pgTable(
  'vehicle_status',
  {
    vehicle_id: uuid('vehicle_id')
      .primaryKey()
      .references(() => vehicles.id),
    current_status: text('current_status').notNull(), // 'in' | 'out'
    current_yard_id: text('current_yard_id').references(() => yards.id),
    last_in_scan_id: uuid('last_in_scan_id').references(() => scans.id),
    last_out_scan_id: uuid('last_out_scan_id').references(() => scans.id),
    last_changed_at: timestamp('last_changed_at', { withTimezone: true }).defaultNow().notNull(),
    override_reason: text('override_reason'),
  },
  (t) => [
    index('vs_yard_status_idx').on(t.current_yard_id, t.current_status),
  ],
);

// ─── flags ───────────────────────────────────────────────────────────
export const flags = pgTable(
  'flags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vehicle_id: uuid('vehicle_id').notNull().references(() => vehicles.id),
    scan_id: uuid('scan_id').references(() => scans.id),
    flag_type: text('flag_type').notNull(),
    message: text('message').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolved: boolean('resolved').default(false).notNull(),
    resolved_by: text('resolved_by'),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('flags_resolved_type_idx').on(t.resolved, t.flag_type),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────
export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  status: one(vehicleStatus, { fields: [vehicles.id], references: [vehicleStatus.vehicle_id] }),
  scans: many(scans),
  flags: many(flags),
}));

export const scansRelations = relations(scans, ({ one }) => ({
  vehicle: one(vehicles, { fields: [scans.vehicle_id], references: [vehicles.id] }),
  yard: one(yards, { fields: [scans.yard_id], references: [yards.id] }),
  device: one(devices, { fields: [scans.device_id], references: [devices.id] }),
}));

export const vehicleStatusRelations = relations(vehicleStatus, ({ one }) => ({
  vehicle: one(vehicles, { fields: [vehicleStatus.vehicle_id], references: [vehicles.id] }),
  yard: one(yards, { fields: [vehicleStatus.current_yard_id], references: [yards.id] }),
  lastInScan: one(scans, { fields: [vehicleStatus.last_in_scan_id], references: [scans.id] }),
  lastOutScan: one(scans, { fields: [vehicleStatus.last_out_scan_id], references: [scans.id] }),
}));

export const flagsRelations = relations(flags, ({ one }) => ({
  vehicle: one(vehicles, { fields: [flags.vehicle_id], references: [vehicles.id] }),
  scan: one(scans, { fields: [flags.scan_id], references: [scans.id] }),
}));
