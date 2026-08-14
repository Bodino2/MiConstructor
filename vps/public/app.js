const state = { user: null, assessment: null, projects: [], billing: null, tab: "overview" };
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const money = (cents) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);
const date = (value) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value)) : "—";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function notify(message, error = false) {
  toast.textContent = message;
  toast.className = `toast${error ? " error" : ""}`;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
  return payload;
}

function go(path) {
  history.pushState({}, "", path);
  void route();
}

function bindLinks() {
  document.querySelectorAll("[data-link]").forEach((link) => link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (href?.startsWith("/")) { event.preventDefault(); go(href); }
  }));
}

function updateNav() {
  const syncHeader = (shell) => shell.setUser(state.user);
  if (window.MiConstructorShell) syncHeader(window.MiConstructorShell);
  else window.addEventListener(
    "miconstructor:shell-ready",
    (event) => syncHeader(event.detail),
    { once: true },
  );
}

function landing() {
  app.innerHTML = `<section class="shell hero">
    <div>
      <span class="eyebrow">REFORMAS CON CONTROL Y TRAZABILIDAD</span>
      <h1>Construye con claridad, desde el primer presupuesto.</h1>
      <p class="lead">Publica tu proyecto, compara profesionales verificados y conserva contratos, hitos y evidencias en un único espacio seguro.</p>
      <div class="actions"><a class="button primary" href="/registro" data-link>Publicar proyecto →</a><a class="button" href="/login" data-link>Ya tengo cuenta</a></div>
      <div class="trust-row"><div><strong>Profesionales verificados</strong><span>Test técnico por oficio y revisión documental</span></div><div><strong>Presupuestos comparables</strong><span>Partidas, materiales, plazo e impuestos</span></div><div><strong>Datos protegidos</strong><span>Sesiones seguras y archivos privados</span></div></div>
    </div>
    <div class="hero-art"><img src="/miconstructor-platform.webp" alt="Vivienda contemporánea representando los proyectos gestionados con MiConstructor" /></div>
  </section>`;
  bindLinks();
}

function login() {
  app.innerHTML = `<section class="auth-wrap"><form class="card" id="login-form">
    <header><span class="eyebrow">ACCESO SEGURO</span><h2>Entrar en MiConstructor</h2><p>Gestiona proyectos, propuestas y verificaciones desde tu cuenta.</p></header>
    <div class="form-grid"><label class="full">Email<input name="email" type="email" autocomplete="email" required /></label><label class="full">Contraseña<input name="password" type="password" autocomplete="current-password" required /></label><div class="form-actions"><a class="button" href="/restablecer" data-link>He olvidado mi contraseña</a><button class="button primary">Entrar →</button></div></div>
  </form></section>`;
  bindLinks();
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      state.user = result.user;
      notify("Sesión iniciada.");
      go("/panel");
    } catch (error) { notify(error.message, true); }
  });
}

function assessmentHtml(assessment) {
  if (!assessment) return "";
  return `<section class="assessment"><div class="notice"><strong>Evaluación técnica obligatoria</strong><br />Debes responder las ${assessment.questionCount} preguntas y obtener al menos ${assessment.passScore}%.</div>${assessment.questions.map((question, index) => `<fieldset class="question"><legend><strong>${index + 1}. ${escapeHtml(question.prompt)}</strong></legend>${question.options.map((option) => `<label><input type="radio" name="assessment_${escapeHtml(question.id)}" value="${escapeHtml(option.id)}" required /> <span>${escapeHtml(option.label)}</span></label>`).join("")}</fieldset>`).join("")}</section>`;
}

async function loadAssessment(slug) {
  if (!slug) { state.assessment = null; document.querySelector("#assessment-slot").innerHTML = ""; return; }
  try {
    const result = await api(`/api/v1/assessments/${encodeURIComponent(slug)}`);
    state.assessment = result.assessment;
    document.querySelector("#assessment-slot").innerHTML = assessmentHtml(result.assessment);
  } catch (error) { notify(error.message, true); }
}

