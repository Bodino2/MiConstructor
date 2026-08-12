CREATE TABLE marketing_campaigns (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  code text NOT NULL UNIQUE
    CHECK (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 160),
  audience text NOT NULL CHECK (audience IN ('cliente', 'profesional')),
  channel text NOT NULL CHECK (channel IN ('qr', 'meta', 'google', 'organic', 'referral', 'partner', 'other')),
  landing_path text NOT NULL CHECK (landing_path LIKE '/campana/%'),
  utm_source text NOT NULL CHECK (char_length(utm_source) BETWEEN 1 AND 80),
  utm_medium text NOT NULL CHECK (char_length(utm_medium) BETWEEN 1 AND 80),
  utm_campaign text NOT NULL CHECK (char_length(utm_campaign) BETWEEN 1 AND 120),
  utm_content text CHECK (utm_content IS NULL OR char_length(utm_content) BETWEEN 1 AND 120),
  headline text NOT NULL CHECK (char_length(headline) BETWEEN 5 AND 180),
  subheadline text NOT NULL CHECK (char_length(subheadline) BETWEEN 5 AND 320),
  cta_label text NOT NULL CHECK (char_length(cta_label) BETWEEN 2 AND 100),
  cta_path text NOT NULL CHECK (cta_path LIKE '/%'),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE marketing_events (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('QR_SCAN', 'LANDING_VIEW', 'CTA_CLICK', 'SIGNUP')),
  path text CHECK (path IS NULL OR (path LIKE '/%' AND char_length(path) <= 300)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_campaigns_active_idx
  ON marketing_campaigns (active, starts_at, ends_at);
CREATE INDEX marketing_events_campaign_created_idx
  ON marketing_events (campaign_id, created_at DESC);
CREATE INDEX marketing_events_type_created_idx
  ON marketing_events (event_type, created_at DESC);

COMMENT ON TABLE marketing_events IS
  'Atribución agregada de campañas. No almacena IP, user-agent, fingerprint ni identificadores personales.';

INSERT INTO marketing_campaigns
  (id, slug, code, name, audience, channel, landing_path,
   utm_source, utm_medium, utm_campaign, utm_content,
   headline, subheadline, cta_label, cta_path)
VALUES
  ('01000000-0000-4000-8000-000000000001',
   'espana-reformas', 'espana-clientes-v1', 'España · Clientes · QR nacional',
   'cliente', 'qr', '/campana/espana-reformas',
   'qr', 'offline', 'espana_launch_clientes', 'qr_nacional_clientes_v1',
   'Tu reforma, con profesionales verificados de tu zona.',
   'Selecciona tu provincia y localidad. MiConstructor adapta la experiencia a tu zona sin necesitar un QR diferente para cada ciudad.',
   'Continuar con mi zona', '/registro-cliente'),
  ('01000000-0000-4000-8000-000000000002',
   'espana-profesionales', 'espana-profesionales-v1', 'España · Profesionales · QR nacional',
   'profesional', 'qr', '/campana/espana-profesionales',
   'qr', 'offline', 'espana_launch_profesionales', 'qr_nacional_profesionales_v1',
   'Más oportunidades cerca de ti, desde un único acceso nacional.',
   'Selecciona provincia y localidad, crea tu perfil profesional y accede a proyectos compatibles con tu especialidad y área de trabajo.',
   'Continuar como profesional', '/registro-profesional')
ON CONFLICT (id) DO NOTHING;
