import {
  pgTable,
  uuid,
  text,
  integer,
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
  active: boolean('active').default(true).notNull(),
});

// ─── credentials ─────────────────────────────────────────────────────
export const credentials = pgTable('credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull(), // 'admin' | 'yard' | 'delivery_incharge'
  yard_id: text('yard_id'),
  branch_id: uuid('branch_id'), // new for delivery_incharge
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
  variant: text('variant'),
  colour: text('colour'),
  drive_type: text('drive_type'), // 'neo_drive' | 'hybrid' | 'petrol' | 'diesel' | 'cng' | 'electric'
  vin_valid: boolean('vin_valid').notNull(),
  // null = pre-tracking / unlabeled; set only on first tagged yard scan going forward
  entry_method: text('entry_method'), // 'qr' | 'manual' | null
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
    out_remark: text('out_remark'), // 'customer_acquisition' | 'stockyard_transfer' | 'display'
    transfer_destination_yard_id: text('transfer_destination_yard_id').references(() => yards.id),
    transfer_requested_by: text('transfer_requested_by'),
    display_taken_by: text('display_taken_by'),
    display_location: text('display_location'),
    key_no: text('key_no'),
    damaged: boolean('damaged'),
    damage_remark: text('damage_remark'),
    damage_image: text('damage_image'),
    status: text('status').notNull(), // 'accepted' | 'rejected' | 'flagged'
    // null = legacy scans before tracking; optional on API so old clients keep working
    entry_method: text('entry_method'), // 'qr' | 'manual' | null
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
    current_status: text('current_status').notNull(), // 'in' | 'out' | 'transit'
    current_yard_id: text('current_yard_id').references(() => yards.id),
    last_in_scan_id: uuid('last_in_scan_id').references(() => scans.id),
    last_out_scan_id: uuid('last_out_scan_id').references(() => scans.id),
    last_changed_at: timestamp('last_changed_at', { withTimezone: true }).defaultNow().notNull(),
    key_no: text('key_no'),
    override_reason: text('override_reason'),
    on_display: boolean('on_display'),
    display_taken_by: text('display_taken_by'),
    display_location: text('display_location'),
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

// ─── branches ────────────────────────────────────────────────────────
export const branches = pgTable('branches', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const branchYards = pgTable('branch_yards', {
  branch_id: uuid('branch_id').notNull().references(() => branches.id),
  yard_id: text('yard_id').notNull().references(() => yards.id),
}, (t) => [
  index('branch_yards_pk').on(t.branch_id, t.yard_id), // Instead of composite PK for simplicity in Drizzle
]);

// ─── requisitions ────────────────────────────────────────────────────
export const requisitions = pgTable('requisitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  requesting_branch_id: uuid('requesting_branch_id').notNull().references(() => branches.id),
  source_branch_id: uuid('source_branch_id').notNull().references(() => branches.id),
  destination_yard_id: text('destination_yard_id').references(() => yards.id),
  vehicle_id: uuid('vehicle_id').notNull().references(() => vehicles.id),
  status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'rejected' | 'fulfilled'
  requested_by: text('requested_by').notNull(),
  requested_at: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  approved_by: text('approved_by'),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  rejected_by: text('rejected_by'),
  rejected_at: timestamp('rejected_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  fulfilled_at: timestamp('fulfilled_at', { withTimezone: true }),
});

// ─── notifications ───────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_role: text('user_role').notNull(), // 'delivery_incharge' | 'stockyard'
  branch_id: uuid('branch_id').notNull().references(() => branches.id),
  message: text('message').notNull(),
  type: text('type').notNull(), // 'requisition_created' | 'requisition_approved' | 'requisition_rejected'
  related_req_id: uuid('related_req_id').references(() => requisitions.id),
  read: boolean('read').default(false).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── audit_logs (F9) ────────────────────────────────────────────────
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull(),
    action: text('action').notNull(),
    resource_type: text('resource_type').notNull(),
    resource_id: text('resource_id'),
    details: text('details'), // JSON stringified
    ip_address: text('ip_address'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_logs_user_idx').on(t.user_id),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_created_idx').on(t.created_at),
  ],
);

// ─── push_subscriptions (F4) ────────────────────────────────────────
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  keys_p256dh: text('keys_p256dh').notNull(),
  keys_auth: text('keys_auth').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────
export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  status: one(vehicleStatus, { fields: [vehicles.id], references: [vehicleStatus.vehicle_id] }),
  scans: many(scans),
  flags: many(flags),
  requisitions: many(requisitions),
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

export const branchesRelations = relations(branches, ({ many }) => ({
  yards: many(branchYards),
  outgoingRequisitions: many(requisitions, { relationName: 'outgoingRequisitions' }),
  incomingRequisitions: many(requisitions, { relationName: 'incomingRequisitions' }),
  notifications: many(notifications),
}));

export const branchYardsRelations = relations(branchYards, ({ one }) => ({
  branch: one(branches, { fields: [branchYards.branch_id], references: [branches.id] }),
  yard: one(yards, { fields: [branchYards.yard_id], references: [yards.id] }),
}));

export const requisitionsRelations = relations(requisitions, ({ one, many }) => ({
  requestingBranch: one(branches, { fields: [requisitions.requesting_branch_id], references: [branches.id], relationName: 'outgoingRequisitions' }),
  sourceBranch: one(branches, { fields: [requisitions.source_branch_id], references: [branches.id], relationName: 'incomingRequisitions' }),
  destinationYard: one(yards, { fields: [requisitions.destination_yard_id], references: [yards.id] }),
  vehicle: one(vehicles, { fields: [requisitions.vehicle_id], references: [vehicles.id] }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  branch: one(branches, { fields: [notifications.branch_id], references: [branches.id] }),
  requisition: one(requisitions, { fields: [notifications.related_req_id], references: [requisitions.id] }),
}));

