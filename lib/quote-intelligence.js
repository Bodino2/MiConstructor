const PROJECT_SCOPE = {
  bano: [
    ["demoliciones", ["demolic", "derribo"]],
    ["retirada de escombros", ["escombro", "residuo", "contenedor"]],
    ["fontanería", ["fontaner", "tuber", "desagüe", "desague"]],
    ["impermeabilización", ["impermeabil"]],
    ["alicatados y pavimentos", ["alicat", "pavimento", "solado", "azulej"]],
    ["sanitarios y grifería", ["sanitario", "grifer", "inodoro", "lavabo", "ducha"]],
    ["electricidad e iluminación", ["electric", "ilumin", "enchufe", "mecanismo"]],
    ["acabados", ["pintura", "acabado", "sellado", "silicona"]],
  ],
  cocina: [
    ["demoliciones", ["demolic", "derribo"]],
    ["retirada de escombros", ["escombro", "residuo", "contenedor"]],
    ["fontanería", ["fontaner", "tuber", "desagüe", "desague"]],
    ["electricidad", ["electric", "enchufe", "mecanismo", "cuadro"]],
    ["revestimientos y pintura", ["alicat", "pavimento", "pintura", "revestimiento"]],
    ["mobiliario y encimera", ["mueble", "mobiliario", "encimera"]],
    ["acabados", ["acabado", "sellado", "remate"]],
  ],
  reforma_integral: [
    ["demoliciones", ["demolic", "derribo"]],
    ["retirada de escombros", ["escombro", "residuo", "contenedor"]],
    ["electricidad", ["electric", "cuadro", "cableado"]],
    ["fontanería", ["fontaner", "tuber", "desagüe", "desague"]],
    ["suelos y revestimientos", ["suelo", "pavimento", "alicat", "revestimiento"]],
    ["carpintería", ["carpinter", "puerta", "ventana"]],
    ["pintura y acabados", ["pintura", "acabado", "remate"]],
  ],
  construccion_casa: [
    ["movimiento de tierras y cimentación", ["excav", "tierra", "ciment", "zapata", "losa"]],
    ["estructura", ["estructura", "forjado", "hormig", "acero"]],
    ["cerramientos y cubierta", ["cerramiento", "fachada", "cubierta", "tejado"]],
    ["electricidad", ["electric", "cuadro", "cableado"]],
    ["fontanería y saneamiento", ["fontaner", "saneamiento", "tuber", "desagüe", "desague"]],
    ["climatización", ["climat", "aeroterm", "calefac", "aire acondicionado"]],
    ["acabados", ["pavimento", "alicat", "pintura", "acabado"]],
    ["documentación y permisos", ["licencia", "permiso", "proyecto", "dirección facultativa", "direccion facultativa"]],
  ],
};

const COMMON_SCOPE = [
  ["mano de obra", ["mano de obra", "trabajos", "ejecución", "ejecucion"]],
  ["materiales", ["material", "suministro"]],
  ["IVA / impuestos", ["iva", "impuesto"]],
];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function scopeCoverage(projectType, message) {
  const normalized = normalizeText(message);
  const expected = [...(PROJECT_SCOPE[projectType] ?? []), ...COMMON_SCOPE];
  const items = expected.map(([label, terms]) => ({
    label,
    found: terms.some((term) => normalized.includes(normalizeText(term))),
  }));
  const found = items.filter((item) => item.found);
  const missing = items.filter((item) => !item.found);
  return {
    score: expected.length ? Math.round((found.length / expected.length) * 100) : 0,
    found: found.map((item) => item.label),
    missing: missing.map((item) => item.label),
  };
}

