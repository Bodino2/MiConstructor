import { calculateShortlistFee } from "./shortlist-pricing.js";

export const HOME_SERVICE_PRICING_VERSION = "2026-08-17-es-v2-deterministic";

const RANGE_FACTOR_MINIMUM = 0.85;
const RANGE_FACTOR_MAXIMUM = 1.15;

const ZONES = {
  ANDALUCIA: { label: "Andalucía", tokens: ["andalucia", "almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"] },
  MADRID: { label: "Comunidad de Madrid", tokens: ["madrid"] },
  CATALUNA: { label: "Cataluña", tokens: ["cataluna", "barcelona", "girona", "lerida", "lleida", "tarragona"] },
  BALEARES: { label: "Illes Balears", tokens: ["baleares", "balears", "mallorca", "menorca", "ibiza", "eivissa"] },
  PAIS_VASCO: { label: "País Vasco", tokens: ["pais vasco", "euskadi", "alava", "araba", "bizkaia", "vizcaya", "gipuzkoa", "guipuzcoa"] },
  NAVARRA: { label: "Navarra", tokens: ["navarra", "pamplona", "iruna"] },
  COMUNIDAD_VALENCIANA: { label: "Comunitat Valenciana", tokens: ["valencia", "alicante", "castellon"] },
  CANARIAS: { label: "Canarias", tokens: ["canarias", "tenerife", "gran canaria", "lanzarote", "fuerteventura", "la palma"] },
  EXTREMADURA: { label: "Extremadura", tokens: ["extremadura", "badajoz", "caceres"] },
  CASTILLA_LA_MANCHA: { label: "Castilla-La Mancha", tokens: ["castilla la mancha", "albacete", "ciudad real", "cuenca", "guadalajara", "toledo"] },
  CASTILLA_Y_LEON: { label: "Castilla y León", tokens: ["castilla y leon", "avila", "burgos", "leon", "palencia", "salamanca", "segovia", "soria", "valladolid", "zamora"] },
  GALICIA: { label: "Galicia", tokens: ["galicia", "a coruna", "coruna", "lugo", "ourense", "orense", "pontevedra"] },
  ASTURIAS: { label: "Asturias", tokens: ["asturias", "oviedo", "gijon"] },
  CANTABRIA: { label: "Cantabria", tokens: ["cantabria", "santander"] },
  ARAGON: { label: "Aragón", tokens: ["aragon", "huesca", "teruel", "zaragoza"] },
  MURCIA: { label: "Región de Murcia", tokens: ["murcia", "cartagena"] },
  LA_RIOJA: { label: "La Rioja", tokens: ["la rioja", "logrono"] },
  NACIONAL: { label: "España", tokens: [] },
};

const CLEANING_SERVICES = {
  limpieza_hogar: "Limpieza del hogar",
  limpieza_profunda: "Limpieza profunda",
  limpieza_fin_obra: "Limpieza fin de obra",
  limpieza_mudanza: "Limpieza de mudanza",
  limpieza_cristales: "Limpieza de cristales",
  limpieza_comunidades: "Limpieza de comunidades",
  limpieza_alojamiento_turistico: "Limpieza para B&B y alojamientos turísticos",
};

const GARDEN_SERVICES = {
  jardineria_mantenimiento: "Mantenimiento de jardines",
  poda: "Poda y cuidado de árboles",
  cesped: "Césped y siega",
  riego: "Riego y mantenimiento",
  limpieza_terreno: "Limpieza de terrenos y parcelas",
};

export const HOME_SERVICE_PRICE_MATRIX = {
  limpieza_mantenimiento: Object.fromEntries(Object.entries(CLEANING_SERVICES).map(([slug, label]) => [slug, {
    label,
    family: "LIMPIEZA",
    puntualPerSquareMeterUnder100Cents: 1_200,
    puntualPerSquareMeterFrom100Cents: 800,
    recurrentPerHourCents: 1_400,
  }])),
  jardin_exterior: {
    ...Object.fromEntries(Object.entries(GARDEN_SERVICES).map(([slug, label]) => [slug, {
      label,
      family: "JARDIN",
      monthlyTiersCents: [
        { maximumSquareMeters: 199.999, amountCents: 12_000 },
        { maximumSquareMeters: 500, amountCents: 20_000 },
        { maximumSquareMeters: Number.POSITIVE_INFINITY, amountCents: 32_000 },
      ],
    }])),
    mantenimiento_piscina: {
      label: "Mantenimiento de piscina",
      family: "PISCINA",
      seasonalMonthlyCents: 11_000,
      annualCents: 120_000,
    },
  },
};