async function register() {
  const specialties = await api("/api/v1/assessments").catch(() => ({ specialties: [] }));
  app.innerHTML = `<section class="auth-wrap"><form class="card" id="register-form">
    <header><span class="eyebrow">ALTA DE USUARIO</span><h2>Crea tu cuenta</h2><p>Los profesionales completan una evaluación técnica específica antes de enviar su solicitud de verificación.</p></header>
    <div class="form-grid">
      <label>Tipo de cuenta<select name="role" id="role"><option value="cliente">Cliente</option><option value="profesional">Profesional / empresa</option></select></label>
      <label>Nombre completo<input name="name" autocomplete="name" required minlength="2" /></label>
      <label>Email<input name="email" type="email" autocomplete="email" required /></label>
      <label>NIF / NIE / CIF<input name="taxId" autocomplete="off" required /></label>
      <label class="full">Contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" required /><small>12 caracteres o más, con mayúscula, minúscula y número.</small></label>
      <div id="professional-fields" class="form-grid full" hidden>
        <label>Empresa / razón social<input name="companyName" /></label><label>Teléfono<input name="phone" type="tel" /></label>
        <label class="full">Especialidad<select name="specialty" id="specialty"><option value="">Selecciona un oficio</option>${specialties.specialties.map((item) => `<option value="${escapeHtml(item.slug)}">${escapeHtml(item.label)}</option>`).join("")}</select></label>
        <div id="assessment-slot" class="full"></div>
      </div>
      <label class="checkbox"><input type="checkbox" name="privacyAccepted" required /><span>Acepto la política de privacidad y el tratamiento de datos necesario para prestar el servicio.</span></label>
      <div class="form-actions"><a class="button" href="/login" data-link>Ya tengo cuenta</a><button class="button primary">Crear cuenta →</button></div>
    </div>
  </form></section>`;
  bindLinks();
  const role = document.querySelector("#role");
  const professionalFields = document.querySelector("#professional-fields");
  const updateRole = () => {
    const professional = role.value === "profesional";
    professionalFields.hidden = !professional;
    professionalFields.querySelectorAll("input, select").forEach((field) => {
      if (["companyName", "phone", "specialty"].includes(field.name)) field.required = professional;
    });
  };
  role.addEventListener("change", updateRole); updateRole();
  document.querySelector("#specialty").addEventListener("change", (event) => void loadAssessment(event.target.value));
  document.querySelector("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    payload.privacyAccepted = form.get("privacyAccepted") === "on";
    if (payload.role === "profesional") {
      payload.assessment = { version: state.assessment?.version, respuestas: {} };
      state.assessment?.questions.forEach((question) => { payload.assessment.respuestas[question.id] = form.get(`assessment_${question.id}`); });
    } else {
      delete payload.companyName; delete payload.phone; delete payload.specialty;
    }
    Object.keys(payload).filter((key) => key.startsWith("assessment_")).forEach((key) => delete payload[key]);
    try {
      await api("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
      app.innerHTML = `<section class="auth-wrap"><div class="card"><span class="eyebrow">REVISA TU EMAIL</span><h2>Cuenta creada correctamente</h2><p class="lead">Te hemos enviado un enlace de verificación. Después podrás entrar y completar tu perfil.</p><a class="button primary" href="/login" data-link>Ir al acceso →</a></div></section>`;
      bindLinks();
    } catch (error) { notify(error.message, true); }
  });
}

async function verifyEmail() {
  const token = new URLSearchParams(location.search).get("token");
  if (!token) { app.innerHTML = `<section class="auth-wrap"><div class="card"><h2>Enlace incompleto</h2><p>Falta el token de verificación.</p></div></section>`; return; }
  try {
    await api("/api/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    app.innerHTML = `<section class="auth-wrap"><div class="card"><span class="eyebrow">EMAIL VERIFICADO</span><h2>Tu cuenta ya está activa</h2><a class="button primary" href="/login" data-link>Entrar →</a></div></section>`;
    bindLinks();
  } catch (error) { app.innerHTML = `<section class="auth-wrap"><div class="card"><h2>No se ha podido verificar</h2><p>${escapeHtml(error.message)}</p></div></section>`; }
}

function resetPassword() {
  const token = new URLSearchParams(location.search).get("token");
  app.innerHTML = `<section class="auth-wrap"><form class="card" id="reset-form"><header><h2>${token ? "Define una contraseña nueva" : "Recupera tu acceso"}</h2></header><div class="form-grid">${token ? `<label class="full">Nueva contraseña<input name="password" type="password" minlength="12" required /></label>` : `<label class="full">Email<input name="email" type="email" required /></label>`}<div class="form-actions"><button class="button primary">Continuar →</button></div></div></form></section>`;
  document.querySelector("#reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(token ? "/api/v1/auth/reset-password" : "/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify(token ? { token, password: data.password } : data) });
      notify(token ? "Contraseña actualizada." : "Si la cuenta existe, recibirás un email.");
      if (token) go("/login");
    } catch (error) { notify(error.message, true); }
  });
}

