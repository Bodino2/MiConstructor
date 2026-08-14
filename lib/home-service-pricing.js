import { calculateShortlistFee } from "./shortlist-pricing.js";

export const HOME_SERVICE_PRICING_VERSION = "2026-08-14-es-v1";

const QUALITY_MULTIPLIERS = {
  basico: { label: "Básico", coefficient: 0.92 },
  estandar: { label: "Estándar", coefficient: 1 },
  premium: { label: "Premium", coefficient: 1.22 },
};

const ZONE_MULTIPLIERS = {
  ANDALUCIA: { label: "Andalucía", coefficient: 0.93, tokens: ["andalucia", "almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"] },
  MADRID: { label: "Comunidad de Madrid", coefficient: 1.16, tokens: ["madrid"] },
  CATALUNA: { label: "Cataluña", coefficient: 1.12, tokens: ["cataluna", "barcelona", "girona", "lerida", "lleida", "tarragona"] },
  BALEARES: { label: "Illes Balears", coefficient: 1.18, tokens: ["baleares", "balears", "mallorca", "menorca", "ibiza", "eivissa"] },
  PAIS_VASCO: { label: "País Vasco", coefficient: 1.13, tokens: ["pais vasco", "euskadi", "alava", "araba", "bizkaia", "vizcaya", "gipuzkoa", "guipuzcoa"] },
  NAVARRA: { label: "Navarra", coefficient: 1.08, tokens: ["navarra", "pamplona", "iruna"] },
  COMUNIDAD_VALENCIANA: { label: "Comunitat Valenciana", coefficient: 1.02, tokens: ["valencia", "alicante", "castellon"] },
  CANARIAS: { label: "Canarias", coefficient: 1.08, tokens: ["canarias", "tenerife", "gran canaria", "lanzarote", "fuerteventura", "la palma"] },
  EXTREMADURA: { label: "Extremadura", coefficient: 0.90, tokens: ["extremadura", "badajoz", "caceres"] },
  CASTILLA_LA_MANCHA: { label: "Castilla-La Mancha", coefficient: 0.92, tokens: ["castilla la mancha", "albacete", "ciudad real", "cuenca", "guadalajara", "toledo"] },
  CASTILLA_Y_LEON: { label: "Castilla y León", coefficient: 0.95, tokens: ["castilla y leon", "avila", "burgos", "leon", "palencia", "salamanca", "segovia", "soria", "valladolid", "zamora"] },
  GALICIA: { label: "Galicia", coefficient: 0.96, tokens: ["galicia", "a coruna", "coruna", "lugo", "ourense", "orense", "pontevedra"] },
  ASTURIAS: { label: "Asturias", coefficient: 0.99, tokens: ["asturias", "oviedo", "gijon"] },
  CANTABRIA: { label: "Cantabria", coefficient: 1.01, tokens: ["cantabria", "santander"] },
  ARAGON: { label: "Aragón", coefficient: 0.98, tokens: ["aragon", "huesca", "teruel", "zaragoza"] },
  MURCIA: { label: "Región de Murcia", coefficient: 0.96, tokens: ["murcia", "cartagena"] },
  LA_RIOJA: { label: "La Rioja", coefficient: 0.98, tokens: ["la rioja", "logrono"] },
  NACIONAL: { label: "España", coefficient: 1, tokens: [] },
};