const FREQUENCY_VISITS_PER_YEAR = {
  PUNTUAL: 1,
  SEMANAL: 52,
  CADA_2_SEMANAS: 26,
  MENSUAL: 12,
};

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function roundCent(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function deterministicRange(baseCents) {
  const median = roundCent(baseCents);
  return {
    minimum: roundCent(median * RANGE_FACTOR_MINIMUM),
    median,
    maximum: roundCent(median * RANGE_FACTOR_MAXIMUM),
  };
}

function findMatrixEntry(serviceSlug) {
  for (const [category, services] of Object.entries(HOME_SERVICE_PRICE_MATRIX)) {
    if (services[serviceSlug]) return { category, service: services[serviceSlug] };
  }
  return null;
}

export function resolveHomeServiceZone(location) {
  const normalized = normalizeText(location);
  for (const [zone, data] of Object.entries(ZONES)) {
    if (zone === "NACIONAL") continue;
    if (data.tokens.some((token) => normalized.includes(normalizeText(token)))) {
      return { zone, label: data.label, coefficient: 1 };
    }
  }
  return { zone: "NACIONAL", label: ZONES.NACIONAL.label, coefficient: 1 };
}

export function getPublicHomeServicePricingModel(serviceSlug) {
  const found = findMatrixEntry(serviceSlug);
  if (!found) return null;
  const { service } = found;
  return {
    version: HOME_SERVICE_PRICING_VERSION,
    unit: service.family === "LIMPIEZA" ? "MIXTO" : service.family === "JARDIN" ? "MES" : "MES_O_ANO",
    referenceQuantity: 1,
    standardRange: { minimum: 0, median: 0, maximum: 0 },
    minimumVisit: { minimum: 0, median: 0, maximum: 0 },
    qualityMultipliers: { basico: 1, estandar: 1, premium: 1 },
    zoneMultipliers: Object.fromEntries(Object.keys(ZONES).map((key) => [key, 1])),
  };
}

export function estimateHomeServicePrice(input = {}) {
  const found = findMatrixEntry(input.serviceSlug);
  if (!found) return { valid: false, error: "Servicio no disponible en la matriz de precios.", version: HOME_SERVICE_PRICING_VERSION };

  const { service, category } = found;
  const zone = resolveHomeServiceZone(input.location);
  const squareMeters = Number(input.squareMeters);
  const estimatedHours = Number(input.estimatedHours);
  const frequency = String(input.frequency || "PUNTUAL");
  const seasonal = input.seasonal === true;

  let baseCents = 0;
  let pricingPeriod = "SERVICIO";
  let annualizedRange = null;
  let quantity = 1;
  let formula = "";

  if (service.family === "LIMPIEZA") {
    if (frequency === "PUNTUAL") {
      if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
        return { valid: false, error: "Indica la superficie para calcular la limpieza puntual.", version: HOME_SERVICE_PRICING_VERSION };
      }
      const centsPerSquareMeter = squareMeters < 100
        ? service.puntualPerSquareMeterUnder100Cents
        : service.puntualPerSquareMeterFrom100Cents;
      baseCents = squareMeters * centsPerSquareMeter;
      quantity = squareMeters;
      pricingPeriod = "SERVICIO";
      formula = "LIMPIEZA_PUNTUAL_M2";
    } else {
      if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
        return { valid: false, error: "Indica las horas estimadas por visita para calcular el mantenimiento periódico.", version: HOME_SERVICE_PRICING_VERSION };
      }
      baseCents = estimatedHours * service.recurrentPerHourCents;
      quantity = estimatedHours;
      pricingPeriod = "VISITA";
      formula = "LIMPIEZA_RECURRENTE_HORA";
      const visitsPerYear = FREQUENCY_VISITS_PER_YEAR[frequency] || 0;
      if (visitsPerYear > 0) annualizedRange = deterministicRange(baseCents * visitsPerYear);
    }
  } else if (service.family === "JARDIN") {
    if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
      return { valid: false, error: "Indica la superficie del jardín para calcular el mantenimiento.", version: HOME_SERVICE_PRICING_VERSION };
    }
    const tier = service.monthlyTiersCents.find((item) => squareMeters <= item.maximumSquareMeters);
    baseCents = tier.amountCents;
    quantity = squareMeters;
    pricingPeriod = "MES";
    formula = "JARDIN_MENSUAL_SUPERFICIE";
    annualizedRange = deterministicRange(baseCents * 12);
  } else if (service.family === "PISCINA") {
    if (seasonal || frequency === "PUNTUAL") {
      baseCents = service.seasonalMonthlyCents;
      pricingPeriod = "MES";
      formula = "PISCINA_TEMPORADA_MENSUAL";
    } else {
      baseCents = service.annualCents;
      pricingPeriod = "ANO";
      formula = "PISCINA_ANUAL";
      annualizedRange = deterministicRange(baseCents);
    }
  }

  const range = deterministicRange(baseCents);
  return {
    valid: true,
    version: HOME_SERVICE_PRICING_VERSION,
    currency: "EUR",
    category,
    serviceSlug: input.serviceSlug,
    serviceLabel: service.label,
    unit: pricingPeriod,
    pricingPeriod,
    quantity: Math.round(quantity * 100) / 100,
    frequency,
    seasonal,
    zone: zone.zone,
    zoneLabel: zone.label,
    range,
    annualizedRange,
    formula,
    disclaimer: "Rango orientativo calculado por la plataforma. El precio final lo determina el presupuesto profesional.",
  };
}

