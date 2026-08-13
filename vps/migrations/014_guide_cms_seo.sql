CREATE TABLE guide_articles (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 120),
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 2 AND 80),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 8 AND 180),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 20 AND 600),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 40 AND 12000),
  price_range text CHECK (price_range IS NULL OR char_length(price_range) <= 120),
  price_metric text CHECK (price_metric IS NULL OR char_length(price_metric) <= 160),
  highlights text[] NOT NULL DEFAULT '{}',
  caveats text CHECK (caveats IS NULL OR char_length(caveats) <= 2500),
  source_label text CHECK (source_label IS NULL OR char_length(source_label) <= 240),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  source_date_label text CHECK (source_date_label IS NULL OR char_length(source_date_label) <= 120),
  author_name text NOT NULL DEFAULT 'Equipo MiConstructor' CHECK (char_length(author_name) BETWEEN 2 AND 120),
  cover_image_path text CHECK (cover_image_path IS NULL OR cover_image_path ~ '^/[A-Za-z0-9_./-]+$'),
  seo_title text NOT NULL CHECK (char_length(btrim(seo_title)) BETWEEN 10 AND 180),
  seo_description text NOT NULL CHECK (char_length(btrim(seo_description)) BETWEEN 30 AND 320),
  status text NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR','PUBLICADO')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'PUBLICADO' AND published_at IS NOT NULL) OR status = 'BORRADOR')
);

CREATE INDEX guide_articles_public_idx
  ON guide_articles (published_at DESC)
  WHERE status = 'PUBLICADO';

INSERT INTO guide_articles
  (id, slug, category, title, summary, body, price_range, price_metric, highlights, caveats,
   source_label, source_url, source_date_label, seo_title, seo_description, status, published_at)
VALUES
  ('01400000-0000-4000-8000-000000000001', 'reforma-bano-5m2', 'Baño',
   'Caso orientativo: reforma completa de baño de 5 m²',
   'Demolición, revestimientos, sanitarios e instalaciones en un baño estándar, sin cambios estructurales complejos.',
   'Una reforma de baño pequeña concentra muchas partidas en pocos metros cuadrados: demolición, retirada de residuos, fontanería, electricidad, impermeabilización, revestimientos y montaje. El rango sirve como referencia inicial para comparar propuestas, no como presupuesto cerrado.',
   '3.250 € – 3.750 €', '650–750 €/m²',
   ARRAY['Demolición y retirada','Revestimientos y pavimento','Fontanería y electricidad habituales','Sanitarios y grifería de gama media'],
   'Mover bajantes, elegir mamparas o sanitarios premium, problemas de humedad o instalaciones muy antiguas puede elevar el presupuesto.',
   'Habitissimo · Precios para reformas de baños en 2026', 'https://www.habitissimo.es/presupuestos/reformas-banos', 'consulta agosto 2026',
   'Precio reforma de baño de 5 m²: caso orientativo | MiConstructor',
   'Caso orientativo para una reforma completa de baño de 5 m² en España, con rango de precio, partidas habituales y factores que pueden encarecer la obra.',
   'PUBLICADO', '2026-08-12T12:00:00+02:00'),
  ('01400000-0000-4000-8000-000000000002', 'reforma-cocina-7m2', 'Cocina',
   'Caso orientativo: cocina de 7 m² con calidades medias',
   'Reforma de cocina compacta con demolición, revestimientos, mobiliario básico y actualización de instalaciones.',
   'En una cocina el coste depende especialmente del mobiliario, la encimera, los electrodomésticos y el grado de modificación de las instalaciones. Este escenario representa una cocina compacta con calidades medias y una distribución sin grandes cambios estructurales.',
   '5.600 € – 9.000 €', 'referencia media ≈ 6.000 €',
   ARRAY['Demolición y desescombro','Suelo y revestimientos','Mobiliario de gama media','Fontanería y electricidad','Montaje básico'],
   'Encimeras especiales, electrodomésticos de alta gama, muebles a medida o cambios de distribución pueden llevar el coste por encima del rango.',
   'Habitissimo · Guía de precios de reformas de cocinas', 'https://www.habitissimo.es/presupuestos/reformas-cocinas', 'referencia consultada en agosto 2026',
   'Precio reforma de cocina de 7 m²: caso orientativo | MiConstructor',
   'Referencia de precio para reformar una cocina de 7 m² con calidades medias, incluyendo partidas habituales y factores que modifican el presupuesto.',
   'PUBLICADO', '2026-08-12T12:05:00+02:00'),
  ('01400000-0000-4000-8000-000000000003', 'reforma-salon-25m2', 'Salón',
   'Caso orientativo: renovación de salón de 25 m²',
   'Ejemplo con derribo de un tabique no estructural, estantería de pladur, suelo vinílico, pintura y lacado de dos puertas.',
   'Un salón puede renovarse de forma ligera o convertirse en una obra de redistribución. Este caso combina varias actuaciones frecuentes para mostrar por qué dos presupuestos de una misma superficie pueden ser muy diferentes según el alcance real.',
   '1.345 € – 5.065 €', 'ejemplo nacional 2026',
   ARRAY['Tabique: 250–800 €','Pladur: 500–1.500 €','Suelo vinílico: 225–1.750 €','Pintura: 250–875 €','Dos puertas: 120–140 €'],
   'Si el tabique es estructural, se modifica fachada o se incorporan carpinterías, climatización o muebles a medida, el proyecto cambia sustancialmente.',
   'Cronoshare · Precio de reformar un salón (25 m²)', 'https://www.cronoshare.com/cuanto-cuesta/reformar-salon', '12 enero 2026',
   'Precio para reformar un salón de 25 m²: caso | MiConstructor',
   'Ejemplo orientativo de renovación de un salón de 25 m² con desglose de actuaciones habituales y rango de precio de referencia en España.',
   'PUBLICADO', '2026-08-12T12:10:00+02:00'),
  ('01400000-0000-4000-8000-000000000004', 'reforma-integral-80m2', 'Reforma integral',
   'Caso orientativo: reforma integral de vivienda de 80 m²',
   'Escenario para una vivienda de 80 m² con renovación amplia de acabados e instalaciones, comparando dos niveles de calidad.',
   'En una reforma integral el precio por metro cuadrado es útil solo como primera referencia. Distribución, instalaciones, ventanas, aislamiento, cocina, baños, estado previo y calidades pueden mover el presupuesto de forma significativa.',
   '32.000 € – 64.000 €', '400–800 €/m² según calidades',
   ARRAY['Calidad baja-media: 32.000–48.000 €','Calidad media-alta: 48.000–64.000 €','Incluye varias partidas de obra e instalaciones','No presupone patologías estructurales'],
   'Estructura, redistribuciones importantes, ventanas, aislamiento, instalaciones especiales, licencias o acabados premium pueden elevar el coste.',
   'Habitissimo · Precios de reformas de viviendas 2026', 'https://www.habitissimo.es/presupuestos/reformas-viviendas', 'actualizado 10 junio 2026',
   'Precio reforma integral de vivienda de 80 m² | MiConstructor',
   'Caso orientativo de reforma integral para una vivienda de 80 m², con rangos por nivel de calidad y factores que pueden modificar el coste final.',
   'PUBLICADO', '2026-08-12T12:15:00+02:00')
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE guide_articles IS
  'CMS editorial de Guía MiConstructor. Solo status PUBLICADO aparece en rutas públicas y sitemap.';
