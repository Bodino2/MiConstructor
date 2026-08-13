(() => {
  const provinces = [
    "A Coruña", "Araba/Álava", "Albacete", "Alicante/Alacant", "Almería", "Asturias", "Ávila",
    "Badajoz", "Barcelona", "Bizkaia", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón/Castelló",
    "Ceuta", "Ciudad Real", "Córdoba", "Cuenca", "Girona", "Granada", "Guadalajara", "Gipuzkoa", "Huelva",
    "Huesca", "Illes Balears", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga",
    "Melilla", "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife",
    "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia/València", "Valladolid", "Zamora", "Zaragoza",
  ];
  const radiusOptions = [10, 25, 50, 75, 100, 150];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);
  const provinceOptions = (selected = "") => provinces.map((province) =>
    `<option value="${escapeHtml(province)}"${province === selected ? " selected" : ""}>${escapeHtml(province)}</option>`).join("");
  const radiusSelectOptions = (selected = 50) => radiusOptions.map((radius) =>
    `<option value="${radius}"${Number(selected) === radius ? " selected" : ""}>+${radius} km</option>`).join("");

  async function json(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set("content-type", "application/json");
    const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
    return payload;
  }

  let cachedArea = null;
  let cachedUser = null;
  async function accountContext() {
    if (cachedArea && cachedUser) return { area: cachedArea, user: cachedUser };
    const [areaResult, userResult] = await Promise.all([
      json("/api/v1/users/me/service-area"),
      json("/api/v1/auth/me"),
    ]);
    cachedArea = areaResult.area;
    cachedUser = userResult.user;
    return { area: cachedArea, user: cachedUser };
  }

  async function enhanceProjectForm() {
    const form = document.querySelector("#project-form");
    if (!form || form.dataset.projectAreaEnhanced === "true") return;
    const locationInput = form.querySelector('input[name="location"]');
    if (!locationInput) return;
    form.dataset.projectAreaEnhanced = "true";
    const originalLabel = locationInput.closest("label");
    let defaults = { province: "", locality: "", radiusKm: 50 };
    try { defaults = (await accountContext()).area || defaults; } catch { /* account may be transitioning */ }

    const wrapper = document.createElement("div");
    wrapper.className = "project-area-fields full";
    wrapper.innerHTML = `
      <div class="project-area-heading">
        <strong>Ubicación de esta obra</strong>
        <span>Puede ser distinta de tu localidad habitual.</span>
      </div>
      <div class="project-area-grid">
        <label>Provincia
          <select name="serviceProvince" required>
            <option value="">Selecciona provincia</option>${provinceOptions(defaults.province || "")}
          </select>
        </label>
        <label>Localidad
          <input name="serviceLocality" required minlength="2" maxlength="100" value="${escapeHtml(defaults.locality || "")}" placeholder="Ej. Linares" />
        </label>
        <label>Radio para buscar profesionales
          <select name="searchRadiusKm" required>${radiusSelectOptions(defaults.radiusKm || 50)}</select>
        </label>
      </div>
      <p class="project-area-help">El radio se aplica a este proyecto. No cambia la zona guardada en tu perfil.</p>
      <p class="project-area-error" role="alert" hidden>Indica provincia y localidad del proyecto.</p>`;
    originalLabel?.replaceWith(wrapper);
    const hiddenLocation = document.createElement("input");
    hiddenLocation.type = "hidden";
    hiddenLocation.name = "location";
    form.append(hiddenLocation);

    const syncLocation = () => {
      const province = form.elements.serviceProvince?.value?.trim() || "";
      const locality = form.elements.serviceLocality?.value?.trim() || "";
      hiddenLocation.value = province && locality ? `${locality}, ${province}` : locality;
    };
    form.elements.serviceProvince?.addEventListener("change", syncLocation);
    form.elements.serviceLocality?.addEventListener("input", syncLocation);
    syncLocation();

    form.addEventListener("submit", (event) => {
      syncLocation();
      const valid = form.elements.serviceProvince?.value && String(form.elements.serviceLocality?.value || "").trim().length >= 2;
      const error = form.querySelector(".project-area-error");
      if (error) error.hidden = Boolean(valid);
      if (!valid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        form.elements.serviceProvince?.focus();
      }
    }, true);
  }

  function closeAreaDialog() {
    document.querySelector("#service-area-dialog")?.remove();
  }

  async function openAreaDialog() {
    closeAreaDialog();
    const { area, user } = await accountContext();
    const professional = user.role === "profesional";
    const dialog = document.createElement("div");
    dialog.id = "service-area-dialog";
    dialog.className = "service-area-dialog";
    dialog.innerHTML = `<div class="service-area-backdrop" data-close-area></div>
      <section class="service-area-card" role="dialog" aria-modal="true" aria-labelledby="service-area-title">
        <button class="service-area-close" type="button" data-close-area aria-label="Cerrar">×</button>
        <span class="eyebrow">${professional ? "ZONA DE TRABAJO" : "ZONA BASE"}</span>
        <h2 id="service-area-title">${professional ? "¿Hasta dónde quieres recibir proyectos?" : "Tu zona habitual"}</h2>
        <p>${professional ? "Esta zona controla las oportunidades que aparecen en tu panel." : "La usamos como valor inicial. Cada proyecto puede tener otra localidad y otro radio."}</p>
        <form id="service-area-form" class="form-grid">
          <label>Provincia<select name="province" required><option value="">Selecciona provincia</option>${provinceOptions(area?.province || "")}</select></label>
          <label>Localidad<input name="locality" required minlength="2" maxlength="100" value="${escapeHtml(area?.locality || "")}" /></label>
          <label class="full">${professional ? "Radio de trabajo" : "Radio por defecto"}<select name="radiusKm" required>${radiusSelectOptions(area?.radiusKm || 50)}</select></label>
          <div class="notice full">Ejemplo: <strong>${escapeHtml(area?.locality || "Linares")} +${Number(area?.radiusKm || 50)} km</strong>. La plataforma valida la localidad antes de guardarla.</div>
          <div class="form-actions full"><button type="button" class="button" data-close-area>Cancelar</button><button class="button primary">Guardar zona →</button></div>
        </form>
      </section>`;
    document.body.append(dialog);
    dialog.querySelectorAll("[data-close-area]").forEach((button) => button.addEventListener("click", closeAreaDialog));
    dialog.querySelector("#service-area-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const submit = event.currentTarget.querySelector('button[type="submit"], button.primary');
      if (submit) { submit.disabled = true; submit.textContent = "Validando localidad…"; }
      try {
        const result = await json("/api/v1/users/me/service-area", {
          method: "PUT",
          body: JSON.stringify({
            province: form.get("province"), locality: form.get("locality"), radiusKm: Number(form.get("radiusKm")),
          }),
        });
        cachedArea = result.area;
        closeAreaDialog();
        window.location.reload();
      } catch (error) {
        const notice = event.currentTarget.querySelector(".notice");
        if (notice) { notice.classList.add("error"); notice.textContent = error.message; }
        if (submit) { submit.disabled = false; submit.textContent = "Guardar zona →"; }
      }
    });
  }

  async function enhanceProfileArea() {
    if (window.location.pathname !== "/panel") return;
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar || sidebar.querySelector("[data-edit-service-area]")) return;
    try {
      const { area, user } = await accountContext();
      const professional = user.role === "profesional";
      const box = document.createElement("div");
      box.className = "profile-area-summary";
      box.innerHTML = `<span>${professional ? "Zona de trabajo" : "Zona base"}</span>
        <strong>${area?.locality ? `${escapeHtml(area.locality)}, ${escapeHtml(area.province)} · +${Number(area.radiusKm || 50)} km` : "Sin configurar"}</strong>
        <button type="button" class="button" data-edit-service-area>Editar zona y radio</button>`;
      sidebar.append(box);
      box.querySelector("[data-edit-service-area]")?.addEventListener("click", () => void openAreaDialog());
    } catch { /* login/panel rendering can still be in progress */ }
  }

  const observer = new MutationObserver(() => {
    void enhanceProjectForm();
    void enhanceProfileArea();
  });
  observer.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
  void enhanceProjectForm();
  void enhanceProfileArea();
})();
