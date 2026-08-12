(() => {
  const match = window.location.pathname.match(/^\/campana\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (!match) return;

  const app = document.querySelector("#app");
  const nav = document.querySelector("#main-nav");
  const slug = match[1];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set("content-type", "application/json");
    const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "No se ha podido cargar la campaña.");
    return payload;
  }

  function track(code, eventType) {
    return fetch("/api/v1/marketing/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ code, eventType, path: window.location.pathname }),
    }).catch(() => undefined);
  }

  function render(campaign) {
    const professional = campaign.audience === "profesional";
    document.body.classList.add("marketing-campaign-page");
    document.title = `${campaign.headline} | MiConstructor`;
    if (nav) {
      nav.innerHTML = professional
        ? '<a href="/login">Entrar</a><a class="primary" href="/registro-profesional">Crear perfil</a>'
        : '<a href="/login">Entrar</a><a class="primary" href="/registro-cliente">Publicar proyecto</a>';
    }
    app.innerHTML = `<section class="marketing-hero">
      <div class="marketing-hero-copy">
        <span class="marketing-eyebrow">MICONSTRUCTOR · LANZAMIENTO LOCAL</span>
        <h1>${escapeHtml(campaign.headline)}</h1>
        <p class="marketing-lead">${escapeHtml(campaign.subheadline)}</p>
        <div class="marketing-actions">
          <a class="marketing-cta" data-marketing-cta href="${escapeHtml(campaign.ctaHref)}">${escapeHtml(campaign.ctaLabel)} →</a>
          <span>Sin compromiso para ${professional ? "crear tu perfil" : "publicar tu proyecto"}.</span>
        </div>
        <div class="marketing-proof-grid">
          ${professional
            ? `<article><strong>Proyectos compatibles</strong><span>Oportunidades relacionadas con tu especialidad y zona.</span></article>
               <article><strong>Perfil verificado</strong><span>Demuestra experiencia, documentación y oficio.</span></article>
               <article><strong>Sin cuota mensual</strong><span>Entra en la plataforma sin pagar una suscripción fija.</span></article>`
            : `<article><strong>Publicación sencilla</strong><span>Explica tu reforma y centraliza las propuestas.</span></article>
               <article><strong>Profesionales verificados</strong><span>Compara perfiles, especialidades y documentación.</span></article>
               <article><strong>Decide con contexto</strong><span>Presupuestos comparables y trazabilidad del proyecto.</span></article>`}
        </div>
      </div>
      <aside class="marketing-card">
        <img src="/miconstructor-mark.svg" alt="MiConstructor" />
        <span>${professional ? "PARA PROFESIONALES" : "PARA CLIENTES"}</span>
        <h2>${professional ? "Convierte tu oficio en oportunidades." : "Tu reforma empieza comparando bien."}</h2>
        <ol>
          ${professional
            ? "<li>Crea tu perfil.</li><li>Supera el test de tu especialidad.</li><li>Completa la verificación.</li><li>Accede a proyectos compatibles.</li>"
            : "<li>Publica lo que necesitas.</li><li>Recibe propuestas.</li><li>Compara profesionales.</li><li>Elige y gestiona tu proyecto.</li>"}
        </ol>
      </aside>
    </section>
    <section class="marketing-bottom-cta">
      <div><span>MICONSTRUCTOR</span><h2>${professional ? "Tu próximo proyecto puede estar más cerca de lo que crees." : "No decidas tu reforma con una sola referencia."}</h2></div>
      <a class="marketing-cta" data-marketing-cta href="${escapeHtml(campaign.ctaHref)}">${escapeHtml(campaign.ctaLabel)} →</a>
    </section>`;

    app.querySelectorAll("[data-marketing-cta]").forEach((link) => {
      link.addEventListener("click", () => { void track(campaign.code, "CTA_CLICK"); });
    });
  }

  async function init() {
    if (!app) return;
    app.innerHTML = '<div class="marketing-loading">Cargando MiConstructor…</div>';
    try {
      const result = await api(`/api/v1/marketing/campaigns/${encodeURIComponent(slug)}`);
      render(result.campaign);
      void track(result.campaign.code, "LANDING_VIEW");
    } catch (error) {
      app.innerHTML = `<section class="marketing-error"><h1>Esta campaña ya no está disponible.</h1><p>${escapeHtml(error.message)}</p><a href="/">Ir a MiConstructor</a></section>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init());
  else void init();
})();
