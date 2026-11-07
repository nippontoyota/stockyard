-- Standalone additive migration. Do not replay the legacy drizzle migrations.
CREATE TABLE IF NOT EXISTS pdi_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigserial NOT NULL UNIQUE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vin_snapshot text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  yard_id text NOT NULL REFERENCES yards(id) ON DELETE RESTRICT,
  inspector_id uuid NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  inspector_username_snapshot text NOT NULL,
  checking_completed boolean NOT NULL,
  result text NOT NULL,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  submission_id uuid NOT NULL UNIQUE,
  CONSTRAINT pdi_completed_check CHECK (checking_completed = true),
  CONSTRAINT pdi_result_check CHECK (result IN ('ok', 'repair_required')),
  CONSTRAINT pdi_remarks_check CHECK (length(remarks) <= 2000 AND (result <> 'repair_required' OR length(trim(remarks)) > 0))
);
CREATE INDEX IF NOT EXISTS pdi_vehicle_sequence_idx ON pdi_inspections(vehicle_id, sequence);
CREATE INDEX IF NOT EXISTS pdi_branch_sequence_idx ON pdi_inspections(branch_id, sequence);

-- The API connects using its database role; public Supabase REST clients get no access.
ALTER TABLE pdi_inspections ENABLE ROW LEVEL SECURITY;
