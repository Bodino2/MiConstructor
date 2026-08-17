const MC_ESTIMATOR_DISCLAIMER = "Rango orientativo calculado por la plataforma. El precio final lo determina el presupuesto profesional.";
const MC_ESTIMATOR_PROJECT_TYPES = [
  ["reforma_integral", "Reforma integral"],
  ["bano", "Reforma de baño"],
  ["cocina", "Reforma de cocina"],
  ["reforma_parcial", "Reforma parcial / salón / dormitorio"],
  ["fachadas_exteriores", "Fachadas y exteriores"],
];
const MC_ESTIMATOR_PROJECT_MATRIX = {
  bano: {
    mode: "BASE_PLUS_INCREMENT",
    standardArea: 5,
    prices: {
      basico: { base: 2_600, incrementPerExtraSquareMeter: 150 },
      estandar: { base: 4_200, incrementPerExtraSquareMeter: 220 },
      premium: { base: 6_800, incrementPerExtraSquareMeter: 380 },
    },
  },
  cocina: {
    mode: "BASE_PLUS_INCREMENT",
    standardArea: 8,
    prices: {
      basico: { base: 3_500, incrementPerExtraSquareMeter: 180 },
      estandar: { base: 5_800, incrementPerExtraSquareMeter: 280 },
      premium: { base: 9_500, incrementPerExtraSquareMeter: 450 },
    },
  },
  reforma_parcial: {
    mode: "PER_SQUARE_METER",
    prices: { basico: 120, estandar: 220, premium: 380 },
  },
  reforma_integral: {
    mode: "PER_SQUARE_METER",
    prices: { basico: 400, estandar: 650, premium: 1_050 },
  },
  fachadas_exteriores: {
    mode: "PER_SQUARE_METER",
    prices: { basico: 45, estandar: 85, premium: 140 },
  },
};
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

function mcEstimatorProjectRangeFromValue(value) {
  const realistic = Math.round(Number(value) || 0);
  if (realistic <= 0) throw new Error("invalid_estimator_value");
  return {
    minimum: Math.round(realistic * 0.85),
    realistic,
    maximum: Math.round(realistic * 1.15),
  };
}

function mcEstimatorCalculateProjectRange(projectType, qualityLevel, rawSquareMeters) {
  const squareMeters = Number.parseFloat(String(rawSquareMeters ?? ""));
  const type = MC_ESTIMATOR_PROJECT_MATRIX[projectType];
  const price = type?.prices?.[qualityLevel];
  if (!type || price == null || Number.isNaN(squareMeters) || squareMeters <= 0) throw new Error("invalid_estimator_input");

  const calculatedValue = type.mode === "BASE_PLUS_INCREMENT"
    ? price.base + Math.max(0, squareMeters - type.standardArea) * price.incrementPerExtraSquareMeter
    : squareMeters * price;
  return mcEstimatorProjectRangeFromValue(calculatedValue);
}

function mcEstimatorProjectFallback(projectType, qualityLevel, rawSquareMeters) {
  const parsedSquareMeters = Number.parseFloat(String(rawSquareMeters ?? ""));
  const squareMeters = Number.isNaN(parsedSquareMeters) || parsedSquareMeters <= 0 ? 1 : parsedSquareMeters;
  const type = MC_ESTIMATOR_PROJECT_MATRIX[projectType] || MC_ESTIMATOR_PROJECT_MATRIX.bano;
  const price = type.prices?.[qualityLevel] ?? type.prices.estandar;
  const calculatedValue = type.mode === "BASE_PLUS_INCREMENT"
    ? Number(price?.base || 4_200)
    : squareMeters * Number(price || 220);
  return mcEstimatorProjectRangeFromValue(calculatedValue);
}

function mcEstimatorEnsureBudgetInput(form) {
  const budget = form.querySelector('input[name="budgetEuros"]');
  if (budget?.type === "hidden") return budget;
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "budgetEuros";
  hidden.dataset.mcCalculatedBudget = "true";
  if (budget) {
    const label = budget.closest("label");
    if (label) label.replaceWith(hidden);
    else budget.replaceWith(hidden);
  } else {
    form.querySelector(".form-actions")?.before(hidden);
  }
  return hidden;
}

function mcEstimatorProjectCard(form) {
  let card = form.querySelector(".mc-estimate-card");
  if (card) return card;
  const existing = form.querySelector("#estimate-result");
  if (existing) {
    existing.classList.add("mc-estimate-card");
    card = existing;
  } else {
    card = document.createElement("div");
    card.className = "mc-estimate-card";
    form.querySelector(".form-actions")?.before(card);
  }
  return card;
}