function sidebar(extra = "") {
  const statusClass = state.user.verificationStatus === "APROBADO" || state.user.verificationStatus === "NO_APLICA" ? "status" : state.user.verificationStatus === "SUSPENDIDO" ? "status danger" : "status warn";
  return `<aside class="card sidebar"><span class="eyebrow">${escapeHtml(state.user.role)}</span><h3>${escapeHtml(state.user.name)}</h3><p class="muted">${escapeHtml(state.user.email)}</p><span class="${statusClass}">${escapeHtml(state.user.verificationStatus)}</span>${extra}</aside>`;
}

async function clientPanel() {
  const result = await api("/api/v1/projects");
  state.projects = result.projects;
  app.innerHTML = `<section class="dashboard"><div class="dashboard-head"><div><span class="eyebrow">ÁREA DE CLIENTE</span><h2>Tus proyectos</h2></div><button class="button primary" id="new-project">Nuevo proyecto +</button></div><div class="dashboard-grid">${sidebar()}<section><div id="client-content" class="list">${projectListHtml(state.projects, true)}</div></section></div></section>`;
  document.querySelector("#new-project").addEventListener("click", renderProjectForm);
  bindProjectOpeners();
}

function projectListHtml(projects, owner = false) {
  if (!projects.length) return `<div class="empty"><strong>No hay proyectos todavía.</strong><p>${owner ? "Publica el primero para recibir propuestas." : "No hay proyectos compatibles en este momento."}</p></div>`;
  return projects.map((project) => `<article class="list-item"><div class="list-item-head"><div><span class="eyebrow">${escapeHtml(project.category)}</span><h3>${escapeHtml(project.title)}</h3></div><span class="status">${escapeHtml(project.status)}</span></div><p>${escapeHtml(project.description)}</p><footer><span>${escapeHtml(project.location)} · ${date(project.created_at)}</span><span class="amount">${money(project.budget_cents)}</span>${owner ? `<button class="button" data-project="${project.id}">Ver propuestas</button>` : `<button class="button primary" data-apply="${project.id}">Enviar propuesta</button>`}</footer></article>`).join("");
}

