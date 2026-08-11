export const PROJECT_ESTIMATOR_VERSION = "2026-08-11-es-v2";

export const PROJECT_TYPES = {
  bano: {
    label: "Reforma de baño",
    minimumArea: 3,
    baseRangePerSquareMeter: { minimum: 700, maximum: 1_150 },
    shares: { manoDeObra: 0.38, materiales: 0.34, instalaciones: 0.17, residuosYPermisos: 0.06, contingencia: 0.05 },
  },
  cocina: {
    label: "Reforma de cocina",
    minimumArea: 5,
    baseRangePerSquareMeter: { minimum: 800, maximum: 1_350 },
    shares: { manoDeObra: 0.34, materiales: 0.40, instalaciones: 0.16, residuosYPermisos: 0.05, contingencia: 0.05 },
  },
  reforma_integral: {
    label: "Reforma integral",
    minimumArea: 20,
    baseRangePerSquareMeter: { minimum: 460, maximum: 650 },
    shares: { manoDeObra: 0.39, materiales: 0.31, instalaciones: 0.20, residuosYPermisos: 0.05, contingencia: 0.05 },
  },
  construccion_casa: {
    label: "Construcción de casa",
    minimumArea: 40,
    baseRangePerSquareMeter: { minimum: 1_580, maximum: 2_500 },
    shares: { manoDeObra: 0.36, materiales: 0.34, instalaciones: 0.19, residuosYPermisos: 0.06, contingencia: 0.05 },
  },
};

export const QUALITY_LEVELS = {
  basico: { label: "Básico", coefficient: 0.85 },
  estandar: { label: "Estándar", coefficient: 1 },
  premium: { label: "Premium", coefficient: 1.35 },
};

export const CONDITION_LEVELS = {
  ligera: { label: "Intervención ligera", coefficient: 0.92 },
  media: { label: "Estado medio", coefficient: 1 },
  completa: { label: "Renovación profunda", coefficient: 1.12 },
};

export const ACCESS_LEVELS = {
  facil: { label: "Acceso fácil", coefficient: 0.97 },
  normal: { label: "Acceso normal", coefficient: 1 },
  complejo: { label: "Acceso complejo", coefficient: 1.10 },
};

const BREAKDOWN_LABELS = {
  manoDeObra: "Mano de obra",
  materiales: "Materiales y acabados",
  instalaciones: "Instalaciones",
  residuosYPermisos: "Residuos, medios auxiliares y permisos",
  contingencia: "Contingencia técnica",
};

