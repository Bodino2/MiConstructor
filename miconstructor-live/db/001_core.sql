CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CLIENT','PROFESSIONAL','ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','DELETED')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  province TEXT NOT NULL,
  municipality TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS professional_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  nif_cif TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  province TEXT NOT NULL,
  municipality TEXT NOT NULL,
  specialty TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
  test_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (test_status IN ('PENDING','PASSED','FAILED'))
);

CREATE TABLE IF NOT EXISTS legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id),
  service_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  province TEXT NOT NULL,
  municipality TEXT NOT NULL,
  budget_min NUMERIC(12,2),
  budget_max NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SHORTLISTING','AWARDED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_location_service_idx ON projects(province, municipality, service_slug, status);
CREATE INDEX IF NOT EXISTS professional_specialty_location_idx ON professional_profiles(specialty, province, municipality, verification_status);
