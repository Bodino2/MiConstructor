(() => {
  const match = window.location.pathname.match(/^\/campana\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (!match) return;

  const app = document.querySelector("#app");
  const nav = document.querySelector("#main-nav");
  const slug = match[1];
  const provinces = [
    "A Coruña", "Araba/Álava", "Albacete", "Alicante/Alacant", "Almería", "Asturias", "Ávila",
    "Badajoz", "Barcelona", "Bizkaia", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón/Castelló",
    "Ceuta", "Ciudad Real", "Córdoba", "Cuenca", "Girona", "Granada", "Guadalajara", "Gipuzkoa", "Huelva",
    "Huesca", "Illes Balears", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga",
    "Melilla", "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife",
    "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia/València", "Valladolid", "Zamora", "Zaragoza",
  ];
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

  function registrationHref(baseHref, province, locality) {
    const target = new URL(baseHref, window.location.origin);
    target.searchParams.set("provincia", province);
    target.searchParams.set("localidad", locality);
    target.searchParams.set("zona", `${locality}, ${province}`);
    return `${target.pathname}${target.search}`;
  }

  function render(campaign) {
    const professional = campaign.audience === "profesional";
    const provinceOptions = provinces.map((province) => `<option value="${escapeHtml(province)}">${escapeHtml(province)}</option>`).join("");
    document.body.classList.add("marketing-campaign-page");
    document.title = `${campaign.headline} | MiConstructor`;
    if (nav) {
      nav.innerHTML = professional
        ? '<a href="/login">Entrar</a><a class="primary" href="/registro-profesional">Crear perfil</a>'
        : '<a href="/login">Entrar</a><a class="primary" href="/registro-cliente">Publicar proyecto</a>';
    }
    app.innerHTML = `<section class="marketing-hero">
      <div class="marketing-hero-copy">
        <span class="marketing-eyebrow">MICONSTRUCTOR · ESPAÑA</span>
        <h1>${escapeHtml(campaign.headline)}</h1>
        <p class="marketing-lead">${escapeHtml(campaign.subheadline)}</p>
        <div class="marketing-zone" id="marketing-zone">
          <div class="marketing-zone-title">
            <strong>¿Dónde quieres usar MiConstructor?</strong>
            <span>El mismo QR funciona en toda España. Tú eliges la zona.</span>
          </div>
          <div class="marketing-zone-fields">
            <label>Provincia
              <select id="marketing-province" autocomplete="address-level1">
                <option value="">Selecciona provincia</option>${provinceOptions}
              </select>
            </label>
            <label>Localidad
              <input id="marketing-locality" type="text" maxlength="100" autocomplete="address-level2" placeholder="Ej. Linares, Marbella, Getafe…" />
            </label>
          </div>
          <p class="marketing-zone-error" id="marketing-zone-error" role="alert" hidden>Selecciona provincia e indica tu localidad para continuar.</p>
        </div>
        <div class="marketing-actions">
          <a class="marketing-cta" data-marketing-cta href="${escapeHtml(campaign.ctaHref)}">${escapeHtml(campaign.ctaLabel)} →</a>
          <span>Sin compromiso para ${professional ? "crear tu perfil" : "publicar tu proyecto"}.</span>
        </div>
        <div class="marketing-proof-grid">
          ${professional
            ? `<article><strong>Proyectos por zona</strong><span>La plataforma filtra oportunidades según tu ubicación y especialidad.</span></article>
               <article><strong>Perfil verificado</strong><span>Demuestra experiencia, documentación y oficio.</span></article>
               <article><strong>Un acceso nacional</strong><span>No necesitas un QR distinto para cada provincia o municipio.</span></article>`
            : `<article><strong>Tu localidad primero</strong><span>Indicas dónde está el proyecto y trabajas con profesionales de esa zona.</span></article>
               <article><strong>Profesionales verificados</strong><span>Compara perfiles, especialidades y documentación.</span></article>
               <article><strong>Un QR para España</strong><span>La misma campaña sirve en cualquier ciudad sin duplicar códigos.</span></article>`}
        </div>
      </div>
      <aside class="marketing-card">
        <img src="/miconstructor-mark.svg" alt="MiConstructor" />
        <span>${professional ? "PARA PROFESIONALES" : "PARA CLIENTES"}</span>
        <h2>${professional ? "Tu zona de trabajo la eliges tú." : "Tu reforma empieza en tu localidad."}</h2>
        <ol>
          ${professional
            ? "<li>Selecciona provincia y localidad.</li><li>Crea tu perfil.</li><li>Supera el test de tu especialidad.</li><li>Accede a proyectos compatibles.</li>"
            : "<li>Selecciona provincia y localidad.</li><li>Publica lo que necesitas.</li><li>Compara profesionales.</li><li>Elige y gestiona tu proyecto.</li>"}
        </ol>
      </aside>
    </section>
    <section class="marketing-bottom-cta">
      <div><span>MICONSTRUCTOR · ESPAÑA</span><h2>${professional ? "Un solo acceso. Tu área de trabajo la defines dentro de MiConstructor." : "Un solo QR para toda España; el proyecto se localiza dentro de la plataforma."}</h2></div>
      <a class="marketing-cta" data-marketing-cta href="${escapeHtml(campaign.ctaHref)}">${escapeHtml(campaign.ctaLabel)} →</a>
    </section>`;

    const province = app.querySelector("#marketing-province");
    const locality = app.querySelector("#marketing-locality");
    const zoneError = app.querySelector("#marketing-zone-error");

    function selectedDestination() {
      const provinceValue = province?.value.trim() || "";
      const localityValue = locality?.value.trim() || "";
      if (!provinceValue || localityValue.length < 2) {
        if (zoneError) zoneError.hidden = false;
        app.querySelector("#marketing-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (!provinceValue) province?.focus();
        else locality?.focus();
        return null;
      }
      if (zoneError) zoneError.hidden = true;
      return registrationHref(campaign.ctaHref, provinceValue, localityValue);
    }

    app.querySelectorAll("[data-marketing-cta]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const destination = selectedDestination();
        if (!destination) {
          event.preventDefault();
          return;
        }
        link.setAttribute("href", destination);
        void track(campaign.code, "CTA_CLICK");
      });
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
