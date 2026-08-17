export const PROJECT_ESTIMATOR_VERSION = "2026-08-17-es-v4-deterministic";

export const PROJECT_TYPES = {
  bano: {
    label: "Reforma de baño",
    mode: "BASE_PLUS_INCREMENT",
    standardArea: 5,
    prices: {
      basico: { base: 2_600, incrementPerExtraSquareMeter: 150 },
      estandar: { base: 4_200, incrementPerExtraSquareMeter: 220 },
      premium: { base: 6_800, incrementPerExtraSquareMeter: 380 },
    },
  },
  cocina: {
    label: "Reforma de cocina",
    mode: "BASE_PLUS_INCREMENT",
    standardArea: 8,
    prices: {
      basico: { base: 3_500, incrementPerExtraSquareMeter: 180 },
      estandar: { base: 5_800, incrementPerExtraSquareMeter: 280 },
      premium: { base: 9_500, incrementPerExtraSquareMeter: 450 },
    },
  },
  reforma_parcial: {
    label: "Reforma parcial / salón / dormitorio",
    mode: "PER_SQUARE_METER",
    prices: { basico: 120, estandar: 220, premium: 380 },
  },
  reforma_integral: {
    label: "Reforma integral",
    mode: "PER_SQUARE_METER",
    prices: { basico: 400, estandar: 650, premium: 1_050 },
  },
  fachadas_exteriores: {
    label: "Fachadas y exteriores",
    mode: "PER_SQUARE_METER",
    prices: { basico: 45, estandar: 85, premium: 140 },
  },
};

export const QUALITY_LEVELS = {
  basico: { label: "Básica" },
  estandar: { label: "Media" },
  premium: { label: "Premium" },
};

// Se conservan por compatibilidad con consumidores antiguos, pero ya no modifican el precio.
export const CONDITION_LEVELS = {
  ligera: { label: "Intervención ligera", coefficient: 1 },
  media: { label: "Estado medio", coefficient: 1 },
  completa: { label: "Renovación profunda", coefficient: 1 },
};

export const ACCESS_LEVELS = {
  facil: { label: "Acceso fácil", coefficient: 1 },
  normal: { label: "Acceso normal", coefficient: 1 },
  complejo: { label: "Acceso complejo", coefficient: 1 },
};

const PROJECT_LOCATION_ZONES = [
  { key: "ANDALUCIA", label: "Andalucía", tokens: ["andalucia", "almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"] },
  { key: "MADRID", label: "Comunidad de Madrid", tokens: ["madrid"] },
  { key: "CATALUNA", label: "Cataluña", tokens: ["cataluna", "barcelona", "girona", "lerida", "lleida", "tarragona"] },
  { key: "BALEARES", label: "Illes Balears", tokens: ["baleares", "balears", "mallorca", "menorca", "ibiza", "eivissa"] },
  { key: "PAIS_VASCO", label: "País Vasco", tokens: ["pais vasco", "euskadi", "alava", "araba", "bizkaia", "vizcaya", "gipuzkoa", "guipuzcoa"] },
  { key: "NAVARRA", label: "Navarra", tokens: ["navarra", "pamplona", "iruna"] },
  { key: "VALENCIA", label: "Comunitat Valenciana", tokens: ["valencia", "alicante", "castellon"] },
  { key: "CANARIAS", label: "Canarias", tokens: ["canarias", "tenerife", "gran canaria", "lanzarote", "fuerteventura", "la palma"] },
  { key: "EXTREMADURA", label: "Extremadura", tokens: ["extremadura", "badajoz", "caceres"] },
  { key: "CASTILLA_LA_MANCHA", label: "Castilla-La Mancha", tokens: ["castilla la mancha", "albacete", "ciudad real", "cuenca", "guadalajara", "toledo"] },
  { key: "CASTILLA_Y_LEON", label: "Castilla y León", tokens: ["castilla y leon", "avila", "burgos", "leon", "palencia", "salamanca", "segovia", "soria", "valladolid", "zamora"] },
];

function normalizeLocation(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function roundEuro(value) {
  return Math.round(Number(value) || 0);
}

function rangeFromCalculatedValue(value) {
  const realistic = roundEuro(value);
  return {
    minimum: roundEuro(realistic * 0.85),
    realistic,
    maximum: roundEuro(realistic * 1.15),
  };
}

export function resolveProjectLocationCostIndex(location) {
  const normalized = normalizeLocation(location);
  const match = PROJECT_LOCATION_ZONES.find((zone) => zone.tokens.some((token) => normalized.includes(normalizeLocation(token))));
  return match
    ? { zone: match.key, label: match.label, coefficient: 1 }
    : { zone: "NACIONAL", label: "España", coefficient: 1 };
}

export function estimateProjectPrice(input = {}) {
  const projectType = String(input.projectType || "");
  const qualityLevel = String(input.qualityLevel || "");
  const type = PROJECT_TYPES[projectType];
  const quality = QUALITY_LEVELS[qualityLevel];
  const area = Number(input.squareMeters);

  if (!type || !quality || !Number.isFinite(area) || area < 1 || area > 1_000) {
    return {
      valid: false,
      error: "Tipo de obra, superficie y calidad válidos son obligatorios.",
      version: PROJECT_ESTIMATOR_VERSION,
    };
  }

  let calculatedValue;
  let calculation;
  if (type.mode === "BASE_PLUS_INCREMENT") {
    const price = type.prices[qualityLevel];
    const extraSquareMeters = Math.max(0, area - type.standardArea);
    calculatedValue = price.base + extraSquareMeters * price.incrementPerExtraSquareMeter;
    calculation = {
      mode: type.mode,
      standardArea: type.standardArea,
      base: price.base,
      extraSquareMeters,
      incrementPerExtraSquareMeter: price.incrementPerExtraSquareMeter,
    };
  } else {
    const pricePerSquareMeter = type.prices[qualityLevel];
    calculatedValue = area * pricePerSquareMeter;
    calculation = {
      mode: type.mode,
      pricePerSquareMeter,
    };
  }

  const range = rangeFromCalculatedValue(calculatedValue);
  const resolvedLocation = resolveProjectLocationCostIndex(input.location || "");
  const legacyRange = { minimum: range.minimum, maximum: range.maximum };
  Object.defineProperty(legacyRange, "realistic", { value: range.realistic, enumerable: false });

  return {
    valid: true,
    version: PROJECT_ESTIMATOR_VERSION,
    currency: "EUR",
    includesEstimatedVat: true,
    methodology: "deterministic-official-matrix-v1",
    inputCompletenessScore: 100,
    input: {
      projectType,
      projectTypeLabel: type.label,
      squareMeters: area,
      billableSquareMeters: area,
      qualityLevel,
      qualityLabel: quality.label,
      location: String(input.location || ""),
      locationZone: resolvedLocation.zone,
      locationZoneLabel: resolvedLocation.label,
      locationCostIndex: 1,
    },
    calculation,
    range: legacyRange,
    realistic: range.realistic,
    rangeV2: range,
    drivers: [],
    breakdown: {
      calculatedValue: {
        label: "Valor calculado según matriz MiConstructor",
        share: 1,
        minimum: range.minimum,
        realistic: range.realistic,
        maximum: range.maximum,
      },
    },
    disclaimer: "Rango orientativo calculado por la plataforma. El precio final lo determina el presupuesto profesional.",
  };
}