function renderProjectForm() {
  document.querySelector("#client-content").innerHTML = `<form class="card" id="project-form"><header><h2>Describe tu proyecto</h2><p>La estimación es orientativa; las ofertas exactas requieren revisión profesional.</p></header><div class="form-grid">
    <label class="full">Título<input name="title" required minlength="5" /></label><label>Tipo de obra<select name="projectType"><option value="bano">Reforma de baño</option><option value="cocina">Reforma de cocina</option><option value="reforma_integral">Reforma integral</option><option value="construccion_casa">Construcción de casa</option></select></label>
    <label>Especialidad principal<select name="category"><option value="reformas_integrales">Reformas integrales</option><option value="albanileria">Albañilería</option><option value="electricidad">Electricidad</option><option value="fontaneria">Fontanería</option><option value="climatizacion">Climatización</option><option value="pintura">Pintura</option></select></label>
    <label>Localidad<input name="location" required /></label><label>Superficie (m²)<input name="squareMeters" type="number" min="1" max="1000" required /></label><label>Calidades<select name="qualityLevel"><option value="basico">Básico</option><option value="estandar" selected>Estándar</option><option value="premium">Premium</option></select></label><label>Presupuesto estimado (€)<input name="budgetEuros" type="number" min="1" /></label>
    <label class="full">Descripción<textarea name="description" required minlength="30"></textarea></label><div id="estimate-result" class="full"></div><div class="form-actions"><button type="button" class="button" id="estimate">Calcular orientación</button><button class="button primary">Publicar proyecto →</button></div>
  </div></form>`;
  const form = document.querySelector("#project-form");
  document.querySelector("#estimate").addEventListener("click", async () => {
    const data = Object.fromEntries(new FormData(form));
    try {
      const estimate = await api("/api/v1/estimate", { method: "POST", body: JSON.stringify({ projectType: data.projectType, squareMeters: Number(data.squareMeters), qualityLevel: data.qualityLevel }) });
      document.querySelector("#estimate-result").innerHTML = `<div class="notice"><strong>Orientación de mercado: ${money(estimate.range.minimum * 100)} – ${money(estimate.range.maximum * 100)}</strong><br />Mano de obra, materiales y residuos/permisos incluidos de forma orientativa.</div>`;
      if (!form.elements.budgetEuros.value) form.elements.budgetEuros.value = Math.round((estimate.range.minimum + estimate.range.maximum) / 2);
    } catch (error) { notify(error.message, true); }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(form));
    const payload = { ...data, squareMeters: Number(data.squareMeters), budgetCents: data.budgetEuros ? Math.round(Number(data.budgetEuros) * 100) : undefined };
    delete payload.budgetEuros;
    try { await api("/api/v1/projects", { method: "POST", body: JSON.stringify(payload) }); notify("Proyecto publicado."); await clientPanel(); } catch (error) { notify(error.message, true); }
  });
}

function bindProjectOpeners() {
  document.querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => void showClientProject(button.dataset.project)));
}

async function showClientProject(id) {
  try {
    const result = await api(`/api/v1/projects/${id}`);
    const project = result.project;
    document.querySelector("#client-content").innerHTML = `<button class="button" id="back-projects">← Proyectos</button><div class="card"><span class="eyebrow">${escapeHtml(project.category)}</span><h2>${escapeHtml(project.title)}</h2><p>${escapeHtml(project.description)}</p><div class="metric"><span>Presupuesto estimado</span><strong>${money(project.budget_cents)}</strong></div></div><div class="card"><h3>Propuestas recibidas</h3><div class="list">${project.proposals?.length ? project.proposals.map((proposal) => `<article class="list-item"><div class="list-item-head"><div><strong>${escapeHtml(proposal.company_name || proposal.name)}</strong><p>★ ${escapeHtml(proposal.rating)} · ${escapeHtml(proposal.review_count)} reseñas · ${proposal.insured ? "Asegurado" : "RC no verificada"}</p></div><span class="amount">${money(proposal.amount_cents)}</span></div><p>${escapeHtml(proposal.message)}</p><footer><span>${proposal.estimated_days} días estimados</span><div class="actions"><button class="button" data-profile="${proposal.professional_id}">Ver reseñas y trabajos</button><button class="button primary" data-shortlist="${proposal.professional_id}">Seleccionar y desbloquear contacto</button></div></footer></article>`).join("") : `<div class="empty">Todavía no hay propuestas.</div>`}</div></div>`;
    document.querySelector("#back-projects").addEventListener("click", () => void clientPanel());
    document.querySelectorAll("[data-shortlist]").forEach((button) => button.addEventListener("click", async () => {
      try {
        const selected = await api(`/api/v1/projects/${id}/shortlist`, { method: "POST", body: JSON.stringify({ professionalId: button.dataset.shortlist }) });
        notify(`Contacto desbloqueado: ${selected.contact.email}${selected.contact.phone ? ` · ${selected.contact.phone}` : ""}`);
      } catch (error) { notify(error.message, true); }
    }));
    document.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => void showProfessionalProfile(id, button.dataset.profile)));
  } catch (error) { notify(error.message, true); }
}

