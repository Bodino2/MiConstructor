ALTER TABLE reviews
  ADD COLUMN publication_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN publication_consent_at timestamptz,
  ADD COLUMN public_price_consent boolean NOT NULL DEFAULT false;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_public_price_requires_publication_consent CHECK (
    NOT public_price_consent OR publication_consent
  );

-- Existing rows predate explicit publication consent. Fail closed: any previously
-- visible review is resealed until the author explicitly opts in through the new flow.
UPDATE reviews
   SET status='SELLADA', published_at=NULL
 WHERE status='PUBLICADA'
   AND publication_consent=false;

CREATE OR REPLACE FUNCTION enforce_review_publication_consent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.publication_consent = true AND NEW.publication_consent_at IS NULL THEN
    NEW.publication_consent_at := now();
  END IF;

  IF NEW.publication_consent = false THEN
    NEW.publication_consent_at := NULL;
    NEW.public_price_consent := false;
    IF NEW.status = 'PUBLICADA' THEN
      NEW.status := 'SELLADA';
      NEW.published_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_publication_consent_guard
BEFORE INSERT OR UPDATE OF publication_consent, public_price_consent, status
ON reviews
FOR EACH ROW
EXECUTE FUNCTION enforce_review_publication_consent();

CREATE INDEX reviews_public_verified_idx
  ON reviews (published_at DESC, project_id)
  WHERE publication_consent = true
    AND status IN ('SELLADA', 'PUBLICADA');

COMMENT ON COLUMN reviews.publication_consent IS
  'Consentimiento explícito del autor para mostrar públicamente su reseña verificada.';
COMMENT ON COLUMN reviews.public_price_consent IS
  'Consentimiento adicional del cliente para mostrar el importe final acordado del proyecto junto a su reseña.';
