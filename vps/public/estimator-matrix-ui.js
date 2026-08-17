const MC_ESTIMATOR_DISCLAIMER = "Rango orientativo calculado por la plataforma. El precio final lo determina el presupuesto profesional.";
const MC_ESTIMATOR_PROJECT_TYPES = [
  ["reforma_integral", "Reforma integral"],
  ["bano", "Reforma de baño"],
  ["cocina", "Reforma de cocina"],
  ["reforma_parcial", "Reforma parcial / salón / dormitorio"],
  ["fachadas_exteriores", "Fachadas y exteriores"],
];
const MC_ESTIMATOR_HOME_SERVICES = new Set([
  "limpieza_hogar",
  "limpieza_profunda",
  "limpieza_fin_obra",
  "limpieza_mudanza",
  "limpieza_cristales",
  "limpieza_comunidades",
  "limpieza_alojamiento_turistico",
  "jardineria_mantenimiento",
  "poda",
  "cesped",
  "riego",
  "limpieza_terreno",
  "mantenimiento_piscina",
]);
const MC_ESTIMATOR_CURRENCY = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const mcEstimatorResults = new WeakMap();
const mcEstimatorNativeFetch = window.fetch.bind(window);

function mcEstimatorFormForService(serviceSlug) {
  return [...document.querySelectorAll("form")].find((form) => form.elements?.serviceSlug?.value === serviceSlug) || null;
}

function mcEstimatorServiceContext(form) {
  let frequency = String(form?.elements?.frequency?.value || "PUNTUAL");
  const bnbMode = form?.querySelector("[data-mc-bnb-mode]")?.value || "";
  const seasonal = frequency === "__TEMPORADA__" || bnbMode === "TEMPORADA";
  if (seasonal) {
    frequency = String(form?.querySelector("[data-mc-season-cadence]")?.value || "MENSUAL");
  }
  return { frequency, seasonal };
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url || "";
  const method = String(init.method || "GET").toUpperCase();
  let next = init;
  let form = null;
  let serviceSlug = "";

  if (url.includes("/api/v1/estimate") && method === "POST" && typeof init.body === "string") {
    try {
      const payload = JSON.parse(init.body);
      serviceSlug = String(payload.serviceSlug || "");
      if (MC_ESTIMATOR_HOME_SERVICES.has(serviceSlug)) {
        form = mcEstimatorFormForService(serviceSlug);
        const context = mcEstimatorServiceContext(form);
        payload.frequency = context.frequency;
        payload.seasonal = context.seasonal;
        next = { ...init, body: JSON.stringify(payload) };
      }
    } catch { /* estimator endpoint validates the original payload */ }
  }

  const response = await mcEstimatorNativeFetch(input, next);
  if (form && serviceSlug && response.ok) {
    response.clone().json().then((estimate) => {
      if (estimate?.valid) {
        mcEstimatorResults.set(form, estimate);
        window.setTimeout(() => mcEstimatorPresentResults(form), 0);
      }
    }).catch(() => null);
  }
  return response;
};

function mcEstimatorNormalizeProjectSelect(select) {
  if (!select || select.dataset.mcOfficialMatrix === "true") return;
  const previous = String(select.value || "reforma_integral");
  select.innerHTML = MC_ESTIMATOR_PROJECT_TYPES
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  select.value = MC_ESTIMATOR_PROJECT_TYPES.some(([value]) => value === previous) ? previous : "reforma_integral";
  select.dataset.mcOfficialMatrix = "true";
}

function mcEstimatorNormalizeQuality(select) {
  if (!select || select.dataset.mcOfficialMatrix === "true") return;
  const medium = select.querySelector('option[value="estandar"]');
  if (medium) medium.textContent = "Media";
  select.dataset.mcOfficialMatrix = "true";
}

function mcEstimatorFormatHomeRange(range) {
  return `${MC_ESTIMATOR_CURRENCY.format(Number(range?.minimum || 0) / 100)} – ${MC_ESTIMATOR_CURRENCY.format(Number(range?.maximum || 0) / 100)}`;
}

function mcEstimatorPeriodLabel(period) {
  if (period === "VISITA") return " · por visita";
  if (period === "MES") return " · al mes";
  if (period === "ANO") return " · anual";
  return "";
}

function mcEstimatorPresentResults(form) {
  const card = form?.querySelector(".mc-estimate-card[data-state=\"ready\"]");
  if (!card) return;
  const small = card.querySelector("small");
  const span = card.querySelector("span");
  const strong = card.querySelector("strong");
  const serviceSlug = String(form.elements?.serviceSlug?.value || "");

  if (serviceSlug) {
    const estimate = mcEstimatorResults.get(form);
    if (!estimate?.range) return;
    if (span) span.textContent = `Estimación MiConstructor${mcEstimatorPeriodLabel(estimate.pricingPeriod)}`;
    if (strong) strong.textContent = mcEstimatorFormatHomeRange(estimate.range);
    if (small) {
      const annual = estimate.annualizedRange && !estimate.seasonal
        ? `Referencia anual aproximada: ${mcEstimatorFormatHomeRange(estimate.annualizedRange)}. `
        : "";
      small.textContent = `${annual}${MC_ESTIMATOR_DISCLAIMER}`;
    }
    return;
  }

  if (span) span.textContent = "Estimación MiConstructor:";
  if (small) small.textContent = MC_ESTIMATOR_DISCLAIMER;
}

function mcEstimatorEnhance(root = document) {
  root.querySelectorAll('select[name="projectType"]').forEach(mcEstimatorNormalizeProjectSelect);
  root.querySelectorAll('select[name="qualityLevel"]').forEach(mcEstimatorNormalizeQuality);
  root.querySelectorAll("form").forEach((form) => mcEstimatorPresentResults(form));
}

mcEstimatorEnhance();
const mcEstimatorObserver = new MutationObserver(() => mcEstimatorEnhance());
mcEstimatorObserver.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
