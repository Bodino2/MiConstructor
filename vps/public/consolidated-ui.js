const MC_MOBILE_QUERY = window.matchMedia("(max-width: 900px)");
const MC_PROFESSIONAL_PATHS = new Set(["/para-profesionales", "/registro-profesional"]);
const MC_SEASON_VALUE = "__TEMPORADA__";
const MC_CURRENCY = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const MC_HOME_CATALOG_ROUTES = new Map([
  ["Limpieza del hogar", ["limpieza", "limpieza_hogar"]],
  ["Limpieza profunda", ["limpieza", "limpieza_profunda"]],
  ["Limpieza fin de obra", ["limpieza", "limpieza_fin_obra"]],
  ["Limpieza de mudanza", ["limpieza", "limpieza_mudanza"]],
  ["Limpieza de cristales", ["limpieza", "limpieza_cristales"]],
  ["Limpieza de comunidades", ["limpieza", "limpieza_comunidades"]],
  ["Limpieza para B&B y alojamientos turísticos", ["limpieza", "limpieza_alojamiento_turistico"]],
  ["Mantenimiento de jardines", ["jardineria", "jardineria_mantenimiento"]],
  ["Poda y cuidado de árboles", ["jardineria", "poda"]],
  ["Césped y siega", ["jardineria", "cesped"]],
  ["Riego y mantenimiento", ["jardineria", "riego"]],
  ["Limpieza de terrenos y parcelas", ["jardineria", "limpieza_terreno"]],
  ["Mantenimiento de piscina", ["jardineria", "mantenimiento_piscina"]],
]);
const MC_FREQUENCY_VISITS = { PUNTUAL: 1, SEMANAL: 52, CADA_2_SEMANAS: 26, MENSUAL: 12 };
const MC_ZONE_RULES = [
  ["ANDALUCIA", ["andalucia", "almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"]],
  ["MADRID", ["madrid"]],
  ["CATALUNA", ["cataluna", "barcelona", "girona", "lerida", "lleida", "tarragona"]],
  ["BALEARES", ["baleares", "balears", "mallorca", "menorca", "ibiza", "eivissa"]],
  ["PAIS_VASCO", ["pais vasco", "euskadi", "alava", "araba", "bizkaia", "vizcaya", "gipuzkoa", "guipuzcoa"]],
  ["NAVARRA", ["navarra", "pamplona", "iruna"]],
  ["COMUNIDAD_VALENCIANA", ["valencia", "alicante", "castellon"]],
  ["CANARIAS", ["canarias", "tenerife", "gran canaria", "lanzarote", "fuerteventura", "la palma"]],
  ["EXTREMADURA", ["extremadura", "badajoz", "caceres"]],
  ["CASTILLA_LA_MANCHA", ["castilla la mancha", "albacete", "ciudad real", "cuenca", "guadalajara", "toledo"]],
  ["CASTILLA_Y_LEON", ["castilla y leon", "avila", "burgos", "leon", "palencia", "salamanca", "segovia", "soria", "valladolid", "zamora"]],
  ["GALICIA", ["galicia", "a coruna", "coruna", "lugo", "ourense", "orense", "pontevedra"]],
  ["ASTURIAS", ["asturias", "oviedo", "gijon"]],
  ["CANTABRIA", ["cantabria", "santander"]],
  ["ARAGON", ["aragon", "huesca", "teruel", "zaragoza"]],
  ["MURCIA", ["murcia", "cartagena"]],
  ["LA_RIOJA", ["la rioja", "logrono"]],
];

let mcCatalogPromise = null;
let mcShellRefreshing = false;

