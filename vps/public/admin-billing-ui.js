const adminBillingApp = document.querySelector("#app");
const adminBillingToast = document.querySelector("#toast");

const adminBillingState = {
  entries: [],
  summary: null,
  filters: { q: "", status: "", from: "", to: "" },
  loading: false,
};

const billingEscape = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const billingMoney = (cents) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);
const billingDateTime = (value) => value
  ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

async function billingApi(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const payload = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "No se ha podido cargar la facturación.");
  return payload;
}

function billingNotify(message, error = false) {
  if (!adminBillingToast) return;
  adminBillingToast.textContent = message;
  adminBillingToast.className = `toast${error ? " error" : ""}`;
  adminBillingToast.hidden = false;
  window.clearTimeout(billingNotify.timer);
  billingNotify.timer = window.setTimeout(() => { adminBillingToast.hidden = true; }, 5000);
}

function billingStatusBadge(value) {
  const labels = {
    PENDIENTE: "Pendiente",
    PROCESANDO: "En proceso",
    FACTURADO: "Facturado histórico",
    PAGADO: "Pagado",
    FALLIDO: "Fallido",
  };
  const normalized = String(value || "PENDIENTE");
  const className = normalized === "FALLIDO" ? " danger" : ["PENDIENTE", "PROCESANDO"].includes(normalized) ? " warn" : "";
  return `<span class="status${className}">${billingEscape(labels[normalized] || normalized)}</span>`;
}

