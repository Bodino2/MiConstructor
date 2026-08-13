ALTER TABLE users
  ADD COLUMN service_province text,
  ADD COLUMN service_locality text,
  ADD COLUMN service_radius_km integer NOT NULL DEFAULT 50
    CHECK (service_radius_km BETWEEN 5 AND 200);

ALTER TABLE users
  ADD CONSTRAINT users_service_area_pair CHECK (
    (service_province IS NULL AND service_locality IS NULL)
    OR
    (service_province IS NOT NULL AND char_length(btrim(service_province)) BETWEEN 2 AND 100
     AND service_locality IS NOT NULL AND char_length(btrim(service_locality)) BETWEEN 2 AND 100)
  );

CREATE INDEX users_service_area_idx
  ON users (role, service_province, service_locality, service_radius_km)
  WHERE service_province IS NOT NULL AND service_locality IS NOT NULL;

COMMENT ON COLUMN users.service_radius_km IS
  'Radio operativo elegido por el usuario alrededor de su localidad base. Valor inicial recomendado: 50 km.';