function mcNormalize(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function mcMoneyFromCents(cents) {
  return MC_CURRENCY.format(Number(cents || 0) / 100);
}

function mcRoundFiveEuros(cents) {
  return Math.max(0, Math.round(Number(cents || 0) / 500) * 500);
}

function mcCurrentProfessionalContext() {
  return MC_PROFESSIONAL_PATHS.has(location.pathname);
}

function mcCloseMobileMenu(nav) {
  const inner = nav?.querySelector(".site-nav-inner");
  const toggle = nav?.querySelector(".site-menu-toggle");
  if (inner) inner.dataset.open = "false";
  toggle?.setAttribute("aria-expanded", "false");
}

function mcWireDropdown(details) {
  if (!details || details.dataset.mcDropdownBound === "true") return;
  details.dataset.mcDropdownBound = "true";
  let leaveTimer = 0;
  const cancelClose = () => window.clearTimeout(leaveTimer);
  const scheduleClose = () => {
    cancelClose();
    leaveTimer = window.setTimeout(() => {
      if (!details.matches(":hover")) details.open = false;
    }, 140);
  };
  details.addEventListener("mouseenter", () => {
    if (MC_MOBILE_QUERY.matches) return;
    cancelClose();
    details.open = true;
  });
  details.addEventListener("mouseleave", () => {
    if (MC_MOBILE_QUERY.matches) return;
    scheduleClose();
  });
  details.querySelector(".site-nav-menu, .site-account-menu")?.addEventListener("mouseenter", cancelClose);
  details.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    details.open = false;
    if (MC_MOBILE_QUERY.matches) mcCloseMobileMenu(details.closest("#main-nav"));
  }));
}

function mcApplyProfessionalMobileNav(nav) {
  const shouldUseProfessionalMobile = MC_MOBILE_QUERY.matches && mcCurrentProfessionalContext();
  if (!shouldUseProfessionalMobile) {
    if (nav?.classList.contains("mc-professional-mobile")) {
      nav.classList.remove("mc-professional-mobile");
      delete nav.dataset.mcProfessionalMobile;
      delete nav.dataset.siteSignature;
      void window.MiConstructorShell?.refreshHeader();
    }
    return;
  }
  if (!nav || nav.dataset.mcProfessionalMobile === "true") return;
  const actions = nav.querySelector(".site-nav-actions");
  if (!actions) return;
  nav.dataset.mcProfessionalMobile = "true";
  nav.classList.add("mc-professional-mobile");
  const authenticated = Boolean(nav.querySelector(".site-account-dropdown"));
  actions.innerHTML = authenticated
    ? '<a href="/panel">Mi Cuenta</a><a class="site-nav-cta" href="/panel">Panel</a>'
    : '<a href="/login">Entrar</a><a class="site-nav-cta" href="/registro-profesional">Crear cuenta profesional</a>';
}

async function mcEnsureUnifiedShell() {
  const nav = document.querySelector("#main-nav");
  if (!nav || !window.MiConstructorShell) return;
  const invalid = !nav.classList.contains("site-nav") || !nav.querySelector(".site-nav-inner") || Boolean(nav.querySelector(".dropdown-menu"));
  if (invalid && !mcShellRefreshing) {
    mcShellRefreshing = true;
    delete nav.dataset.siteSignature;
    try { await window.MiConstructorShell.refreshHeader(); } finally { mcShellRefreshing = false; }
  }
  const currentNav = document.querySelector("#main-nav");
  currentNav?.querySelectorAll(".site-nav-dropdown, .site-account-dropdown").forEach(mcWireDropdown);
  mcApplyProfessionalMobileNav(currentNav);
}

function mcMakeCatalogActionable(root = document) {
  root.querySelectorAll(".hs-service-chips span").forEach((chip) => {
    const label = String(chip.textContent || "").trim();
    const route = MC_HOME_CATALOG_ROUTES.get(label);
    if (!route) return;
    const link = document.createElement("a");
    link.className = "mc-service-chip";
    link.href = `/publicar?servicio=${encodeURIComponent(route[0])}&tipo=${encodeURIComponent(route[1])}`;
    link.textContent = label;
    chip.replaceWith(link);
  });
}