function roundToNearest50(value) {
  return Math.round(value / 50) * 50;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function splitAmount(total, shares) {
  const entries = Object.entries(shares);
  let assigned = 0;
  return Object.fromEntries(entries.map(([key, share], index) => {
    const amount = index === entries.length - 1 ? total - assigned : roundToNearest50(total * share);
    assigned += amount;
    return [key, amount];
  }));
}

function optionalBoolean(value) {
  return value === true;
}

export function estimateProjectPrice(input = {}) {
  const {
    projectType,
    squareMeters,
    qualityLevel,
    conditionLevel = "media",
    accessLevel = "normal",
    floor = 0,
    hasElevator = true,
    demolition = false,
    renewElectrical = false,
    renewPlumbing = false,
    structuralWork = false,
    occupiedHome = false,
    locationCostIndex = 1,
  } = input;

  const type = PROJECT_TYPES[projectType];
  const quality = QUALITY_LEVELS[qualityLevel];
  const condition = CONDITION_LEVELS[conditionLevel];
  const access = ACCESS_LEVELS[accessLevel];
  const area = Number(squareMeters);
  const floorNumber = Number(floor);
  const locationIndex = Number(locationCostIndex);

  if (!type || !quality || !condition || !access || !Number.isFinite(area) || area < 1 || area > 1_000) {
    return {
      valid: false,
      error: "Tipo de obra, superficie, calidades, estado y acceso válidos son obligatorios.",
      version: PROJECT_ESTIMATOR_VERSION,
    };
  }
  if (!Number.isFinite(floorNumber) || floorNumber < 0 || floorNumber > 60) {
    return { valid: false, error: "La planta indicada no es válida.", version: PROJECT_ESTIMATOR_VERSION };
  }
  if (!Number.isFinite(locationIndex) || locationIndex < 0.75 || locationIndex > 1.35) {
    return { valid: false, error: "El índice territorial debe estar entre 0,75 y 1,35.", version: PROJECT_ESTIMATOR_VERSION };
  }

  const billableArea = Math.max(area, type.minimumArea);
  const drivers = [];
  let coefficient = quality.coefficient * condition.coefficient * access.coefficient * locationIndex;

  const pushDriver = (key, label, driverCoefficient) => {
    coefficient *= driverCoefficient;
    drivers.push({ key, label, coefficient: driverCoefficient });
  };

  if (!hasElevator && floorNumber >= 2) {
    pushDriver("sinAscensor", "Planta elevada sin ascensor", 1 + clamp((floorNumber - 1) * 0.025, 0.025, 0.12));
  }
  if (optionalBoolean(demolition)) pushDriver("demolicion", "Demolición y retirada adicional", 1.08);
  if (optionalBoolean(renewElectrical)) pushDriver("electricidad", "Renovación completa de electricidad", 1.07);
  if (optionalBoolean(renewPlumbing)) pushDriver("fontaneria", "Renovación completa de fontanería", 1.07);
  if (optionalBoolean(structuralWork)) pushDriver("estructura", "Intervención estructural", 1.15);
  if (optionalBoolean(occupiedHome)) pushDriver("viviendaOcupada", "Obra con vivienda ocupada", 1.06);

  const minimum = roundToNearest50(billableArea * type.baseRangePerSquareMeter.minimum * coefficient);
  const maximum = roundToNearest50(billableArea * type.baseRangePerSquareMeter.maximum * coefficient);
  const realistic = roundToNearest50(minimum * 0.44 + maximum * 0.56);
  const minimumParts = splitAmount(minimum, type.shares);
  const realisticParts = splitAmount(realistic, type.shares);
  const maximumParts = splitAmount(maximum, type.shares);

  const suppliedDetailCount = [
    conditionLevel !== "media",
    accessLevel !== "normal",
    floorNumber > 0,
    hasElevator === false,
    demolition,
    renewElectrical,
    renewPlumbing,
    structuralWork,
    occupiedHome,
    locationIndex !== 1,
  ].filter(Boolean).length;
  const inputCompletenessScore = clamp(55 + suppliedDetailCount * 4, 55, 95);

  const legacyRange = { minimum, maximum };
  Object.defineProperty(legacyRange, "realistic", { value: realistic, enumerable: false });

  return {
    valid: true,
    version: PROJECT_ESTIMATOR_VERSION,
    currency: "EUR",
    includesEstimatedVat: true,
    methodology: "range-based-v2",
    inputCompletenessScore,
    input: {
      projectType,
      projectTypeLabel: type.label,
      squareMeters: area,
      billableSquareMeters: billableArea,
      qualityLevel,
      qualityLabel: quality.label,
      conditionLevel,
      conditionLabel: condition.label,
      accessLevel,
      accessLabel: access.label,
      floor: floorNumber,
      hasElevator: Boolean(hasElevator),
      demolition: Boolean(demolition),
      renewElectrical: Boolean(renewElectrical),
      renewPlumbing: Boolean(renewPlumbing),
      structuralWork: Boolean(structuralWork),
      occupiedHome: Boolean(occupiedHome),
      locationCostIndex: locationIndex,
    },
    range: legacyRange,
    realistic,
    rangeV2: { minimum, realistic, maximum },
    drivers,
    breakdown: Object.fromEntries(
      Object.keys(type.shares).map((key) => [key, {
        label: BREAKDOWN_LABELS[key],
        share: type.shares[key],
        minimum: minimumParts[key],
        realistic: realisticParts[key],
        maximum: maximumParts[key],
      }]),
    ),
    disclaimer:
      "Estimación orientativa basada en parámetros declarados y coeficientes internos calibrables. No sustituye una visita técnica ni un presupuesto profesional desglosado.",
  };
}
