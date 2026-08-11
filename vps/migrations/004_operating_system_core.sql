CREATE TABLE professional_availability (
  professional_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available_from date,
  concurrent_capacity integer NOT NULL DEFAULT 1 CHECK (concurrent_capacity BETWEEN 1 AND 20),
  travel_radius_km integer NOT NULL DEFAULT 50 CHECK (travel_radius_km BETWEEN 1 AND 500),
  service_areas text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_evidence_files (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id uuid NOT NULL UNIQUE REFERENCES stored_files(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  context text NOT NULL DEFAULT 'OBRA' CHECK (context IN ('OBRA', 'EXTRA')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, file_id)
);
CREATE INDEX work_evidence_project_idx ON work_evidence_files (project_id, created_at DESC);

CREATE TABLE change_orders (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES work_contracts(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES users(id),
  client_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  reason text NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 500000000),
  extra_days integer NOT NULL DEFAULT 0 CHECK (extra_days BETWEEN 0 AND 3650),
  requested_due_date date,
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA')),
  decision_reason text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_orders_project_idx ON change_orders (project_id, status, created_at DESC);
CREATE INDEX change_orders_professional_idx ON change_orders (professional_id, created_at DESC);

CREATE TABLE change_order_evidence (
  change_order_id uuid NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
  PRIMARY KEY (change_order_id, file_id)
);

ALTER TABLE stored_files DROP CONSTRAINT stored_files_purpose_check;
ALTER TABLE stored_files ADD CONSTRAINT stored_files_purpose_check CHECK (purpose IN (
  'PORTFOLIO_ANTES', 'PORTFOLIO_DESPUES', 'SEGURO_RC', 'HITO_EVIDENCIA',
  'CONTRATO', 'CHAT_AUDIO', 'OBRA_EVIDENCIA'
));

ALTER TABLE work_passport_entries DROP CONSTRAINT work_passport_entries_event_type_check;
ALTER TABLE work_passport_entries ADD CONSTRAINT work_passport_entries_event_type_check CHECK (event_type IN (
  'CONTRATO_ACEPTADO', 'HITO_CREADO', 'EVIDENCIA_SUBIDA', 'HITO_LIBERADO',
  'HITO_DISPUTADO', 'MENSAJE_ENVIADO', 'PROYECTO_FINALIZADO', 'REVIEW_CREADA',
  'EVIDENCIA_OBRA_SUBIDA', 'EXTRA_SOLICITADO', 'EXTRA_APROBADO', 'EXTRA_RECHAZADO',
  'DISPONIBILIDAD_ACTUALIZADA'
));
