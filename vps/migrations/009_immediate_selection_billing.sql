ALTER TABLE billable_items
  ADD COLUMN stripe_payment_intent_id text UNIQUE,
  ADD COLUMN collection_requested_at timestamptz,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN failure_reason text,
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0);

ALTER TABLE billable_items DROP CONSTRAINT billable_items_status_check;
ALTER TABLE billable_items
  ADD CONSTRAINT billable_items_status_check
  CHECK (status IN ('PENDIENTE','PROCESANDO','FACTURADO','PAGADO','FALLIDO'));

CREATE INDEX billable_items_immediate_charge_idx
  ON billable_items (professional_id, status, service_date DESC)
  WHERE invoice_id IS NULL;

COMMENT ON COLUMN billable_items.invoice_id IS
  'Compatibilidad histórica con la facturación semanal anterior. Las nuevas selecciones usan cobro inmediato y mantienen invoice_id NULL.';

COMMENT ON COLUMN billable_items.stripe_payment_intent_id IS
  'PaymentIntent individual creado automáticamente cuando el cliente selecciona al profesional.';
