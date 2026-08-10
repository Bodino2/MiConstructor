const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const adminState = {
  user: null,
  overview: null,
  queue: null,
  users: null,
  projects: null,
  audit: null,
  tab: "reviews",
};

let enhancing = false;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const money = (cents) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);
const dateTime = (value) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
  return payload;
}

function notify(message, error = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast${error ? " error" : ""}`;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function statusBadge(value) {
  const normalized = String(value || "—");
  const danger = normalized.includes("SUSPEND") || normalized.includes("RECHAZ") || normalized.includes("CANCEL") || normalized.includes("FALLIDA");
  const warn = normalized.includes("PENDIENTE") || normalized.includes("BORRADOR") || normalized.includes("REVISION");
  return `<span class="status${danger ? " danger" : warn ? " warn" : ""}">${escapeHtml(normalized)}</span>`;
}

function pendingTotal() {
  const data = adminState.overview || {};
  return Number(data.pendingQualifications || 0) + Number(data.pendingPortfolios || 0) + Number(data.pendingInsurance || 0);
}

function sidebar() {
  return `<aside class="card sidebar admin-sidebar">
    <span class="eyebrow">ADMIN</span>
    <h3>${escapeHtml(adminState.user?.name)}</h3>
    <p class="muted">${escapeHtml(adminState.user?.email)}</p>
    <span class="status">Control total</span>
    <div class="admin-side-summary">
      <div class="metric"><span>Pendientes</span><strong>${pendingTotal()}</strong></div>
      <div class="metric"><span>Cuentas suspendidas</span><strong>${Number(adminState.overview?.suspendedAccounts || 0)}</strong></div>
      <div class="metric"><span>Saldo vencido</span><strong>${money(adminState.overview?.overdueBalanceCents)}</strong></div>
    </div>
  </aside>`;
}

function renderShell() {
  const data = adminState.overview;
  app.innerHTML = `<section class="dashboard admin-dashboard" data-admin-dashboard-v2="true">
    <div class="dashboard-head">
      <div><span class="eyebrow">ADMINISTRACIÓN</span><h2>Centro de control</h2><p class="muted">Verificación, cuentas, proyectos y trazabilidad operativa.</p></div>
      <span class="status">Sistema operativo</span>
    </div>
    <div class="admin-kpis">
      <article class="card admin-kpi"><span>Usuarios</span><strong>${Number(data.usersTotal || 0)}</strong><small>${Number(data.clientsTotal || 0)} clientes · ${Number(data.professionalsTotal || 0)} profesionales</small></article>
      <article class="card admin-kpi"><span>Proyectos</span><strong>${Number(data.projectsTotal || 0)}</strong><small>${Number(data.activeProjects || 0)} activos</small></article>
      <article class="card admin-kpi"><span>Verificaciones</span><strong>${pendingTotal()}</strong><small>${Number(data.pendingQualifications || 0)} tests · ${Number(data.pendingPortfolios || 0)} portfolios · ${Number(data.pendingInsurance || 0)} RC</small></article>
      <article class="card admin-kpi"><span>Saldo vencido</span><strong>${money(data.overdueBalanceCents)}</strong><small>Facturación profesional</small></article>
    </div>
    <div class="dashboard-grid">
      ${sidebar()}
      <section>
        <div class="tabs admin-tabs">
          <button class="active" data-admin-tab="reviews">Verificaciones</button>
          <button data-admin-tab="users">Utilizatori</button>
          <button data-admin-tab="projects">Proiecte</button>
          <button data-admin-tab="audit">Audit</button>
        </div>
        <div id="admin-content"></div>
      </section>
    </div>
  </section>`;
  bindTabs();
  void showTab(adminState.tab);
}

function bindTabs() {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => {
    adminState.tab = button.dataset.adminTab;
    document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.toggle("active", item === button));
    void showTab(adminState.tab);
  }));
}

function reviewItems() {
  const queue = adminState.queue || { qualifications: [], portfolios: [], insurance: [] };
  return [
    ...queue.qualifications.map((item) => ({ ...item, kind: "qualifications", label: "Test profesional", title: `${item.specialty_label} · ${item.score}%`, detail: `${item.company_name || item.name} · ${item.email || ""}` })),
    ...queue.portfolios.map((item) => ({ ...item, kind: "portfolios", label: "Portfolio", title: item.title, detail: `${item.company_name || item.name} · ${item.category} · ${item.location}` })),
    ...queue.insurance.map((item) => ({ ...item, kind: "insurance", label: "Seguro RC", title: `${item.insurer} · ${money(item.coverage_cents)}`, detail: `${item.company_name || item.name} · válida ${dateTime(item.valid_until)}` })),
  ];
}

function renderReviews() {
  const items = reviewItems();
  const target = document.querySelector("#admin-content");
  target.innerHTML = `<div class="admin-section-head"><div><h3>Cola de verificación</h3><p class="muted">Cada decisión exige motivo y queda registrada en auditoría.</p></div><span class="status warn">${items.length} pendientes</span></div>
    <div class="list">${items.length ? items.map((item) => `<article class="list-item admin-review-item">
      <div class="list-item-head"><div><span class="eyebrow">${escapeHtml(item.label)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></div>${item.score !== undefined ? statusBadge(`${item.score}%`) : ""}</div>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      <label>Motivo / nota de revisión<input data-review-reason="${item.id}" placeholder="Motivo obligatorio para trazabilidad" /></label>
      <footer class="admin-actions">
        <button class="button" data-review-decision="RECHAZAR" data-kind="${item.kind}" data-id="${item.id}">Rechazar</button>
        ${item.kind === "qualifications" ? `<button class="button danger-button" data-review-decision="SUSPENDER" data-kind="${item.kind}" data-id="${item.id}">Suspender</button>` : ""}
        <button class="button primary" data-review-decision="APROBAR" data-kind="${item.kind}" data-id="${item.id}">Aprobar</button>
      </footer>
    </article>`).join("") : `<div class="empty"><strong>Cola limpia.</strong><p>No hay verificaciones pendientes.</p></div>`}</div>`;

  document.querySelectorAll("[data-review-decision]").forEach((button) => button.addEventListener("click", async () => {
    const decision = button.dataset.reviewDecision;
    const input = document.querySelector(`[data-review-reason="${button.dataset.id}"]`);
    const fallback = decision === "APROBAR" ? "Revisión completada y conforme." : decision === "SUSPENDER" ? "Verificación suspendida tras revisión administrativa." : "Revisión no conforme; requiere corrección.";
    const reason = input.value.trim() || fallback;
    try {
      await api(`/api/v1/admin/${button.dataset.kind}/${button.dataset.id}/decision`, { method: "POST", body: JSON.stringify({ decision, reason }) });
      notify("Decisión guardada y auditada.");
      await refreshOverviewAndQueue();
      renderShell();
    } catch (error) { notify(error.message, true); }
  }));
}

function filteredUsers() {
  const q = document.querySelector("#admin-user-search")?.value.trim().toLowerCase() || "";
  const role = document.querySelector("#admin-user-role")?.value || "";
  return (adminState.users || []).filter((user) => {
    const haystack = `${user.name} ${user.email} ${user.company_name || ""}`.toLowerCase();
    return (!q || haystack.includes(q)) && (!role || user.role === role);
  });
}

function userListHtml(users) {
  if (!users.length) return `<div class="empty">No hay usuarios que coincidan con el filtro.</div>`;
  return users.map((user) => `<article class="list-item admin-user-item">
    <div class="list-item-head"><div><span class="eyebrow">${escapeHtml(user.role)}</span><h3>${escapeHtml(user.company_name || user.name)}</h3><p>${escapeHtml(user.email)}${user.phone ? ` · ${escapeHtml(user.phone)}` : ""}</p></div><div class="status-stack">${statusBadge(user.account_status)}${statusBadge(user.verification_status)}</div></div>
    <div class="admin-meta-grid"><span><strong>Alta</strong>${dateTime(user.created_at)}</span><span><strong>Último acceso</strong>${dateTime(user.last_login_at)}</span><span><strong>Facturación</strong>${escapeHtml(user.billing_status || "NO_APLICA")}</span><span><strong>Saldo vencido</strong>${money(user.overdue_balance_cents)}</span></div>
    ${user.role !== "admin" && ["ACTIVO", "SUSPENDIDO"].includes(user.account_status) ? `<label>Motivo de acción<input data-user-reason="${user.id}" placeholder="Motivo administrativo" /></label><footer class="admin-actions"><button class="button ${user.account_status === "ACTIVO" ? "danger-button" : "primary"}" data-account-action="${user.account_status === "ACTIVO" ? "SUSPENDER" : "REACTIVAR"}" data-user-id="${user.id}">${user.account_status === "ACTIVO" ? "Suspender cuenta" : "Reactivar cuenta"}</button></footer>` : ""}
  </article>`).join("");
}

async function renderUsers() {
  if (!adminState.users) adminState.users = (await api("/api/v1/admin/users?limit=200")).users;
  const target = document.querySelector("#admin-content");
  target.innerHTML = `<div class="admin-section-head"><div><h3>Usuarios</h3><p class="muted">Estado de cuenta, verificación y facturación.</p></div></div>
    <div class="admin-toolbar"><input id="admin-user-search" placeholder="Buscar por nombre, empresa o email" /><select id="admin-user-role"><option value="">Todos los roles</option><option value="cliente">Clientes</option><option value="profesional">Profesionales</option><option value="admin">Admins</option></select></div>
    <div id="admin-user-list" class="list">${userListHtml(adminState.users)}</div>`;
  const redraw = () => { document.querySelector("#admin-user-list").innerHTML = userListHtml(filteredUsers()); bindUserActions(); };
  document.querySelector("#admin-user-search").addEventListener("input", redraw);
  document.querySelector("#admin-user-role").addEventListener("change", redraw);
  bindUserActions();
}

function bindUserActions() {
  document.querySelectorAll("[data-account-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.accountAction;
    const reason = document.querySelector(`[data-user-reason="${button.dataset.userId}"]`)?.value.trim() || (action === "SUSPENDER" ? "Cuenta suspendida por revisión administrativa." : "Cuenta reactivada tras revisión administrativa.");
    try {
      await api(`/api/v1/admin/users/${button.dataset.userId}/account-status`, { method: "POST", body: JSON.stringify({ action, reason }) });
      notify(action === "SUSPENDER" ? "Cuenta suspendida." : "Cuenta reactivada.");
      adminState.users = null;
      adminState.audit = null;
      adminState.overview = await api("/api/v1/admin/overview");
      await renderUsers();
    } catch (error) { notify(error.message, true); }
  }));
}

async function renderProjects() {
  if (!adminState.projects) adminState.projects = (await api("/api/v1/admin/projects?limit=200")).projects;
  const target = document.querySelector("#admin-content");
  target.innerHTML = `<div class="admin-section-head"><div><h3>Proyectos</h3><p class="muted">Visión operativa de proyectos, propuestas, selección y contrato.</p></div></div><div class="list">${adminState.projects.length ? adminState.projects.map((project) => `<article class="list-item">
    <div class="list-item-head"><div><span class="eyebrow">${escapeHtml(project.category)}</span><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.location)} · cliente: ${escapeHtml(project.owner_name)} (${escapeHtml(project.owner_email)})</p></div>${statusBadge(project.status)}</div>
    <div class="admin-meta-grid"><span><strong>Presupuesto</strong>${money(project.budget_cents)}</span><span><strong>Propuestas</strong>${escapeHtml(project.proposal_count)}</span><span><strong>Shortlists</strong>${escapeHtml(project.shortlist_count)}</span><span><strong>Contrato</strong>${project.has_contract ? "Sí" : "No"}</span></div>
    ${project.professional_id ? `<p><strong>Profesional asignado:</strong> ${escapeHtml(project.professional_company || project.professional_name)}</p>` : ""}
  </article>`).join("") : `<div class="empty">No hay proyectos todavía.</div>`}</div>`;
}

async function renderAudit() {
  if (!adminState.audit) adminState.audit = (await api("/api/v1/admin/audit?limit=200")).events;
  const target = document.querySelector("#admin-content");
  target.innerHTML = `<div class="admin-section-head"><div><h3>Auditoría append-only</h3><p class="muted">Acciones sensibles registradas con actor, entidad, IP y metadatos.</p></div><span class="status">${adminState.audit.length} eventos</span></div><div class="list audit-list">${adminState.audit.length ? adminState.audit.map((event) => `<article class="list-item audit-item"><div class="list-item-head"><div><span class="eyebrow">${escapeHtml(event.entity_type)}</span><h3>${escapeHtml(event.action)}</h3><p>${escapeHtml(event.actor_email || "Sistema")} · ${dateTime(event.created_at)}</p></div><span class="status">#${escapeHtml(event.id)}</span></div><div class="admin-meta-grid"><span><strong>Entidad</strong>${escapeHtml(event.entity_id || "—")}</span><span><strong>IP</strong>${escapeHtml(event.ip_address || "—")}</span></div>${event.metadata && Object.keys(event.metadata).length ? `<details><summary>Metadatos</summary><pre>${escapeHtml(JSON.stringify(event.metadata, null, 2))}</pre></details>` : ""}</article>`).join("") : `<div class="empty">No hay eventos de auditoría.</div>`}</div>`;
}

async function showTab(tab) {
  try {
    if (tab === "reviews") renderReviews();
    if (tab === "users") await renderUsers();
    if (tab === "projects") await renderProjects();
    if (tab === "audit") await renderAudit();
  } catch (error) { notify(error.message, true); }
}

async function refreshOverviewAndQueue() {
  [adminState.overview, adminState.queue] = await Promise.all([
    api("/api/v1/admin/overview"),
    api("/api/v1/admin/review-queue"),
  ]);
  adminState.audit = null;
}

async function enhanceAdminPanel() {
  if (enhancing || location.pathname !== "/panel" || app.querySelector("[data-admin-dashboard-v2]")) return;
  if (!app.textContent.includes("ADMINISTRACIÓN")) return;
  enhancing = true;
  try {
    const me = await api("/api/v1/auth/me");
    if (me.user?.role !== "admin") return;
    adminState.user = me.user;
    await refreshOverviewAndQueue();
    renderShell();
  } catch (error) {
    notify(`No se ha podido cargar el panel de control: ${error.message}`, true);
  } finally {
    enhancing = false;
  }
}

const observer = new MutationObserver(() => { void enhanceAdminPanel(); });
observer.observe(app, { childList: true, subtree: true });
void enhanceAdminPanel();
