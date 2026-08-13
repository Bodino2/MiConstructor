const portalApp = document.querySelector("#app");
const portalNav = document.querySelector("#main-nav");
const portalToast = document.querySelector("#toast");
const PORTAL_PATHS = new Set(["/registro", "/registro-cliente", "/para-profesionales", "/registro-profesional", "/publicar"]);

const portalEscape = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
})[character]);

const PUBLICAR_DRAFT_KEY = "miconstructor_publicar_draft_v1";
const PUBLICAR_SERVICES = new Set(["reformas", "limpieza", "jardineria"]);
const PUBLICAR_DEFAULT_HOME_SERVICE = {
  limpieza: "limpieza_hogar",
  jardineria: "jardineria_mantenimiento",
};
const PUBLICAR_FREQUENCY_LABELS = {
  PUNTUAL: "Una sola vez",
  SEMANAL: "Cada semana",
  CADA_2_SEMANAS: "Cada dos semanas",
  MENSUAL: "Cada mes",
};

function publicarSelected(value, expected) {
  return value === expected ? " selected" : "";
}

function publicarServiceFromLocation() {
  const requested = new URLSearchParams(location.search).get("servicio");
  return PUBLICAR_SERVICES.has(requested) ? requested : "reformas";
}

function publicarDraftRead(expectedService = null) {
  try {
    const raw = localStorage.getItem(PUBLICAR_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft?.version !== 1 || !PUBLICAR_SERVICES.has(draft.service) || !draft.payload || typeof draft.payload !== "object") return null;
    if (expectedService && draft.service !== expectedService) return null;
    return draft;
  } catch {
    return null;
  }
}

