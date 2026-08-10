export const PROJECT_ESTIMATOR_VERSION = "2026-08-09-es-v1";

export const PROJECT_TYPES = {
  bano: {
    label: "Reforma de baño",
    minimumArea: 3,
    baseRangePerSquareMeter: { minimum: 700, maximum: 1_150 },
  },
  cocina: {
    label: "Reforma de cocina",
    minimumArea: 5,
    baseRangePerSquareMeter: { minimum: 800, maximum: 1_350 },
  },
  reforma_integral: {
    label: "Reforma integral",
    minimumArea: 20,
    baseRangePerSquareMeter: { minimum: 460, maximum: 650 },
  },
  construccion_casa: {
    label: "Construcción de casa",
    minimumArea: 40,
    baseRangePerSquareMeter: { minimum: 1_580, maximum: 2_500 },
  },
};

export const QUALITY_LEVELS = {
  basico: { label: "Básico", coefficient: 0.85 },
  estandar: { label: "Estándar", coefficient: 1 },
  premium: { label: "Premium", coefficient: 1.35 },
};

const BREAKDOWN = [
  { key: "manoDeObra", label: "Mano de obra", share: 0.5 },
  { key: "materiales", label: "Materiales y acabados", share: 0.4 },
  { key: "residuosYPermisos", label: "Residuos y permisos", share: 0.1 },
];

function roundToNearest50(value) {
  return Math.round(value / 50) * 50;
}

function splitAmount(total) {
  const labor = roundToNearest50(total * 0.5);
  const materials = roundToNearest50(total * 0.4);
  return [labor, materials, total - labor - materials];
}

export function estimateProjectPrice({ projectType, squareMeters, qualityLevel }) {
  const type = PROJECT_TYPES[projectType];
  const quality = QUALITY_LEVELS[qualityLevel];
  const area = Number(squareMeters);

  if (!type || !quality || !Number.isFinite(area) || area < 1 || area > 1_000) {
    return {
      valid: false,
      error: "Tipo de obra, superficie y nivel de calidades válidos son obligatorios.",
      version: PROJECT_ESTIMATOR_VERSION,
    };
  }

  // Las estancias pequeñas conservan un coste mínimo de movilización, medios
  // auxiliares e instalaciones, aunque su superficie real sea inferior.
  const billableArea = Math.max(area, type.minimumArea);
  const minimum = roundToNearest50(
    billableArea * type.baseRangePerSquareMeter.minimum * quality.coefficient,
  );
  const maximum = roundToNearest50(
    billableArea * type.baseRangePerSquareMeter.maximum * quality.coefficient,
  );
  const minimumParts = splitAmount(minimum);
  const maximumParts = splitAmount(maximum);

  return {
    valid: true,
    version: PROJECT_ESTIMATOR_VERSION,
    currency: "EUR",
    includesEstimatedVat: true,
    input: {
      projectType,
      projectTypeLabel: type.label,
      squareMeters: area,
      billableSquareMeters: billableArea,
      qualityLevel,
      qualityLabel: quality.label,
    },
    range: { minimum, maximum },
    breakdown: Object.fromEntries(
      BREAKDOWN.map((item, index) => [
        item.key,
        {
          label: item.label,
          share: item.share,
          minimum: minimumParts[index],
          maximum: maximumParts[index],
        },
      ]),
    ),
    disclaimer:
      "Simulación orientativa basada en los datos introducidos. El presupuesto exacto requiere una visita y una oferta profesional.",
  };
}
