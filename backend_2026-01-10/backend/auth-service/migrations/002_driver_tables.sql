-- PR2: driver + truck binding tables

CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_trucks (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, plate_number)
);

CREATE INDEX IF NOT EXISTS idx_driver_trucks_plate_number ON driver_trucks(plate_number);
CREATE INDEX IF NOT EXISTS idx_driver_trucks_driver_id ON driver_trucks(driver_id);
