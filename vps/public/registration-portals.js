const portalApp = document.querySelector("#app");
const portalNav = document.querySelector("#main-nav");
const portalToast = document.querySelector("#toast");
const PORTAL_PATHS = new Set(["/registro", "/registro-cliente", "/para-profesionales", "/registro-profesional"]);

const portalEscape = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
})[character]);

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
  patchAnonymousNav();
  portalApp?.focus();
  return true;
}

const navObserver = new MutationObserver(() => patchAnonymousNav());
if (portalNav) navObserver.observe(portalNav, { childList: true });

const appObserver = new MutationObserver(() => {
  patchAnonymousNav();
  if (!PORTAL_PATHS.has(location.pathname)) patchPublicLanding();
});
if (portalApp) appObserver.observe(portalApp, { childList: true, subtree: false });

window.addEventListener("popstate", () => { window.setTimeout(() => void renderPortalRoute(), 0); });
window.setTimeout(() => void renderPortalRoute(), 0);
