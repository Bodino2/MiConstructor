(() => {
  const params = new URLSearchParams(window.location.search);
  const province = (params.get("provincia") || "").trim();
  const locality = (params.get("localidad") || "").trim();
  const radiusKm = Number(params.get("radioKm") || 50);
  if (!province || locality.length < 2 || !Number.isInteger(radiusKm) || radiusKm < 5 || radiusKm > 200) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);

  function hiddenInput(name, value) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    input.dataset.marketingServiceArea = "true";
    return input;
  }

  function applyArea() {
    const form = document.querySelector('#register-form[data-registration-portal="cliente"], #register-form[data-registration-portal="profesional"]');
    if (!form || form.dataset.marketingAreaBound === "true") return;
    form.dataset.marketingAreaBound = "true";
    form.append(
      hiddenInput("serviceProvince", province),
      hiddenInput("serviceLocality", locality),
      hiddenInput("serviceRadiusKm", radiusKm),
    );

    const professional = form.dataset.registrationPortal === "profesional";
    const summary = document.createElement("div");
    summary.className = "notice full marketing-registration-area-summary";
    summary.innerHTML = `<strong>${professional ? "Zona de trabajo" : "Zona del proyecto"}</strong><br />${escapeHtml(locality)}, ${escapeHtml(province)} · <strong>+${radiusKm} km</strong>`;
    const grid = form.querySelector(".form-grid");
    if (grid) grid.prepend(summary);
  }

  applyArea();
  const observer = new MutationObserver(() => applyArea());
  const root = document.querySelector("#app") || document.body;
  observer.observe(root, { childList: true, subtree: true });
})();