async function showProfessionalProfile(projectId, professionalId) {
  try {
    const data = await api(`/api/v1/professionals/${professionalId}/profile`);
    const pro = data.professional;
    document.querySelector("#client-content").innerHTML = `<button class="button" id="back-detail">← Volver a propuestas</button><div class="card"><span class="eyebrow">PROFESIONAL VERIFICADO</span><h2>${escapeHtml(pro.company_name || pro.name)}</h2><p>${pro.insured ? "◇ Seguro de responsabilidad civil verificado" : "Seguro RC no verificado"}</p>${data.qualifications.map((item) => `<span class="status">${escapeHtml(item.specialty_label)} · ${item.score}%</span>`).join(" ")}</div><div class="card"><h3>Trabajos antes y después</h3><div class="list">${data.portfolio.length ? data.portfolio.map((work) => `<article class="list-item"><h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(work.description)}</p><div class="actions">${work.images.map((image) => `<a href="/api/v1/files/${image.fileId}" target="_blank" rel="noopener" class="button">${escapeHtml(image.phase)}</a>`).join("")}</div></article>`).join("") : `<div class="empty">No ha publicado trabajos todavía.</div>`}</div></div><div class="card"><h3>Reseñas verificadas</h3><div class="list">${data.reviews.length ? data.reviews.map((review) => `<article class="list-item"><strong>${"★".repeat(review.rating)} · ${escapeHtml(review.author_name)}</strong><p>${escapeHtml(review.comment)}</p><small>${date(review.published_at)}</small></article>`).join("") : `<div class="empty">Todavía no tiene reseñas verificadas.</div>`}</div></div>`;
    document.querySelector("#back-detail").addEventListener("click", () => void showClientProject(projectId));
  } catch (error) { notify(error.message, true); }
}

async function professionalPanel() {
  const [projects, billing] = await Promise.all([api("/api/v1/projects"), api("/api/v1/billing/me")]);
  state.projects = projects.projects; state.billing = billing;
  const account = billing.account;
  const billingClass = account?.status === "ACTIVO" ? "status" : account?.status === "SUSPENDIDO_IMPAGO" ? "status danger" : "status warn";
  app.innerHTML = `<section class="dashboard"><div class="dashboard-head"><div><span class="eyebrow">ÁREA PROFESIONAL</span><h2>Oportunidades y actividad</h2></div><span class="${billingClass}">${escapeHtml(account?.status || "PENDIENTE_MANDATO")}</span></div><div class="dashboard-grid">${sidebar(`<div class="metric"><span>Saldo vencido</span><strong>${money(account?.overdue_balance_cents)}</strong></div>`)}<section><div class="tabs"><button class="active" data-tab="projects">Proyectos</button><button data-tab="billing">Facturación</button><button data-tab="portfolio">Portfolio y RC</button></div><div id="professional-content">${projectListHtml(state.projects)}</div></section></div></section>`;
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
    if (button.dataset.tab === "projects") { document.querySelector("#professional-content").innerHTML = projectListHtml(state.projects); bindProposalButtons(); }
    if (button.dataset.tab === "billing") renderBilling();
    if (button.dataset.tab === "portfolio") renderProfessionalUploads();
  }));
  bindProposalButtons();
}

function bindProposalButtons() {
  document.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", () => {
    const project = state.projects.find((item) => item.id === button.dataset.apply);
    document.querySelector("#professional-content").innerHTML = `<form class="card" id="proposal-form"><header><h2>Propuesta para ${escapeHtml(project.title)}</h2></header><div class="form-grid"><label>Importe total (€)<input name="amountEuros" type="number" min="1" required /></label><label>Plazo estimado (días)<input name="estimatedDays" type="number" min="1" required /></label><label class="full">Alcance, materiales, exclusiones y garantías<textarea name="message" minlength="30" required></textarea></label><div class="form-actions"><button class="button primary">Enviar propuesta →</button></div></div></form>`;
    document.querySelector("#proposal-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
      try { await api("/api/v1/proposals", { method: "POST", body: JSON.stringify({ projectId: project.id, amountCents: Math.round(Number(data.amountEuros) * 100), estimatedDays: Number(data.estimatedDays), message: data.message }) }); notify("Propuesta enviada."); await professionalPanel(); } catch (error) { notify(error.message, true); }
    });
  }));
}

