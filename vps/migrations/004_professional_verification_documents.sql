ALTER TABLE stored_files
  DROP CONSTRAINT IF EXISTS stored_files_purpose_check;

ALTER TABLE stored_files
  ADD CONSTRAINT stored_files_purpose_check CHECK (
    purpose IN (
      'PORTFOLIO_ANTES',
      'PORTFOLIO_DESPUES',
      'SEGURO_RC',
      'HITO_EVIDENCIA',
      'CONTRATO',
      'CHAT_AUDIO',
      'VERIFICACION_PROFESIONAL'
    )
  );

CREATE TABLE IF NOT EXISTS professional_verification_documents (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id uuid NOT NULL UNIQUE REFERENCES stored_files(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN ('IDENTIDAD', 'SITUACION_FISCAL')),
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS professional_verification_documents_queue_idx
  ON professional_verification_documents(status, created_at);

CREATE INDEX IF NOT EXISTS professional_verification_documents_latest_idx
  ON professional_verification_documents(professional_id, document_type, created_at DESC, id DESC);