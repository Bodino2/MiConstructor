const appRoot = document.querySelector("#app");
const toast = document.querySelector("#toast");

function escapeVerificationHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function verificationNotice(message, error = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast${error ? " error" : ""}`;
  toast.hidden = false;
  clearTimeout(verificationNotice.timer);
  verificationNotice.timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

async function verificationApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
  return payload;
}

function documentTypeLabel(type) {
  return type === "IDENTIDAD" ? "Identidad / NIF" : "Situación fiscal / alta profesional";
}

function documentStatusClass(status) {
  if (status === "APROBADO") return "status";
  if (status === "RECHAZADO") return "status danger";
  return "status warn";
}

async function renderProfessionalVerificationStatus(card) {
  const slot = card.querySelector("[data-verification-status]");
  if (!slot) return;
  try {
    const result = await verificationApi("/api/v1/professionals/verification-documents");
    const documents = result.documents || [];
    if (!documents.length) {
      slot.innerHTML = `<div class="notice"><strong>Documentación pendiente</strong><br />Sube ambos documentos para que el equipo pueda verificar tu cuenta.</div>`;
      return;
    }
    slot.innerHTML = `<div class="list">${documents.map((document) => `
      <div class="metric">
        <span><strong>${escapeVerificationHtml(documentTypeLabel(document.document_type))}</strong><br /><small>${escapeVerificationHtml(document.original_name)}</small>${document.review_reason ? `<br /><small>${escapeVerificationHtml(document.review_reason)}</small>` : ""}</span>
        <strong><span class="${documentStatusClass(document.status)}">${escapeVerificationHtml(document.status)}</span> <a class="button" href="/api/v1/files/${encodeURIComponent(document.file_id)}" target="_blank" rel="noopener">Ver</a></strong>
      </div>`).join("")}</div>`;
  } catch (error) {
    slot.innerHTML = `<div class="notice">${escapeVerificationHtml(error.message)}</div>`;
  }
}

function enhanceProfessionalVerification() {
  const portfolioForm = document.querySelector("#portfolio-form");
  if (!portfolioForm || document.querySelector("#professional-verification-card")) return;

  const card = document.createElement("section");
  card.className = "card";
  card.id = "professional-verification-card";
  card.innerHTML = `
    <header>
      <span class="eyebrow">VERIFICACIÓN OBLIGATORIA</span>
      <h3>Identidad y situación profesional</h3>
      <p>Para quedar aprobado no basta con superar el test técnico. También verificamos tu identidad/NIF y tu alta fiscal o profesional.</p>
    </header>
    <div data-verification-status><div class="loading">Cargando documentación…</div></div>
    <form id="professional-verification-form" enctype="multipart/form-data">
      <div class="form-grid">
        <label>Documento de identidad / NIF
          <input name="identity" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
          <small>DNI, NIE, NIF/CIF o documento equivalente que permita validar la identidad declarada.</small>
        </label>
        <label>Alta fiscal / profesional
          <input name="taxStatus" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
          <small>Alta de autónomo, certificado censal o documento registral de la empresa/profesional.</small>
        </label>
        <div class="form-actions"><button class="button primary">Enviar documentación →</button></div>
      </div>
    </form>`;
  portfolioForm.parentElement?.insertBefore(card, portfolioForm);
  void renderProfessionalVerificationStatus(card);

  card.querySelector("#professional-verification-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    if (button) button.disabled = true;
    try {
      await verificationApi("/api/v1/professionals/verification-documents", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      verificationNotice("Documentación enviada a revisión.");
      event.currentTarget.reset();
      await renderProfessionalVerificationStatus(card);
    } catch (error) {
      verificationNotice(error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

async function renderAdminVerificationDocuments(card) {
  const slot = card.querySelector("[data-admin-verification-list]");
  if (!slot) return;
  try {
    const result = await verificationApi("/api/v1/admin/verification-documents");
    const documents = result.documents || [];
    if (!documents.length) {
      slot.innerHTML = `<div class="empty">No hay documentos profesionales pendientes.</div>`;
      return;
    }
    slot.innerHTML = documents.map((document) => `
      <article class="list-item" data-verification-document="${escapeVerificationHtml(document.id)}">
        <span class="eyebrow">${escapeVerificationHtml(documentTypeLabel(document.document_type))}</span>
        <h3>${escapeVerificationHtml(document.company_name || document.name)}</h3>
        <p>${escapeVerificationHtml(document.email)} · ${escapeVerificationHtml(document.tax_id)}</p>
        <p><a class="button" href="/api/v1/files/${encodeURIComponent(document.file_id)}" target="_blank" rel="noopener">Abrir ${escapeVerificationHtml(document.original_name)} →</a></p>
        <label>Motivo / nota de revisión<input data-verification-reason="${escapeVerificationHtml(document.id)}" /></label>
        <footer>
          <button class="button" data-verification-decision="RECHAZAR" data-id="${escapeVerificationHtml(document.id)}">Rechazar</button>
          <button class="button primary" data-verification-decision="APROBAR" data-id="${escapeVerificationHtml(document.id)}">Aprobar</button>
        </footer>
      </article>`).join("");

    slot.querySelectorAll("[data-verification-decision]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const decision = button.dataset.verificationDecision;
      const input = slot.querySelector(`[data-verification-reason="${CSS.escape(id)}"]`);
      const reason = input?.value.trim() || (decision === "APROBAR" ? "Documento revisado y conforme." : "Documento no conforme; debe sustituirse.");
      button.disabled = true;
      try {
        await verificationApi(`/api/v1/admin/verification-documents/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          body: JSON.stringify({ decision, reason }),
        });
        verificationNotice("Revisión documental guardada.");
        await renderAdminVerificationDocuments(card);
      } catch (error) {
        verificationNotice(error.message, true);
        button.disabled = false;
      }
    }));
  } catch (error) {
    slot.innerHTML = `<div class="notice">${escapeVerificationHtml(error.message)}</div>`;
  }
}

function enhanceAdminVerification() {
  const heading = [...document.querySelectorAll(".dashboard-head h2")]
    .find((element) => element.textContent?.trim() === "Cola de verificación");
  if (!heading || document.querySelector("#admin-professional-verification-card")) return;
  const dashboard = heading.closest(".dashboard");
  const list = dashboard?.querySelector(".dashboard-grid > .list");
  if (!list) return;

  const card = document.createElement("section");
  card.className = "card";
  card.id = "admin-professional-verification-card";
  card.innerHTML = `
    <header><span class="eyebrow">DOCUMENTACIÓN OBLIGATORIA</span><h3>Identidad y situación profesional</h3><p>La cuenta solo queda aprobada cuando coinciden test técnico aprobado y ambos documentos aprobados.</p></header>
    <div class="list" data-admin-verification-list><div class="loading">Cargando documentos…</div></div>`;
  list.prepend(card);
  void renderAdminVerificationDocuments(card);
}

function enhanceVerificationUi() {
  enhanceProfessionalVerification();
  enhanceAdminVerification();
}

if (appRoot) {
  new MutationObserver(enhanceVerificationUi).observe(appRoot, { childList: true, subtree: true });
}
enhanceVerificationUi();