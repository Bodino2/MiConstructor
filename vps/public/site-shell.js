(() => {
  const nativeFetch = window.fetch.bind(window);
  const legalPaths = new Set(["/aviso-legal", "/privacidad", "/cookies", "/terminos", "/sepa", "/contacto"]);
  const cookieKey = "miconstructor_cookie_consent_v1";
  let runtimeConfig = null;
  let currentUser;
  let supportUserId = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
  const formatDate = (value) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url || "";
    let next = init;
    if (url.includes("/api/v1/auth/register") && String(init.method || "GET").toUpperCase() === "POST") {
      try {
        const payload = JSON.parse(String(init.body || "{}"));
        payload.termsAccepted = document.querySelector("#termsAccepted")?.checked === true;
        next = { ...init, body: JSON.stringify(payload) };
      } catch { /* auth route will validate the original payload */ }
    }
    if (url.includes("/api/v1/billing/setup-intent") && String(init.method || "GET").toUpperCase() === "POST") {
      next = { ...init, body: JSON.stringify({ termsAccepted: document.querySelector("#sepaTermsAccepted")?.checked === true }) };
    }
    return nativeFetch(input, next);
  };

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
    const response = await nativeFetch(path, { ...options, headers, credentials: "same-origin" });
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("json") ? await response.json() : null;
    if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
    return payload;
  }

  async function getRuntimeConfig() {
    if (runtimeConfig) return runtimeConfig;
    runtimeConfig = await api("/api/v1/config").catch(() => ({
      contactEmail: "admin@miconstructor.es",
      contactPhone: null,
      legalEntityName: null,
      legalTaxId: null,
      legalAddress: null,
      legalRegistry: null,
      legalIdentityComplete: false,
    }));
    return runtimeConfig;
  }

  async function getCurrentUser(force = false) {
    if (!force && currentUser !== undefined) return currentUser;
    currentUser = await api("/api/v1/auth/me").then((result) => result.user).catch(() => null);
    return currentUser;
  }

  function injectRegistrationLegal() {
    const form = document.querySelector("#register-form");
    if (!form || form.querySelector("#termsAccepted")) return;
    const privacy = form.querySelector('input[name="privacyAccepted"]')?.closest("label");
    if (!privacy) return;
    const terms = document.createElement("label");
    terms.className = "checkbox terms-checkbox";
    terms.innerHTML = '<input id="termsAccepted" name="termsAccepted" type="checkbox" required /><span>He leído y acepto los <a href="/terminos">Términos y Condiciones</a> de MiConstructor.</span>';
    privacy.parentNode.insertBefore(terms, privacy);
    const privacySpan = privacy.querySelector("span");
    if (privacySpan) privacySpan.innerHTML = 'Acepto la <a href="/privacidad">Política de Privacidad</a> y el tratamiento necesario para prestar el servicio.';
  }

  function injectSepaLegal() {
    const form = document.querySelector("#sepa-form");
    if (!form || form.querySelector("#sepaTermsAccepted")) return;
    const actions = form.querySelector(".form-actions");
    const copy = document.createElement("div");
    copy.className = "sepa-legal-copy";
    copy.innerHTML = 'Al facilitar tu IBAN y activar la domiciliación autorizas a MiConstructor y a Stripe, como proveedor de pagos, a enviar instrucciones de adeudo a tu banco. Mantienes los derechos de reembolso previstos por SEPA. Las condiciones completas están en <a href="/sepa">Mandato y condiciones SEPA</a>.';
    const consent = document.createElement("label");
    consent.className = "checkbox terms-checkbox";
    consent.innerHTML = '<input id="sepaTermsAccepted" name="sepaTermsAccepted" type="checkbox" required /><span>He leído y acepto el mandato y las condiciones de domiciliación SEPA para los cargos de MiConstructor.</span>';
    form.insertBefore(copy, actions);
    form.insertBefore(consent, actions);
  }

  function ensureFooter(config) {
    let footer = document.querySelector("#site-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.id = "site-footer";
      footer.className = "site-footer";
      document.body.append(footer);
    }
    const email = config.contactEmail || "admin@miconstructor.es";
    footer.innerHTML = `<div class="site-footer-grid">
      <section><h3>MiConstructor</h3><p>Marketplace para gestionar reformas, profesionales verificados, contratos, hitos y trazabilidad.</p><p><strong>Contacto:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>${config.contactPhone ? ` · <a href="tel:${escapeHtml(config.contactPhone)}">${escapeHtml(config.contactPhone)}</a>` : ""}</p><p><button class="button" type="button" data-open-support>Chat con soporte</button></p></section>
      <section><h4>Legal</h4><div class="site-footer-links"><a href="/aviso-legal">Aviso legal</a><a href="/privacidad">Privacidad</a><a href="/cookies">Cookies</a><a href="/terminos">Términos y Condiciones</a><a href="/sepa">Condiciones SEPA</a></div></section>
      <section><h4>Ayuda</h4><div class="site-footer-links"><a href="/contacto">Contacto y soporte</a><button class="button" type="button" data-cookie-settings>Configurar cookies</button></div></section>
    </div><div class="site-footer-bottom"><span>© 2026 MiConstructor. Todos los derechos reservados.</span><span>miconstructor.es</span></div>`;
    footer.querySelectorAll("[data-open-support]").forEach((button) => button.addEventListener("click", openSupport));
    footer.querySelectorAll("[data-cookie-settings]").forEach((button) => button.addEventListener("click", () => showCookieBanner(true)));
  }

  function saveCookieConsent(mode) {
    localStorage.setItem(cookieKey, JSON.stringify({ necessary: true, analytics: mode === "all", mode, savedAt: new Date().toISOString(), version: 1 }));
    document.querySelector("#cookie-banner")?.remove();
  }

  function showCookieBanner(force = false) {
    if (!force && localStorage.getItem(cookieKey)) return;
    document.querySelector("#cookie-banner")?.remove();
    const banner = document.createElement("section");
    banner.id = "cookie-banner";
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Preferencias de cookies");
    banner.innerHTML = `<h3>Privacidad y cookies</h3><p>MiConstructor utiliza almacenamiento técnico imprescindible para sesión y seguridad. No cargamos cookies analíticas o publicitarias sin consentimiento. Puedes aceptar o rechazar las no esenciales con la misma facilidad.</p><div class="cookie-actions"><button class="button primary" data-cookie="essential">Rechazar no esenciales</button><button class="button primary" data-cookie="all">Aceptar todas</button><button class="button" data-cookie="details">Configurar</button><a class="button" href="/cookies">Política de cookies</a></div><div class="cookie-settings" hidden><div class="cookie-setting"><span><strong>Necesarias</strong><br><small>Sesión, seguridad y preferencias esenciales.</small></span><input type="checkbox" checked disabled /></div><div class="cookie-setting"><span><strong>Analíticas</strong><br><small>No instaladas actualmente; permanecerán desactivadas salvo consentimiento.</small></span><input id="cookie-analytics" type="checkbox" /></div><div class="cookie-actions"><button class="button primary" data-cookie="save">Guardar selección</button></div></div>`;
    document.body.append(banner);
    banner.querySelector('[data-cookie="essential"]').addEventListener("click", () => saveCookieConsent("essential"));
    banner.querySelector('[data-cookie="all"]').addEventListener("click", () => saveCookieConsent("all"));
    banner.querySelector('[data-cookie="details"]').addEventListener("click", () => { banner.querySelector(".cookie-settings").hidden = false; });
    banner.querySelector('[data-cookie="save"]').addEventListener("click", () => saveCookieConsent(banner.querySelector("#cookie-analytics").checked ? "all" : "essential"));
  }

  function legalIdentity(config) {
    const name = config.legalEntityName || "MiConstructor";
    const email = config.contactEmail || "admin@miconstructor.es";
    const missing = !config.legalIdentityComplete;
    return { name, email, missing };
  }

  function legalPageHtml(path, config) {
    const { name, email, missing } = legalIdentity(config);
    const identity = `<ul><li><strong>Titular:</strong> ${escapeHtml(name)}</li><li><strong>NIF/VAT:</strong> ${escapeHtml(config.legalTaxId || "Pendiente de configuración previa a la apertura comercial")}</li><li><strong>Domicilio:</strong> ${escapeHtml(config.legalAddress || "Pendiente de configuración previa a la apertura comercial")}</li><li><strong>Registro:</strong> ${escapeHtml(config.legalRegistry || "Pendiente de configuración previa a la apertura comercial")}</li><li><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></li></ul>`;
    const pending = missing ? '<p class="legal-notice"><strong>Estado pre-lanzamiento:</strong> faltan datos societarios/fiscales en la configuración del servidor. MiConstructor no debe abrir la contratación comercial hasta completarlos.</p>' : "";
    const pages = {
      "/aviso-legal": `<span class="eyebrow">INFORMACIÓN LEGAL</span><h1>Aviso legal</h1>${pending}<h2>1. Titular del servicio</h2>${identity}<h2>2. Objeto</h2><p>MiConstructor presta una plataforma digital que conecta clientes con profesionales y facilita la gestión documental y operativa de proyectos de construcción y reforma.</p><h2>3. Uso del sitio</h2><p>El usuario debe utilizar el servicio de forma lícita, veraz y respetuosa con terceros. El acceso a determinadas funciones exige cuenta y autenticación.</p><h2>4. Propiedad intelectual</h2><p>La marca, interfaz, software, diseño y contenidos propios de MiConstructor están protegidos por la normativa aplicable. Los contenidos aportados por usuarios permanecen sujetos a los derechos de sus titulares y a las licencias necesarias para prestar el servicio.</p><h2>5. Contacto</h2><p>Para comunicaciones directas: <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a> o el chat de soporte de la plataforma.</p>`,
      "/privacidad": `<span class="eyebrow">RGPD / PROTECCIÓN DE DATOS</span><h1>Política de Privacidad</h1>${pending}<h2>Responsable</h2>${identity}<h2>Datos tratados</h2><p>Datos identificativos y de contacto, información de cuenta, NIF/NIE/CIF, datos profesionales y de verificación, proyectos y propuestas, documentación subida, comunicaciones, datos de facturación y evidencias técnicas necesarias para operar la plataforma.</p><h2>Finalidades y bases jurídicas</h2><ul><li>Crear y administrar la cuenta y ejecutar el servicio solicitado.</li><li>Gestionar proyectos, propuestas, contratos, hitos, verificaciones y soporte.</li><li>Cumplir obligaciones legales, fiscales, de seguridad y prevención del fraude.</li><li>Gestionar pagos y domiciliaciones cuando el usuario los activa.</li></ul><h2>Destinatarios</h2><p>Los datos pueden comunicarse a proveedores estrictamente necesarios para alojamiento, correo, seguridad y pagos, incluido Stripe cuando se active SEPA, así como a autoridades cuando exista obligación legal.</p><h2>Conservación</h2><p>Se conservarán durante la relación contractual y posteriormente durante los plazos necesarios para atender obligaciones legales, responsabilidades, seguridad y defensa de reclamaciones. Los datos no necesarios se eliminarán o anonimizarán cuando corresponda.</p><h2>Derechos</h2><p>Puedes solicitar acceso, rectificación, supresión, limitación, portabilidad u oposición, cuando proceda, escribiendo a <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>. También puedes presentar una reclamación ante la autoridad de protección de datos competente.</p>`,
      "/cookies": `<span class="eyebrow">PRIVACIDAD</span><h1>Política de Cookies</h1><h2>Qué utilizamos actualmente</h2><p>MiConstructor utiliza una cookie de sesión técnica y segura para mantener la autenticación y proteger el acceso a la cuenta. En producción se denomina <code>__Host-miconstructor_session</code>, es HttpOnly y Secure, y su duración máxima es de 30 días.</p><p>También guardamos localmente la preferencia de cookies para no preguntarla en cada visita.</p><h2>Cookies no esenciales</h2><p>No se cargan actualmente herramientas analíticas o publicitarias. Si se incorporan en el futuro, permanecerán bloqueadas hasta que el usuario las acepte. Aceptar y rechazar se ofrecen al mismo nivel.</p><h2>Cambiar preferencias</h2><p>Puedes volver a abrir el gestor desde “Configurar cookies” en el pie de página.</p>`,
      "/terminos": `<span class="eyebrow">CONDICIONES DE USO</span><h1>Términos y Condiciones</h1>${pending}<h2>1. Ámbito</h2><p>Estas condiciones regulan el uso de MiConstructor por clientes, profesionales y empresas. La creación de una cuenta exige aceptación expresa de la versión vigente.</p><h2>2. Función de la plataforma</h2><p>MiConstructor facilita publicación de proyectos, comparación de propuestas, verificación profesional, documentación, contratos, hitos, evidencias y comunicaciones. Las estimaciones automáticas son orientativas y no sustituyen un presupuesto profesional tras inspección.</p><h2>3. Obligaciones de usuarios y profesionales</h2><p>Los datos y documentos aportados deben ser veraces y vigentes. Los profesionales siguen siendo responsables de sus licencias, seguros, obligaciones fiscales, laborales, técnicas y de seguridad, así como de la correcta ejecución de los trabajos contratados.</p><h2>4. Contratación y trazabilidad</h2><p>La aceptación de una propuesta puede generar un contrato y un registro de hitos/evidencias. El usuario debe revisar importes, alcance, exclusiones, materiales, impuestos, plazos y garantías antes de aceptar.</p><h2>5. Verificación, moderación y suspensión</h2><p>MiConstructor puede revisar documentación y contenido, rechazar o suspender verificaciones y limitar cuentas ante fraude, incumplimientos, documentación vencida o saldos pendientes, dejando trazabilidad de las decisiones administrativas.</p><h2>6. Facturación</h2><p>Las funciones sujetas a cobro se facturan conforme al modelo comercial aplicable a la cuenta. Los profesionales que activen domiciliación deben aceptar además las condiciones SEPA.</p><h2>7. Soporte y reclamaciones</h2><p>Las incidencias pueden comunicarse a <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a> o mediante el chat de soporte.</p><h2>8. Normativa aplicable</h2><p>Se respetará la normativa imperativa aplicable según el territorio, la condición del usuario y la identidad jurídica definitiva del titular del servicio. Esta cláusula se concretará con los datos societarios antes de la apertura comercial.</p>`,
      "/sepa": `<span class="eyebrow">PAGOS</span><h1>Mandato y condiciones SEPA</h1><h2>Autorización</h2><p>Al facilitar el IBAN y confirmar la activación, autorizas a ${escapeHtml(name)} y a Stripe, como proveedor de pagos, a enviar a tu entidad bancaria instrucciones para adeudar los importes debidos por los servicios de MiConstructor, y autorizas a tu banco a ejecutar dichos adeudos conforme a esas instrucciones.</p><h2>Cargos y notificación</h2><p>Los cargos pueden agruparse de forma semanal según los servicios generados en la plataforma. El mandato permite notificar futuros adeudos hasta dos días naturales antes de su ejecución, de acuerdo con el flujo SEPA utilizado por Stripe.</p><h2>Derecho de reembolso</h2><p>Para adeudos autorizados bajo SEPA Core, el ordenante dispone normalmente de un plazo de ocho semanas desde el cargo para solicitar el reembolso a su banco, sujeto a las condiciones de su entidad y a las reglas SEPA aplicables.</p><h2>Revocación</h2><p>Puedes solicitar la cancelación del mandato a tu banco o contactar con MiConstructor en <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>. La cancelación impide nuevos cargos bajo ese mandato y puede exigir configurar uno nuevo para seguir utilizando servicios de pago.</p><h2>Registro de aceptación</h2><p>MiConstructor registra la versión y fecha de aceptación de estas condiciones. El mandato técnico y su referencia se gestionan mediante Stripe.</p>`,
      "/contacto": `<span class="eyebrow">SOPORTE</span><h1>Contacto</h1><div class="contact-card-grid"><div class="card"><h2>Email</h2><p><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>${config.contactPhone ? `<p><a href="tel:${escapeHtml(config.contactPhone)}">${escapeHtml(config.contactPhone)}</a></p>` : ""}</div><div class="card"><h2>Chat</h2><p>Los usuarios registrados pueden mantener una conversación persistente con soporte desde el botón de chat.</p><button class="button primary" type="button" data-open-support>Iniciar chat</button></div></div>`,
    };
    return pages[path] || "";
  }

  async function renderLegalIfNeeded() {
    const path = location.pathname;
    if (!legalPaths.has(path)) return;
    const main = document.querySelector("#app");
    if (!main || main.querySelector(".legal-shell")) return;
    const config = await getRuntimeConfig();
    main.innerHTML = `<section class="legal-shell"><div class="card">${legalPageHtml(path, config)}</div><p><a class="button" href="/">← Volver a MiConstructor</a></p></section>`;
    main.querySelectorAll("[data-open-support]").forEach((button) => button.addEventListener("click", openSupport));
  }

  function ensureSupportShell() {
    let launcher = document.querySelector("#support-launcher");
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = "support-launcher";
      launcher.className = "support-launcher";
      launcher.type = "button";
      launcher.textContent = "Chat · Soporte";
      launcher.addEventListener("click", openSupport);
      document.body.append(launcher);
    }
    let panel = document.querySelector("#support-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "support-panel";
      panel.className = "support-panel";
      panel.hidden = true;
      panel.innerHTML = '<header class="support-head"><h3>Soporte MiConstructor</h3><button class="support-close" type="button" aria-label="Cerrar">×</button></header><div id="support-body" class="support-body"></div><div id="support-footer"></div>';
      panel.querySelector(".support-close").addEventListener("click", () => { panel.hidden = true; });
      document.body.append(panel);
    }
    return panel;
  }

  async function openSupport() {
    const panel = ensureSupportShell();
    panel.hidden = false;
    const user = await getCurrentUser(true);
    if (!user) return renderAnonymousSupport();
    if (user.role === "admin") return renderAdminThreads();
    return renderUserSupport();
  }

  async function renderAnonymousSupport() {
    const config = await getRuntimeConfig();
    const body = document.querySelector("#support-body");
    const footer = document.querySelector("#support-footer");
    body.innerHTML = `<div class="support-empty"><strong>Chat para usuarios registrados</strong><p>Inicia sesión para mantener una conversación persistente con soporte. Si todavía no tienes cuenta, también puedes escribir a <a href="mailto:${escapeHtml(config.contactEmail)}">${escapeHtml(config.contactEmail)}</a>.</p><p><a class="button primary" href="/login">Entrar</a></p></div>`;
    footer.innerHTML = "";
  }

  function messageListHtml(messages) {
    if (!messages.length) return '<div class="support-empty">Todavía no hay mensajes. Escribe tu consulta y soporte podrá responderte desde el panel de administración.</div>';
    return messages.map((message) => `<div class="support-message ${message.sender_role === "usuario" ? "user" : "admin"}"><span>${escapeHtml(message.body)}</span><small>${message.sender_role === "usuario" ? "Tú" : "Soporte"} · ${escapeHtml(formatDate(message.created_at))}</small></div>`).join("");
  }

  function supportComposer(onSubmit, label = "Enviar") {
    const footer = document.querySelector("#support-footer");
    footer.innerHTML = `<form class="support-compose"><textarea name="body" maxlength="4000" placeholder="Escribe un mensaje" required></textarea><button class="button primary">${escapeHtml(label)}</button></form>`;
    footer.querySelector("form").addEventListener("submit", onSubmit);
  }

  async function renderUserSupport() {
    const body = document.querySelector("#support-body");
    body.innerHTML = '<div class="support-empty">Cargando conversación…</div>';
    try {
      const result = await api("/api/v1/support/messages");
      body.innerHTML = messageListHtml(result.messages || []);
      body.scrollTop = body.scrollHeight;
      supportComposer(async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = String(form.get("body") || "").trim();
        if (!text) return;
        await api("/api/v1/support/messages", { method: "POST", body: JSON.stringify({ body: text }) });
        event.currentTarget.reset();
        await renderUserSupport();
      });
    } catch (error) {
      body.innerHTML = `<div class="support-empty">${escapeHtml(error.message)}</div>`;
      document.querySelector("#support-footer").innerHTML = "";
    }
  }

  async function renderAdminThreads() {
    supportUserId = null;
    const body = document.querySelector("#support-body");
    document.querySelector("#support-footer").innerHTML = "";
    body.innerHTML = '<div class="support-empty">Cargando bandeja…</div>';
    try {
      const result = await api("/api/v1/support/admin/threads");
      const threads = result.threads || [];
      body.innerHTML = threads.length ? `<div class="support-threads">${threads.map((thread) => `<button class="support-thread" type="button" data-thread-user="${escapeHtml(thread.user_id)}"><strong>${escapeHtml(thread.name)}${Number(thread.unread_count) ? ` · ${Number(thread.unread_count)} nuevo(s)` : ""}</strong><span>${escapeHtml(thread.email)} · ${escapeHtml(thread.last_message || "")}</span></button>`).join("")}</div>` : '<div class="support-empty">No hay conversaciones de soporte todavía.</div>';
      body.querySelectorAll("[data-thread-user]").forEach((button) => button.addEventListener("click", () => renderAdminConversation(button.dataset.threadUser)));
    } catch (error) { body.innerHTML = `<div class="support-empty">${escapeHtml(error.message)}</div>`; }
  }

  async function renderAdminConversation(userId) {
    supportUserId = userId;
    const body = document.querySelector("#support-body");
    try {
      const result = await api(`/api/v1/support/admin/threads/${encodeURIComponent(userId)}/messages`);
      body.innerHTML = `<button class="button" type="button" data-back-threads>← Conversaciones</button><p><strong>${escapeHtml(result.user.name)}</strong><br><span class="muted">${escapeHtml(result.user.email)}</span></p>${messageListHtml(result.messages || [])}`;
      body.querySelector("[data-back-threads]").addEventListener("click", renderAdminThreads);
      body.scrollTop = body.scrollHeight;
      supportComposer(async (event) => {
        event.preventDefault();
        const text = String(new FormData(event.currentTarget).get("body") || "").trim();
        if (!text || !supportUserId) return;
        await api(`/api/v1/support/admin/threads/${encodeURIComponent(supportUserId)}/messages`, { method: "POST", body: JSON.stringify({ body: text }) });
        event.currentTarget.reset();
        await renderAdminConversation(supportUserId);
      }, "Responder");
    } catch (error) { body.innerHTML = `<div class="support-empty">${escapeHtml(error.message)}</div>`; }
  }

  async function init() {
    const config = await getRuntimeConfig();
    ensureFooter(config);
    ensureSupportShell();
    showCookieBanner(false);
    injectRegistrationLegal();
    injectSepaLegal();
    await renderLegalIfNeeded();

    const observer = new MutationObserver(() => {
      injectRegistrationLegal();
      injectSepaLegal();
      if (legalPaths.has(location.pathname) && !document.querySelector("#app .legal-shell")) void renderLegalIfNeeded();
    });
    observer.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init());
  else void init();
})();