function renderBilling() {
  const { account, invoices, pendingItems } = state.billing;
  document.querySelector("#professional-content").innerHTML = `<div class="card"><h3>Domiciliación semanal</h3><p>Las selecciones se agrupan en una factura semanal. Un impago suspende la cuenta hasta liquidar el saldo.</p>${account?.status === "PENDIENTE_MANDATO" ? `<form id="sepa-form" class="form-grid"><label>Titular de la cuenta<input name="name" value="${escapeHtml(state.user.name)}" required /></label><label>IBAN<input name="iban" autocomplete="off" placeholder="ES00 0000 0000 0000 0000 0000" required /></label><div class="form-actions"><button class="button primary">Activar domiciliación SEPA →</button></div></form>` : `<span class="status">${escapeHtml(account?.status)}</span>`}</div><div class="card"><h3>Conceptos pendientes</h3><div class="list">${pendingItems.length ? pendingItems.map((item) => `<div class="metric"><span>${escapeHtml(item.description)} · ${date(item.service_date)}</span><strong>${money(item.amount_cents)}</strong></div>`).join("") : `<div class="empty">No hay conceptos pendientes.</div>`}</div></div><div class="card"><h3>Facturas</h3>${invoices.length ? invoices.map((invoice) => `<div class="metric"><span>${date(invoice.period_start)} – ${date(invoice.period_end)} · ${escapeHtml(invoice.status)}</span><strong>${money(invoice.total_cents)} ${invoice.status === "FALLIDA" ? `<button class="button" data-retry-invoice="${invoice.id}">Pagar saldo</button>` : ""}</strong></div>`).join("") : `<div class="empty">Todavía no hay facturas.</div>`}</div>`;
  document.querySelector("#sepa-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const config = await api("/api/v1/config");
      if (!config.stripePublishableKey) throw new Error("La domiciliación todavía no está configurada.");
      if (!window.Stripe) await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "https://js.stripe.com/v3/"; script.onload = resolve; script.onerror = reject; document.head.append(script); });
      const setup = await api("/api/v1/billing/setup-intent", { method: "POST", body: "{}" });
      const form = new FormData(event.currentTarget);
      const stripe = window.Stripe(config.stripePublishableKey);
      const result = await stripe.confirmSepaDebitSetup(setup.clientSecret, { payment_method: { sepa_debit: { iban: form.get("iban") }, billing_details: { name: form.get("name"), email: state.user.email } } });
      if (result.error) throw new Error(result.error.message);
      notify("Mandato enviado. La activación se confirmará automáticamente.");
      await professionalPanel();
    } catch (error) { notify(error.message, true); }
  });
  document.querySelectorAll("[data-retry-invoice]").forEach((button) => button.addEventListener("click", async () => {
    try { await api(`/api/v1/billing/invoices/${button.dataset.retryInvoice}/retry`, { method: "POST", body: "{}" }); notify("Cobro reenviado. La cuenta se reactivará tras confirmación bancaria."); await professionalPanel(); } catch (error) { notify(error.message, true); }
  }));
}

