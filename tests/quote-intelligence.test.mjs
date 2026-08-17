import assert from "node:assert/strict";
import test from "node:test";
import { estimateProjectPrice, PROJECT_ESTIMATOR_VERSION } from "../lib/project-estimator.js";
import { analyzeQuote, compareQuotes } from "../lib/quote-intelligence.js";

test("estimador determinista devuelve mínimo, realista y máximo según la matriz oficial", () => {
  const estimate = estimateProjectPrice({
    projectType: "reforma_integral",
    squareMeters: 90,
    qualityLevel: "estandar",
    conditionLevel: "completa",
    accessLevel: "complejo",
    floor: 4,
    hasElevator: false,
    demolition: true,
    renewElectrical: true,
    renewPlumbing: true,
  });
  assert.equal(estimate.valid, true);
  assert.equal(estimate.version, PROJECT_ESTIMATOR_VERSION);
  assert.equal(estimate.realistic, 58_500);
  assert.deepEqual(estimate.range, { minimum: 49_725, maximum: 67_275 });
  assert.deepEqual(estimate.drivers, []);
  assert.equal(estimate.breakdown.calculatedValue.realistic, 58_500);
});

test("los antiguos multiplicadores de complejidad no alteran la matriz determinista", () => {
  const basic = estimateProjectPrice({ projectType: "bano", squareMeters: 6, qualityLevel: "estandar" });
  const complex = estimateProjectPrice({
    projectType: "bano",
    squareMeters: 6,
    qualityLevel: "estandar",
    conditionLevel: "completa",
    accessLevel: "complejo",
    floor: 5,
    hasElevator: false,
    demolition: true,
  });
  assert.equal(basic.valid, true);
  assert.equal(complex.valid, true);
  assert.equal(basic.realistic, 4_420);
  assert.deepEqual(complex.range, basic.range);
  assert.equal(complex.realistic, basic.realistic);
  assert.ok("minimum" in basic.range && "maximum" in basic.range);
});

test("analizador detecta oferta demasiado baja y partidas ausentes", () => {
  const project = { projectType: "bano", squareMeters: 6, qualityLevel: "estandar" };
  const estimate = estimateProjectPrice(project);
  const analysis = analyzeQuote({
    project,
    estimate,
    quote: {
      amountCents: Math.round(estimate.range.realistic * 100 * 0.5),
      estimatedDays: 4,
      message: "Reforma de baño con materiales y mano de obra.",
    },
  });
  assert.equal(analysis.price.band, "muy-bajo");
  assert.ok(analysis.scopeCoverage.missing.includes("impermeabilización"));
  assert.ok(analysis.warnings.length >= 2);
  assert.equal(analysis.recommendation, "requiere-aclaraciones");
});

test("comparación premia una oferta documentada y no automáticamente la más barata", () => {
  const project = { projectType: "bano", squareMeters: 7, qualityLevel: "estandar" };
  const estimate = estimateProjectPrice(project);
  const fullMessage = "Demoliciones y retirada de escombros. Fontanería y tuberías. Impermeabilización. Alicatados y pavimentos. Sanitarios y grifería. Electricidad e iluminación. Pintura y acabados. Incluye materiales, suministros, mano de obra e IVA.";
  const result = compareQuotes({
    project,
    estimate,
    quotes: [
      { id: "barata", amountCents: Math.round(estimate.range.realistic * 100 * 0.58), estimatedDays: 5, message: "Reforma completa con mano de obra." },
      { id: "documentada", amountCents: Math.round(estimate.range.realistic * 100), estimatedDays: 16, message: fullMessage },
    ],
  });
  assert.equal(result.proposals[0].quote.id, "documentada");
  assert.ok(result.proposals[0].analysis.comparisonScore > result.proposals[1].analysis.comparisonScore);
});
