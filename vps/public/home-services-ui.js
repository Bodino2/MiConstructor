const homeServicesApp = document.querySelector("#app");
const homeServicesToast = document.querySelector("#toast");
const HOME_SERVICES_PATH = "/servicios-hogar";
const HOME_SERVICE_SPECIALTIES = new Set(["limpieza_profesional", "jardineria"]);
let homeServicesRenderPromise = null;

const hsEscape = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const hsMoney = (cents) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);

function hsTodayMadrid() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hsNotify(message, error = false) {
  if (!homeServicesToast) return;
  homeServicesToast.textContent = message;
  homeServicesToast.className = `toast${error ? " error" : ""}`;
  homeServicesToast.hidden = false;
  window.clearTimeout(hsNotify.timer);
  hsNotify.timer = window.setTimeout(() => { homeServicesToast.hidden = true; }, 5000);
}

async function hsApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.error || "No se ha podido completar la operación.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function hsFrequencyLabel(value) {
  return ({ PUNTUAL: "Una sola vez", SEMANAL: "Cada semana", CADA_2_SEMANAS: "Cada dos semanas", MENSUAL: "Cada mes" })[value] || value;
}

function hsStatus(value) {
  return `<span class="hs-status hs-status-${hsEscape(String(value).toLowerCase())}">${hsEscape(String(value).replaceAll("_", " "))}</span>`;
}

function catalogMap(catalog) {
  const map = new Map();
  for (const vertical of catalog.verticals || []) {
    for (const service of vertical.services || []) map.set(service.slug, { ...service, verticalLabel: vertical.label });
  }
  return map;
}

function publicCatalog(catalog) {
  return `<section class="hs-public-catalog" id="catalogo-servicios">
    ${(catalog.verticals || []).map((vertical) => `<article class="hs-vertical-card" id="${vertical.slug === "limpieza_mantenimiento" ? "limpieza" : "jardin"}">
      <span class="eyebrow">${hsEscape(vertical.label)}</span>
      <h2>${vertical.slug === "limpieza_mantenimiento" ? "Limpieza para vivir mejor" : "Exterior cuidado todo el año"}</h2>
      <div class="hs-service-chips">${(vertical.services || []).map((service) => `<span>${hsEscape(service.label)}</span>`).join("")}</div>
      <p>${vertical.slug === "limpieza_mantenimiento" ? "Servicios puntuales o programados para viviendas, comunidades, cristales, mudanzas y fin de obra." : "Jardinería, césped, poda, riego, parcelas y piscina con opción de mantenimiento recurrente."}</p>
    </article>`).join("")}
  </section>`;
}

function requestForm(catalog) {
  const services = catalogMap(catalog);
  const options = [...services.entries()].map(([slug, service]) => `<option value="${hsEscape(slug)}">${hsEscape(service.verticalLabel)} · ${hsEscape(service.label)}</option>`).join("");
  return `<section class="card hs-card hs-request-card">
    <header><span class="eyebrow">NUEVO SERVICIO</span><h2>Programa el cuidado de tu hogar</h2><p>Elige qué necesitas, cuándo y con qué frecuencia. Recibirás ofertas por visita de profesionales verificados.</p></header>
    <form id="hs-request-form" class="form-grid">
      <label class="full">Servicio<select name="serviceSlug" id="hs-service" required><option value="">Selecciona un servicio</option>${options}</select></label>
      <label class="full">Ubicación<input name="location" required minlength="3" placeholder="Linares, Jaén" /></label>
      <label>Tipo de propiedad<select name="propertyType" required><option value="PISO">Piso</option><option value="CASA">Casa</option><option value="CHALET">Chalet</option><option value="COMUNIDAD">Comunidad</option><option value="LOCAL">Local</option><option value="JARDIN">Jardín</option><option value="PARCELA">Parcela</option><option value="OTRO">Otro</option></select></label>
      <label>Superficie aproximada (m²)<input name="squareMeters" type="number" min="1" max="100000" step="1" /></label>
      <label>Dormitorios<input name="bedrooms" type="number" min="0" max="50" step="1" /></label>
      <label>Baños<input name="bathrooms" type="number" min="0" max="50" step="1" /></label>
      <label>Horas estimadas<input name="estimatedHours" type="number" min="0.5" max="24" step="0.5" /></label>
      <label>Frecuencia<select name="frequency" id="hs-frequency" required><option value="">Selecciona primero el servicio</option></select></label>
      <label>Fecha de inicio<input name="requestedStartDate" type="date" min="${hsTodayMadrid()}" required /></label>
      <label>Desde<input name="preferredTimeStart" type="time" /></label>
      <label>Hasta<input name="preferredTimeEnd" type="time" /></label>
      <label class="full">Indicaciones<textarea name="notes" maxlength="4000" placeholder="Prioridades, acceso, mascotas, zonas concretas, materiales delicados…"></textarea></label>
      <div class="form-actions"><button class="button primary">Solicitar ofertas →</button></div>
    </form>
  </section>`;
}