function priceAssessment(amountEuros, estimate) {
  const realistic = Number(estimate?.range?.realistic ?? 0);
  if (!realistic || !Number.isFinite(amountEuros) || amountEuros <= 0) {
    return { score: 0, band: "sin-referencia", ratio: null, warning: "No hay referencia suficiente para comparar el precio." };
  }
  const ratio = amountEuros / realistic;
  const distance = Math.abs(1 - ratio);
  const score = Math.round(clamp(100 - distance * 120, 0, 100));
  if (ratio < 0.65) return { score, band: "muy-bajo", ratio, warning: "La oferta es muy inferior al coste realista estimado; revisa partidas, calidades y exclusiones." };
  if (ratio < 0.85) return { score, band: "bajo", ratio, warning: "La oferta está por debajo del rango central estimado; conviene revisar el alcance incluido." };
  if (ratio <= 1.20) return { score, band: "razonable", ratio, warning: null };
  if (ratio <= 1.45) return { score, band: "alto", ratio, warning: "La oferta está por encima del rango central; puede responder a mayor alcance, calidad o complejidad." };
  return { score, band: "muy-alto", ratio, warning: "La oferta es muy superior al coste realista estimado; solicita un desglose claro de las diferencias." };
}

function expectedDuration(projectType, squareMeters) {
  const area = Number(squareMeters || 0);
  if (projectType === "bano") return { minimum: 7, maximum: 30 };
  if (projectType === "cocina") return { minimum: 10, maximum: 45 };
  if (projectType === "reforma_integral") return { minimum: Math.max(20, Math.round(area * 0.45)), maximum: Math.max(60, Math.round(area * 1.6)) };
  if (projectType === "construccion_casa") return { minimum: Math.max(120, Math.round(area * 1.2)), maximum: Math.max(300, Math.round(area * 3.5)) };
  return { minimum: 1, maximum: 3650 };
}

function durationAssessment(projectType, squareMeters, estimatedDays) {
  const days = Number(estimatedDays);
  const expected = expectedDuration(projectType, squareMeters);
  if (!Number.isFinite(days) || days <= 0) return { score: 0, expected, warning: "No se ha indicado un plazo válido." };
  if (days < expected.minimum) return { score: 45, expected, warning: "El plazo parece muy corto para el tamaño y tipo de obra; confirma equipo, solapes y alcance." };
  if (days > expected.maximum) return { score: 65, expected, warning: "El plazo es superior a la referencia interna; revisa disponibilidad, fases y dependencias." };
  return { score: 100, expected, warning: null };
}

export function analyzeQuote({ project, estimate, quote }) {
  const amountEuros = Number(quote?.amountEuros ?? (Number(quote?.amountCents || 0) / 100));
  const coverage = scopeCoverage(project?.projectType, quote?.message);
  const price = priceAssessment(amountEuros, estimate);
  const duration = durationAssessment(project?.projectType, project?.squareMeters, quote?.estimatedDays);
  const warnings = [price.warning, duration.warning].filter(Boolean);
  if (coverage.score < 55) warnings.push("El presupuesto está poco desglosado; faltan varias partidas esperables para poder compararlo con seguridad.");
  if (coverage.missing.includes("IVA / impuestos")) warnings.push("No consta claramente si el IVA o los impuestos están incluidos.");
  const comparisonScore = Math.round(coverage.score * 0.5 + price.score * 0.35 + duration.score * 0.15);
  return {
    version: "2026-08-11-quote-v1",
    comparisonScore,
    amountEuros,
    price,
    scopeCoverage: coverage,
    duration,
    warnings,
    recommendation: comparisonScore >= 80 ? "bien-documentada" : comparisonScore >= 60 ? "revisar-detalles" : "requiere-aclaraciones",
    disclaimer: "Análisis explicable y orientativo. No determina por sí solo qué profesional debe contratarse ni sustituye la revisión técnica del presupuesto.",
  };
}

export function compareQuotes({ project, estimate, quotes }) {
  const analyses = (Array.isArray(quotes) ? quotes : []).map((quote) => ({
    quote,
    analysis: analyzeQuote({ project, estimate, quote }),
  }));
  analyses.sort((a, b) => b.analysis.comparisonScore - a.analysis.comparisonScore || a.analysis.amountEuros - b.analysis.amountEuros);
  return {
    version: "2026-08-11-quote-v1",
    estimate,
    proposals: analyses,
    explanation: "La puntuación prioriza presupuesto desglosado (50%), coherencia de precio con la estimación (35%) y plausibilidad del plazo (15%). No premia automáticamente la oferta más barata.",
  };
}
