(() => {
  if (!window.location.pathname.startsWith("/guia")) return;

  const app = document.querySelector("#app");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);

  const cases = [
    {
      slug: "reforma-bano-5m2",
      category: "Baño",
      title: "Caso orientativo: reforma completa de baño de 5 m²",
      range: "3.250 € – 3.750 €",
      metric: "650–750 €/m²",
      summary: "Demolición, revestimientos, sanitarios e instalaciones en un baño estándar, sin cambios estructurales complejos.",
      scope: ["Demolición y retirada", "Revestimientos y pavimento", "Fontanería y electricidad habituales", "Sanitarios y grifería de gama media"],
      caveats: "Mover bajantes, elegir mamparas o sanitarios premium, problemas de humedad o instalaciones muy antiguas puede elevar el presupuesto.",
      source: "Precios de mercado consultados en España",
      sourceDate: "consulta agosto 2026",
      sourceUrl: null,
    },
    {
      slug: "reforma-cocina-7m2",
      category: "Cocina",
      title: "Caso orientativo: cocina de 7 m² con calidades medias",
      range: "5.600 € – 9.000 €",
      metric: "referencia media ≈ 6.000 €",
      summary: "Reforma de cocina compacta con demolición, revestimientos, mobiliario básico y actualización de instalaciones.",
      scope: ["Demolición y desescombro", "Suelo y revestimientos", "Mobiliario de gama media", "Fontanería y electricidad", "Montaje básico"],
      caveats: "Encimeras especiales, electrodomésticos de alta gama, muebles a medida o cambios de distribución pueden llevar el coste por encima del rango.",
      source: "Precios de mercado consultados en España",
      sourceDate: "referencia consultada en agosto 2026",
      sourceUrl: null,
    },
    {
      slug: "reforma-salon-25m2",
      category: "Salón",
      title: "Caso orientativo: renovación de salón de 25 m²",
      range: "1.345 € – 5.065 €",
      metric: "ejemplo nacional 2026",
      summary: "Ejemplo con derribo de un tabique no estructural, estantería de pladur, suelo vinílico, pintura y lacado de dos puertas.",
      scope: ["Tabique: 250–800 €", "Pladur: 500–1.500 €", "Suelo vinílico: 225–1.750 €", "Pintura: 250–875 €", "Dos puertas: 120–140 €"],
      caveats: "Si el tabique es estructural, se modifica fachada o se incorporan carpinterías, climatización o muebles a medida, el proyecto cambia sustancialmente.",
      source: "Precios de mercado consultados en España",
      sourceDate: "12 enero 2026",
      sourceUrl: null,
    },
    {
      slug: "reforma-integral-80m2",
      category: "Reforma integral",
      title: "Caso orientativo: reforma integral de vivienda de 80 m²",
      range: "32.000 € – 64.000 €",
      metric: "400–800 €/m² según calidades",
      summary: "Escenario para una vivienda de 80 m² con renovación amplia de acabados e instalaciones, comparando dos niveles de calidad.",
      scope: ["Calidad baja-media: 32.000–48.000 €", "Calidad media-alta: 48.000–64.000 €", "Incluye varias partidas de obra e instalaciones", "No presupone patologías estructurales"],
      caveats: "Estructura, redistribuciones importantes, ventanas, aislamiento, instalaciones especiales, licencias o acabados premium pueden elevar el coste.",
      source: "Precios de mercado consultados en España",
      sourceDate: "actualizado 10 junio 2026",
      sourceUrl: null,
    },
  ];

  function sourceNote(item) {
    return `<p class="guide-source">Referencia orientativa: ${escapeHtml(item.source)} · ${escapeHtml(item.sourceDate)}. Los importes son orientativos y no sustituyen un presupuesto profesional.</p>`;
  }

  function card(item) {
    return `<article class="guide-card">
      <span class="guide-category">${escapeHtml(item.category)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <div class="guide-price">${escapeHtml(item.range)}</div>
      <div class="guide-metric">${escapeHtml(item.metric)}</div>
      <p>${escapeHtml(item.summary)}</p>
      <a class="button" href="/guia/${item.slug}">Ver caso completo →</a>
    </article>`;
  }

  function guideHome() {
    document.title = "Guía de precios y casos de reformas | MiConstructor";
    app.innerHTML = `<section class="guide-shell">
      <header class="guide-hero">
        <span class="eyebrow">GUÍA MICONSTRUCTOR · ESPAÑA</span>
        <h1>Precios, consejos y casos para decidir una reforma con más contexto.</h1>
        <p>Referencias de mercado explicadas de forma sencilla. No publicamos opiniones inventadas: las reseñas de MiConstructor serán únicamente de proyectos verificados y finalizados dentro de la plataforma.</p>
        <div class="actions"><a class="button primary" href="/registro-cliente">Publicar mi proyecto →</a><a class="button" href="#casos">Ver casos orientativos</a></div>
      </header>
      <section class="guide-principles">
        <article><strong>Rangos, no promesas</strong><span>Una obra real depende de estado previo, ciudad, materiales y alcance.</span></article>
        <article><strong>Referencias de mercado</strong><span>Indicamos cuándo se consultaron los precios orientativos utilizados.</span></article>
        <article><strong>Opiniones verificadas</strong><span>Las reseñas reales se publicarán solo tras trabajos vinculados a la plataforma.</span></article>
      </section>
      <section id="casos" class="guide-section">
        <div class="guide-section-head"><span class="eyebrow">CASOS ORIENTATIVOS</span><h2>¿Cuánto puede costar?</h2></div>
        <div class="guide-grid">${cases.map(card).join("")}</div>
      </section>
      <section class="guide-section guide-advice">
        <div><span class="eyebrow">ANTES DE ELEGIR</span><h2>Compara alcance, no solo el total.</h2></div>
        <ol><li>Comprueba qué materiales están incluidos.</li><li>Separa mano de obra, materiales, residuos, licencias e impuestos.</li><li>Verifica qué instalaciones se renuevan realmente.</li><li>Compara plazos, garantías y exclusiones.</li><li>Reserva margen para imprevistos si la vivienda es antigua.</li></ol>
      </section>
    </section>`;
  }

  function guideDetail(item) {
    document.title = `${item.title} | Guía MiConstructor`;
    const otherCases = cases.filter((candidate) => candidate.slug !== item.slug).slice(0, 3);
    app.innerHTML = `<article class="guide-shell guide-detail">
      <a class="guide-back" href="/guia">← Volver a Guía MiConstructor</a>
      <header class="guide-detail-hero">
        <span class="guide-category">${escapeHtml(item.category)}</span>
        <h1>${escapeHtml(item.title)}</h1>
        <p>${escapeHtml(item.summary)}</p>
        <div class="guide-detail-price"><strong>${escapeHtml(item.range)}</strong><span>${escapeHtml(item.metric)}</span></div>
      </header>
      <section class="guide-detail-grid">
        <div class="guide-detail-main">
          <h2>Qué contempla este caso</h2>
          <ul>${item.scope.map((scope) => `<li>${escapeHtml(scope)}</li>`).join("")}</ul>
          <h2>Qué puede cambiar el precio</h2>
          <p>${escapeHtml(item.caveats)}</p>
          ${sourceNote(item)}
        </div>
        <aside class="guide-cta-card">
          <span class="eyebrow">TU OBRA NO ES UNA MEDIA</span>
          <h2>Publica el proyecto en su localidad real.</h2>
          <p>Define provincia, localidad y radio. MiConstructor buscará profesionales verificados dentro de esa zona.</p>
          <a class="button primary" href="/registro-cliente">Empezar proyecto →</a>
        </aside>
      </section>
      <section class="guide-section"><div class="guide-section-head"><span class="eyebrow">TAMBIÉN PUEDE INTERESARTE</span><h2>Otros casos</h2></div><div class="guide-grid">${otherCases.map(card).join("")}</div></section>
    </article>`;
  }

  const slug = window.location.pathname.match(/^\/guia\/([a-z0-9-]+)\/?$/)?.[1];
  if (!slug) guideHome();
  else {
    const item = cases.find((candidate) => candidate.slug === slug);
    if (item) guideDetail(item);
    else app.innerHTML = `<section class="guide-shell"><div class="guide-not-found"><h1>Este artículo no existe.</h1><a class="button" href="/guia">Ir a la guía</a></div></section>`;
  }
})();