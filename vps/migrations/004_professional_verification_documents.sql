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

CREATE OR REPLACE FUNCTION miconstructor_enforce_professional_verification_gate()
RETURNS trigger AS $$
DECLARE
  approved_document_count integer := 0;
  has_approved_qualification boolean := false;
BEGIN
  IF NEW.role = 'profesional' AND NEW.verification_status = 'APROBADO' THEN
    SELECT count(*)
      INTO approved_document_count
      FROM (
        SELECT DISTINCT ON (document_type) document_type, status
          FROM professional_verification_documents
         WHERE professional_id = NEW.id
           AND document_type IN ('IDENTIDAD', 'SITUACION_FISCAL')
         ORDER BY document_type, created_at DESC, id DESC
      ) latest
     WHERE latest.status = 'APROBADO';

    SELECT EXISTS (
      SELECT 1
        FROM professional_specialty_qualifications
       WHERE professional_id = NEW.id
         AND verification_status = 'APROBADO'
    ) INTO has_approved_qualification;

    IF approved_document_count < 2 OR NOT has_approved_qualification THEN
      NEW.verification_status := 'PENDIENTE_REVISION';
      NEW.verification_reason := 'Pendiente de completar la verificación técnica y documental obligatoria.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_professional_verification_gate ON users;
CREATE TRIGGER users_professional_verification_gate
BEFORE INSERT OR UPDATE OF verification_status ON users
FOR EACH ROW EXECUTE FUNCTION miconstructor_enforce_professional_verification_gate();