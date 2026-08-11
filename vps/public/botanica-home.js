const botanicaApp = document.querySelector("#app");
const botanicaNav = document.querySelector("#main-nav");

const botanicaEscape = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

function botanicaInitials(value) {
  return String(value || "MC")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "MC";
}

function botanicaAnonymousNav() {
  if (!botanicaNav) return;
  if (botanicaNav.querySelector("#logout") || botanicaNav.querySelector('a[href="/panel"]')) return;
  botanicaNav.innerHTML = `
    <a href="/#como-funciona">Cómo funciona</a>
    <a href="/#profesionales">Profesionales</a>
    <a href="/para-profesionales">Para profesionales</a>
    <a href="/login">Entrar</a>
    <a class="primary" href="/registro-cliente">Crear cuenta</a>`;
}

function botanicaHomeMarkup() {
  return `<div class="botanica-home" data-botanica-home="true">
    <section class="botanica-hero" aria-labelledby="botanica-title">
      <div class="botanica-hero-copy">
        <span class="botanica-kicker">REFORMAS CON CONTROL Y TRAZABILIDAD</span>
        <h1 id="botanica-title">Reformas con claridad y <em>profesionales verificados.</em></h1>
        <p class="lead">Compara presupuestos, avanza por hitos y conserva contratos, evidencias y decisiones en un único espacio seguro.</p>
        <div class="botanica-hero-actions">
          <a class="button primary" href="/registro-cliente">Pedir presupuesto →</a>
          <a class="button" href="#profesionales">Ver profesionales</a>
        </div>
        <div class="botanica-proof-row" aria-label="Ventajas de MiConstructor">
          <span><i class="botanica-proof-dot">✓</i> Gratis para publicar</span>
          <span><i class="botanica-proof-dot">✓</i> Profesionales verificados</span>
          <span><i class="botanica-proof-dot">✓</i> Presupuestos comparables</span>
          <span><i class="botanica-proof-dot">✓</i> Seguimiento por hitos</span>
        </div>
      </div>
      <div class="botanica-hero-visual">
        <img src="/miconstructor-platform.webp" alt="Vivienda contemporánea que representa una reforma gestionada con MiConstructor" />
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
          <p>Publica tu proyecto, recibe propuestas verificadas y controla presupuesto, hitos y documentación.</p>
          <a class="button primary" href="/registro-cliente">Crear cuenta como cliente →</a>
        </div>
      </article>
      <article class="botanica-audience-card">
        <span class="botanica-audience-icon" aria-hidden="true">▣</span>
        <div>
          <h2>Para profesionales</h2>
          <p>Demuestra tu especialidad, recibe proyectos compatibles y gestiona propuestas y obras desde un solo lugar.</p>
          <a class="button" href="/para-profesionales">Crear cuenta profesional →</a>
        </div>
      </article>
    </section>

    <section class="botanica-section" id="como-funciona" aria-labelledby="como-funciona-title">
      <div class="botanica-section-head">
        <div>
          <span class="eyebrow">UN PROCESO CLARO</span>
          <h2 id="como-funciona-title">Cómo funciona</h2>
        </div>
      </div>
      <div class="botanica-steps">
        <article class="botanica-step"><strong class="botanica-step-number">1</strong><div><h3>Publica tu proyecto</h3><p>Cuéntanos qué necesitas, dónde está la obra y el alcance previsto.</p></div></article>
        <article class="botanica-step"><strong class="botanica-step-number">2</strong><div><h3>Recibe y compara</h3><p>Compara propuestas de profesionales verificados con criterios homogéneos y trazables.</p></div></article>
        <article class="botanica-step"><strong class="botanica-step-number">3</strong><div><h3>Elige y avanza</h3><p>Formaliza el trabajo y controla hitos, evidencias, cambios y documentación hasta finalizar.</p></div></article>
      </div>
    </section>

    <section class="botanica-section" id="profesionales" aria-labelledby="profesionales-title">
      <div class="botanica-section-head">
        <div>
          <span class="eyebrow">CONFIANZA BASADA EN DATOS REALES</span>
          <h2 id="profesionales-title">Profesionales verificados</h2>
          <p>Mostramos únicamente profesionales aprobados por la plataforma. Las valoraciones proceden de reseñas publicadas en MiConstructor.</p>
        </div>
        <a class="botanica-section-link" href="/para-profesionales">Soy profesional →</a>
      </div>
      <div class="botanica-professionals" id="botanica-professionals-list" aria-live="polite">
        <div class="botanica-prof-empty">Cargando profesionales verificados…</div>
      </div>
    </section>

    <section class="botanica-trust-band" id="seguridad" aria-label="Seguridad y control">
      <div class="botanica-trust-inner">
        <article class="botanica-trust-item"><strong><i>✓</i>Profesionales verificados</strong><span>Especialidad y documentación revisadas antes de operar.</span></article>
        <article class="botanica-trust-item"><strong><i>≋</i>Presupuestos comparables</strong><span>Más claridad sobre alcance, importe, plazo y diferencias.</span></article>
        <article class="botanica-trust-item"><strong><i>▣</i>Control por hitos</strong><span>Evidencias, aprobaciones y decisiones quedan registradas.</span></article>
        <article class="botanica-trust-item"><strong><i>□</i>Documentación segura</strong><span>Contratos, archivos y trazabilidad protegidos en la plataforma.</span></article>
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
      return `<article class="botanica-prof-card">
        <div class="botanica-prof-head">
          <span class="botanica-prof-avatar" aria-hidden="true">${botanicaEscape(botanicaInitials(professional.displayName))}</span>
          <div><h3>${botanicaEscape(professional.displayName)}</h3><div class="botanica-prof-location">${botanicaEscape(professional.location || "España")}</div></div>
        </div>
        <div class="botanica-rating">${botanicaEscape(rating)}</div>
        <p class="botanica-prof-meta">${botanicaEscape(professional.specialty || "Profesional verificado")}</p>
        <div class="botanica-badges"><span class="botanica-badge">VERIFICADO</span>${professional.insured ? '<span class="botanica-badge">Seguro RC</span>' : ""}</div>
      </article>`;
    }).join("");
  } catch {
    list.innerHTML = `<div class="botanica-prof-empty">El directorio público se está preparando. Puedes crear tu proyecto ahora y MiConstructor te mostrará profesionales compatibles cuando estén disponibles.</div>`;
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