function publicarDraftWrite(service, payload) {
  try {
    localStorage.setItem(PUBLICAR_DRAFT_KEY, JSON.stringify({
      version: 1,
      service,
      payload,
      updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

function publicarDraftClear() {
  try { localStorage.removeItem(PUBLICAR_DRAFT_KEY); } catch { /* storage unavailable */ }
}

function publicarDraftUrl(service, accountStep = false) {
  return `/publicar?servicio=${encodeURIComponent(service)}${accountStep ? "&paso=cuenta" : ""}`;
}

function publicarTodayMadrid() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function publicarServiceSelector(service) {
  return `<label class="full">Servicio<select id="publicar-service-kind" required>
    <option value="reformas"${publicarSelected(service, "reformas")}>Reformas Integrales</option>
    <option value="limpieza"${publicarSelected(service, "limpieza")}>Limpieza</option>
    <option value="jardineria"${publicarSelected(service, "jardineria")}>Jardinería</option>
  </select></label>`;
}

function bindPublicarServiceSwitch() {
  document.querySelector("#publicar-service-kind")?.addEventListener("change", (event) => {
    const nextService = event.target.value;
    if (!PUBLICAR_SERVICES.has(nextService)) return;
    publicarDraftClear();
    history.replaceState({}, "", publicarDraftUrl(nextService));
    void publicarFunnel();
  });
}

function publicarReformasForm(service, draft) {
  const data = draft?.payload || {};
  const budgetEuros = data.budgetCents ? Number(data.budgetCents) / 100 : "";
  portalApp.innerHTML = `<section class="auth-wrap portal-register-wrap"><form class="card" id="publicar-details-form">
    <header><span class="eyebrow">PASO 1 · PROYECTO</span><h2>Cuéntanos qué necesitas</h2><p>Guardaremos estos datos como borrador en este navegador hasta que completes el acceso.</p></header>
    <div class="form-grid">
      ${publicarServiceSelector(service)}
      <label class="full">Título<input name="title" required minlength="5" maxlength="160" value="${portalEscape(data.title || "")}" /></label>
      <label>Tipo de obra<select name="projectType" required>
        <option value="reforma_integral"${publicarSelected(data.projectType || "reforma_integral", "reforma_integral")}>Reforma integral</option>
        <option value="bano"${publicarSelected(data.projectType, "bano")}>Reforma de baño</option>
        <option value="cocina"${publicarSelected(data.projectType, "cocina")}>Reforma de cocina</option>
        <option value="construccion_casa"${publicarSelected(data.projectType, "construccion_casa")}>Construcción de casa</option>
      </select></label>
      <label>Calidades<select name="qualityLevel" required>
        <option value="basico"${publicarSelected(data.qualityLevel, "basico")}>Básico</option>
        <option value="estandar"${publicarSelected(data.qualityLevel || "estandar", "estandar")}>Estándar</option>
        <option value="premium"${publicarSelected(data.qualityLevel, "premium")}>Premium</option>
      </select></label>
      <label>Localidad<input name="location" required minlength="2" maxlength="160" value="${portalEscape(data.location || "")}" /></label>
      <label>Superficie (m²)<input name="squareMeters" type="number" min="1" max="1000" required value="${portalEscape(data.squareMeters || "")}" /></label>
      <label>Presupuesto estimado (€)<input name="budgetEuros" type="number" min="1" step="1" value="${portalEscape(budgetEuros)}" /></label>
      <label class="full">Descripción<textarea name="description" required minlength="30" maxlength="5000">${portalEscape(data.description || "")}</textarea></label>
      <div class="form-actions"><button class="button primary">Continuar →</button></div>
    </div>
  </form></section>`;
  bindPublicarServiceSwitch();
  document.querySelector("#publicar-details-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const payload = {
      title: values.title,
      description: values.description,
      category: "reformas_integrales",
      projectType: values.projectType,
      location: values.location,
      squareMeters: Number(values.squareMeters),
      qualityLevel: values.qualityLevel,
      ...(values.budgetEuros ? { budgetCents: Math.round(Number(values.budgetEuros) * 100) } : {}),
    };
    if (!publicarDraftWrite(service, payload)) {
      portalNotify("No se ha podido guardar el borrador en este navegador.", true);
      return;
    }
    history.replaceState({}, "", publicarDraftUrl(service, true));
    void publicarFunnel();
  });
}

async function publicarHomeServiceForm(service, draft) {
  const data = draft?.payload || {};
  const catalog = await portalApi("/api/v1/home-services/catalog");
  const verticalSlug = service === "limpieza" ? "limpieza_mantenimiento" : "jardin_exterior";
  const vertical = (catalog.verticals || []).find((item) => item.slug === verticalSlug);
  const services = vertical?.services || [];
  if (!services.length) {
    portalApp.innerHTML = `<section class="auth-wrap"><div class="card"><h2>Servicio no disponible</h2><p>No se ha podido cargar el catálogo de este servicio.</p></div></section>`;
    return;
  }
  const preferredSlug = services.some((item) => item.slug === data.serviceSlug)
    ? data.serviceSlug
    : PUBLICAR_DEFAULT_HOME_SERVICE[service];
  const selectedService = services.find((item) => item.slug === preferredSlug) || services[0];
  const selectedFrequency = selectedService.recurrence.includes(data.frequency) ? data.frequency : selectedService.recurrence[0];
  const serviceOptions = services.map((item) => `<option value="${portalEscape(item.slug)}" data-recurrence="${portalEscape(item.recurrence.join(","))}"${publicarSelected(item.slug, selectedService.slug)}>${portalEscape(item.label)}</option>`).join("");
  const frequencyOptions = selectedService.recurrence.map((value) => `<option value="${portalEscape(value)}"${publicarSelected(value, selectedFrequency)}>${portalEscape(PUBLICAR_FREQUENCY_LABELS[value] || value)}</option>`).join("");
  portalApp.innerHTML = `<section class="auth-wrap portal-register-wrap"><form class="card" id="publicar-details-form">
    <header><span class="eyebrow">PASO 1 · SERVICIO</span><h2>Cuéntanos qué necesitas</h2><p>Guardaremos estos datos como borrador en este navegador hasta que completes el acceso.</p></header>
    <div class="form-grid">
      ${publicarServiceSelector(service)}
      <label class="full">Tipo de servicio<select name="serviceSlug" id="publicar-home-service" required>${serviceOptions}</select></label>
      <label class="full">Ubicación<input name="location" required minlength="3" maxlength="180" value="${portalEscape(data.location || "")}" /></label>
      <label>Tipo de propiedad<select name="propertyType" required>
        ${["PISO", "CASA", "CHALET", "COMUNIDAD", "LOCAL", "JARDIN", "PARCELA", "OTRO"].map((value) => `<option value="${value}"${publicarSelected(data.propertyType || "PISO", value)}>${value === "JARDIN" ? "Jardín" : value.charAt(0) + value.slice(1).toLowerCase()}</option>`).join("")}
      </select></label>
      <label>Superficie aproximada (m²)<input name="squareMeters" type="number" min="1" max="100000" step="1" value="${portalEscape(data.squareMeters || "")}" /></label>
      <label>Dormitorios<input name="bedrooms" type="number" min="0" max="50" step="1" value="${portalEscape(data.bedrooms ?? "")}" /></label>
      <label>Baños<input name="bathrooms" type="number" min="0" max="50" step="1" value="${portalEscape(data.bathrooms ?? "")}" /></label>
      <label>Horas estimadas<input name="estimatedHours" type="number" min="0.5" max="24" step="0.5" value="${portalEscape(data.estimatedHours || "")}" /></label>
      <label>Frecuencia<select name="frequency" id="publicar-frequency" required>${frequencyOptions}</select></label>
      <label>Fecha de inicio<input name="requestedStartDate" type="date" min="${publicarTodayMadrid()}" required value="${portalEscape(data.requestedStartDate || publicarTodayMadrid())}" /></label>
      <label>Desde<input name="preferredTimeStart" type="time" value="${portalEscape(data.preferredTimeStart || "")}" /></label>
      <label>Hasta<input name="preferredTimeEnd" type="time" value="${portalEscape(data.preferredTimeEnd || "")}" /></label>
      <label class="full">Indicaciones<textarea name="notes" maxlength="4000">${portalEscape(data.notes || "")}</textarea></label>
      <div class="form-actions"><button class="button primary">Continuar →</button></div>
    </div>
  </form></section>`;
  bindPublicarServiceSwitch();
  const serviceSelect = document.querySelector("#publicar-home-service");
  const frequencySelect = document.querySelector("#publicar-frequency");
  serviceSelect?.addEventListener("change", () => {
    const recurrence = (serviceSelect.selectedOptions[0]?.dataset.recurrence || "").split(",").filter(Boolean);
    frequencySelect.innerHTML = recurrence.map((value) => `<option value="${portalEscape(value)}">${portalEscape(PUBLICAR_FREQUENCY_LABELS[value] || value)}</option>`).join("");
  });
  document.querySelector("#publicar-details-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      serviceSlug: values.serviceSlug,
      location: values.location,
      propertyType: values.propertyType,
      requestedStartDate: values.requestedStartDate,
      frequency: values.frequency,
      notes: values.notes || "",
    };
    for (const key of ["squareMeters", "bedrooms", "bathrooms", "estimatedHours"]) {
      if (values[key] !== "") payload[key] = Number(values[key]);
    }
    for (const key of ["preferredTimeStart", "preferredTimeEnd"]) {
      if (values[key]) payload[key] = values[key];
    }
    if (!publicarDraftWrite(service, payload)) {
      portalNotify("No se ha podido guardar el borrador en este navegador.", true);
      return;
    }
    history.replaceState({}, "", publicarDraftUrl(service, true));
    void publicarFunnel();
  });
}

function publicarDraftSummary(draft) {
  if (draft.service === "reformas") {
    return `<p><strong>${portalEscape(draft.payload.title)}</strong><br />${portalEscape(draft.payload.location)} · ${portalEscape(draft.payload.squareMeters)} m²</p>`;
  }
  return `<p><strong>${draft.service === "limpieza" ? "Limpieza" : "Jardinería"}</strong><br />${portalEscape(draft.payload.location)} · ${portalEscape(draft.payload.requestedStartDate)}</p>`;
}

async function publicarCurrentUser() {
  try { return (await portalApi("/api/v1/auth/me")).user || null; } catch { return null; }
}

function publicarSuccess(draft) {
  publicarDraftClear();
  const destination = draft.service === "reformas" ? "/panel" : "/servicios-hogar";
  portalApp.innerHTML = `<section class="auth-wrap"><div class="card portal-success">
    <span class="eyebrow">PUBLICADO</span><h2>${draft.service === "reformas" ? "Proyecto publicado" : "Solicitud publicada"}</h2>
    <p class="lead">Tu solicitud ya está asociada a tu cuenta.</p><a class="button primary" href="${destination}">Continuar →</a>
  </div></section>`;
}

async function publicarSubmitDraft(draft, button) {
  if (button) button.disabled = true;
  try {
    if (draft.service === "reformas") {
      await portalApi("/api/v1/projects", { method: "POST", body: JSON.stringify(draft.payload) });
    } else {
      await portalApi("/api/v1/home-services/requests", { method: "POST", body: JSON.stringify(draft.payload) });
    }
    publicarSuccess(draft);
  } catch (error) {
    portalNotify(error.message, true);
    if (button) button.disabled = false;
  }
}

function bindPublicarLogin(draft) {
  document.querySelector("#publicar-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    const credentials = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await portalApi("/api/v1/auth/login", { method: "POST", body: JSON.stringify(credentials) });
      if (result.user?.role !== "cliente") {
        portalNotify("Debes entrar con una cuenta de cliente para publicar esta solicitud.", true);
        if (button) button.disabled = false;
        return;
      }
      await publicarSubmitDraft(draft, button);
    } catch (error) {
      portalNotify(error.message, true);
      if (button) button.disabled = false;
    }
  });
}

