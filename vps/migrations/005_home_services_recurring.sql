CREATE TABLE home_service_requests (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vertical text NOT NULL CHECK (vertical IN ('limpieza_mantenimiento','jardin_exterior')),
  service_slug text NOT NULL,
  location text NOT NULL,
  service_address text,
  access_notes text NOT NULL DEFAULT '',
  property_type text NOT NULL CHECK (property_type IN ('PISO','CASA','CHALET','COMUNIDAD','LOCAL','JARDIN','PARCELA','OTRO')),
  square_meters numeric(10,2) CHECK (square_meters > 0 AND square_meters <= 100000),
  bedrooms integer CHECK (bedrooms BETWEEN 0 AND 50),
  bathrooms integer CHECK (bathrooms BETWEEN 0 AND 50),
  estimated_hours numeric(5,2) CHECK (estimated_hours > 0 AND estimated_hours <= 24),
  notes text NOT NULL DEFAULT '',
  requested_start_date date NOT NULL,
  preferred_time_start time,
  preferred_time_end time,
  frequency text NOT NULL CHECK (frequency IN ('PUNTUAL','SEMANAL','CADA_2_SEMANAS','MENSUAL')),
  status text NOT NULL DEFAULT 'PUBLICADO'
    CHECK (status IN ('BORRADOR','PUBLICADO','ASIGNADO','FINALIZADO','CANCELADO')),
  assigned_professional_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (service_address IS NULL OR length(btrim(service_address)) BETWEEN 5 AND 300),
  CHECK (length(access_notes) <= 1000),
  CHECK (preferred_time_end IS NULL OR preferred_time_start IS NULL OR preferred_time_end > preferred_time_start)
);
CREATE INDEX home_service_requests_client_idx ON home_service_requests (client_id, created_at DESC);
CREATE INDEX home_service_requests_market_idx ON home_service_requests (status, service_slug, requested_start_date, created_at DESC);

