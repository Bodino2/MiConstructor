(() => {
  const app = document.querySelector("#app");
  if (!app) return;

  let selectedProjectId = null;
  let enhancing = false;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set("content-type", "application/json");
    const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
    return payload;
  }

  app.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-project]");
    if (button?.dataset.project) selectedProjectId = button.dataset.project;
  }, true);

  function existingReviewHtml(review) {
    const publicText = review.publication_consent
      ? "Has autorizado la publicación de esta opinión verificada."
      : "Esta reseña se mantiene privada.";
    return `<section class="card verified-review-panel" data-verified-review-panel>
      <span class="eyebrow">RESEÑA REGISTRADA</span>
      <h3>${"★".repeat(Number(review.rating || 0))}</h3>
      <p>${escapeHtml(review.comment)}</p>
      <div class="notice"><strong>${escapeHtml(review.status)}</strong><br />${publicText}${review.public_price_consent ? " También has autorizado mostrar el precio final acordado." : ""}</div>
    </section>`;
  }

  function reviewFormHtml(project) {
    return `<section class="card verified-review-panel" data-verified-review-panel>
      <span class="eyebrow">OPINIÓN VERIFICADA</span>
      <h3>Valora el trabajo finalizado</h3>
      <p>Esta reseña queda vinculada al contrato y al proyecto finalizado. Puedes mantenerla privada o autorizar su publicación.</p>
      <form id="verified-review-form" class="form-grid">
        <label>Valoración<select name="rating" required><option value="5">5 · Excelente</option><option value="4">4 · Muy buena</option><option value="3">3 · Correcta</option><option value="2">2 · Mejorable</option><option value="1">1 · Mala</option></select></label>
        <label class="full">Tu experiencia<textarea name="comment" required minlength="10" maxlength="3000" placeholder="Calidad, comunicación, plazos, limpieza, resultado final…"></textarea></label>
        <label class="checkbox full review-consent"><input type="checkbox" name="publicationConsent" /><span>Autorizo a MiConstructor a publicar esta reseña como <strong>Opinión verificada</strong>, sin mostrar mi nombre completo ni datos privados.</span></label>
        <label class="checkbox full review-consent"><input type="checkbox" name="publicPriceConsent" disabled /><span>También autorizo mostrar el precio final acordado del proyecto. Esta opción es independiente y puede quedar desmarcada.</span></label>
        <div class="notice full">La localidad pública procede de la zona del proyecto, no de la dirección exacta de la vivienda. El precio solo se muestra si das permiso expreso.</div>
        <div id="verified-review-error" class="notice error full" hidden></div>
        <div class="form-actions full"><button class="button primary">Guardar reseña →</button></div>
      </form>
    </section>`;
  }

  async function enhanceProjectDetail() {
    if (enhancing || location.pathname !== "/panel" || !selectedProjectId) return;
    const content = document.querySelector("#client-content");
    if (!content || !content.querySelector("#back-projects") || content.querySelector("[data-verified-review-panel]")) return;
    enhancing = true;
    try {
      const projectResult = await api(`/api/v1/projects/${selectedProjectId}`);
      const project = projectResult.project;
      if (project?.status !== "FINALIZADO") return;
      const reviewResult = await api(`/api/v1/projects/${selectedProjectId}/review/me`);
      const hostCards = content.querySelectorAll(":scope > .card");
      const anchor = hostCards[0] || content.firstElementChild;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = reviewResult.review ? existingReviewHtml(reviewResult.review) : reviewFormHtml(project);
      const panel = wrapper.firstElementChild;
      if (anchor?.after) anchor.after(panel);
      else content.append(panel);

      const form = panel?.querySelector("#verified-review-form");
      if (!form) return;
      const publish = form.elements.publicationConsent;
      const price = form.elements.publicPriceConsent;
      publish.addEventListener("change", () => {
        price.disabled = !publish.checked;
        if (!publish.checked) price.checked = false;
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const submit = form.querySelector("button.primary");
        const errorBox = form.querySelector("#verified-review-error");
        if (submit) { submit.disabled = true; submit.textContent = "Guardando…"; }
        if (errorBox) errorBox.hidden = true;
        try {
          const result = await api(`/api/v1/projects/${selectedProjectId}/public-review`, {
            method: "POST",
            body: JSON.stringify({
              rating: Number(data.get("rating")),
              comment: String(data.get("comment") || ""),
              publicationConsent: data.get("publicationConsent") === "on",
              publicPriceConsent: data.get("publicPriceConsent") === "on",
            }),
          });
          panel.outerHTML = existingReviewHtml({
            rating: Number(data.get("rating")),
            comment: String(data.get("comment") || ""),
            status: result.status,
            publication_consent: result.publicationConsent,
            public_price_consent: result.publicPriceConsent,
          });
        } catch (error) {
          if (errorBox) { errorBox.textContent = error.message; errorBox.hidden = false; }
          if (submit) { submit.disabled = false; submit.textContent = "Guardar reseña →"; }
        }
      });
    } catch {
      // The base panel may still be rendering or the user may have navigated away.
    } finally {
      enhancing = false;
    }
  }

  new MutationObserver(() => void enhanceProjectDetail()).observe(app, { childList: true, subtree: true });
  void enhanceProjectDetail();
})();