function publicarAccountStep(draft, user = null, emailHint = "", verificationPending = false) {
  if (user && user.role !== "cliente") {
    portalApp.innerHTML = `<section class="auth-wrap"><div class="card"><span class="eyebrow">PASO FINAL</span><h2>Necesitas una cuenta de cliente</h2><p>La sesión actual no corresponde a una cuenta de cliente. El borrador permanece guardado en este navegador.</p></div></section>`;
    return;
  }
  if (user) {
    portalApp.innerHTML = `<section class="auth-wrap"><div class="card">
      <span class="eyebrow">PASO FINAL · TU CUENTA</span><h2>Publica con tu cuenta</h2>${publicarDraftSummary(draft)}
      <p>${portalEscape(user.name)} · ${portalEscape(user.email)}</p>
      <div class="form-actions"><button class="button primary" id="publicar-authenticated-submit">Publicar ahora →</button></div>
    </div></section>`;
    document.querySelector("#publicar-authenticated-submit")?.addEventListener("click", (event) => void publicarSubmitDraft(draft, event.currentTarget));
    return;
  }
  portalApp.innerHTML = `<section class="auth-wrap portal-register-wrap">
    <div class="card">
      <span class="eyebrow">PASO FINAL · CUENTA</span><h2>Guarda y publica tu solicitud</h2>${publicarDraftSummary(draft)}
      ${verificationPending ? '<div class="notice"><strong>Cuenta creada.</strong><br />Verifica tu email y vuelve a esta página. Después inicia sesión aquí para publicar el borrador.</div>' : ""}
    </div>
    <form class="card" id="publicar-register-form">
      <header><h2>Crear cuenta de cliente</h2><p>Los datos de contacto no se guardan en el borrador del navegador.</p></header>
      <div class="form-grid">
        <label class="full">Nombre completo<input name="name" autocomplete="name" required minlength="2" /></label>
        <label>Email<input name="email" type="email" autocomplete="email" required /></label>
        <label>Teléfono<input name="phone" type="tel" autocomplete="tel" /></label>
        <label>Dirección<input name="address" required minlength="5" /></label>
        <label>NIF / NIE<input name="taxId" autocomplete="off" required /></label>
        <label class="full">Contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" required /><small>12 caracteres o más, con mayúscula, minúscula y número.</small></label>
        ${legalCheckboxes()}
        <div class="form-actions"><button class="button primary">Crear cuenta →</button></div>
      </div>
    </form>
    <form class="card" id="publicar-login-form">
      <header><h2>Ya tengo cuenta</h2><p>Si acabas de registrarte, verifica primero tu email.</p></header>
      <div class="form-grid">
        <label class="full">Email<input name="email" type="email" autocomplete="email" required value="${portalEscape(emailHint)}" /></label>
        <label class="full">Contraseña<input name="password" type="password" autocomplete="current-password" required /></label>
        <div class="form-actions"><button class="button primary" type="submit">Entrar y publicar →</button></div>
      </div>
    </form>
  </section>`;
  document.querySelector("#publicar-register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"], button');
    if (button) button.disabled = true;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    payload.role = "cliente";
    payload.privacyAccepted = form.get("privacyAccepted") === "on";
    try {
      await portalApi("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
      publicarAccountStep(draft, null, String(payload.email || ""), true);
    } catch (error) {
      portalNotify(error.message, true);
      if (button) button.disabled = false;
    }
  });
  bindPublicarLogin(draft);
}

