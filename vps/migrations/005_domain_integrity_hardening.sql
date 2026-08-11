CREATE OR REPLACE FUNCTION miconstructor_professional_verification_ready(target_professional uuid)
RETURNS boolean AS $$
  SELECT
    EXISTS (
      SELECT 1
        FROM professional_specialty_qualifications q
       WHERE q.professional_id = target_professional
         AND q.verification_status = 'APROBADO'
    )
    AND (
      SELECT count(*) = 2
        FROM (
          SELECT DISTINCT ON (d.document_type) d.document_type, d.status
            FROM professional_verification_documents d
           WHERE d.professional_id = target_professional
             AND d.document_type IN ('IDENTIDAD', 'SITUACION_FISCAL')
           ORDER BY d.document_type, d.created_at DESC, d.id DESC
        ) latest
       WHERE latest.status = 'APROBADO'
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION miconstructor_enforce_professional_verification()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'profesional'
     AND NEW.verification_status = 'APROBADO'
     AND NOT miconstructor_professional_verification_ready(NEW.id) THEN
    NEW.verification_status := 'PENDIENTE_REVISION';
    NEW.verification_reason := 'Pendiente de completar la verificación técnica y documental obligatoria.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_professional_verification_guard ON users;
CREATE TRIGGER users_professional_verification_guard
BEFORE INSERT OR UPDATE OF verification_status ON users
FOR EACH ROW EXECUTE FUNCTION miconstructor_enforce_professional_verification();

UPDATE users u
   SET verification_status = 'PENDIENTE_REVISION',
       verification_reason = 'Pendiente de completar la verificación técnica y documental obligatoria.',
       updated_at = now()
 WHERE u.role = 'profesional'
   AND u.verification_status = 'APROBADO'
   AND NOT miconstructor_professional_verification_ready(u.id);

CREATE OR REPLACE FUNCTION miconstructor_professional_eligible_for_specialty(
  target_professional uuid,
  target_specialty text
)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
      FROM users u
      JOIN billing_accounts b ON b.professional_id = u.id
     WHERE u.id = target_professional
       AND u.role = 'profesional'
       AND u.email_verified = true
       AND u.account_status = 'ACTIVO'
       AND u.verification_status = 'APROBADO'
       AND miconstructor_professional_verification_ready(u.id)
       AND b.status = 'ACTIVO'
       AND b.overdue_balance_cents = 0
       AND EXISTS (
         SELECT 1
           FROM professional_specialty_qualifications q
          WHERE q.professional_id = u.id
            AND q.specialty_slug = target_specialty
            AND q.verification_status = 'APROBADO'
       )
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION miconstructor_guard_shortlist_insert()
RETURNS trigger AS $$
DECLARE
  project_owner uuid;
  project_status text;
  project_specialty text;
BEGIN
  SELECT owner_id, status, category
    INTO project_owner, project_status, project_specialty
    FROM projects
   WHERE id = NEW.project_id
   FOR SHARE;

  IF project_owner IS NULL OR project_owner <> NEW.client_id THEN
    RAISE EXCEPTION 'shortlist_client_not_project_owner';
  END IF;
  IF project_status <> 'PUBLICADO' THEN
    RAISE EXCEPTION 'shortlist_project_not_open';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM proposals
     WHERE project_id = NEW.project_id
       AND professional_id = NEW.professional_id
       AND status = 'ENVIADA'
  ) THEN
    RAISE EXCEPTION 'shortlist_active_proposal_required';
  END IF;
  IF NOT miconstructor_professional_eligible_for_specialty(NEW.professional_id, project_specialty) THEN
    RAISE EXCEPTION 'shortlist_professional_not_eligible';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shortlists_professional_eligibility_guard ON shortlists;
CREATE TRIGGER shortlists_professional_eligibility_guard
BEFORE INSERT ON shortlists
FOR EACH ROW EXECUTE FUNCTION miconstructor_guard_shortlist_insert();

CREATE OR REPLACE FUNCTION miconstructor_guard_work_contract_insert()
RETURNS trigger AS $$
DECLARE
  project_owner uuid;
  project_status text;
  project_specialty text;
BEGIN
  SELECT owner_id, status, category
    INTO project_owner, project_status, project_specialty
    FROM projects
   WHERE id = NEW.project_id
   FOR SHARE;

  IF project_owner IS NULL OR project_owner <> NEW.client_id THEN
    RAISE EXCEPTION 'contract_client_not_project_owner';
  END IF;
  IF project_status <> 'PUBLICADO' THEN
    RAISE EXCEPTION 'contract_project_not_open';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM proposals
     WHERE id = NEW.proposal_id
       AND project_id = NEW.project_id
       AND professional_id = NEW.professional_id
       AND status = 'ENVIADA'
  ) THEN
    RAISE EXCEPTION 'contract_active_proposal_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM shortlists
     WHERE project_id = NEW.project_id
       AND client_id = NEW.client_id
       AND professional_id = NEW.professional_id
       AND contact_unlocked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'contract_shortlist_required';
  END IF;
  IF NOT miconstructor_professional_eligible_for_specialty(NEW.professional_id, project_specialty) THEN
    RAISE EXCEPTION 'contract_professional_not_eligible';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_contracts_professional_eligibility_guard ON work_contracts;
CREATE TRIGGER work_contracts_professional_eligibility_guard
BEFORE INSERT ON work_contracts
FOR EACH ROW EXECUTE FUNCTION miconstructor_guard_work_contract_insert();