// Valores internos calibrables. Importes en céntimos y sin exponer la política de monetización.
export const HOME_SERVICE_PRICE_MATRIX = {
  limpieza_mantenimiento: {
    limpieza_hogar: {
      label: "Limpieza del hogar",
      unit: "HORA",
      referenceQuantity: 3,
      standardRange: { minimum: 1_400, median: 1_800, maximum: 2_300 },
      minimumVisit: { minimum: 3_500, median: 4_500, maximum: 5_500 },
    },
    limpieza_profunda: {
      label: "Limpieza profunda",
      unit: "M2",
      referenceQuantity: 70,
      standardRange: { minimum: 220, median: 320, maximum: 450 },
      minimumVisit: { minimum: 8_000, median: 11_000, maximum: 15_000 },
    },
    limpieza_fin_obra: {
      label: "Limpieza fin de obra",
      unit: "M2",
      referenceQuantity: 70,
      standardRange: { minimum: 300, median: 450, maximum: 650 },
      minimumVisit: { minimum: 12_000, median: 16_000, maximum: 22_000 },
    },
    limpieza_mudanza: {
      label: "Limpieza de mudanza",
      unit: "M2",
      referenceQuantity: 70,
      standardRange: { minimum: 200, median: 300, maximum: 430 },
      minimumVisit: { minimum: 8_000, median: 11_000, maximum: 15_000 },
    },
    limpieza_cristales: {
      label: "Limpieza de cristales",
      unit: "HORA",
      referenceQuantity: 2,
      standardRange: { minimum: 1_600, median: 2_100, maximum: 2_800 },
      minimumVisit: { minimum: 4_000, median: 5_000, maximum: 6_500 },
    },
    limpieza_comunidades: {
      label: "Limpieza de comunidades",
      unit: "HORA",
      referenceQuantity: 3,
      standardRange: { minimum: 1_400, median: 1_800, maximum: 2_300 },
      minimumVisit: { minimum: 4_500, median: 5_500, maximum: 7_000 },
    },
    limpieza_alojamiento_turistico: {
      label: "Limpieza para B&B y alojamientos turísticos",
      unit: "VISITA",
      referenceQuantity: 1,
      standardRange: { minimum: 4_500, median: 6_500, maximum: 9_000 },
      minimumVisit: { minimum: 4_500, median: 6_500, maximum: 9_000 },
      bedroomAdjustment: { minimum: 650, median: 850, maximum: 1_100 },
      bathroomAdjustment: { minimum: 500, median: 700, maximum: 900 },
    },
  },
  jardin_exterior: {
    jardineria_mantenimiento: {
      label: "Mantenimiento de jardines",
      unit: "HORA",
      referenceQuantity: 3,
      standardRange: { minimum: 1_800, median: 2_400, maximum: 3_200 },
      minimumVisit: { minimum: 5_000, median: 7_000, maximum: 9_500 },
    },
    poda: {
      label: "Poda y cuidado de árboles",
      unit: "HORA",
      referenceQuantity: 3,
      standardRange: { minimum: 2_200, median: 3_200, maximum: 4_500 },
      minimumVisit: { minimum: 7_000, median: 10_000, maximum: 14_000 },
    },
    cesped: {
      label: "Césped y siega",
      unit: "M2",
      referenceQuantity: 150,
      standardRange: { minimum: 14, median: 22, maximum: 35 },
      minimumVisit: { minimum: 3_500, median: 4_500, maximum: 6_000 },
    },
    riego: {
      label: "Riego y mantenimiento",
      unit: "HORA",
      referenceQuantity: 2,
      standardRange: { minimum: 2_000, median: 2_800, maximum: 4_000 },
      minimumVisit: { minimum: 6_000, median: 8_000, maximum: 11_000 },
    },
    limpieza_terreno: {
      label: "Limpieza de terrenos y parcelas",
      unit: "M2",
      referenceQuantity: 300,
      standardRange: { minimum: 25, median: 45, maximum: 80 },
      minimumVisit: { minimum: 8_000, median: 12_000, maximum: 18_000 },
    },
    mantenimiento_piscina: {
      label: "Mantenimiento de piscina",
      unit: "VISITA",
      referenceQuantity: 1,
      standardRange: { minimum: 3_500, median: 5_000, maximum: 7_500 },
      minimumVisit: { minimum: 3_500, median: 5_000, maximum: 7_500 },
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

function roundToFiveEuros(cents) {
  return Math.max(0, Math.round(Number(cents || 0) / 500) * 500);
}

function findMatrixEntry(serviceSlug) {
  for (const [category, services] of Object.entries(HOME_SERVICE_PRICE_MATRIX)) {
    if (services[serviceSlug]) return { category, service: services[serviceSlug] };
  }
  return null;
}

export function resolveHomeServiceZone(location) {
  const normalized = normalizeText(location);
  for (const [zone, data] of Object.entries(ZONE_MULTIPLIERS)) {
    if (zone === "NACIONAL") continue;
    if (data.tokens.some((token) => normalized.includes(normalizeText(token)))) {
      return { zone, label: data.label, coefficient: data.coefficient };
    }
  }
  return { zone: "NACIONAL", label: ZONE_MULTIPLIERS.NACIONAL.label, coefficient: 1 };
}

export function getPublicHomeServicePricingModel(serviceSlug) {
  const found = findMatrixEntry(serviceSlug);
  if (!found) return null;
  const { service } = found;
  return {
    version: HOME_SERVICE_PRICING_VERSION,
    unit: service.unit,
    referenceQuantity: service.referenceQuantity,
    standardRange: { ...service.standardRange },
    minimumVisit: { ...service.minimumVisit },
    qualityMultipliers: Object.fromEntries(Object.entries(QUALITY_MULTIPLIERS).map(([key, item]) => [key, item.coefficient])),
    zoneMultipliers: Object.fromEntries(Object.entries(ZONE_MULTIPLIERS).map(([key, item]) => [key, item.coefficient])),
  };
}

export function estimateHomeServicePrice(input = {}) {
  const found = findMatrixEntry(input.serviceSlug);
  if (!found) return { valid: false, error: "Servicio no disponible en la matriz de precios.", version: HOME_SERVICE_PRICING_VERSION };

  const quality = QUALITY_MULTIPLIERS[input.qualityLevel] || QUALITY_MULTIPLIERS.estandar;
  const zone = resolveHomeServiceZone(input.location);
  const { service, category } = found;
  const squareMeters = Number(input.squareMeters);
  const estimatedHours = Number(input.estimatedHours);
  const bedrooms = Math.max(0, Number(input.bedrooms) || 0);
  const bathrooms = Math.max(0, Number(input.bathrooms) || 0);

  let quantity = service.referenceQuantity;
  if (service.unit === "HORA") {
    if (Number.isFinite(estimatedHours) && estimatedHours > 0) quantity = estimatedHours;
    else if (Number.isFinite(squareMeters) && squareMeters > 0) quantity = Math.max(2, squareMeters / 28);
  } else if (service.unit === "M2" && Number.isFinite(squareMeters) && squareMeters > 0) {
    quantity = squareMeters;
  }

  const coefficient = quality.coefficient * zone.coefficient;
  const range = {};
  for (const key of ["minimum", "median", "maximum"]) {
    let raw = service.standardRange[key] * quantity;
    if (service.bedroomAdjustment && bedrooms > 1) raw += service.bedroomAdjustment[key] * (bedrooms - 1);
    if (service.bathroomAdjustment && bathrooms > 1) raw += service.bathroomAdjustment[key] * (bathrooms - 1);
    raw = Math.max(raw, service.minimumVisit[key]);
    range[key] = roundToFiveEuros(raw * coefficient);
  }

  return {
    valid: true,
    version: HOME_SERVICE_PRICING_VERSION,
    currency: "EUR",
    category,
    serviceSlug: input.serviceSlug,
    serviceLabel: service.label,
    unit: service.unit,
    quantity: Math.round(quantity * 100) / 100,
    qualityLevel: input.qualityLevel in QUALITY_MULTIPLIERS ? input.qualityLevel : "estandar",
    qualityLabel: quality.label,
    zone: zone.zone,
    zoneLabel: zone.label,
    range,
    disclaimer: "Estimación orientativa de MiConstructor basada en la matriz interna de precios, características declaradas y zona. La oferta final la fija el profesional.",
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