async function publicarFunnel() {
  const service = publicarServiceFromLocation();
  const draft = publicarDraftRead(service);
  const accountStep = new URLSearchParams(location.search).get("paso") === "cuenta";
  if (accountStep && draft) {
    const user = await publicarCurrentUser();
    publicarAccountStep(draft, user?.emailVerified === false ? null : user, user?.email || "", user?.emailVerified === false);
    return;
  }
  if (accountStep && !draft) history.replaceState({}, "", publicarDraftUrl(service));
  if (service === "reformas") publicarReformasForm(service, draft);
  else await publicarHomeServiceForm(service, draft);
}

function patchPublicarVerificationResume() {
  if (location.pathname !== "/verificar-email") return;
  const draft = publicarDraftRead();
  if (!draft) return;
  const link = portalApp?.querySelector('a.button.primary[href="/login"]');
  if (!link) return;
  const replacement = link.cloneNode(true);
  replacement.removeAttribute("data-link");
  replacement.href = publicarDraftUrl(draft.service, true);
  replacement.textContent = "Volver a mi solicitud →";
  link.replaceWith(replacement);
}

function portalNotify(message, error = false) {
  if (!portalToast) return;
  portalToast.textContent = message;
  portalToast.className = `toast${error ? " error" : ""}`;
  portalToast.hidden = false;
  clearTimeout(portalNotify.timer);
  portalNotify.timer = setTimeout(() => { portalToast.hidden = true; }, 5000);
}

