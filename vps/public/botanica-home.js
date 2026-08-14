const botanicaApp = document.querySelector("#app");
const botanicaNav = document.querySelector("#main-nav");

const botanicaEscape = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

function botanicaInitials(value) {
  return String(value || "MC").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "MC";
}

function botanicaAnonymousNav() {
  if (!botanicaNav || location.pathname !== "/") return;

  const authenticated = Boolean(
    botanicaNav.querySelector("#logout")
    || botanicaNav.querySelector('a[href="/panel"]')
    || botanicaNav.dataset.marketplaceMode === "authenticated",
  );
  const mode = authenticated ? "authenticated" : "anonymous";

  if (botanicaNav.classList.contains("navbar-marketplace") && botanicaNav.dataset.marketplaceMode === mode) return;

  if (!document.querySelector('link[href="/marketplace-navbar.css"]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/marketplace-navbar.css";
    document.head.append(stylesheet);
  }

  botanicaNav.classList.add("navbar-marketplace");
  botanicaNav.dataset.marketplaceMode = mode;
  botanicaNav.innerHTML = `
    <ul class="nav-main-links">
      <li><a href="/#servicios">Servicios <span aria-hidden="true">▾</span></a></li>
      <li><a href="/#como-funciona">Cómo funciona</a></li>
      <li><a href="/guia">Guía de precios</a></li>
      <li><a href="/opiniones">Opiniones</a></li>
    </ul>
    <div class="nav-actions">
      <a href="/para-profesionales" class="link-pro">¿Eres profesional?</a>
      <a href="/publicar?servicio=reformas" class="btn-cta-green">Pedir Presupuesto</a>
      ${authenticated ? `
        <div class="user-avatar-dropdown">
          <button class="avatar-btn" type="button" aria-expanded="false" aria-controls="marketplace-user-menu">👤 Mi Cuenta <span aria-hidden="true">▾</span></button>
          <div class="user-account-menu" id="marketplace-user-menu" hidden>
            <a href="/panel">Panel</a>
            <a href="/servicios-hogar">Mis Solicitudes</a>
            <button type="button" id="logout">Salir</button>
          </div>
        </div>` : '<a href="/login" class="nav-login">Entrar</a>'}
    </div>`;

  if (!authenticated) return;

  const avatarButton = botanicaNav.querySelector(".avatar-btn");
  const accountMenu = botanicaNav.querySelector(".user-account-menu");
  avatarButton?.addEventListener("click", () => {
    const opening = accountMenu?.hidden ?? false;
    if (accountMenu) accountMenu.hidden = !opening;
    avatarButton.setAttribute("aria-expanded", String(opening));
  });

  botanicaNav.querySelector("#logout")?.addEventListener("click", async () => {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
    window.location.assign("/");
  });
}

function botanicaHomeMarkup() {
  return `<div class="botanica-home" data-botanica-home="true">
    <section class="botanica-hero" aria-labelledby="botanica-title">
      <div class="botanica-hero-copy">
        <span class="botanica-kicker">REFORMAS Y CUIDADO DE TU HOGAR</span>
        <h1 id="botanica-title">Reformas con claridad y <em>profesionales verificados.</em></h1>
        <p class="lead">Compara presupuestos, programa servicios y conserva contratos, visitas, hitos, evidencias y decisiones en un único espacio seguro.</p>
        <div class="botanica-hero-actions">
          <a class="button primary" href="/publicar?servicio=reformas">Pedir presupuesto →</a>
          <a class="button" href="/servicios-hogar">Limpieza y jardín →</a>
        </div>
        <div class="botanica-proof-row" aria-label="Ventajas de MiConstructor">
          <span><i class="botanica-proof-dot">✓</i> Gratis para publicar</span>
          <span><i class="botanica-proof-dot">✓</i> Profesionales verificados</span>
          <span><i class="botanica-proof-dot">✓</i> Presupuestos comparables</span>
          <span><i class="botanica-proof-dot">✓</i> Servicios programados</span>
        </div>
      </div>
      <div class="botanica-hero-visual">
        <img src="/miconstructor-platform.webp" alt="Vivienda contemporánea que representa una propiedad gestionada con MiConstructor" />
        <aside class="botanica-verified-card" aria-label="Profesionales verificados">
          <span class="botanica-verified-icon" aria-hidden="true">✓</span>
          <strong>Profesionales verificados</strong>
          <span>Identidad, especialidad, documentación y evidencias reales de trabajo.</span>
        </aside>
      </div>
    </section>

    <section class="botanica-audiences" aria-label="Áreas de MiConstructor">
      <article class="botanica-audience-card">
        <span class="botanica-audience-icon" aria-hidden="true">⌂</span>
        <div>
          <h2>Para clientes</h2>
          <p>Publica una reforma o programa limpieza y mantenimiento. Compara profesionales y controla presupuesto, visitas, hitos y documentación.</p>
          <a class="button primary" href="/registro-cliente">Crear cuenta como cliente →</a>
        </div>
      </article>
      <article class="botanica-audience-card">
        <span class="botanica-audience-icon" aria-hidden="true">▣</span>
        <div>
          <h2>Para profesionales</h2>
          <p>Demuestra tu especialidad, recibe proyectos o servicios compatibles y gestiona propuestas, obras y visitas desde un solo lugar.</p>
          <a class="button" href="/para-profesionales">Crear cuenta profesional →</a>
        </div>
      </article>
    </section>

    <section class="botanica-section" id="servicios" aria-labelledby="servicios-title">
      <div class="botanica-section-head"><div><span class="eyebrow">UNA PLATAFORMA PARA TU PROPIEDAD</span><h2 id="servicios-title">¿Qué necesitas?</h2><p>MiConstructor mantiene flujos distintos según el trabajo: una reforma no se gestiona igual que una limpieza semanal.</p></div></div>
      <div class="botanica-steps">
        <article class="botanica-step"><strong class="botanica-step-number">01</strong><div><h3>Reformas y construcción</h3><p>Presupuestos, contratos, hitos, evidencias, extras controlados y pasaporte digital de la obra.</p><a class="botanica-section-link" href="/publicar?servicio=reformas">Publicar proyecto →</a></div></article>
        <article class="botanica-step"><strong class="botanica-step-number">02</strong><div><h3>Limpieza y mantenimiento</h3><p>Hogar, profunda, fin de obra, cristales y comunidades. Puntual o con frecuencia programada.</p><a class="botanica-section-link" href="/servicios-hogar#limpieza">Ver servicios →</a></div></article>
        <article class="botanica-step"><strong class="botanica-step-number">03</strong><div><h3>Jardín y exterior</h3><p>Jardinería, poda, césped, riego, parcelas y piscina con agenda y visitas recurrentes.</p><a class="botanica-section-link" href="/servicios-hogar#jardin">Ver servicios →</a></div></article>
      </div>
    </section>

    <section class="botanica-section" id="como-funciona" aria-labelledby="como-funciona-title">
      <div class="botanica-section-head"><div><span class="eyebrow">UN PROCESO CLARO</span><h2 id="como-funciona-title">Cómo funciona</h2></div></div>
      <div class="botanica-steps">
        <article class="botanica-step"><strong class="botanica-step-number">1</strong><div><h3>Describe lo que necesitas</h3><p>Publica una obra o selecciona un servicio, ubicación, fecha y frecuencia.</p></div></article>
        <article class="botanica-step"><strong class="botanica-step-number">2</strong><div><h3>Recibe y compara</h3><p>Compara propuestas de profesionales verificados con criterios claros y trazables.</p></div></article>
        <article class="botanica-step"><strong class="botanica-step-number">3</strong><div><h3>Elige y controla</h3><p>Gestiona hitos de obra o visitas programadas, evidencias, cambios y documentación hasta finalizar.</p></div></article>
      </div>
    </section>

    <section class="botanica-section" id="profesionales" aria-labelledby="profesionales-title">
      <div class="botanica-section-head">
        <div><span class="eyebrow">CONFIANZA BASADA EN DATOS REALES</span><h2 id="profesionales-title">Profesionales verificados</h2><p>Mostramos únicamente profesionales aprobados por la plataforma. Las valoraciones proceden de reseñas publicadas en MiConstructor.</p></div>
        <a class="botanica-section-link" href="/para-profesionales">Soy profesional →</a>
      </div>
      <div class="botanica-professionals" id="botanica-professionals-list" aria-live="polite"><div class="botanica-prof-empty">Cargando profesionales verificados…</div></div>
    </section>

    <section class="botanica-trust-band" id="seguridad" aria-label="Seguridad y control">
      <div class="botanica-trust-inner">
        <article class="botanica-trust-item"><strong><i>✓</i>Profesionales verificados</strong><span>Especialidad y documentación revisadas antes de operar.</span></article>
        <article class="botanica-trust-item"><strong><i>≋</i>Presupuestos y ofertas claras</strong><span>Alcance, importe, plazo o precio por visita visibles antes de elegir.</span></article>
        <article class="botanica-trust-item"><strong><i>▣</i>Trazabilidad</strong><span>Hitos, visitas, evidencias, aprobaciones y decisiones quedan registradas.</span></article>
        <article class="botanica-trust-item"><strong><i>□</i>Documentación segura</strong><span>Contratos, archivos y actividad protegidos en la plataforma.</span></article>
      </div>
    </section>
  </div>`;
}

async function loadBotanicaProfessionals() {
  const list = document.querySelector("#botanica-professionals-list");
  if (!list) return;
  try {
    const response = await fetch("/api/v1/public/professionals?limit=5", { credentials: "same-origin" });
    if (!response.ok) throw new Error("directory unavailable");
    const payload = await response.json();
    const professionals = Array.isArray(payload.professionals) ? payload.professionals : [];
    if (!professionals.length) {
      list.innerHTML = `<div class="botanica-prof-empty"><strong>Estamos incorporando profesionales verificados.</strong><br />Los perfiles aparecerán aquí cuando completen la verificación de MiConstructor. <a href="/para-profesionales">Conoce el área profesional →</a></div>`;
      return;
    }
    list.innerHTML = professionals.map((professional) => {
      const rating = professional.rating == null ? "Sin reseñas aún" : `★ ${Number(professional.rating).toFixed(1)} · ${professional.reviewCount} ${professional.reviewCount === 1 ? "reseña" : "reseñas"}`;
      return `<article class="botanica-prof-card"><div class="botanica-prof-head"><span class="botanica-prof-avatar" aria-hidden="true">${botanicaEscape(botanicaInitials(professional.displayName))}</span><div><h3>${botanicaEscape(professional.displayName)}</h3><div class="botanica-prof-location">${botanicaEscape(professional.location || "España")}</div></div></div><div class="botanica-rating">${botanicaEscape(rating)}</div><p class="botanica-prof-meta">${botanicaEscape(professional.specialty || "Profesional verificado")}</p><div class="botanica-badges"><span class="botanica-badge">VERIFICADO</span>${professional.insured ? '<span class="botanica-badge">Seguro RC</span>' : ""}</div></article>`;
    }).join("");
  } catch {
    list.innerHTML = `<div class="botanica-prof-empty">El directorio público se está preparando. Puedes crear tu solicitud ahora y MiConstructor te mostrará profesionales compatibles cuando estén disponibles.</div>`;
  }
}

function renderBotanicaHome() {
  if (!botanicaApp || location.pathname !== "/") return;
  if (botanicaApp.querySelector("[data-botanica-home]")) { botanicaAnonymousNav(); return; }
  botanicaApp.innerHTML = botanicaHomeMarkup();
  botanicaAnonymousNav();
  void loadBotanicaProfessionals();
}

const botanicaObserver = new MutationObserver(() => {
  if (location.pathname === "/" && !botanicaApp?.querySelector("[data-botanica-home]")) renderBotanicaHome();
  botanicaAnonymousNav();
});
if (botanicaApp) botanicaObserver.observe(botanicaApp, { childList: true });
if (botanicaNav) botanicaObserver.observe(botanicaNav, { childList: true });
window.addEventListener("popstate", () => window.setTimeout(renderBotanicaHome, 0));
window.setTimeout(renderBotanicaHome, 0);
