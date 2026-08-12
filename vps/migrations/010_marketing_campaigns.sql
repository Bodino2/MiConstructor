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
   'linares-reformas', 'linares-clientes-v1', 'Linares · Clientes · Lanzamiento QR',
   'cliente', 'qr', '/campana/linares-reformas',
   'qr', 'offline', 'linares_launch_clientes', 'flyer_general_v1',
   'Antes de aceptar un presupuesto, comprueba tus opciones.',
   'Publica tu reforma en Linares, compara propuestas de profesionales verificados y decide con más información.',
   'Publicar mi reforma gratis', '/registro-cliente'),
  ('01000000-0000-4000-8000-000000000002',
   'linares-profesionales', 'linares-pro-v1', 'Linares · Profesionales · Lanzamiento QR',
   'profesional', 'qr', '/campana/linares-profesionales',
   'qr', 'offline', 'linares_launch_profesionales', 'flyer_profesional_v1',
   'Más proyectos cerca de ti. Menos tiempo buscando clientes.',
   'Crea tu perfil profesional, acredita tu especialidad y accede a oportunidades compatibles de tu zona.',
   'Crear perfil profesional', '/registro-profesional'),
  ('01000000-0000-4000-8000-000000000003',
   'linares-banos', 'linares-banos-v1', 'Linares · Reformas de baño · QR',
   'cliente', 'qr', '/campana/linares-banos',
   'qr', 'offline', 'linares_launch_clientes', 'flyer_banos_v1',
   '¿Vas a reformar el baño? No te quedes con una sola opción.',
   'Describe tu proyecto y compara propuestas de profesionales verificados antes de elegir.',
   'Publicar reforma de baño', '/registro-cliente'),
  ('01000000-0000-4000-8000-000000000004',
   'linares-cocinas', 'linares-cocinas-v1', 'Linares · Reformas de cocina · QR',
   'cliente', 'qr', '/campana/linares-cocinas',
   'qr', 'offline', 'linares_launch_clientes', 'flyer_cocinas_v1',
   '¿Reformas la cocina? Compara antes de decidir.',
   'Publica lo que necesitas y recibe propuestas comparables de profesionales verificados de tu zona.',
   'Publicar reforma de cocina', '/registro-cliente')
ON CONFLICT (id) DO NOTHING;