async function portalApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
  return payload;
}

function portalGo(path) {
  history.pushState({}, "", path);
  void renderPortalRoute();
}

function bindPortalLinks(root = document) {
  root.querySelectorAll("[data-portal-link]").forEach((link) => {
    if (link.dataset.portalBound) return;
    link.dataset.portalBound = "true";
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href?.startsWith("/")) return;
      event.preventDefault();
      portalGo(href);
    });
  });
}

function patchAnonymousNav() {
  if (!portalNav) return;
  if (portalNav.querySelector('a[href="/panel"]') || portalNav.querySelector("#logout") || portalNav.textContent.includes("Salir")) return;
  const alreadyPatched = portalNav.querySelector('a[href="/para-profesionales"]') && portalNav.querySelector('a[href="/registro-cliente"]');
  if (alreadyPatched) { bindPortalLinks(portalNav); return; }
  if (!portalNav.querySelector('a[href="/login"]') && portalNav.children.length) return;
  portalNav.innerHTML = `
    <a href="/login" data-link>Entrar</a>
    <a href="/para-profesionales" data-portal-link>Para profesionales</a>
    <a class="primary" href="/registro-cliente" data-portal-link>Crear cuenta</a>`;
  bindPortalLinks(portalNav);
}

function patchPublicLanding() {
  if (location.pathname !== "/") return;
  const primary = portalApp?.querySelector('.actions a[href="/registro"]');
  if (primary) {
    primary.setAttribute("href", "/registro-cliente");
    primary.removeAttribute("data-link");
    primary.setAttribute("data-portal-link", "");
    primary.textContent = "Publicar proyecto →";
  }
  const actions = portalApp?.querySelector(".actions");
  if (actions && !actions.querySelector('[data-professional-landing-link]')) {
    const link = document.createElement("a");
    link.className = "button professional-entry-button";
    link.href = "/para-profesionales";
    link.dataset.portalLink = "";
    link.dataset.professionalLandingLink = "";
    link.textContent = "Soy profesional";
    actions.append(link);
  }
  bindPortalLinks(portalApp || document);
}

