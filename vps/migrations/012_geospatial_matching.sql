CREATE TABLE geo_location_cache (
  area_key text PRIMARY KEY,
  province text NOT NULL CHECK (char_length(btrim(province)) BETWEEN 2 AND 100),
  locality text NOT NULL CHECK (char_length(btrim(locality)) BETWEEN 2 AND 100),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  formatted_address text CHECK (formatted_address IS NULL OR char_length(formatted_address) <= 500),
  provider text NOT NULL CHECK (provider IN ('geoapify')),
  resolved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN service_latitude double precision,
  ADD COLUMN service_longitude double precision,
  ADD COLUMN service_geocoded_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_service_coordinates_pair CHECK (
    (service_latitude IS NULL AND service_longitude IS NULL)
    OR
    (service_latitude BETWEEN -90 AND 90 AND service_longitude BETWEEN -180 AND 180)
  );

ALTER TABLE projects
  ADD COLUMN service_province text,
  ADD COLUMN service_locality text,
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN geocoded_at timestamptz;

ALTER TABLE projects
  ADD CONSTRAINT projects_service_coordinates_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );

CREATE INDEX users_service_coordinates_idx
  ON users (role, service_latitude, service_longitude)
  WHERE service_latitude IS NOT NULL AND service_longitude IS NOT NULL;

CREATE INDEX projects_service_coordinates_idx
  ON projects (status, category, latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_user_service_coordinates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cached geo_location_cache%ROWTYPE;
BEGIN
  IF NEW.service_province IS NULL OR NEW.service_locality IS NULL THEN
    NEW.service_latitude := NULL;
    NEW.service_longitude := NULL;
    NEW.service_geocoded_at := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO cached
    FROM geo_location_cache
   WHERE area_key = lower(btrim(NEW.service_province)) || '|' || lower(btrim(NEW.service_locality));

  IF FOUND THEN
    NEW.service_latitude := cached.latitude;
    NEW.service_longitude := cached.longitude;
    NEW.service_geocoded_at := cached.resolved_at;
  ELSIF TG_OP = 'INSERT'
     OR NEW.service_province IS DISTINCT FROM OLD.service_province
     OR NEW.service_locality IS DISTINCT FROM OLD.service_locality THEN
    NEW.service_latitude := NULL;
    NEW.service_longitude := NULL;
    NEW.service_geocoded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_sync_service_coordinates
BEFORE INSERT OR UPDATE OF service_province, service_locality
ON users
FOR EACH ROW
EXECUTE FUNCTION sync_user_service_coordinates();

CREATE OR REPLACE FUNCTION sync_project_service_coordinates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_area record;
  cached geo_location_cache%ROWTYPE;
BEGIN
  IF NEW.service_province IS NULL OR NEW.service_locality IS NULL THEN
    SELECT service_province, service_locality, service_latitude, service_longitude, service_geocoded_at
      INTO owner_area
      FROM users
     WHERE id = NEW.owner_id;
    NEW.service_province := owner_area.service_province;
    NEW.service_locality := owner_area.service_locality;
    IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
      NEW.latitude := owner_area.service_latitude;
      NEW.longitude := owner_area.service_longitude;
      NEW.geocoded_at := owner_area.service_geocoded_at;
    END IF;
  END IF;

  IF (NEW.latitude IS NULL OR NEW.longitude IS NULL)
     AND NEW.service_province IS NOT NULL
     AND NEW.service_locality IS NOT NULL THEN
    SELECT * INTO cached
      FROM geo_location_cache
     WHERE area_key = lower(btrim(NEW.service_province)) || '|' || lower(btrim(NEW.service_locality));
    IF FOUND THEN
      NEW.latitude := cached.latitude;
      NEW.longitude := cached.longitude;
      NEW.geocoded_at := cached.resolved_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_sync_service_coordinates
BEFORE INSERT OR UPDATE OF owner_id, service_province, service_locality
ON projects
FOR EACH ROW
EXECUTE FUNCTION sync_project_service_coordinates();

UPDATE users u
   SET service_latitude=c.latitude,
       service_longitude=c.longitude,
       service_geocoded_at=c.resolved_at,
       updated_at=now()
  FROM geo_location_cache c
 WHERE c.area_key=lower(btrim(u.service_province)) || '|' || lower(btrim(u.service_locality));

UPDATE projects p
   SET service_province=u.service_province,
       service_locality=u.service_locality,
       latitude=u.service_latitude,
       longitude=u.service_longitude,
       geocoded_at=u.service_geocoded_at,
       updated_at=now()
  FROM users u
 WHERE p.owner_id=u.id
   AND p.service_province IS NULL;

COMMENT ON TABLE geo_location_cache IS
  'Cache server-side de centros de localidad para España. No contiene direcciones privadas de usuarios.';
COMMENT ON COLUMN users.service_latitude IS
  'Centro aproximado de la localidad base elegida; no representa la dirección privada del usuario.';
COMMENT ON COLUMN projects.latitude IS
  'Centro aproximado de la localidad del proyecto para filtrado por radio; no representa la dirección privada de la obra.';