function mcEstimatorRenderProjectPending(card, hiddenBudget, submit) {
  if (hiddenBudget) hiddenBudget.value = "";
  card.dataset.state = "pending";
  card.innerHTML = "<span>Estimación MiConstructor</span><strong>Completa tipo de obra, superficie y calidad.</strong>";
  if (submit) submit.disabled = true;
}

function mcEstimatorRenderProjectRange(card, hiddenBudget, submit, range) {
  if (hiddenBudget) hiddenBudget.value = String(range.realistic);
  card.dataset.state = "ready";
  card.innerHTML = `<span>Estimación MiConstructor:</span><strong>${MC_ESTIMATOR_CURRENCY.format(range.minimum)} – ${MC_ESTIMATOR_CURRENCY.format(range.maximum)}</strong><small>${MC_ESTIMATOR_DISCLAIMER}</small>`;
  if (submit) submit.disabled = false;
}

function mcEstimatorSetupProject(form) {
  if (!form || form.dataset.mcProjectSync === "true") return;
  form.dataset.mcProjectEstimate = "true";
  form.dataset.mcProjectSync = "true";
  const hiddenBudget = mcEstimatorEnsureBudgetInput(form);
  form.querySelector("#estimate")?.remove();
  const card = mcEstimatorProjectCard(form);
  const submit = form.querySelector('.form-actions button:not([type="button"]), .form-actions button.primary');

  const calculate = () => {
    const projectType = String(form.elements.projectType?.value || "");
    const qualityLevel = String(form.elements.qualityLevel?.value || "");
    const rawSquareMeters = String(form.elements.squareMeters?.value ?? "").trim();
    const squareMeters = Number.parseFloat(rawSquareMeters);

    if (!projectType || !qualityLevel || !rawSquareMeters || Number.isNaN(squareMeters) || squareMeters <= 0) {
      mcEstimatorRenderProjectPending(card, hiddenBudget, submit);
      return;
    }

    try {
      mcEstimatorRenderProjectRange(
        card,
        hiddenBudget,
        submit,
        mcEstimatorCalculateProjectRange(projectType, qualityLevel, squareMeters),
      );
    } catch {
      mcEstimatorRenderProjectRange(
        card,
        hiddenBudget,
        submit,
        mcEstimatorProjectFallback(projectType, qualityLevel, squareMeters),
      );
    }
  };

  form.elements.squareMeters?.addEventListener("input", calculate);
  form.elements.projectType?.addEventListener("change", calculate);
  form.elements.qualityLevel?.addEventListener("change", calculate);
  calculate();
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
  const serviceSlug = String(form?.elements?.serviceSlug?.value || "");
  if (!serviceSlug) return;
  const estimate = mcEstimatorResults.get(form);
  if (!estimate?.range) return;
  const card = form.querySelector(".mc-estimate-card[data-state=\"ready\"]");
  if (!card) return;
  const small = card.querySelector("small");
  const span = card.querySelector("span");
  const strong = card.querySelector("strong");
  if (span) span.textContent = `Estimación MiConstructor${mcEstimatorPeriodLabel(estimate.pricingPeriod)}`;
  if (strong) strong.textContent = mcEstimatorFormatHomeRange(estimate.range);
  if (small) {
    const annual = estimate.annualizedRange && !estimate.seasonal
      ? `Referencia anual aproximada: ${mcEstimatorFormatHomeRange(estimate.annualizedRange)}. `
      : "";
    small.textContent = `${annual}${MC_ESTIMATOR_DISCLAIMER}`;
  }
}

function mcEstimatorEnhance(root = document) {
  root.querySelectorAll('select[name="projectType"]').forEach((select) => {
    const form = select.form;
    if (!form || form.dataset.mcProjectSync === "true") return;
    mcEstimatorNormalizeProjectSelect(select);
    mcEstimatorNormalizeQuality(form.elements.qualityLevel);
    mcEstimatorSetupProject(form);
  });
}

function mcEstimatorFindUnboundProjectForm(node) {
  if (!(node instanceof Element)) return null;
  const select = node.matches('select[name="projectType"]')
    ? node
    : node.querySelector('select[name="projectType"]');
  const form = select?.form || null;
  return form && form.dataset.mcProjectSync !== "true" ? form : null;
}

mcEstimatorEnhance();
const mcEstimatorObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      const form = mcEstimatorFindUnboundProjectForm(node);
      if (!form) continue;
      mcEstimatorEnhance(form);
      return;
    }
  }
});
mcEstimatorObserver.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
