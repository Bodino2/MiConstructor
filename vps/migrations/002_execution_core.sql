CREATE TABLE work_contracts (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL UNIQUE REFERENCES proposals(id),
  client_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid NOT NULL REFERENCES users(id),
  project_title text NOT NULL,
  project_description text NOT NULL,
  project_location text NOT NULL,
  specialty_slug text NOT NULL,
  agreed_amount_cents bigint NOT NULL CHECK (agreed_amount_cents > 0),
  estimated_days integer NOT NULL CHECK (estimated_days > 0),
  proposal_message text NOT NULL,
  terms_version text NOT NULL DEFAULT 'execution-v1',
  status text NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'FINALIZADO', 'CANCELADO')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_contracts_participants_idx ON work_contracts (client_id, professional_id, created_at DESC);

CREATE TABLE work_passport_entries (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'CONTRATO_ACEPTADO', 'HITO_CREADO', 'EVIDENCIA_SUBIDA', 'HITO_LIBERADO',
    'HITO_DISPUTADO', 'MENSAJE_ENVIADO', 'PROYECTO_FINALIZADO', 'REVIEW_CREADA'
  )),
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_passport_project_idx ON work_passport_entries (project_id, created_at, id);

CREATE OR REPLACE FUNCTION prevent_execution_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'execution snapshot is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_contracts_no_update
BEFORE UPDATE OR DELETE ON work_contracts
FOR EACH ROW EXECUTE FUNCTION prevent_execution_snapshot_mutation();

CREATE TRIGGER work_passport_no_update
BEFORE UPDATE OR DELETE ON work_passport_entries
FOR EACH ROW EXECUTE FUNCTION prevent_execution_snapshot_mutation();