function legalCheckboxes() {
  return `
    <label class="checkbox"><input type="checkbox" name="privacyAccepted" required /><span>Acepto la <a href="/privacidad">Política de Privacidad</a> y el tratamiento necesario para prestar el servicio.</span></label>`;
}

function registrationSuccess(role) {
  const professional = role === "profesional";
  portalApp.innerHTML = `<section class="auth-wrap portal-register-wrap"><div class="card portal-success">
    <span class="eyebrow">REVISA TU EMAIL</span>
    <h2>${professional ? "Solicitud profesional creada" : "Cuenta creada correctamente"}</h2>
    <p class="lead">Te hemos enviado un enlace de verificación. ${professional ? "Después podrás continuar con la revisión de tu perfil profesional." : "Después podrás entrar y publicar tu primer proyecto."}</p>
    <a class="button primary" href="/login" data-link>Ir al acceso →</a>
  </div></section>`;
}

function registrationChooser() {
  portalApp.innerHTML = `<section class="portal-shell">
    <header class="portal-heading">
      <span class="eyebrow">ELIGE CÓMO QUIERES USAR MICONSTRUCTOR</span>
      <h1>Dos áreas. Dos experiencias distintas.</h1>
      <p class="lead">Los clientes publican y gestionan proyectos. Los profesionales y empresas acceden a oportunidades, acreditan su especialidad y presentan propuestas.</p>
    </header>
    <div class="portal-choice-grid">
      <article class="card portal-choice-card client-choice">
        <span class="portal-badge">CLIENTES</span>
        <h2>Quiero hacer una obra</h2>
        <p>Publica tu proyecto, recibe propuestas comparables y gestiona contratos, hitos y evidencias.</p>
        <ul><li>Publicación de proyectos</li><li>Profesionales verificados</li><li>Presupuestos y seguimiento</li></ul>
        <a class="button primary" href="/registro-cliente" data-portal-link>Crear cuenta de cliente →</a>
      </article>
      <article class="card portal-choice-card professional-choice">
        <span class="portal-badge">PROFESIONALES Y EMPRESAS</span>
        <h2>Quiero conseguir proyectos</h2>
        <p>Crea tu perfil profesional, supera la evaluación de tu oficio y accede a proyectos compatibles.</p>
        <ul><li>Perfil y portfolio profesional</li><li>Test técnico por especialidad</li><li>Oportunidades y propuestas</li></ul>
        <a class="button" href="/para-profesionales" data-portal-link>Ir a Para profesionales →</a>
      </article>
    </div>
  </section>`;
  bindPortalLinks(portalApp);
}

