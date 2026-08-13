-- MiConstructor guide reference normalization
UPDATE guide_articles
SET source_label = 'Precios de mercado consultados en España',
    source_url = NULL,
    updated_at = now()
WHERE slug IN (
  'reforma-bano-5m2',
  'reforma-cocina-7m2',
  'reforma-salon-25m2',
  'reforma-integral-80m2'
);
