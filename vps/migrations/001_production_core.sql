CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('cliente', 'profesional', 'admin')),
  tax_id text NOT NULL UNIQUE,
  company_name text,
  phone text,
  email_verified boolean NOT NULL DEFAULT false,
  account_status text NOT NULL DEFAULT 'ACTIVO'
    CHECK (account_status IN ('ACTIVO', 'SUSPENDIDO', 'ELIMINACION_SOLICITADA', 'ANONIMIZADO')),
  verification_status text NOT NULL DEFAULT 'NO_APLICA'
    CHECK (verification_status IN ('NO_APLICA', 'PENDIENTE_REVISION', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO')),
  verification_reason text,
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  privacy_version text NOT NULL,
  privacy_accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_role_verification_idx ON users (role, verification_status);

CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id, expires_at DESC);

CREATE TABLE auth_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX auth_tokens_user_type_idx ON auth_tokens (user_id, type, expires_at DESC);

CREATE TABLE professional_specialty_qualifications (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty_slug text NOT NULL,
  specialty_label text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  assessment_version text NOT NULL,
  question_count integer NOT NULL CHECK (question_count BETWEEN 12 AND 30),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed_at timestamptz NOT NULL,
  verification_status text NOT NULL DEFAULT 'PENDIENTE_REVISION'
    CHECK (verification_status IN ('PENDIENTE_REVISION', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, specialty_slug)
);
CREATE INDEX qualifications_status_idx ON professional_specialty_qualifications (verification_status, specialty_slug);

CREATE TABLE billing_accounts (
  professional_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDIENTE_MANDATO'
    CHECK (status IN ('PENDIENTE_MANDATO', 'ACTIVO', 'SUSPENDIDO_IMPAGO')),
  stripe_customer_id text UNIQUE,
  stripe_payment_method_id text,
  sepa_mandate_reference text,
  overdue_balance_cents bigint NOT NULL DEFAULT 0 CHECK (overdue_balance_cents >= 0),
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('bano', 'cocina', 'reforma_integral', 'construccion_casa')),
  location text NOT NULL,
  square_meters numeric(10,2),
  quality_level text CHECK (quality_level IN ('basico', 'estandar', 'premium')),
  budget_cents bigint NOT NULL CHECK (budget_cents > 0),
  estimator_version text,
  status text NOT NULL DEFAULT 'PUBLICADO'
    CHECK (status IN ('BORRADOR', 'PUBLICADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO')),
  assigned_professional_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_idx ON projects (owner_id, created_at DESC);
CREATE INDEX projects_marketplace_idx ON projects (status, category, location, created_at DESC);

CREATE TABLE proposals (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES users(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  estimated_days integer NOT NULL CHECK (estimated_days > 0),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'ENVIADA'
    CHECK (status IN ('ENVIADA', 'ACEPTADA', 'RECHAZADA', 'RETIRADA')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, professional_id)
);

CREATE TABLE shortlists (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid NOT NULL REFERENCES users(id),
  project_budget_cents bigint NOT NULL CHECK (project_budget_cents > 0),
  fee_cents bigint NOT NULL CHECK (fee_cents > 0),
  pricing_version text NOT NULL,
  contact_unlocked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, professional_id)
);

CREATE TABLE weekly_invoices (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES users(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_cents bigint NOT NULL CHECK (total_cents > 0),
  status text NOT NULL DEFAULT 'PENDIENTE_COBRO'
    CHECK (status IN ('PENDIENTE_COBRO', 'PROCESANDO', 'PAGADA', 'FALLIDA')),
  stripe_payment_intent_id text UNIQUE,
  failure_reason text,
  collection_requested_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, period_start, period_end)
);

CREATE TABLE billable_items (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES users(id),
  shortlist_id uuid NOT NULL UNIQUE REFERENCES shortlists(id),
  invoice_id uuid REFERENCES weekly_invoices(id),
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'FACTURADO', 'PAGADO', 'FALLIDO')),
  service_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billable_items_pending_idx ON billable_items (professional_id, status, service_date);

CREATE TABLE stored_files (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('PORTFOLIO_ANTES', 'PORTFOLIO_DESPUES', 'SEGURO_RC', 'HITO_EVIDENCIA', 'CONTRATO', 'CHAT_AUDIO')),
  object_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL,
  moderation_status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (moderation_status IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portfolio_projects (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  location text NOT NULL,
  completion_year integer CHECK (completion_year BETWEEN 1950 AND 2100),
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'PUBLICADO', 'RECHAZADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portfolio_files (
  portfolio_id uuid NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('ANTES', 'DESPUES')),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (portfolio_id, file_id)
);

CREATE TABLE insurance_policies (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES stored_files(id),
  insurer text NOT NULL,
  policy_number_masked text NOT NULL,
  coverage_cents bigint NOT NULL CHECK (coverage_cents > 0),
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  status text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXPIRADA')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until >= valid_from)
);

CREATE TABLE milestones (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'PREVISTO'
    CHECK (status IN ('PREVISTO', 'RETENIDO', 'EN_REVISION', 'LIBERADO', 'DISPUTADO')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, position)
);

CREATE TABLE milestone_evidence (
  id uuid PRIMARY KEY,
  milestone_id uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES users(id),
  file_id uuid NOT NULL REFERENCES stored_files(id),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  subject_id uuid NOT NULL REFERENCES users(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL,
  status text NOT NULL DEFAULT 'SELLADA'
    CHECK (status IN ('SELLADA', 'PUBLICADA', 'OCULTA')),
  publish_after timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, author_id)
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid NOT NULL REFERENCES users(id),
  contact_unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, professional_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  message_type text NOT NULL CHECK (message_type IN ('TEXT', 'AUDIO')),
  body text,
  file_id uuid REFERENCES stored_files(id),
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);

CREATE TABLE stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE TABLE email_outbox (
  id bigserial PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_pending_idx ON email_outbox (next_attempt_at, created_at) WHERE sent_at IS NULL;

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  ip_address inet,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