function renderProfessionalUploads() {
  document.querySelector("#professional-content").innerHTML = `<form class="card" id="portfolio-form" enctype="multipart/form-data"><header><h3>Publicar un antes y después</h3><p>Las imágenes pasan por moderación antes de mostrarse al cliente.</p></header><div class="form-grid"><label>Título<input name="title" required /></label><label>Especialidad<input name="category" required /></label><label>Localidad<input name="location" required /></label><label>Año<input name="completionYear" type="number" min="1950" max="${new Date().getFullYear()}" /></label><label>Foto antes<input name="before" type="file" accept="image/jpeg,image/png,image/webp" required /></label><label>Foto después<input name="after" type="file" accept="image/jpeg,image/png,image/webp" required /></label><label class="full">Descripción<textarea name="description" minlength="20" required></textarea></label><input type="hidden" name="publicationConsent" value="true" /><div class="form-actions"><button class="button primary">Enviar portfolio →</button></div></div></form><form class="card" id="insurance-form" enctype="multipart/form-data"><header><h3>Seguro de responsabilidad civil</h3></header><div class="form-grid"><label>Aseguradora<input name="insurer" required /></label><label>Últimos 4 caracteres de póliza<input name="policyNumberLast4" minlength="4" maxlength="4" required /></label><label>Cobertura (€)<input name="coverageEuros" type="number" min="1" required /></label><label>Válida desde<input name="validFrom" type="date" required /></label><label>Válida hasta<input name="validUntil" type="date" required /></label><label>Póliza PDF<input name="policy" type="file" accept="application/pdf" required /></label><div class="form-actions"><button class="button primary">Enviar póliza →</button></div></div></form>`;
  document.querySelector("#portfolio-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await api("/api/v1/professionals/portfolio", { method: "POST", body: new FormData(event.currentTarget) }); notify("Portfolio enviado a moderación."); event.currentTarget.reset(); } catch (error) { notify(error.message, true); } });
  document.querySelector("#insurance-form").addEventListener("submit", async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); data.set("coverageCents", String(Math.round(Number(data.get("coverageEuros")) * 100))); data.delete("coverageEuros"); try { await api("/api/v1/professionals/insurance", { method: "POST", body: data }); notify("Póliza enviada a revisión."); event.currentTarget.reset(); } catch (error) { notify(error.message, true); } });
}

async function adminPanel() {
  const queue = await api("/api/v1/admin/review-queue");
  const items = [
    ...queue.qualifications.map((item) => ({ ...item, kind: "qualifications", title: `${item.specialty_label} · ${item.score}%`, subtitle: item.company_name || item.name })),
    ...queue.portfolios.map((item) => ({ ...item, kind: "portfolios", title: item.title, subtitle: item.company_name || item.name })),
    ...queue.insurance.map((item) => ({ ...item, kind: "insurance", title: `${item.insurer} · ${money(item.coverage_cents)}`, subtitle: item.company_name || item.name })),
  ];
  app.innerHTML = `<section class="dashboard"><div class="dashboard-head"><div><span class="eyebrow">ADMINISTRACIÓN</span><h2>Cola de verificación</h2></div></div><div class="dashboard-grid">${sidebar()}<div class="list">${items.length ? items.map((item) => `<article class="list-item"><span class="eyebrow">${escapeHtml(item.kind)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p><label>Motivo / nota de revisión<input data-reason="${item.id}" /></label><footer><button class="button" data-decision="RECHAZAR" data-kind="${item.kind}" data-id="${item.id}">Rechazar</button><button class="button primary" data-decision="APROBAR" data-kind="${item.kind}" data-id="${item.id}">Aprobar</button></footer></article>`).join("") : `<div class="empty">No hay elementos pendientes.</div>`}</div></div></section>`;
  document.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", async () => {
    const reason = document.querySelector(`[data-reason="${button.dataset.id}"]`).value.trim() || (button.dataset.decision === "APROBAR" ? "Documentación revisada y conforme." : "Documentación no conforme.");
    try { await api(`/api/v1/admin/${button.dataset.kind}/${button.dataset.id}/decision`, { method: "POST", body: JSON.stringify({ decision: button.dataset.decision, reason }) }); notify("Decisión guardada."); await adminPanel(); } catch (error) { notify(error.message, true); }
  }));
}

async function panel() {
  if (!state.user) {
    try { state.user = (await api("/api/v1/auth/me")).user; } catch { go("/login"); return; }
  }
  if (state.user.role === "cliente") await clientPanel();
  if (state.user.role === "profesional") await professionalPanel();
  if (state.user.role === "admin") await adminPanel();
}

async function route() {
  app.innerHTML = `<div class="loading">Cargando…</div>`;
  const path = location.pathname;
  if (path === "/") landing();
  else if (path === "/login") login();
  else if (path === "/registro") await register();
  else if (path === "/verificar-email") await verifyEmail();
  else if (path === "/restablecer") resetPassword();
  else if (path === "/panel") await panel();
  else landing();
  updateNav();
  app.focus();
}

window.addEventListener("popstate", () => void route());
void api("/api/v1/auth/me").then((result) => { state.user = result.user; }).catch(() => null).finally(() => route());