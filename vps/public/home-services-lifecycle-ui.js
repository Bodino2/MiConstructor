const hsLifecycleApp = document.querySelector("#app");
const hsLifecycleToast = document.querySelector("#toast");

const hslEscape = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const hslMoney = (cents) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);

async function hslApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
  return payload;
}

function hslNotify(message, error = false) {
  if (!hsLifecycleToast) return;
  hsLifecycleToast.textContent = message;
  hsLifecycleToast.className = `toast${error ? " error" : ""}`;
  hsLifecycleToast.hidden = false;
  window.setTimeout(() => { hsLifecycleToast.hidden = true; }, 4500);
}

function hardenRequestPrivacyCopy() {
  const locationInput = document.querySelector('#hs-request-form input[name="location"]');
  if (locationInput) {
    locationInput.placeholder = "Linares, Jaén · zona/localidad, no dirección exacta";
    const label = locationInput.closest("label");
    if (label && !label.querySelector(".hs-public-field-note")) {
      const note = document.createElement("small");
      note.className = "hs-public-field-note";
      note.textContent = "Esta zona es visible para profesionales antes de contratar. La dirección exacta no debe escribirse aquí.";
      locationInput.insertAdjacentElement("afterend", note);
    }
  }
  const notes = document.querySelector('#hs-request-form textarea[name="notes"]');
  if (notes) notes.placeholder = "Describe tareas y prioridades. No incluyas teléfono, email, dirección exacta, llaves ni códigos de acceso.";
}

function privateDetailsForm(requestId) {
  const wrapper = document.createElement("div");
  wrapper.className = "hsl-private-details-form";
  wrapper.dataset.hslPrivateForm = requestId;
  wrapper.innerHTML = `<strong>Datos privados para ejecutar el servicio</strong><p>La dirección exacta y el acceso no se muestran a profesionales antes de contratar.</p><div class="hsl-private-grid"><label>Dirección exacta<input data-hsl-address="${hslEscape(requestId)}" maxlength="300" autocomplete="street-address" placeholder="Calle, número, piso/puerta" /></label><label>Acceso (opcional)<input data-hsl-access="${hslEscape(requestId)}" maxlength="1000" placeholder="Portería, indicaciones de llegada; evita contraseñas permanentes" /></label><button class="button" type="button" data-hsl-save-private="${hslEscape(requestId)}">Guardar datos privados</button></div>`;
  wrapper.querySelector("[data-hsl-save-private]")?.addEventListener("click", async (event) => {
    const id = event.currentTarget.dataset.hslSavePrivate;
    const serviceAddress = wrapper.querySelector(`[data-hsl-address="${CSS.escape(id)}"]`)?.value.trim();
    const accessNotes = wrapper.querySelector(`[data-hsl-access="${CSS.escape(id)}"]`)?.value.trim() || "";
    if (!serviceAddress || serviceAddress.length < 5) return hslNotify("Indica la dirección exacta antes de contratar.", true);
    try {
      await hslApi(`/api/v1/home-services/requests/${encodeURIComponent(id)}/private-details`, { method: "PUT", body: JSON.stringify({ serviceAddress, accessNotes }) });
      hslNotify("Dirección privada guardada.");
      wrapper.classList.add("hsl-private-saved");
      const strong = wrapper.querySelector("strong");
      if (strong) strong.textContent = "✓ Datos privados guardados";
    } catch (error) { hslNotify(error.message, true); }
  });
  return wrapper;
}

async function addClientWithdrawal() {
  const me = await hslApi("/api/v1/auth/me").catch(() => ({ user: null }));
  if (me.user?.role !== "cliente") return;
  document.querySelectorAll("[data-hs-offers]").forEach((offersButton) => {
    const requestId = offersButton.dataset.hsOffers;
    if (!offersButton.parentElement?.querySelector(`[data-hsl-private-form="${CSS.escape(requestId)}"]`)) {
      offersButton.insertAdjacentElement("beforebegin", privateDetailsForm(requestId));
    }
    if (offersButton.parentElement?.querySelector("[data-hsl-cancel-request]")) return;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button danger-button";
    cancel.dataset.hslCancelRequest = requestId;
    cancel.textContent = "Retirar solicitud";
    offersButton.insertAdjacentElement("afterend", cancel);
    cancel.addEventListener("click", async () => {
      try {
        await hslApi(`/api/v1/home-services/requests/${encodeURIComponent(cancel.dataset.hslCancelRequest)}/cancel`, { method: "POST" });
        hslNotify("Solicitud retirada.");
        window.setTimeout(() => window.location.reload(), 300);
      } catch (error) { hslNotify(error.message, true); }
    });
  });
}