CREATE TABLE home_service_offers (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES home_service_requests(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents_per_visit bigint NOT NULL CHECK (amount_cents_per_visit > 0 AND amount_cents_per_visit <= 50000000),
  estimated_duration_minutes integer NOT NULL CHECK (estimated_duration_minutes BETWEEN 30 AND 1440),
  first_available_date date NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'ENVIADA' CHECK (status IN ('ENVIADA','ACEPTADA','RECHAZADA','RETIRADA')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, professional_id)
);
CREATE INDEX home_service_offers_request_idx ON home_service_offers (request_id, status, created_at);
CREATE INDEX home_service_offers_professional_idx ON home_service_offers (professional_id, status, created_at DESC);

CREATE TABLE home_service_engagements (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES home_service_requests(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL UNIQUE REFERENCES home_service_offers(id),
  client_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid NOT NULL REFERENCES users(id),
  service_slug text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('PUNTUAL','SEMANAL','CADA_2_SEMANAS','MENSUAL')),
  price_cents_per_visit bigint NOT NULL CHECK (price_cents_per_visit > 0 AND price_cents_per_visit <= 50000000),
  estimated_duration_minutes integer NOT NULL CHECK (estimated_duration_minutes BETWEEN 30 AND 1440),
  preferred_time_start time,
  preferred_time_end time,
  start_date date NOT NULL,
  next_visit_date date,
  status text NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','PAUSADO','CANCELADO','FINALIZADO')),
  paused_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (preferred_time_end IS NULL OR preferred_time_start IS NULL OR preferred_time_end > preferred_time_start)
);
CREATE INDEX home_service_engagements_participants_idx ON home_service_engagements (client_id, professional_id, status, created_at DESC);
CREATE INDEX home_service_engagements_next_visit_idx ON home_service_engagements (next_visit_date, status) WHERE status='ACTIVO';

CREATE OR REPLACE FUNCTION require_home_service_private_address() RETURNS trigger AS $$
DECLARE
  private_address text;
BEGIN
  SELECT service_address INTO private_address
    FROM home_service_requests
   WHERE id=NEW.request_id;

  IF private_address IS NULL OR length(btrim(private_address)) < 5 THEN
    RAISE EXCEPTION 'home_service_private_address_required';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER home_service_engagement_requires_private_address
BEFORE INSERT ON home_service_engagements
FOR EACH ROW EXECUTE FUNCTION require_home_service_private_address();

CREATE TABLE home_service_visits (
  id uuid PRIMARY KEY,
  engagement_id uuid NOT NULL REFERENCES home_service_engagements(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  scheduled_date date NOT NULL,
  scheduled_time time,
  status text NOT NULL DEFAULT 'PROGRAMADA'
    CHECK (status IN ('PROGRAMADA','EN_CURSO','COMPLETADA','CANCELADA_CLIENTE','CANCELADA_PROFESIONAL','NO_REALIZADA')),
  started_at timestamptz,
  completed_at timestamptz,
  completion_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, sequence_number),
  UNIQUE (engagement_id, scheduled_date),
  CHECK (status <> 'EN_CURSO' OR started_at IS NOT NULL),
  CHECK (status <> 'COMPLETADA' OR (started_at IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);
CREATE INDEX home_service_visits_schedule_idx ON home_service_visits (scheduled_date, status);
CREATE INDEX home_service_visits_engagement_status_idx ON home_service_visits (engagement_id, status, sequence_number DESC);

CREATE OR REPLACE FUNCTION enforce_home_service_schedule_capacity() RETURNS trigger AS $$
DECLARE
  target_professional uuid;
  target_duration integer;
  target_capacity integer;
  overlapping integer;
BEGIN
  IF NEW.status NOT IN ('PROGRAMADA','EN_CURSO') OR NEW.scheduled_time IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.professional_id,
         e.estimated_duration_minutes,
         COALESCE(pa.concurrent_capacity, 1)
    INTO target_professional, target_duration, target_capacity
    FROM home_service_engagements e
    LEFT JOIN professional_availability pa ON pa.professional_id=e.professional_id
   WHERE e.id=NEW.engagement_id;

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'home_service_engagement_missing';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(target_professional::text || ':' || NEW.scheduled_date::text, 0)
  );

  SELECT count(*)::integer
    INTO overlapping
    FROM home_service_visits v
    JOIN home_service_engagements existing_engagement ON existing_engagement.id=v.engagement_id
   WHERE existing_engagement.professional_id=target_professional
     AND v.scheduled_date=NEW.scheduled_date
     AND v.scheduled_time IS NOT NULL
     AND v.status IN ('PROGRAMADA','EN_CURSO')
     AND v.id<>NEW.id
     AND v.scheduled_time < NEW.scheduled_time + make_interval(mins => target_duration)
     AND v.scheduled_time + make_interval(mins => existing_engagement.estimated_duration_minutes) > NEW.scheduled_time;

  IF overlapping >= target_capacity THEN
    RAISE EXCEPTION 'professional_schedule_capacity_exceeded';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER home_service_visits_capacity_guard
BEFORE INSERT OR UPDATE OF engagement_id, scheduled_date, scheduled_time, status
ON home_service_visits
FOR EACH ROW EXECUTE FUNCTION enforce_home_service_schedule_capacity();

CREATE TABLE home_service_visit_events (
  id bigserial PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES home_service_visits(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('PROGRAMADA','INICIADA','COMPLETADA','CANCELADA','REPROGRAMADA')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX home_service_visit_events_idx ON home_service_visit_events (visit_id, created_at, id);

CREATE OR REPLACE FUNCTION prevent_home_service_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'home_service_visit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER home_service_visit_events_no_update
BEFORE UPDATE OR DELETE ON home_service_visit_events
FOR EACH ROW EXECUTE FUNCTION prevent_home_service_event_mutation();
