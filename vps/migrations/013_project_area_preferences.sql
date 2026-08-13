ALTER TABLE projects
  ADD COLUMN search_radius_km integer NOT NULL DEFAULT 50
    CHECK (search_radius_km BETWEEN 5 AND 200);

CREATE INDEX projects_area_radius_idx
  ON projects (status, category, service_province, service_locality, search_radius_km)
  WHERE service_province IS NOT NULL AND service_locality IS NOT NULL;

COMMENT ON COLUMN projects.search_radius_km IS
  'Radio máximo elegido por el cliente para buscar profesionales alrededor de la localidad específica del proyecto.';