async function addPrivateExecutionDetails() {
  const shell = document.querySelector(".hs-shell");
  if (!shell || shell.querySelector("#hsl-private-execution")) return;
  const me = await hslApi("/api/v1/auth/me").catch(() => ({ user: null }));
  if (!me.user) return;
  try {
    const result = await hslApi("/api/v1/home-services/engagements/private-details");
    const visible = (result.privateDetails || []).filter((item) => item.serviceAddress && !["CANCELADO"].includes(item.status));
    if (!visible.length) return;
    const section = document.createElement("section");
    section.className = "hs-section";
    section.id = "hsl-private-execution";
    section.innerHTML = `<div class="hs-section-head"><h2>Detalles privados de ejecución</h2></div><div class="hs-requests">${visible.map((item) => `<article class="card hs-request-item hsl-private-card"><div class="hs-engagement-head"><div><span class="eyebrow">ACCESO PRIVADO</span><h3>${hslEscape(item.zone)}</h3></div><span class="hs-status">${hslEscape(item.status)}</span></div><p><strong>Dirección:</strong> ${hslEscape(item.serviceAddress)}</p>${item.accessNotes ? `<p><strong>Indicaciones:</strong> ${hslEscape(item.accessNotes)}</p>` : ""}<small>Visible únicamente para las partes asignadas y administración.</small></article>`).join("")}</div>`;
    shell.append(section);
  } catch (error) { hslNotify(error.message, true); }
}

async function addProfessionalOffers() {
  const me = await hslApi("/api/v1/auth/me").catch(() => ({ user: null }));
  if (me.user?.role !== "profesional") return;
  const shell = document.querySelector(".hs-shell");
  if (!shell || shell.querySelector("#hsl-my-offers")) return;
  try {
    const result = await hslApi("/api/v1/home-services/my-offers");
    const section = document.createElement("section");
    section.className = "hs-section";
    section.id = "hsl-my-offers";
    section.innerHTML = `<div class="hs-section-head"><h2>Tus ofertas enviadas</h2></div>${result.offers.length ? `<div class="hs-requests">${result.offers.map((offer) => `<article class="card hs-request-item"><div class="hs-engagement-head"><div><span class="eyebrow">${hslEscape(offer.service_slug)}</span><h3>${hslEscape(offer.location)}</h3></div><span class="hs-status">${hslEscape(offer.status)}</span></div><div class="hs-engagement-meta"><span><strong>${hslMoney(offer.amount_cents_per_visit)}</strong> / visita</span><span>${hslEscape(offer.frequency)}</span><span>Solicitud: ${hslEscape(offer.request_status)}</span></div><p>${hslEscape(offer.message)}</p>${offer.status === "ENVIADA" && offer.request_status === "PUBLICADO" ? `<button class="button danger-button" type="button" data-hsl-withdraw-offer="${hslEscape(offer.id)}">Retirar oferta</button>` : ""}</article>`).join("")}</div>` : '<div class="empty">Todavía no has enviado ofertas de limpieza o jardín.</div>'}`;
    shell.append(section);
    section.querySelectorAll("[data-hsl-withdraw-offer]").forEach((button) => button.addEventListener("click", async () => {
      try {
        await hslApi(`/api/v1/home-services/offers/${encodeURIComponent(button.dataset.hslWithdrawOffer)}/withdraw`, { method: "POST" });
        hslNotify("Oferta retirada.");
        section.remove();
        await addProfessionalOffers();
      } catch (error) { hslNotify(error.message, true); }
    }));
  } catch (error) { hslNotify(error.message, true); }
}

async function enhanceHomeServicesLifecycle() {
  if (location.pathname !== "/servicios-hogar") return;
  hardenRequestPrivacyCopy();
  await Promise.all([addClientWithdrawal(), addProfessionalOffers(), addPrivateExecutionDetails()]);
}

const hslObserver = new MutationObserver(() => {
  if (location.pathname === "/servicios-hogar") window.setTimeout(() => void enhanceHomeServicesLifecycle(), 0);
});
if (hsLifecycleApp) hslObserver.observe(hsLifecycleApp, { childList: true, subtree: false });
window.addEventListener("popstate", () => window.setTimeout(() => void enhanceHomeServicesLifecycle(), 0));
window.setTimeout(() => void enhanceHomeServicesLifecycle(), 250);