function mcRemoveGuestAccountFirst(root = document) {
  if (location.pathname !== "/servicios-hogar") return;
  const accountCta = root.querySelector('.hs-page-head .actions a[href="/registro-cliente"]');
  if (!accountCta) return;
  const head = accountCta.closest(".hs-page-head");
  const lead = head?.querySelector(".lead");
  if (lead) lead.textContent = "Elige primero qué necesitas y completa los detalles. La cuenta se solicita únicamente al final, antes de publicar.";
  const actions = accountCta.closest(".actions");
  if (actions) {
    actions.innerHTML = '<a class="button primary" href="/publicar?servicio=limpieza">Elegir limpieza →</a><a class="button" href="/publicar?servicio=jardineria">Elegir jardinería →</a>';
  }
}

function mcSelectedHomeServiceFromQuery(select) {
  const requested = new URLSearchParams(location.search).get("tipo");
  if (!requested || !select?.querySelector(`option[value="${CSS.escape(requested)}"]`)) return;
  if (select.value !== requested) {
    select.value = requested;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function mcReplaceManualBudget(form) {
  const budget = form.querySelector('input[name="budgetEuros"]');
  if (!budget || budget.type === "hidden") return budget;
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "budgetEuros";
  hidden.dataset.mcCalculatedBudget = "true";
  const label = budget.closest("label");
  if (label) label.replaceWith(hidden);
  else budget.replaceWith(hidden);
  return hidden;
}

function mcEstimateCard(form) {
  let card = form.querySelector(".mc-estimate-card");
  if (card) return card;
  const existing = form.querySelector("#estimate-result");
  if (existing) {
    existing.classList.add("mc-estimate-card");
    existing.dataset.state = "pending";
    card = existing;
  } else {
    card = document.createElement("div");
    card.className = "mc-estimate-card";
    card.dataset.state = "pending";
    form.querySelector(".form-actions")?.before(card);
  }
  card.innerHTML = "<span>Estimación MiConstructor</span><strong>Completa los datos para calcular el rango.</strong>";
  return card;
}

function mcProjectEstimatePayload(form) {
  const projectType = form.elements.projectType?.value || "";
  const squareMeters = Number(form.elements.squareMeters?.value || 0);
  const qualityLevel = form.elements.qualityLevel?.value || "";
  const locationValue = String(form.elements.location?.value || "").trim();
  if (!projectType || !qualityLevel || !locationValue || !Number.isFinite(squareMeters) || squareMeters <= 0) return null;
  return { projectType, squareMeters, qualityLevel, location: locationValue };
}

function mcSetupProjectEstimate(form) {
  if (!form || form.dataset.mcProjectEstimate === "true") return;
  form.dataset.mcProjectEstimate = "true";
  const hiddenBudget = mcReplaceManualBudget(form);
  form.querySelector("#estimate")?.remove();
  const card = mcEstimateCard(form);
  const submit = form.querySelector('.form-actions button:not([type="button"]), .form-actions button.primary');
  let sequence = 0;
  let timer = 0;

  const calculate = async () => {
    const payload = mcProjectEstimatePayload(form);
    if (!payload) {
      if (submit) submit.disabled = true;
      card.dataset.state = "pending";
      card.innerHTML = "<span>Estimación MiConstructor</span><strong>Completa tipo de obra, superficie, calidades y localidad.</strong>";
      return;
    }
    const current = ++sequence;
    if (submit) submit.disabled = true;
    card.dataset.state = "loading";
    card.innerHTML = "<span>Estimación MiConstructor</span><strong>Calculando rango orientativo…</strong>";
    try {
      const response = await fetch("/api/v1/estimate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const estimate = await response.json();
      if (!response.ok) throw new Error(estimate?.error || "No se ha podido calcular la estimación.");
      if (current !== sequence) return;
      const minimum = Number(estimate.range?.minimum || 0);
      const maximum = Number(estimate.range?.maximum || 0);
      if (!minimum || !maximum) throw new Error("La estimación no contiene un rango válido.");
      if (hiddenBudget) hiddenBudget.value = String(Math.round((minimum + maximum) / 2));
      card.dataset.state = "ready";
      const zone = estimate.input?.locationZoneLabel ? ` · ${estimate.input.locationZoneLabel}` : "";
      card.innerHTML = `<span>Estimación MiConstructor${zone}</span><strong>${MC_CURRENCY.format(minimum)} – ${MC_CURRENCY.format(maximum)}</strong><small>Rango orientativo calculado por la plataforma. El precio final lo determina el presupuesto profesional.</small>`;
      if (submit) submit.disabled = false;
    } catch (error) {
      if (current !== sequence) return;
      if (hiddenBudget) hiddenBudget.value = "";
      card.dataset.state = "error";
      card.innerHTML = `<span>Estimación MiConstructor</span><strong>${String(error?.message || "No se ha podido calcular.")}</strong>`;
      if (submit) submit.disabled = true;
    }
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void calculate(), 220);
  };
  ["projectType", "squareMeters", "qualityLevel", "location"].forEach((name) => {
    form.elements[name]?.addEventListener("input", schedule);
    form.elements[name]?.addEventListener("change", schedule);
  });
  schedule();
}

async function mcHomeCatalog() {
  if (!mcCatalogPromise) {
    mcCatalogPromise = fetch("/api/v1/home-services/catalog", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "No se ha podido cargar la matriz de servicios.");
        return payload;
      })
      .catch((error) => {
        mcCatalogPromise = null;
        throw error;
      });
  }
  return mcCatalogPromise;
}