function clientRegistration() {
  portalApp.innerHTML = `<section class="auth-wrap portal-register-wrap"><form class="card" id="register-form" data-registration-portal="cliente">
    <header>
      <span class="eyebrow">ÁREA DE CLIENTES</span>
      <h2>Crea tu cuenta</h2>
      <p>Crea una cuenta de cliente para publicar proyectos, comparar propuestas y gestionar tu obra con trazabilidad.</p>
    </header>
    <input type="hidden" name="role" value="cliente" />
    <div class="form-grid">
      <label class="full">Nombre completo<input name="name" autocomplete="name" required minlength="2" /></label>
      <label>Email<input name="email" type="email" autocomplete="email" required /></label>
      <label>NIF / NIE<input name="taxId" autocomplete="off" required /></label>
      <label class="full">Contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" required /><small>12 caracteres o más, con mayúscula, minúscula y número.</small></label>
      ${legalCheckboxes()}
      <div class="form-actions portal-form-actions"><a class="button" href="/registro" data-portal-link>Volver</a><button class="button primary">Crear cuenta →</button></div>
    </div>
  </form></section>`;
  bindPortalLinks(portalApp);
  document.querySelector("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    payload.role = "cliente";
    payload.privacyAccepted = form.get("privacyAccepted") === "on";
    delete payload.termsAccepted;
    try {
      await portalApi("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
      registrationSuccess("cliente");
    } catch (error) { portalNotify(error.message, true); }
  });
}

function professionalLanding() {
  portalApp.innerHTML = `<section class="portal-shell professional-portal">
    <div class="professional-portal-hero">
      <div>
        <span class="eyebrow">PARA PROFESIONALES</span>
        <h1>Más proyectos. Menos tiempo buscando clientes.</h1>
        <p class="lead">MiConstructor conecta profesionales y empresas verificadas con clientes que ya tienen una necesidad concreta de obra o reforma.</p>
        <div class="actions"><a class="button primary" href="/registro-profesional" data-portal-link>Crear cuenta profesional →</a><a class="button" href="/login" data-link>Ya tengo cuenta</a></div>
      </div>
      <div class="card professional-value-card">
        <span class="portal-badge">TU PERFIL PROFESIONAL</span>
        <h2>Demuestra lo que sabes hacer</h2>
        <p>La verificación combina identidad, documentación, portfolio y una evaluación técnica específica de tu especialidad.</p>
        <div class="professional-steps"><span><strong>1</strong> Crea tu cuenta</span><span><strong>2</strong> Elige tu oficio</span><span><strong>3</strong> Supera el test técnico</span><span><strong>4</strong> Completa la verificación</span></div>
      </div>
    </div>
    <div class="professional-benefits">
      <article><strong>Proyectos compatibles</strong><span>Accede a oportunidades relacionadas con tu especialidad.</span></article>
      <article><strong>Perfil verificado</strong><span>Genera confianza con documentación, seguro y trabajos realizados.</span></article>
      <article><strong>Gestión centralizada</strong><span>Propuestas, hitos, evidencias y facturación dentro de la plataforma.</span></article>
    </div>
  </section>`;
  bindPortalLinks(portalApp);
}

function assessmentHtml(assessment) {
  if (!assessment) return "";
  return `<section class="assessment"><div class="notice"><strong>Evaluación técnica obligatoria</strong><br />Debes responder las ${assessment.questionCount} preguntas y obtener al menos ${assessment.passScore}%.</div>${assessment.questions.map((question, index) => `<fieldset class="question"><legend><strong>${index + 1}. ${portalEscape(question.prompt)}</strong></legend>${question.options.map((option) => `<label><input type="radio" name="assessment_${portalEscape(question.id)}" value="${portalEscape(option.id)}" required /> <span>${portalEscape(option.label)}</span></label>`).join("")}</fieldset>`).join("")}</section>`;
}

