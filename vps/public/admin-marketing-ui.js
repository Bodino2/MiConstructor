(() => {
  const app = document.querySelector("#app");
  if (!app) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);
  const fmt = (value) => new Intl.NumberFormat("es-ES").format(Number(value || 0));
  const pct = (value) => value == null ? "—" : `${Number(value).toFixed(1)}%`;

  async function api(path) {
    const response = await fetch(path, { credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "No se ha podido cargar marketing.");
    return payload;
  }

  let period = "30";

  function campaignCard(item) {
    const shortUrl = `${location.origin}/r/${item.code}`;
    return `<article class="card admin-marketing-card">
      <div class="admin-marketing-card-head"><div><span class="eyebrow">${escapeHtml(item.audience)} · ${escapeHtml(item.channel)}</span><h3>${escapeHtml(item.name)}</h3></div><span class="status${item.active ? "" : " warn"}">${item.active ? "ACTIVA" : "INACTIVA"}</span></div>
      <div class="admin-marketing-qr"><img src="/qr/${escapeHtml(item.code)}.svg" alt="QR ${escapeHtml(item.name)}" /><div><strong>URL corta</strong><div class="admin-marketing-url">${escapeHtml(shortUrl)}</div><button class="button admin-marketing-copy" type="button" data-copy-url="${escapeHtml(shortUrl)}">Copiar URL</button></div></div>
      <div class="admin-marketing-metrics"><span><small>Escaneos</small><strong>${fmt(item.qrScans)}</strong></span><span><small>Landing</small><strong>${fmt(item.landingViews)}</strong></span><span><small>CTA</small><strong>${fmt(item.ctaClicks)}</strong></span><span><small>Registros</small><strong>${fmt(item.signups)}</strong></span></div>
      <div class="admin-marketing-conversions"><span><small>Scan → landing</small><strong>${pct(item.conversions?.scanToLandingPct)}</strong></span><span><small>Landing → CTA</small><strong>${pct(item.conversions?.landingToCtaPct)}</strong></span><span><small>CTA → registro</small><strong>${pct(item.conversions?.ctaToSignupPct)}</strong></span><span><small>Scan → registro</small><strong>${pct(item.conversions?.scanToSignupPct)}</strong></span></div>
    </article>`;
  }

  async function render() {
    const target = document.querySelector("#admin-content");
    if (!target) return;
    target.innerHTML = `<div class="loading">Cargando rendimiento de campañas…</div>`;
    try {
      const data = await api(`/api/v1/admin/marketing?days=${encodeURIComponent(period)}`);
      const totals = data.totals || {};
      target.innerHTML = `<div class="admin-marketing-toolbar"><div><h3>Marketing / QR</h3><p class="muted">Embudo agregado y sin datos personales: escaneo → landing → CTA → registro.</p></div><label>Periodo<select id="admin-marketing-period"><option value="7"${period === "7" ? " selected" : ""}>7 días</option><option value="30"${period === "30" ? " selected" : ""}>30 días</option><option value="90"${period === "90" ? " selected" : ""}>90 días</option><option value="365"${period === "365" ? " selected" : ""}>365 días</option><option value="all"${period === "all" ? " selected" : ""}>Todo</option></select></label></div>
        <div class="admin-marketing-summary"><article class="card admin-marketing-kpi"><span>Escaneos</span><strong>${fmt(totals.qrScans)}</strong></article><article class="card admin-marketing-kpi"><span>Landing</span><strong>${fmt(totals.landingViews)}</strong></article><article class="card admin-marketing-kpi"><span>CTA</span><strong>${fmt(totals.ctaClicks)}</strong></article><article class="card admin-marketing-kpi"><span>Registros</span><strong>${fmt(totals.signups)}</strong></article><article class="card admin-marketing-kpi"><span>Scan → registro</span><strong>${pct(totals.scanToSignupPct)}</strong></article></div>
        <div class="admin-marketing-grid">${(data.campaigns || []).map(campaignCard).join("") || '<div class="empty">No hay campañas configuradas.</div>'}</div>`;
      document.querySelector("#admin-marketing-period")?.addEventListener("change", (event) => { period = event.target.value; void render(); });
      document.querySelectorAll("[data-copy-url]").forEach((button) => button.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(button.dataset.copyUrl); button.textContent = "Copiada"; }
        catch { button.textContent = button.dataset.copyUrl; }
      }));
    } catch (error) {
      target.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
    }
  }

  function activate() {
    document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.remove("active"));
    document.querySelector("[data-admin-guide-tab]")?.classList.remove("active");
    document.querySelector("[data-admin-marketing-tab]")?.classList.add("active");
    void render();
  }

  function enhance() {
    if (location.pathname !== "/panel") return;
    const tabs = document.querySelector(".admin-tabs");
    if (!tabs || tabs.querySelector("[data-admin-marketing-tab]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.adminMarketingTab = "true";
    button.textContent = "Marketing / QR";
    tabs.append(button);
    button.addEventListener("click", activate);
  }

  new MutationObserver(enhance).observe(app, { childList: true, subtree: true });
  enhance();
})();