function mcCatalogService(catalog, slug) {
  for (const vertical of catalog.verticals || []) {
    const service = (vertical.services || []).find((item) => item.slug === slug);
    if (service) return service;
  }
  return null;
}

function mcZoneCoefficient(locationValue, pricing) {
  const normalized = mcNormalize(locationValue);
  const match = MC_ZONE_RULES.find(([, tokens]) => tokens.some((token) => normalized.includes(mcNormalize(token))));
  const zone = match?.[0] || "NACIONAL";
  return { zone, coefficient: Number(pricing?.zoneMultipliers?.[zone] || pricing?.zoneMultipliers?.NACIONAL || 1) };
}

function mcEstimateHomeServiceRange(form, service) {
  const pricing = service?.pricing;
  if (!pricing) return null;
  const squareMeters = Number(form.elements.squareMeters?.value || 0);
  const estimatedHours = Number(form.elements.estimatedHours?.value || 0);
  const bedrooms = Math.max(0, Number(form.elements.bedrooms?.value || 0));
  const bathrooms = Math.max(0, Number(form.elements.bathrooms?.value || 0));
  let quantity = Number(pricing.referenceQuantity || 1);
  if (pricing.unit === "HORA") {
    if (estimatedHours > 0) quantity = estimatedHours;
    else if (squareMeters > 0) quantity = Math.max(2, squareMeters / 28);
  } else if (pricing.unit === "M2" && squareMeters > 0) quantity = squareMeters;
  const zone = mcZoneCoefficient(form.elements.location?.value, pricing);
  const quality = Number(pricing.qualityMultipliers?.estandar || 1);
  const coefficient = zone.coefficient * quality;
  const range = {};
  for (const key of ["minimum", "median", "maximum"]) {
    let raw = Number(pricing.standardRange?.[key] || 0) * quantity;
    if (service.slug === "limpieza_alojamiento_turistico") {
      raw *= 1 + Math.max(0, bedrooms - 1) * 0.12 + Math.max(0, bathrooms - 1) * 0.08;
    }
    raw = Math.max(raw, Number(pricing.minimumVisit?.[key] || 0));
    range[key] = mcRoundFiveEuros(raw * coefficient);
  }
  return { range, quantity, zone: zone.zone };
}

