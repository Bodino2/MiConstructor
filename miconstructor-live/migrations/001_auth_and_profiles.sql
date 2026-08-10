create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('CLIENT','PROFESSIONAL','ADMIN')),
  full_name text not null,
  phone text not null,
  privacy_accepted_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists professional_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  nif_cif text not null,
  specialty text not null,
  province text not null,
  locality text not null,
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING','APPROVED','REJECTED','SUSPENDED')),
  test_status text not null default 'PENDING' check (test_status in ('PENDING','PASSED','FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists professional_profiles_nif_cif_idx on professional_profiles (upper(nif_cif));
create index if not exists professional_profiles_lookup_idx on professional_profiles (specialty, province, locality, verification_status);
