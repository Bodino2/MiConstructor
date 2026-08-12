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

  function registrationHref(baseHref, province, locality, radiusKm) {
    const target = new URL(baseHref, window.location.origin);
    target.searchParams.set("provincia", province);
    target.searchParams.set("localidad", locality);
    target.searchParams.set("radioKm", String(radiusKm));
    target.searchParams.set("zona", `${locality}, ${province} · ${radiusKm} km`);
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
            <strong>${professional ? "Define tu zona de trabajo" : "Define la zona de tu proyecto"}</strong>
            <span>El mismo QR funciona en toda España. 50 km es la opción recomendada.</span>
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
            <label>${professional ? "Radio de trabajo" : "Radio de búsqueda"}
              <select id="marketing-radius">
                <option value="10">+10 km</option>
                <option value="25">+25 km</option>
                <option value="50" selected>+50 km</option>
                <option value="75">+75 km</option>
                <option value="100">+100 km</option>
                <option value="150">+150 km</option>
              </select>
            </label>
          </div>
          <p class="marketing-zone-hint">Ejemplo: <strong>Linares +50 km</strong> incluye oportunidades o profesionales dentro del radio configurado alrededor de Linares.</p>
          <p class="marketing-zone-error" id="marketing-zone-error" role="alert" hidden>Selecciona provincia e indica tu localidad para continuar.</p>
        </div>
        <div class="marketing-actions">
          <a class="marketing-cta" data-marketing-cta href="${escapeHtml(campaign.ctaHref)}">${escapeHtml(campaign.ctaLabel)} →</a>
          <span>Sin compromiso para ${professional ? "crear tu perfil" : "publicar tu proyecto"}.</span>
        </div>
        <div class="marketing-proof-grid">
          ${professional
            ? `<article><strong>Radio configurable</strong><span>50 km por defecto; puedes ampliarlo o reducirlo según tu movilidad.</span></article>
               <article><strong>Proyectos por zona</strong><span>La plataforma podrá priorizar oportunidades compatibles con tu localidad y radio.</span></article>
               <article><strong>Un acceso nacional</strong><span>No necesitas un QR distinto para cada provincia o municipio.</span></article>`
            : `<article><strong>Radio configurable</strong><span>Busca profesionales alrededor de la localidad del proyecto, con 50 km por defecto.</span></article>
               <article><strong>Profesionales verificados</strong><span>Compara perfiles, especialidades y documentación.</span></article>
               <article><strong>Un QR para España</strong><span>La misma campaña sirve en cualquier ciudad sin duplicar códigos.</span></article>`}
        </div>
      </div>
      <aside class="marketing-card">
        <img src="/miconstructor-mark.svg" alt="MiConstructor" />
        <span>${professional ? "PARA PROFESIONALES" : "PARA CLIENTES"}</span>
        <h2>${professional ? "Tu zona de trabajo la eliges tú." : "Tú decides hasta dónde buscar."}</h2>
        <ol>
          ${professional
            ? "<li>Selecciona provincia y localidad.</li><li>Define tu radio, 50 km por defecto.</li><li>Crea y verifica tu perfil.</li><li>Recibe proyectos compatibles.</li>"
            : "<li>Selecciona provincia y localidad.</li><li>Define el radio, 50 km por defecto.</li><li>Publica lo que necesitas.</li><li>Compara profesionales de la zona.</li>"}
        </ol>
      </aside>
    </section>
    <section class="marketing-bottom-cta">
      <div><span>MICONSTRUCTOR · ESPAÑA</span><h2>${professional ? "Una localidad base y el radio que realmente quieres trabajar." : "Una localidad base y el radio en el que quieres encontrar profesionales."}</h2></div>
      <a class="marketing-cta" data-marketing-cta href="${escapeHtml(campaign.ctaHref)}">${escapeHtml(campaign.ctaLabel)} →</a>
    </section>`;

    const province = app.querySelector("#marketing-province");
    const locality = app.querySelector("#marketing-locality");
    const radius = app.querySelector("#marketing-radius");
    const zoneError = app.querySelector("#marketing-zone-error");

    function selectedDestination() {
      const provinceValue = province?.value.trim() || "";
      const localityValue = locality?.value.trim() || "";
      const radiusValue = Number(radius?.value || 50);
      if (!provinceValue || localityValue.length < 2 || !Number.isInteger(radiusValue) || radiusValue < 5 || radiusValue > 200) {
        if (zoneError) zoneError.hidden = false;
        app.querySelector("#marketing-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (!provinceValue) province?.focus();
        else if (localityValue.length < 2) locality?.focus();
        else radius?.focus();
        return null;
      }
      if (zoneError) zoneError.hidden = true;
      return registrationHref(campaign.ctaHref, provinceValue, localityValue, radiusValue);
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