async function professionalRegistration() {
  const specialties = await portalApi("/api/v1/assessments").catch(() => ({ specialties: [] }));
  let assessment = null;
  portalApp.innerHTML = `<section class="auth-wrap portal-register-wrap professional-register-wrap"><form class="card" id="register-form" data-registration-portal="profesional">
    <header>
      <span class="eyebrow">ALTA PROFESIONAL</span>
      <h2>Crea tu cuenta profesional</h2>
      <p>Registra tu empresa o actividad profesional y completa el test técnico correspondiente a tu especialidad.</p>
    </header>
    <input type="hidden" name="role" value="profesional" />
    <div class="form-grid">
      <label>Nombre y apellidos<input name="name" autocomplete="name" required minlength="2" /></label>
      <label>Empresa / razón social<input name="companyName" autocomplete="organization" required /></label>
      <label>Email profesional<input name="email" type="email" autocomplete="email" required /></label>
      <label>Teléfono<input name="phone" type="tel" autocomplete="tel" required /></label>
      <label>NIF / NIE / CIF<input name="taxId" autocomplete="off" required /></label>
      <label>Especialidad<select name="specialty" id="professional-specialty" required><option value="">Selecciona un oficio</option>${specialties.specialties.map((item) => `<option value="${portalEscape(item.slug)}">${portalEscape(item.label)}</option>`).join("")}</select></label>
      <label class="full">Contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" required /><small>12 caracteres o más, con mayúscula, minúscula y número.</small></label>
      <div id="professional-assessment-slot" class="full"></div>
      ${legalCheckboxes()}
      <div class="form-actions portal-form-actions"><a class="button" href="/para-profesionales" data-portal-link>Volver</a><button class="button primary">Enviar alta profesional →</button></div>
    </div>
  </form></section>`;
  bindPortalLinks(portalApp);
  const specialty = document.querySelector("#professional-specialty");
  specialty?.addEventListener("change", async (event) => {
    const slug = event.target.value;
    const slot = document.querySelector("#professional-assessment-slot");
    assessment = null;
    if (!slug) { slot.innerHTML = ""; return; }
    slot.innerHTML = '<div class="loading portal-inline-loading">Cargando evaluación técnica…</div>';
    try {
      assessment = (await portalApi(`/api/v1/assessments/${encodeURIComponent(slug)}`)).assessment;
      slot.innerHTML = assessmentHtml(assessment);
    } catch (error) {
      slot.innerHTML = "";
      portalNotify(error.message, true);
    }
  });
  document.querySelector("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!assessment) { portalNotify("Selecciona una especialidad y completa su evaluación técnica.", true); return; }
    const payload = Object.fromEntries(form);
    payload.role = "profesional";
    payload.privacyAccepted = form.get("privacyAccepted") === "on";
    payload.assessment = { version: assessment.version, respuestas: {} };
    assessment.questions.forEach((question) => { payload.assessment.respuestas[question.id] = form.get(`assessment_${question.id}`); });
    Object.keys(payload).filter((key) => key.startsWith("assessment_")).forEach((key) => delete payload[key]);
    delete payload.termsAccepted;
    try {
      await portalApi("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
      registrationSuccess("profesional");
    } catch (error) { portalNotify(error.message, true); }
  });
}

async function renderPortalRoute() {
  const path = location.pathname;
  patchAnonymousNav();
  if (!PORTAL_PATHS.has(path)) { patchPublicLanding(); return false; }
  if (path === "/registro") registrationChooser();
  if (path === "/registro-cliente") clientRegistration();
  if (path === "/para-profesionales") professionalLanding();
  if (path === "/registro-profesional") await professionalRegistration();
  if (path === "/publicar") await publicarFunnel();
  patchAnonymousNav();
  portalApp?.focus();
  return true;
}

const navObserver = new MutationObserver(() => patchAnonymousNav());
if (portalNav) navObserver.observe(portalNav, { childList: true });

const appObserver = new MutationObserver(() => {
  patchAnonymousNav();
  patchPublicarVerificationResume();
  if (!PORTAL_PATHS.has(location.pathname)) patchPublicLanding();
});
if (portalApp) appObserver.observe(portalApp, { childList: true, subtree: false });

window.addEventListener("popstate", () => { window.setTimeout(() => void renderPortalRoute(), 0); });
window.setTimeout(() => void renderPortalRoute(), 0);