function visitsMarkup(visits = [], professional = false) {
  if (!visits?.length) return `<div class="hs-empty-mini">Todavía no hay visitas registradas.</div>`;
  const today = hsTodayMadrid();
  return `<div class="hs-visits">${visits.map((visit) => `<div class="hs-visit">
    <div><strong>Visita ${hsEscape(visit.sequenceNumber)}</strong><span>${hsEscape(String(visit.scheduledDate).slice(0, 10))}${visit.scheduledTime ? ` · ${hsEscape(String(visit.scheduledTime).slice(0, 5))}` : ""}</span></div>
    ${hsStatus(visit.status)}
    ${professional && visit.status === "PROGRAMADA" ? `<button class="button hs-small-button" type="button" data-hs-start="${hsEscape(visit.id)}" ${String(visit.scheduledDate).slice(0, 10) > today ? "disabled" : ""}>Iniciar</button>` : ""}
    ${professional && visit.status === "EN_CURSO" ? `<div class="hs-complete"><input data-hs-complete-note="${hsEscape(visit.id)}" maxlength="2000" placeholder="Nota de finalización" /><button class="button primary hs-small-button" type="button" data-hs-complete="${hsEscape(visit.id)}">Finalizar</button></div>` : ""}
  </div>`).join("")}</div>`;
}

function engagementsMarkup(engagements = [], user) {
  if (!engagements.length) return `<div class="empty">Aún no tienes servicios asignados.</div>`;
  const professional = user.role === "profesional";
  return `<div class="hs-engagements">${engagements.map((item) => `<article class="card hs-engagement">
    <div class="hs-engagement-head"><div><span class="eyebrow">${hsEscape(item.service_slug)}</span><h3>${hsFrequencyLabel(item.frequency)}</h3></div>${hsStatus(item.status)}</div>
    <div class="hs-engagement-meta"><span><strong>${hsMoney(item.price_cents_per_visit)}</strong> / visita</span><span>Inicio: ${hsEscape(String(item.start_date).slice(0, 10))}</span><span>Próxima: ${item.next_visit_date ? hsEscape(String(item.next_visit_date).slice(0, 10)) : "—"}</span></div>
    ${visitsMarkup(item.visits || [], professional)}
    ${!professional && ["ACTIVO", "PAUSADO"].includes(item.status) ? `<div class="hs-engagement-actions">
      ${item.status === "ACTIVO" && item.frequency !== "PUNTUAL" ? `<button class="button" type="button" data-hs-pause="${hsEscape(item.id)}">Pausar</button>` : ""}
      ${item.status === "PAUSADO" ? `<button class="button primary" type="button" data-hs-resume="${hsEscape(item.id)}">Reanudar</button>` : ""}
      <input data-hs-cancel-reason="${hsEscape(item.id)}" maxlength="1000" placeholder="Motivo para cancelar" />
      <button class="button danger-button" type="button" data-hs-cancel="${hsEscape(item.id)}">Cancelar servicio</button>
    </div>` : ""}
  </article>`).join("")}</div>`;
}

