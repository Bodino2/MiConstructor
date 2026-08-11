ALTER TABLE stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_retry_idx
  ON stripe_webhook_events(processed_at, processing_started_at)
  WHERE processed_at IS NULL;
