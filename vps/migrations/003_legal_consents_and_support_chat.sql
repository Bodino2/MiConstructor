ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS sepa_terms_version text,
  ADD COLUMN IF NOT EXISTS sepa_terms_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION miconstructor_set_registration_terms() RETURNS trigger AS $$
BEGIN
  IF NEW.role <> 'admin' AND NEW.terms_accepted_at IS NULL THEN
    NEW.terms_version := COALESCE(NEW.terms_version, '2026-08-10');
    NEW.terms_accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_registration_terms_default ON users;
CREATE TRIGGER users_registration_terms_default
BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION miconstructor_set_registration_terms();

CREATE TABLE IF NOT EXISTS support_messages (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('usuario', 'admin')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  read_by_user_at timestamptz,
  read_by_admin_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_created_idx
  ON support_messages(user_id, created_at, id);

CREATE INDEX IF NOT EXISTS support_messages_admin_unread_idx
  ON support_messages(user_id, created_at)
  WHERE sender_role = 'usuario' AND read_by_admin_at IS NULL;