function requestsMarkup(requests = [], serviceMap, client = true) {
  if (!requests.length) return `<div class="empty">No hay solicitudes en este momento.</div>`;
  return `<div class="hs-requests">${requests.map((item) => {
    const service = serviceMap.get(item.service_slug);
    return `<article class="card hs-request-item">
      <div class="hs-engagement-head"><div><span class="eyebrow">${hsEscape(service?.verticalLabel || item.vertical)}</span><h3>${hsEscape(service?.label || item.service_slug)}</h3></div>${hsStatus(item.status)}</div>
      <p>${hsEscape(item.location)} · ${hsEscape(item.property_type)}${item.square_meters ? ` · ${hsEscape(item.square_meters)} m²` : ""}</p>
      <div class="hs-request-meta"><span>${hsFrequencyLabel(item.frequency)}</span><span>Desde ${hsEscape(String(item.requested_start_date).slice(0, 10))}</span></div>
      ${client && item.status === "PUBLICADO" ? `<button class="button" type="button" data-hs-offers="${hsEscape(item.id)}">Ver ofertas</button><div class="hs-offers-slot" data-hs-offers-slot="${hsEscape(item.id)}"></div>` : ""}
      ${!client && item.status === "PUBLICADO" && !item.already_offered ? `<form class="hs-offer-form" data-hs-offer-form="${hsEscape(item.id)}">
        <label>Precio / visita (€)<input name="amountEuros" type="number" min="1" max="500000" step="0.01" required /></label>
        <label>Duración (min)<input name="estimatedDurationMinutes" type="number" min="30" max="1440" step="15" required /></label>
        <label>Primera fecha disponible<input name="firstAvailableDate" type="date" min="${hsTodayMadrid()}" required /></label>
        <label class="full">Qué incluye<textarea name="message" minlength="20" maxlength="4000" required></textarea></label>
        <button class="button primary" type="submit">Enviar oferta →</button>
      </form>` : ""}
      ${!client && item.already_offered ? `<div class="notice">Ya has enviado una oferta para este servicio.</div>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function assessmentMarkup(assessment) {
  return `<form id="hs-assessment-form" class="hs-assessment-form">
    <input type="hidden" name="version" value="${hsEscape(assessment.version)}" />
    <div class="notice"><strong>${hsEscape(assessment.specialty.label)}</strong><br />Responde las ${assessment.questionCount} preguntas. Mínimo ${assessment.passScore}%.</div>
    ${assessment.questions.map((question, index) => `<fieldset class="question"><legend><strong>${index + 1}. ${hsEscape(question.prompt)}</strong></legend>${question.options.map((option) => `<label><input type="radio" name="${hsEscape(question.id)}" value="${hsEscape(option.id)}" required /><span>${hsEscape(option.label)}</span></label>`).join("")}</fieldset>`).join("")}
    <button class="button primary">Enviar evaluación →</button>
  </form>`;
}

async function renderClientHomeServices(user, catalog) {
  const serviceMap = catalogMap(catalog);
  const [requestsResult, engagementsResult] = await Promise.all([
    hsApi("/api/v1/home-services/requests"),
    hsApi("/api/v1/home-services/engagements"),
  ]);
  homeServicesApp.innerHTML = `<main class="hs-shell">
    <header class="hs-page-head"><span class="eyebrow">LIMPIEZA · JARDÍN · MANTENIMIENTO</span><h1>Cuida tu hogar sin volver a empezar cada vez.</h1><p class="lead">Solicita un servicio puntual o programa visitas recurrentes. Ofertas, fechas y seguimiento quedan centralizados en MiConstructor.</p></header>
    ${publicCatalog(catalog)}
    <div class="hs-two-column"><div>${requestForm(catalog)}</div><aside class="card hs-account-card"><span class="eyebrow">TU CUENTA</span><h3>${hsEscape(user.name)}</h3><p>${hsEscape(user.email)}</p><a class="button" href="/panel">Volver al panel</a></aside></div>
    <section class="hs-section"><div class="hs-section-head"><h2>Tus solicitudes</h2></div>${requestsMarkup(requestsResult.requests || [], serviceMap, true)}</section>
    <section class="hs-section"><div class="hs-section-head"><h2>Servicios asignados y programados</h2></div>${engagementsMarkup(engagementsResult.engagements || [], user)}</section>
  </main>`;

  const serviceSelect = document.querySelector("#hs-service");
  const frequencySelect = document.querySelector("#hs-frequency");
  const updateFrequencies = () => {
    const service = serviceMap.get(serviceSelect.value);
    frequencySelect.innerHTML = service ? service.recurrence.map((value) => `<option value="${hsEscape(value)}">${hsFrequencyLabel(value)}</option>`).join("") : '<option value="">Selecciona primero el servicio</option>';
  };
  serviceSelect?.addEventListener("change", updateFrequencies);

  document.querySelector("#hs-request-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    for (const key of ["squareMeters", "bedrooms", "bathrooms", "estimatedHours", "preferredTimeStart", "preferredTimeEnd"]) if (payload[key] === "") delete payload[key];
    try {
      await hsApi("/api/v1/home-services/requests", { method: "POST", body: JSON.stringify(payload) });
      hsNotify("Solicitud publicada.");
      await renderHomeServicesRoute();
    } catch (error) { hsNotify(error.message, true); }
  });

  document.querySelectorAll("[data-hs-offers]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.hsOffers;
    const slot = document.querySelector(`[data-hs-offers-slot="${CSS.escape(id)}"]`);
    slot.innerHTML = '<div class="loading">Cargando ofertas…</div>';
    try {
      const result = await hsApi(`/api/v1/home-services/requests/${encodeURIComponent(id)}/offers`);
      slot.innerHTML = result.offers.length ? `<div class="hs-offers">${result.offers.map((offer) => `<article class="hs-offer"><div><strong>${hsEscape(offer.professional_display_name)}</strong><span>${offer.review_count ? `★ ${hsEscape(offer.rating)} · ${hsEscape(offer.review_count)} reseñas` : "Sin reseñas aún"}</span></div><div><strong>${hsMoney(offer.amount_cents_per_visit)}</strong><span>${hsEscape(offer.estimated_duration_minutes)} min</span></div><p>${hsEscape(offer.message)}</p>${offer.status === "ENVIADA" ? `<button class="button primary" type="button" data-hs-accept="${hsEscape(offer.id)}" data-hs-request="${hsEscape(id)}">Aceptar oferta →</button>` : hsStatus(offer.status)}</article>`).join("")}</div>` : '<div class="hs-empty-mini">Todavía no has recibido ofertas.</div>';
      slot.querySelectorAll("[data-hs-accept]").forEach((accept) => accept.addEventListener("click", async () => {
        try {
          await hsApi(`/api/v1/home-services/requests/${encodeURIComponent(accept.dataset.hsRequest)}/offers/${encodeURIComponent(accept.dataset.hsAccept)}/accept`, { method: "POST" });
          hsNotify("Oferta aceptada y primera visita programada.");
          await renderHomeServicesRoute();
        } catch (error) { hsNotify(error.message, true); }
      }));
    } catch (error) { slot.innerHTML = `<div class="notice danger">${hsEscape(error.message)}</div>`; }
  }));

  bindEngagementActions();
}

function bindEngagementActions() {
  document.querySelectorAll("[data-hs-pause]").forEach((button) => button.addEventListener("click", async () => {
    try { await hsApi(`/api/v1/home-services/engagements/${encodeURIComponent(button.dataset.hsPause)}/pause`, { method: "POST" }); hsNotify("Servicio pausado."); await renderHomeServicesRoute(); } catch (error) { hsNotify(error.message, true); }
  }));
  document.querySelectorAll("[data-hs-resume]").forEach((button) => button.addEventListener("click", async () => {
    try { await hsApi(`/api/v1/home-services/engagements/${encodeURIComponent(button.dataset.hsResume)}/resume`, { method: "POST" }); hsNotify("Servicio reanudado."); await renderHomeServicesRoute(); } catch (error) { hsNotify(error.message, true); }
  }));
  document.querySelectorAll("[data-hs-cancel]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.hsCancel;
    const reason = document.querySelector(`[data-hs-cancel-reason="${CSS.escape(id)}"]`)?.value.trim();
    if (!reason || reason.length < 5) return hsNotify("Indica un motivo de cancelación de al menos 5 caracteres.", true);
    try { await hsApi(`/api/v1/home-services/engagements/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); hsNotify("Servicio cancelado."); await renderHomeServicesRoute(); } catch (error) { hsNotify(error.message, true); }
  }));
  document.querySelectorAll("[data-hs-start]").forEach((button) => button.addEventListener("click", async () => {
    try { await hsApi(`/api/v1/home-services/visits/${encodeURIComponent(button.dataset.hsStart)}/start`, { method: "POST" }); hsNotify("Visita iniciada."); await renderHomeServicesRoute(); } catch (error) { hsNotify(error.message, true); }
  }));
  document.querySelectorAll("[data-hs-complete]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.hsComplete;
    const notes = document.querySelector(`[data-hs-complete-note="${CSS.escape(id)}"]`)?.value.trim() || "";
    try { await hsApi(`/api/v1/home-services/visits/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify({ notes }) }); hsNotify("Visita finalizada."); await renderHomeServicesRoute(); } catch (error) { hsNotify(error.message, true); }
  }));
}

async function renderProfessionalHomeServices(user, catalog) {
  const serviceMap = catalogMap(catalog);
  let opportunities = [];
  let marketMessage = "";
  try { opportunities = (await hsApi("/api/v1/home-services/requests")).requests || []; }
  catch (error) { marketMessage = error.message; }
  const engagements = (await hsApi("/api/v1/home-services/engagements")).engagements || [];
  const assessmentCatalog = await hsApi("/api/v1/assessments");
  const specialties = (assessmentCatalog.specialties || []).filter((item) => HOME_SERVICE_SPECIALTIES.has(item.slug));

  homeServicesApp.innerHTML = `<main class="hs-shell">
    <header class="hs-page-head"><span class="eyebrow">ÁREA PROFESIONAL</span><h1>Servicios recurrentes con agenda clara.</h1><p class="lead">Accede a solicitudes compatibles cuando tu cuenta y especialidad estén aprobadas. Cada visita queda trazada por separado.</p></header>
    ${publicCatalog(catalog)}
    <div class="hs-two-column"><section class="card hs-card"><span class="eyebrow">NUEVA ESPECIALIDAD</span><h2>Limpieza o jardinería</h2><p>Si todavía no tienes esta especialidad, supera su evaluación de 15 preguntas. La plataforma revisará después tu cualificación.</p><label>Especialidad<select id="hs-add-specialty"><option value="">Selecciona</option>${specialties.map((item) => `<option value="${hsEscape(item.slug)}">${hsEscape(item.label)}</option>`).join("")}</select></label><div id="hs-assessment-slot"></div></section><aside class="card hs-account-card"><span class="eyebrow">TU CUENTA</span><h3>${hsEscape(user.name)}</h3><p>${hsEscape(user.email)}</p><span>${hsStatus(user.verificationStatus)}</span><a class="button" href="/panel">Volver al panel</a></aside></div>
    <section class="hs-section"><div class="hs-section-head"><h2>Oportunidades compatibles</h2></div>${marketMessage ? `<div class="notice">${hsEscape(marketMessage)}</div>` : requestsMarkup(opportunities, serviceMap, false)}</section>
    <section class="hs-section"><div class="hs-section-head"><h2>Tu agenda de servicios</h2></div>${engagementsMarkup(engagements, user)}</section>
  </main>`;

  document.querySelector("#hs-add-specialty")?.addEventListener("change", async (event) => {
    const slot = document.querySelector("#hs-assessment-slot");
    if (!event.target.value) { slot.innerHTML = ""; return; }
    try {
      const result = await hsApi(`/api/v1/assessments/${encodeURIComponent(event.target.value)}`);
      slot.innerHTML = assessmentMarkup(result.assessment);
      slot.querySelector("#hs-assessment-form")?.addEventListener("submit", async (submitEvent) => {
        submitEvent.preventDefault();
        const form = new FormData(submitEvent.currentTarget);
        const payload = { version: result.assessment.version, respuestas: {} };
        result.assessment.questions.forEach((question) => { payload.respuestas[question.id] = form.get(question.id); });
        try {
          await hsApi(`/api/v1/assessments/${encodeURIComponent(event.target.value)}/submit`, { method: "POST", body: JSON.stringify(payload) });
          hsNotify("Evaluación superada. La especialidad queda pendiente de revisión.");
          slot.innerHTML = '<div class="notice">Evaluación enviada. Estado: PENDIENTE DE REVISIÓN.</div>';
        } catch (error) { hsNotify(error.message, true); }
      });
    } catch (error) { slot.innerHTML = `<div class="notice danger">${hsEscape(error.message)}</div>`; }
  });

  document.querySelectorAll("[data-hs-offer-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const amount = Number(data.amountEuros);
    if (!Number.isFinite(amount) || amount <= 0) return hsNotify("Indica un precio válido.", true);
    const payload = { amountCentsPerVisit: Math.round(amount * 100), estimatedDurationMinutes: Number(data.estimatedDurationMinutes), firstAvailableDate: data.firstAvailableDate, message: data.message };
    try {
      await hsApi(`/api/v1/home-services/requests/${encodeURIComponent(event.currentTarget.dataset.hsOfferForm)}/offers`, { method: "POST", body: JSON.stringify(payload) });
      hsNotify("Oferta enviada.");
      await renderHomeServicesRoute();
    } catch (error) { hsNotify(error.message, true); }
  }));
  bindEngagementActions();
}

function scrollHomeServicesHash() {
  const targetId = window.location.hash.slice(1);
  if (!targetId) return;
  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "start" });
  });
}

async function renderHomeServicesRoute() {
  if (!homeServicesApp || location.pathname !== HOME_SERVICES_PATH) return;
  if (homeServicesRenderPromise) return homeServicesRenderPromise;

  homeServicesRenderPromise = (async () => {
    homeServicesApp.innerHTML = '<div class="loading" data-hs-rendering="true">Cargando servicios del hogar…</div>';
    try {
      const [catalog, me] = await Promise.all([
        hsApi("/api/v1/home-services/catalog"),
        hsApi("/api/v1/auth/me").catch(() => ({ user: null })),
      ]);
      const user = me.user;
      if (!user) {
        homeServicesApp.innerHTML = `<main class="hs-shell"><header class="hs-page-head"><span class="eyebrow">CUIDADO INTEGRAL DE LA PROPIEDAD</span><h1>Limpieza y jardín, puntual o programado.</h1><p class="lead">Elige el servicio y la frecuencia. Para solicitar ofertas necesitas una cuenta de cliente; los profesionales pueden acreditarse por especialidad.</p><div class="actions"><a class="button primary" href="/registro-cliente">Crear cuenta de cliente →</a><a class="button" href="/para-profesionales">Soy profesional</a></div></header>${publicCatalog(catalog)}</main>`;
        return;
      }
      if (user.role === "cliente") {
        await renderClientHomeServices(user, catalog);
        return;
      }
      if (user.role === "profesional") {
        await renderProfessionalHomeServices(user, catalog);
        return;
      }
      const [requestsResult, engagementsResult] = await Promise.all([hsApi("/api/v1/home-services/requests"), hsApi("/api/v1/home-services/engagements")]);
      homeServicesApp.innerHTML = `<main class="hs-shell"><header class="hs-page-head"><span class="eyebrow">ADMIN</span><h1>Servicios de hogar</h1><p class="lead">Vista operativa de solicitudes y servicios recurrentes.</p></header>${publicCatalog(catalog)}<section class="hs-section"><h2>Solicitudes</h2><div class="notice">${requestsResult.requests.length} solicitudes registradas.</div></section><section class="hs-section"><h2>Relaciones de servicio</h2>${engagementsMarkup(engagementsResult.engagements || [], user)}</section></main>`;
    } catch (error) {
      homeServicesApp.innerHTML = `<main class="hs-shell"><div class="card"><h2>No se ha podido cargar</h2><p>${hsEscape(error.message)}</p><a class="button" href="/">Volver al inicio</a></div></main>`;
    } finally {
      homeServicesApp.focus();
      scrollHomeServicesHash();
    }
  })();

  try {
    await homeServicesRenderPromise;
  } finally {
    homeServicesRenderPromise = null;
  }
}

const hsObserver = new MutationObserver(() => {
  if (
    location.pathname === HOME_SERVICES_PATH
    && !homeServicesRenderPromise
    && !homeServicesApp?.querySelector(".hs-shell")
  ) void renderHomeServicesRoute();
});
if (homeServicesApp) hsObserver.observe(homeServicesApp, { childList: true });
window.addEventListener("popstate", () => window.setTimeout(() => void renderHomeServicesRoute(), 0));
window.addEventListener("hashchange", scrollHomeServicesHash);
window.setTimeout(() => void renderHomeServicesRoute(), 0);