function mcSeasonVisitCount(frequency, startValue, endValue) {
  const start = new Date(`${startValue}T12:00:00Z`);
  const end = new Date(`${endValue}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const interval = frequency === "SEMANAL" ? 7 : frequency === "CADA_2_SEMANAS" ? 14 : 30.4375;
  return Math.max(1, Math.ceil(days / interval));
}

function mcSeasonBlock(form) {
  let block = form.querySelector("[data-mc-season-block]");
  if (block) return block;
  block = document.createElement("section");
  block.className = "mc-home-service-extra";
  block.dataset.mcSeasonBlock = "true";
  block.hidden = true;
  block.innerHTML = `<h3>Mantenimiento por temporada</h3><p>Se mantiene una única relación de servicio y se programan las visitas dentro del periodo indicado.</p>
    <label>Frecuencia durante la temporada<select data-mc-season-cadence><option value="SEMANAL">Cada semana</option><option value="CADA_2_SEMANAS">Cada dos semanas</option><option value="MENSUAL">Cada mes</option></select></label>
    <label>Fin de temporada<input data-mc-season-end type="date" /></label>`;
  const notes = form.elements.notes?.closest("label");
  if (notes) notes.before(block);
  else form.querySelector(".form-actions")?.before(block);
  return block;
}

function mcBnbBlock(form) {
  let block = form.querySelector("[data-mc-bnb-block]");
  if (block) return block;
  block = document.createElement("section");
  block.className = "mc-home-service-extra";
  block.dataset.mcBnbBlock = "true";
  block.innerHTML = `<h3>B&B y alojamientos turísticos</h3><p>Configura el cambio de huéspedes y los extras de preparación del alojamiento.</p>
    <label class="full">Modalidad<select data-mc-bnb-mode><option value="PUNTUAL">Limpieza puntual</option><option value="ENTRE_RESERVAS">Entre reservas / cambio de huéspedes</option><option value="RECURRENTE">Servicio recurrente</option><option value="TEMPORADA">Temporada</option></select></label>
    <label>Check-out<input data-mc-checkout type="datetime-local" /></label>
    <label>Inicio ventana check-in<input data-mc-checkin-start type="datetime-local" /></label>
    <label>Fin ventana check-in<input data-mc-checkin-end type="datetime-local" /></label>
    <div class="mc-inline-checks"><label><input data-mc-linen type="checkbox" /> Cambio de ropa de cama</label><label><input data-mc-towels type="checkbox" /> Cambio de toallas</label><label><input data-mc-consumables type="checkbox" /> Reposición de consumibles</label><label><input data-mc-photo type="checkbox" /> Inspección y fotos al finalizar</label></div>`;
  const notes = form.elements.notes?.closest("label");
  if (notes) notes.before(block);
  else form.querySelector(".form-actions")?.before(block);
  return block;
}

function mcStripSystemMetadata(value) {
  return String(value || "")
    .replace(/\n?\[MiConstructor temporada\][\s\S]*?\[\/MiConstructor temporada\]\n?/g, "\n")
    .replace(/\n?\[MiConstructor B&B\][\s\S]*?\[\/MiConstructor B&B\]\n?/g, "\n")
    .trim();
}

function mcParseMetadata(notes, key) {
  const match = String(notes || "").match(new RegExp(`${key}:\\s*([^\\n]+)`));
  return match?.[1]?.trim() || "";
}

function mcSetupHomeServiceExtras(form, catalog, serviceSelect, frequencySelect) {
  if (form.dataset.mcHomeExtras === "true") return;
  form.dataset.mcHomeExtras = "true";
  const seasonBlock = mcSeasonBlock(form);
  const seasonCadence = seasonBlock.querySelector("[data-mc-season-cadence]");
  const seasonEnd = seasonBlock.querySelector("[data-mc-season-end]");
  let bnbBlock = null;
  let visualSeason = false;

  const restoreDraftMetadata = () => {
    const notes = form.elements.notes?.value || "";
    const storedEnd = mcParseMetadata(notes, "Fin temporada");
    const storedCadence = mcParseMetadata(notes, "Frecuencia temporada");
    if (storedEnd) seasonEnd.value = storedEnd;
    if (storedCadence && seasonCadence.querySelector(`option[value="${CSS.escape(storedCadence)}"]`)) seasonCadence.value = storedCadence;
  };

  const sync = () => {
    const service = mcCatalogService(catalog, serviceSelect.value);
    const existingSeasonOption = frequencySelect.querySelector(`option[value="${MC_SEASON_VALUE}"]`);
    if (existingSeasonOption) existingSeasonOption.remove();
    visualSeason = false;
    seasonBlock.hidden = true;

    if (service?.seasonal && !service?.bnb) {
      const option = document.createElement("option");
      option.value = MC_SEASON_VALUE;
      option.textContent = "Por temporada";
      frequencySelect.append(option);
      const notes = form.elements.notes?.value || "";
      if (mcParseMetadata(notes, "Fin temporada")) frequencySelect.value = MC_SEASON_VALUE;
    }

    const isBnb = service?.slug === "limpieza_alojamiento_turistico" || service?.bnb === true;
    if (isBnb) {
      bnbBlock = mcBnbBlock(form);
      bnbBlock.hidden = false;
      const mode = bnbBlock.querySelector("[data-mc-bnb-mode]");
      const storedMode = mcParseMetadata(form.elements.notes?.value, "Modalidad B&B");
      if (storedMode && mode.querySelector(`option[value="${CSS.escape(storedMode)}"]`)) mode.value = storedMode;
      const updateBnbMode = () => {
        const value = mode.value;
        const frequencyLabel = frequencySelect.closest("label");
        if (value === "PUNTUAL" || value === "ENTRE_RESERVAS") {
          frequencySelect.value = "PUNTUAL";
          if (frequencyLabel) frequencyLabel.hidden = true;
          seasonBlock.hidden = true;
        } else {
          if (frequencyLabel) frequencyLabel.hidden = false;
          if (frequencySelect.value === "PUNTUAL" || frequencySelect.value === MC_SEASON_VALUE) {
            frequencySelect.value = frequencySelect.querySelector('option[value="SEMANAL"]') ? "SEMANAL" : frequencySelect.querySelector('option[value="MENSUAL"]') ? "MENSUAL" : frequencySelect.options[0]?.value;
          }
          seasonBlock.hidden = value !== "TEMPORADA";
          visualSeason = value === "TEMPORADA";
        }
      };
      if (mode.dataset.mcBound !== "true") {
        mode.dataset.mcBound = "true";
        mode.addEventListener("change", () => { updateBnbMode(); form.dispatchEvent(new Event("mc:estimate")); });
      }
      updateBnbMode();
      const bedroomsLabel = form.elements.bedrooms?.closest("label");
      if (bedroomsLabel) bedroomsLabel.childNodes[0].textContent = "Habitaciones";
    } else if (bnbBlock) {
      bnbBlock.hidden = true;
      const frequencyLabel = frequencySelect.closest("label");
      if (frequencyLabel) frequencyLabel.hidden = false;
    }
    restoreDraftMetadata();
  };

  frequencySelect.addEventListener("change", () => {
    if (frequencySelect.value === MC_SEASON_VALUE) {
      visualSeason = true;
      seasonBlock.hidden = false;
    } else if (!bnbBlock || bnbBlock.hidden || bnbBlock.querySelector("[data-mc-bnb-mode]")?.value !== "TEMPORADA") {
      visualSeason = false;
      seasonBlock.hidden = true;
    }
    form.dispatchEvent(new Event("mc:estimate"));
  });

  serviceSelect.addEventListener("change", () => window.setTimeout(() => {
    sync();
    form.dispatchEvent(new Event("mc:estimate"));
  }, 0));

  form.addEventListener("submit", () => {
    const service = mcCatalogService(catalog, serviceSelect.value);
    const notes = form.elements.notes;
    if (!notes) return;
    const originalVisualFrequency = frequencySelect.value;
    let baseNotes = mcStripSystemMetadata(notes.value);
    const blocks = [];
    const isBnb = service?.slug === "limpieza_alojamiento_turistico" || service?.bnb === true;
    if (isBnb && bnbBlock) {
      const mode = bnbBlock.querySelector("[data-mc-bnb-mode]")?.value || "PUNTUAL";
      const checkout = bnbBlock.querySelector("[data-mc-checkout]")?.value || "";
      const checkinStart = bnbBlock.querySelector("[data-mc-checkin-start]")?.value || "";
      const checkinEnd = bnbBlock.querySelector("[data-mc-checkin-end]")?.value || "";
      if (checkout) {
        const [day, time] = checkout.split("T");
        if (form.elements.requestedStartDate) form.elements.requestedStartDate.value = day;
        if (form.elements.preferredTimeStart && time) form.elements.preferredTimeStart.value = time.slice(0, 5);
      }
      if (checkinEnd && form.elements.preferredTimeEnd) {
        const [, time] = checkinEnd.split("T");
        if (time) form.elements.preferredTimeEnd.value = time.slice(0, 5);
      }
      if (mode === "PUNTUAL" || mode === "ENTRE_RESERVAS") frequencySelect.value = "PUNTUAL";
      if (mode === "TEMPORADA") {
        frequencySelect.value = seasonCadence.value;
        visualSeason = true;
      }
      blocks.push(`[MiConstructor B&B]\nModalidad B&B: ${mode}\nCheck-out: ${checkout || "No indicado"}\nVentana check-in: ${checkinStart || "No indicada"} – ${checkinEnd || "No indicada"}\nCambio ropa de cama: ${bnbBlock.querySelector("[data-mc-linen]")?.checked ? "Sí" : "No"}\nCambio toallas: ${bnbBlock.querySelector("[data-mc-towels]")?.checked ? "Sí" : "No"}\nReposición consumibles: ${bnbBlock.querySelector("[data-mc-consumables]")?.checked ? "Sí" : "No"}\nInspección foto: ${bnbBlock.querySelector("[data-mc-photo]")?.checked ? "Sí" : "No"}\n[/MiConstructor B&B]`);
    }
    if (visualSeason || originalVisualFrequency === MC_SEASON_VALUE) {
      frequencySelect.value = seasonCadence.value;
      blocks.push(`[MiConstructor temporada]\nInicio temporada: ${form.elements.requestedStartDate?.value || ""}\nFin temporada: ${seasonEnd.value || ""}\nFrecuencia temporada: ${seasonCadence.value}\n[/MiConstructor temporada]`);
    }
    notes.value = [baseNotes, ...blocks].filter(Boolean).join("\n\n");
    window.setTimeout(() => {
      if (!form.isConnected) return;
      if (originalVisualFrequency === MC_SEASON_VALUE && frequencySelect.querySelector(`option[value="${MC_SEASON_VALUE}"]`)) frequencySelect.value = MC_SEASON_VALUE;
    }, 0);
  }, true);

  restoreDraftMetadata();
  sync();
}

function mcSetupHomeServiceEstimate(form, catalog) {
  if (!form || form.dataset.mcHomeEstimate === "true") return;
  const serviceSelect = form.querySelector("#publicar-home-service, #hs-service, select[name=" + JSON.stringify("serviceSlug") + "]");
  const frequencySelect = form.querySelector("#publicar-frequency, #hs-frequency, select[name=" + JSON.stringify("frequency") + "]");
  if (!serviceSelect || !frequencySelect) return;
  form.dataset.mcHomeEstimate = "true";
  mcSelectedHomeServiceFromQuery(serviceSelect);
  mcSetupHomeServiceExtras(form, catalog, serviceSelect, frequencySelect);
  const card = mcEstimateCard(form);

  const calculate = () => {
    const service = mcCatalogService(catalog, serviceSelect.value);
    const estimate = mcEstimateHomeServiceRange(form, service);
    const locationValue = String(form.elements.location?.value || "").trim();
    if (!service || !estimate || !locationValue) {
      card.dataset.state = "pending";
      card.innerHTML = "<span>Estimación MiConstructor</span><strong>Selecciona servicio y localidad para calcular el rango.</strong>";
      return;
    }
    const minimum = estimate.range.minimum;
    const maximum = estimate.range.maximum;
    let frequency = frequencySelect.value;
    let visits = MC_FREQUENCY_VISITS[frequency] || 1;
    let recurringLabel = "";
    const seasonBlock = form.querySelector("[data-mc-season-block]");
    const bnbMode = form.querySelector("[data-mc-bnb-mode]")?.value;
    const seasonal = frequency === MC_SEASON_VALUE || bnbMode === "TEMPORADA";
    if (seasonal) {
      frequency = seasonBlock?.querySelector("[data-mc-season-cadence]")?.value || "MENSUAL";
      visits = mcSeasonVisitCount(frequency, form.elements.requestedStartDate?.value, seasonBlock?.querySelector("[data-mc-season-end]")?.value);
      if (visits > 0) recurringLabel = `Referencia para la temporada: ${mcMoneyFromCents(minimum * visits)} – ${mcMoneyFromCents(maximum * visits)}.`;
    } else if (frequency !== "PUNTUAL" && MC_FREQUENCY_VISITS[frequency]) {
      recurringLabel = `Referencia anual aproximada: ${mcMoneyFromCents(minimum * visits)} – ${mcMoneyFromCents(maximum * visits)}.`;
    }
    card.dataset.state = "ready";
    card.innerHTML = `<span>Estimación MiConstructor · por visita</span><strong>${mcMoneyFromCents(minimum)} – ${mcMoneyFromCents(maximum)}</strong><small>${recurringLabel ? `${recurringLabel} ` : ""}Rango orientativo; la oferta final la fija el profesional.</small>`;
  };

  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(calculate, 120);
  };
  ["location", "squareMeters", "estimatedHours", "bedrooms", "bathrooms", "requestedStartDate"].forEach((name) => {
    form.elements[name]?.addEventListener("input", schedule);
    form.elements[name]?.addEventListener("change", schedule);
  });
  serviceSelect.addEventListener("change", schedule);
  frequencySelect.addEventListener("change", schedule);
  form.addEventListener("mc:estimate", schedule);
  form.querySelectorAll("[data-mc-season-end], [data-mc-season-cadence], [data-mc-bnb-mode]").forEach((field) => {
    field.addEventListener("input", schedule);
    field.addEventListener("change", schedule);
  });
  schedule();
}

async function mcEnhanceForms(root = document) {
  root.querySelectorAll("#publicar-details-form").forEach((form) => {
    if (form.querySelector("[name=projectType]")) mcSetupProjectEstimate(form);
  });
  root.querySelectorAll("#project-form").forEach(mcSetupProjectEstimate);
  const homeForms = [...root.querySelectorAll("#publicar-details-form, #hs-request-form")]
    .filter((form) => form.querySelector("[name=serviceSlug], #publicar-home-service, #hs-service"));
  if (homeForms.length) {
    try {
      const catalog = await mcHomeCatalog();
      homeForms.forEach((form) => mcSetupHomeServiceEstimate(form, catalog));
    } catch {
      homeForms.forEach((form) => {
        const card = mcEstimateCard(form);
        card.dataset.state = "error";
        card.innerHTML = "<span>Estimación MiConstructor</span><strong>No se ha podido cargar la matriz de precios.</strong>";
      });
    }
  }
}

async function mcEnhanceAll(root = document) {
  mcMakeCatalogActionable(root);
  mcRemoveGuestAccountFirst(root);
  await mcEnhanceForms(root);
  await mcEnsureUnifiedShell();
}

document.addEventListener("pointerdown", (event) => {
  document.querySelectorAll("#main-nav .site-nav-dropdown[open], #main-nav .site-account-dropdown[open]").forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  });
});

const mcAppObserver = new MutationObserver(() => { void mcEnhanceAll(document); });
const mcApp = document.querySelector("#app");
if (mcApp) mcAppObserver.observe(mcApp, { childList: true, subtree: true });

const mcNav = document.querySelector("#main-nav");
const mcNavObserver = new MutationObserver(() => { void mcEnsureUnifiedShell(); });
if (mcNav) mcNavObserver.observe(mcNav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

MC_MOBILE_QUERY.addEventListener("change", () => { void mcEnsureUnifiedShell(); });
window.addEventListener("popstate", () => window.setTimeout(() => void mcEnhanceAll(document), 0));
window.addEventListener("hashchange", () => window.setTimeout(() => void mcEnhanceAll(document), 0));
window.addEventListener("miconstructor:shell-ready", () => void mcEnsureUnifiedShell());
window.setTimeout(() => void mcEnhanceAll(document), 0);