export function annualizeHomeServiceValue({ priceCentsPerVisit, frequency, seasonStartDate = null, seasonEndDate = null } = {}) {
  const price = Number(priceCentsPerVisit);
  const visitsPerYear = FREQUENCY_VISITS_PER_YEAR[frequency];
  if (!Number.isFinite(price) || price <= 0 || !visitsPerYear) {
    return { valid: false, annualizedValueCents: 0, contractValueCents: 0, visitsPerYear: 0, estimatedContractVisits: 0 };
  }

  let contractVisits = visitsPerYear;
  let seasonal = false;
  if (frequency !== "PUNTUAL" && seasonStartDate && seasonEndDate) {
    const start = new Date(`${seasonStartDate}T12:00:00Z`);
    const end = new Date(`${seasonEndDate}T12:00:00Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
      const intervalDays = frequency === "SEMANAL" ? 7 : frequency === "CADA_2_SEMANAS" ? 14 : 30.4375;
      contractVisits = Math.max(1, Math.ceil(days / intervalDays));
      seasonal = true;
    }
  }

  return {
    valid: true,
    seasonal,
    visitsPerYear,
    estimatedContractVisits: contractVisits,
    annualizedValueCents: Math.round(price * visitsPerYear),
    contractValueCents: Math.round(price * contractVisits),
  };
}

export function calculateHomeServiceMonetization(input = {}) {
  const recurringValue = annualizeHomeServiceValue(input);
  if (!recurringValue.valid) {
    return { valid: false, feeCents: 0, pricingVersion: HOME_SERVICE_PRICING_VERSION, recurringValue };
  }
  const basisCents = input.frequency === "PUNTUAL"
    ? recurringValue.contractValueCents
    : recurringValue.seasonal
      ? recurringValue.contractValueCents
      : recurringValue.annualizedValueCents;
  const fee = calculateShortlistFee(basisCents);
  if (!fee.valid) return { valid: false, feeCents: 0, pricingVersion: HOME_SERVICE_PRICING_VERSION, recurringValue };
  return {
    valid: true,
    basisCents,
    feeCents: fee.feeCents,
    pricingVersion: `${HOME_SERVICE_PRICING_VERSION}+${fee.pricingVersion}`,
    recurringValue,
  };
}