function billingQuery() {
  const params = new URLSearchParams({ limit: "500" });
  for (const key of ["q", "status", "from", "to"]) {
    const value = adminBillingState.filters[key]?.trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}

function billingSummaryMarkup(summary) {
  return `<div class="admin-kpis admin-billing-kpis">
    <article class="card admin-kpi"><span>Cobrado este mes</span><strong>${billingMoney(summary.paidThisMonthCents)}</strong><small>${Number(summary.paidCount || 0)} cobros pagados en total</small></article>
    <article class="card admin-kpi"><span>En proceso</span><strong>${billingMoney(summary.processingCents)}</strong><small>${Number(summary.processingCount || 0)} cargos pendientes de confirmación</small></article>
    <article class="card admin-kpi"><span>Saldo vencido</span><strong>${billingMoney(summary.overdueBalanceCents)}</strong><small>Importe actualmente impagado</small></article>
    <article class="card admin-kpi"><span>Pagos fallidos</span><strong>${Number(summary.failedCount || 0)}</strong><small>Cargos que requieren revisión o reintento</small></article>
  </div>`;
}

function billingEntryMarkup(entry) {
  const professional = entry.professional_company || entry.professional_name;
  const source = entry.entry_type === "FACTURA_HISTORICA" ? "Factura histórica" : "Cobro por selección";
  const project = entry.project_title || "Sin proyecto individual (histórico)";
  const failure = entry.failure_reason
    ? `<div class="notice danger admin-billing-failure"><strong>Motivo del fallo</strong><p>${billingEscape(entry.failure_reason)}</p></div>`
    : "";
  const overdue = Number(entry.account_overdue_balance_cents || 0) > 0
    ? `<span><strong>Saldo de la cuenta</strong>${billingMoney(entry.account_overdue_balance_cents)}</span>`
    : "";

  return `<article class="list-item admin-billing-entry">
    <div class="list-item-head">
      <div>
        <span class="eyebrow">${billingEscape(source)}</span>
        <h3>${billingEscape(professional)}</h3>
        <p>${billingEscape(entry.professional_email)} · ${billingEscape(project)}</p>
      </div>
      <div class="admin-billing-amount"><strong>${billingMoney(entry.amount_cents)}</strong>${billingStatusBadge(entry.status)}</div>
    </div>
    <p class="admin-billing-description">${billingEscape(entry.description)}</p>
    <div class="admin-meta-grid">
      <span><strong>Concepto / proyecto</strong>${billingEscape(project)}</span>
      <span><strong>Fecha del cargo</strong>${billingDateTime(entry.service_date)}</span>
      <span><strong>Cobro solicitado</strong>${billingDateTime(entry.collection_requested_at)}</span>
      <span><strong>Pagado</strong>${billingDateTime(entry.paid_at)}</span>
      <span><strong>Estado de cuenta</strong>${billingEscape(entry.account_status || "NO_APLICA")}</span>
      <span><strong>Reintentos</strong>${Number(entry.retry_count || 0)}</span>
      ${overdue}
    </div>
    ${failure}
  </article>`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportBillingCsv() {
  if (!adminBillingState.entries.length) {
    billingNotify("No hay movimientos para exportar.", true);
    return;
  }
  const headers = ["Tipo", "Profesional", "Email", "Proyecto", "Concepto", "Importe EUR", "Estado", "Fecha cargo", "Solicitud cobro", "Fecha pago", "Motivo fallo", "Reintentos"];
  const rows = adminBillingState.entries.map((entry) => [
    entry.entry_type,
    entry.professional_company || entry.professional_name,
    entry.professional_email,
    entry.project_title || "Histórico",
    entry.description,
    (Number(entry.amount_cents || 0) / 100).toFixed(2),
    entry.status,
    entry.service_date || "",
    entry.collection_requested_at || "",
    entry.paid_at || "",
    entry.failure_reason || "",
    entry.retry_count || 0,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `miconstructor-facturacion-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindBillingControls() {
  document.querySelector("#admin-billing-filter")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    adminBillingState.filters = {
      q: String(form.get("q") || ""),
      status: String(form.get("status") || ""),
      from: String(form.get("from") || ""),
      to: String(form.get("to") || ""),
    };
    await renderAdminBilling();
  });
  document.querySelector("#admin-billing-clear")?.addEventListener("click", async () => {
    adminBillingState.filters = { q: "", status: "", from: "", to: "" };
    await renderAdminBilling();
  });
  document.querySelector("#admin-billing-export")?.addEventListener("click", exportBillingCsv);
}

async function renderAdminBilling() {
  const target = document.querySelector("#admin-content");
  if (!target || adminBillingState.loading) return;
  adminBillingState.loading = true;
  target.innerHTML = '<div class="loading">Cargando movimientos de facturación…</div>';
  try {
    const result = await billingApi(`/api/v1/admin/billing?${billingQuery()}`);
    adminBillingState.entries = result.entries || [];
    adminBillingState.summary = result.summary || {};
    const filters = adminBillingState.filters;
    target.innerHTML = `<div class="admin-section-head">
      <div><h3>Facturación</h3><p class="muted">Quién pagó, por qué concepto, cuánto, cuándo y qué cobros siguen pendientes o fallidos.</p></div>
      <button class="button" id="admin-billing-export" type="button">Exportar CSV</button>
    </div>
    ${billingSummaryMarkup(adminBillingState.summary)}
    <form id="admin-billing-filter" class="admin-billing-toolbar">
      <input name="q" value="${billingEscape(filters.q)}" placeholder="Profesional, empresa, email o proyecto" />
      <select name="status">
        <option value="">Todos los estados</option>
        ${["PENDIENTE", "PROCESANDO", "PAGADO", "FALLIDO", "FACTURADO"].map((status) => `<option value="${status}"${filters.status === status ? " selected" : ""}>${billingEscape(({ PENDIENTE: "Pendiente", PROCESANDO: "En proceso", PAGADO: "Pagado", FALLIDO: "Fallido", FACTURADO: "Facturado histórico" })[status])}</option>`).join("")}
      </select>
      <label>Desde<input name="from" type="date" value="${billingEscape(filters.from)}" /></label>
      <label>Hasta<input name="to" type="date" value="${billingEscape(filters.to)}" /></label>
      <div class="admin-billing-filter-actions"><button class="button primary" type="submit">Aplicar filtros</button><button class="button" id="admin-billing-clear" type="button">Limpiar</button></div>
    </form>
    <div class="admin-section-head admin-billing-results-head"><div><h3>Movimientos</h3><p class="muted">${adminBillingState.entries.length} registros encontrados.</p></div></div>
    <div class="list">${adminBillingState.entries.length ? adminBillingState.entries.map(billingEntryMarkup).join("") : '<div class="empty"><strong>Sin movimientos.</strong><p>No hay cobros que coincidan con los filtros seleccionados.</p></div>'}</div>`;
    bindBillingControls();
  } catch (error) {
    target.innerHTML = `<div class="notice danger"><strong>No se ha podido cargar la facturación.</strong><p>${billingEscape(error.message)}</p></div>`;
    billingNotify(error.message, true);
  } finally {
    adminBillingState.loading = false;
  }
}

async function activateAdminBilling(options = {}) {
  if (options.failedOnly) adminBillingState.filters.status = "FALLIDO";
  document.querySelectorAll("[data-admin-tab]").forEach((button) => button.classList.toggle("active", button.dataset.adminTab === "billing"));
  await renderAdminBilling();
}

function enhanceAdminBilling() {
  if (location.pathname !== "/panel") return;
  const dashboard = adminBillingApp?.querySelector("[data-admin-dashboard-v2]");
  const tabs = dashboard?.querySelector(".admin-tabs");
  if (!dashboard || !tabs) return;

  let billingButton = tabs.querySelector('[data-admin-tab="billing"]');
  if (!billingButton) {
    billingButton = document.createElement("button");
    billingButton.type = "button";
    billingButton.dataset.adminTab = "billing";
    billingButton.textContent = "Facturación";
    billingButton.addEventListener("click", () => void activateAdminBilling());
    tabs.append(billingButton);
  }

  const overdueCard = dashboard.querySelector(".admin-kpis .admin-kpi:last-child");
  if (overdueCard && !overdueCard.dataset.billingBound) {
    overdueCard.dataset.billingBound = "true";
    overdueCard.dataset.adminOpenBilling = "true";
    overdueCard.tabIndex = 0;
    overdueCard.setAttribute("role", "button");
    overdueCard.setAttribute("aria-label", "Abrir detalle del saldo vencido");
    overdueCard.addEventListener("click", () => void activateAdminBilling({ failedOnly: true }));
    overdueCard.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        void activateAdminBilling({ failedOnly: true });
      }
    });
  }
}

const adminBillingObserver = new MutationObserver(enhanceAdminBilling);
if (adminBillingApp) adminBillingObserver.observe(adminBillingApp, { childList: true, subtree: true });
enhanceAdminBilling();
